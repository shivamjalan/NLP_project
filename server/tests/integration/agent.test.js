import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAgentTurn } from '../../src/services/agentOrchestrator.service.js';
import { createSession } from '../../src/services/session.service.js';
import { buildConversationContext, maybeSummarizeSession } from '../../src/services/conversationMemory.service.js';
import { seedDemoFixtures } from '../../src/services/seed.service.js';
import { Message } from '../../src/models/Message.js';
import { AgentRun } from '../../src/models/AgentRun.js';
import { startTestDb, stopTestDb } from '../helpers/db.js';

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function makeStub(overrides = {}) {
  return {
    provider: 'stub',
    model: 'stub-agent',
    planTurn: async () => ({
      result: { action: 'respond', text: 'Stub answer.' },
      usage: { ...ZERO_USAGE },
    }),
    continueTurn: async () => ({
      result: { action: 'respond', reason: 'done' },
      usage: { ...ZERO_USAGE },
    }),
    generateFinalAnswer: async ({ evidence }) => ({
      result: {
        answer: evidence.length ? 'Stub grounded answer.' : 'Stub abstention.',
        evidenceIds: evidence.length ? [evidence[0].evidenceId] : [],
        needsClarification: false,
        followUpQuestion: null,
        confidence: 'low',
        answerType: evidence.length ? 'grounded' : 'abstention',
      },
      usage: { ...ZERO_USAGE },
    }),
    verifyAnswer: async () => ({
      result: { verdict: 'ok', unsupportedClaims: [], missingCitations: [], notes: [] },
      usage: { ...ZERO_USAGE },
    }),
    ...overrides,
  };
}

async function newSession() {
  const { session } = await createSession('en');
  return session._id;
}

beforeAll(async () => {
  await startTestDb();
  await seedDemoFixtures({ reset: true });
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

describe('bounded agent orchestration', () => {
  it('runs safety gates before the model is called', async () => {
    let calls = 0;
    const llm = makeStub({
      planTurn: async () => {
        calls += 1;
        return { result: { action: 'respond', text: 'Should not happen' }, usage: { ...ZERO_USAGE } };
      },
    });
    const sessionId = await newSession();
    const result = await runAgentTurn({
      sessionId,
      messages: [{ role: 'user', content: 'Book a train ticket for me' }],
      latestUserMessage: 'Book a train ticket for me',
      language: 'en',
      llm,
    });

    expect(calls).toBe(0);
    expect(result.safetyCategory).toBe('unsupported_action');
    expect(result.answerType).toBe('abstention');
    expect(result.evidenceCount).toBe(0);
  });

  it('turns a provider failure into a safe fallback answer', async () => {
    const llm = makeStub({
      planTurn: async () => {
        const error = new Error('provider unavailable');
        error.code = 'provider_unavailable';
        throw error;
      },
      generateFinalAnswer: async () => {
        throw new Error('provider unavailable');
      },
    });
    const sessionId = await newSession();
    const result = await runAgentTurn({
      sessionId,
      messages: [{ role: 'user', content: 'What are the Tatkal rules?' }],
      latestUserMessage: 'What are the Tatkal rules?',
      language: 'en',
      llm,
    });

    expect(result.agentStatus).toBe('failed');
    expect(result.answerType).toBe('abstention');
    expect(result.answer).toMatch(/could not complete that answer safely/);
    expect(result.citations).toEqual([]);
  });

  it('enforces the retrieval-call budget across the loop', async () => {
    let counter = 0;
    const toolCall = () => {
      counter += 1;
      return {
        id: `call_${counter}`,
        name: 'searchKnowledgeBase',
        arguments: { query: `Tatkal booking rules ${counter}`, service: 'irctc', limit: 1 },
      };
    };
    const llm = makeStub({
      planTurn: async () => ({
        result: { action: 'call_tools', toolCalls: [toolCall()] },
        usage: { ...ZERO_USAGE },
      }),
      continueTurn: async () => ({
        result: { action: 'call_tools', toolCalls: [toolCall()] },
        usage: { ...ZERO_USAGE },
      }),
    });
    const sessionId = await newSession();
    const result = await runAgentTurn({
      sessionId,
      messages: [{ role: 'user', content: 'Tatkal rules' }],
      latestUserMessage: 'Tatkal rules',
      language: 'en',
      llm,
    });

    expect(result.retrievalCallCount).toBe(3);
    expect(result.toolCallCount).toBe(3);
    expect(result.stopReason).toBe('retrieval_budget_exhausted');
    expect(result.agentStatus).toBe('budget_exhausted');

    const run = await AgentRun.findOne({ sessionId }).lean();
    expect(run.retrievalCallCount).toBe(3);
    expect(run.status).toBe('budget_exhausted');
  });

  it('drops invented evidence IDs and rewrites invented URLs', async () => {
    const llm = makeStub({
      planTurn: async () => ({
        result: {
          action: 'call_tools',
          toolCalls: [
            {
              id: 'call_1',
              name: 'searchKnowledgeBase',
              arguments: { query: 'Tatkal booking', service: 'irctc', limit: 2 },
            },
          ],
        },
        usage: { ...ZERO_USAGE },
      }),
      generateFinalAnswer: async () => ({
        result: {
          answer: 'Fabricated rule from https://evil.invalid/made-up',
          evidenceIds: ['ev_999'],
          needsClarification: false,
          followUpQuestion: null,
          confidence: 'high',
          answerType: 'grounded',
        },
        usage: { ...ZERO_USAGE },
      }),
    });
    const sessionId = await newSession();
    const result = await runAgentTurn({
      sessionId,
      messages: [{ role: 'user', content: 'What are the Tatkal rules?' }],
      latestUserMessage: 'What are the Tatkal rules?',
      language: 'en',
      llm,
    });

    expect(result.citations).toEqual([]);
    expect(result.answerType).toBe('abstention');
    expect(result.answer).not.toContain('evil.invalid');
    expect(result.answer).toContain('the official source linked below');
    expect(result.answer).toMatch(/treat it as unverified/);
    expect(result.confidence).toBe('low');
  });

  it('returns citations built only from stored source records', async () => {
    const llm = makeStub({
      planTurn: async () => ({
        result: {
          action: 'call_tools',
          toolCalls: [
            {
              id: 'call_1',
              name: 'searchKnowledgeBase',
              arguments: { query: 'Tatkal booking', service: 'irctc', limit: 2 },
            },
          ],
        },
        usage: { ...ZERO_USAGE },
      }),
    });
    const sessionId = await newSession();
    const result = await runAgentTurn({
      sessionId,
      messages: [{ role: 'user', content: 'What are the Tatkal rules?' }],
      latestUserMessage: 'What are the Tatkal rules?',
      language: 'en',
      llm,
    });

    expect(result.agentStatus).toBe('completed');
    expect(result.retrievalCallCount).toBe(1);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0].url).toMatch(/^https:\/\/demo\.invalid\//);
    expect(result.citations[0].trustLevel).toBe('fixture');
    expect(result.evidenceCount).toBeGreaterThan(0);
    expect(result.verification.verdict).toBe('ok');
  });

  it('asks for clarification without retrieving', async () => {
    const llm = makeStub({
      planTurn: async () => ({
        result: { action: 'ask_clarification', question: 'Which service do you mean?', reason: 'ambiguous' },
        usage: { ...ZERO_USAGE },
      }),
    });
    const sessionId = await newSession();
    const result = await runAgentTurn({
      sessionId,
      messages: [{ role: 'user', content: 'rules' }],
      latestUserMessage: 'rules',
      language: 'en',
      llm,
    });

    expect(result.answerType).toBe('clarification');
    expect(result.needsClarification).toBe(true);
    expect(result.followUpQuestion).toBe('Which service do you mean?');
    expect(result.retrievalCallCount).toBe(0);
  });
});

describe('conversation memory', () => {
  it('summarizes older turns and keeps a bounded context window', async () => {
    const { session } = await createSession('en');
    for (let index = 0; index < 26; index += 1) {
      await Message.create({
        sessionId: session._id,
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `Message number ${index} about Tatkal and refunds.`,
        language: 'en',
      });
    }

    const summary = await maybeSummarizeSession(session._id);
    expect(summary).toBeTruthy();
    expect(summary).toContain('Message number');

    const context = await buildConversationContext(session._id);
    expect(context.messages).toHaveLength(12);
    expect(context.sessionSummary.length).toBeGreaterThan(0);
    expect(context.sessionSummary.length).toBeLessThanOrEqual(1600);
  });
});

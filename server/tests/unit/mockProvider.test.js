import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '../../src/adapters/llm/mock.provider.js';
import { sanitizeAgentDecision, sanitizeFinalAnswer, sanitizeVerification } from '../../src/adapters/llm/schemas.js';

const provider = new MockLLMProvider();

function userMessage(content) {
  return [{ role: 'user', content }];
}

describe('MockLLMProvider', () => {
  it('advertises deterministic demo metadata', () => {
    expect(provider.metadata).toEqual({ provider: 'mock', model: 'bharatseva-demo-agent-v1' });
  });

  it('answers greetings without retrieval', async () => {
    const { result } = await provider.planTurn({ messages: userMessage('Hello'), language: 'en' });
    expect(result.action).toBe('respond');
    expect(result.text).toMatch(/independent information assistant/);
  });

  it('answers in the requested language', async () => {
    const { result } = await provider.planTurn({ messages: userMessage('नमस्ते'), language: 'hi' });
    expect(result.action).toBe('respond');
    expect(result.text).toContain('स्वतंत्र सूचना सहायक');
  });

  it('asks for clarification on very short ambiguous topics', async () => {
    const { result } = await provider.planTurn({ messages: userMessage('refund'), language: 'en' });
    expect(result.action).toBe('ask_clarification');
    expect(result.question).toMatch(/clarify/i);
  });

  it('calls the knowledge tool for substantive questions', async () => {
    const { result } = await provider.planTurn({
      messages: userMessage('What are the public rules for Tatkal booking?'),
      language: 'en',
    });
    expect(result.action).toBe('call_tools');
    expect(result.toolCalls[0]).toMatchObject({
      name: 'searchKnowledgeBase',
      arguments: { service: 'irctc', language: 'en' },
    });
  });

  it('merges short follow-ups with the previous question', async () => {
    const { result } = await provider.planTurn({
      messages: [
        { role: 'user', content: 'What are the public rules for Tatkal booking?' },
        { role: 'assistant', content: 'Some answer' },
        { role: 'user', content: 'What about refunds?' },
      ],
      language: 'en',
    });
    expect(result.toolCalls[0].arguments.query).toContain('Tatkal booking');
    expect(result.toolCalls[0].arguments.query).toContain('What about refunds?');
  });

  it('abstains when final synthesis has no evidence', async () => {
    const { result } = await provider.generateFinalAnswer({
      evidence: [],
      language: 'en',
      latestUserMessage: 'Unknown question',
    });
    expect(result.answerType).toBe('abstention');
    expect(result.evidenceIds).toEqual([]);
    expect(result.answer).toMatch(/could not find any verified information/);
  });

  it('labels fixture answers as synthetic demo content', async () => {
    const { result } = await provider.generateFinalAnswer({
      evidence: [
        { evidenceId: 'ev_1', text: 'SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY. Placeholder.' },
        { evidenceId: 'ev_2', text: 'SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY. Another placeholder.' },
      ],
      language: 'en',
      latestUserMessage: 'Tatkal rules',
    });
    expect(result.answerType).toBe('grounded');
    expect(result.evidenceIds).toEqual(['ev_1', 'ev_2']);
    expect(result.answer).toContain('synthetic fixtures');
    expect(result.answer).toContain('not official policy');
  });
});

describe('LLM output schemas', () => {
  it('accepts a valid decision and rejects malformed ones', () => {
    expect(sanitizeAgentDecision({ action: 'respond', text: 'Hello' }).success).toBe(true);
    expect(sanitizeAgentDecision({ action: 'call_tools', toolCalls: [] }).success).toBe(false);
    expect(sanitizeAgentDecision({ action: 'ask_clarification' }).success).toBe(false);
    expect(sanitizeAgentDecision({ action: 'run_code' }).success).toBe(false);
  });

  it('rejects final answers with an invalid answer type', () => {
    expect(
      sanitizeFinalAnswer({
        answer: 'x',
        answerType: 'grounded',
      }).success,
    ).toBe(true);
    expect(
      sanitizeFinalAnswer({
        answer: '',
        answerType: 'grounded',
      }).success,
    ).toBe(false);
    expect(
      sanitizeFinalAnswer({
        answer: 'x',
        answerType: 'made_up',
      }).success,
    ).toBe(false);
  });

  it('normalizes verification defaults', () => {
    const parsed = sanitizeVerification({});
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      verdict: 'ok',
      unsupportedClaims: [],
      missingCitations: [],
      notes: [],
    });
  });
});

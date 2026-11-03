import { env, isDemoMode } from '../config/env.js';
import { AgentRun } from '../models/AgentRun.js';
import { Source } from '../models/Source.js';
import { getLLMProvider } from '../adapters/llm/index.js';
import { sanitizeAgentDecision } from '../adapters/llm/schemas.js';
import { executeTool, isAllowedTool, isRetrievalTool, TOOL_DEFINITIONS } from '../agentTools/index.js';
import { EvidenceRegistry } from './evidence.service.js';
import { buildCitations, auditAnswerAgainstEvidence } from './citation.service.js';
import { computeConfidence } from './confidence.service.js';
import { evaluateSafety } from './safety.service.js';
import { synthesizeFinalAnswer, runVerificationPass } from './evidenceSynthesis.service.js';
import { termCoverage, truncate } from '../utils/text.js';
import { logger } from '../utils/logger.js';

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function addUsage(total, usage = {}) {
  total.promptTokens += usage.promptTokens || 0;
  total.completionTokens += usage.completionTokens || 0;
  total.totalTokens += usage.totalTokens || 0;
}

function fallbackText(language, reason) {
  if (language === 'hi') {
    return `क्षमा करें, मैं इस उत्तर को सुरक्षित रूप से पूरा नहीं कर सका (${reason})। कृपया पुनः प्रयास करें या प्रश्न को थोड़ा सरल करें।`;
  }
  if (language === 'kn') {
    return `ಕ್ಷಮಿಸಿ, ಈ ಉತ್ತರವನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಪೂರ್ಣಗೊಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ (${reason}). ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ಪ್ರಶ್ನೆಯನ್ನು ಸ್ವಲ್ಪ ಸರಳಗೊಳಿಸಿ.`;
  }
  return `Sorry, I could not complete that answer safely (${reason}). Please retry, or narrow the question.`;
}

function unverifiedNote(language) {
  if (language === 'hi') return 'नोट: इस उत्तर के लिए कोई सत्यापित स्रोत उपलब्ध नहीं था, इसलिए इसे असत्यापित मानें।';
  if (language === 'kn') return 'ಸೂಚನೆ: ಈ ಉತ್ತರಕ್ಕೆ ಪರಿಶೀಲಿತ ಮೂಲ ಲಭ್ಯವಿಲ್ಲ, ಆದ್ದರಿಂದ ಇದನ್ನು ಪರಿಶೀಲಿಸದ ಮಾಹಿತಿ ಎಂದು ಪರಿಗಣಿಸಿ.';
  return 'Note: no verified source was available for this answer, so treat it as unverified.';
}

/**
 * Bounded agent loop. The model proposes actions and tool calls; this service
 * enforces allowlists, budgets, timeouts, evidence validation and citation
 * assembly. It never exposes hidden reasoning.
 */
export async function runAgentTurn({
  sessionId,
  messages,
  latestUserMessage,
  language = 'en',
  llm = getLLMProvider(),
  requestId = null,
}) {
  const startedAt = Date.now();
  const registry = new EvidenceRegistry({ maxEvidence: Math.max(env.AGENT_MAX_EVIDENCE_CHUNKS * 2, 12) });
  const usage = { ...ZERO_USAGE };
  const policyConfig = {
    maxSteps: env.AGENT_MAX_STEPS,
    maxRetrievalCalls: env.AGENT_MAX_RETRIEVAL_CALLS,
    maxRuntimeMs: env.AGENT_MAX_RUNTIME_MS,
    maxAnswerChars: 9000,
    maxEvidenceChunks: env.AGENT_MAX_EVIDENCE_CHUNKS,
  };

  const run = await AgentRun.create({
    sessionId,
    status: 'running',
    startedAt: new Date(startedAt),
    modelProvider: llm.provider || 'unknown',
    modelName: llm.model || 'unknown',
    demoMode: isDemoMode,
  });

  let toolCallCount = 0;
  let retrievalCallCount = 0;
  let steps = 0;
  let stopReason = null;
  let agentStatus = 'completed';
  let verification = { verdict: 'ok', unsupportedClaims: [], missingCitations: [], notes: [] };
  let clarification = null;
  let directText = null;
  let evidenceMeta = { semanticUsed: false, degraded: false, store: null };

  const safety = evaluateSafety({ message: latestUserMessage, language });
  let answer = null;

  try {
    if (safety) {
      stopReason = `safety:${safety.category}`;
      const result = {
        answer: safety.answer,
        evidenceIds: [],
        needsClarification: Boolean(safety.needsClarification),
        followUpQuestion: safety.followUpQuestion ?? null,
        confidence: safety.confidence || 'low',
        answerType: safety.answerType || 'abstention',
      };
      return await finishRun({ run, result, registry, language, stopReason, agentStatus, startedAt, usage, counts: { toolCallCount, retrievalCallCount }, verification, evidenceMeta, safetyCategory: safety.category });
    }

    let toolResults = [];
    const seenSignatures = new Set();

    while (steps < policyConfig.maxSteps) {
      if (Date.now() - startedAt > policyConfig.maxRuntimeMs) {
        stopReason = 'runtime_budget_exhausted';
        agentStatus = 'budget_exhausted';
        break;
      }
      steps += 1;

      const policy = {
        ...policyConfig,
        remainingRetrievals: Math.max(policyConfig.maxRetrievalCalls - retrievalCallCount, 0),
      };

      let decisionPayload;
      if (steps === 1) {
        decisionPayload = {
          messages,
          sessionSummary: '',
          language,
          tools: TOOL_DEFINITIONS,
          policy,
        };
      } else {
        decisionPayload = {
          messages,
          sessionSummary: '',
          toolResults,
          language,
          tools: TOOL_DEFINITIONS,
          policy,
        };
      }

      let callResult;
      try {
        callResult = steps === 1 ? await llm.planTurn(decisionPayload) : await llm.continueTurn(decisionPayload);
      } catch (error) {
        stopReason = error.code || 'llm_error';
        agentStatus = error.statusCode === 504 ? 'timeout' : 'failed';
        logger.warn({ requestId, code: stopReason }, 'Agent decision call failed');
        break;
      }
      addUsage(usage, callResult.usage);

      const parsed = sanitizeAgentDecision(callResult.result);
      if (!parsed.success) {
        stopReason = 'invalid_agent_decision';
        break;
      }
      const decision = parsed.data;

      if (decision.action === 'respond') {
        if (decision.text && registry.size === 0) directText = decision.text;
        break;
      }

      if (decision.action === 'ask_clarification') {
        clarification = { question: decision.question, reason: decision.reason || '' };
        break;
      }

      if (decision.action === 'call_tools') {
        toolResults = [];
        let clarificationFromTool = null;

        for (const call of decision.toolCalls) {
          if (!isAllowedTool(call.name)) {
            toolResults.push({
              toolCallId: call.id,
              name: call.name,
              status: 'error',
              code: 'tool_not_allowed',
              message: 'That tool is not available.',
              evidence: [],
            });
            continue;
          }

          const signature = `${call.name}:${JSON.stringify(call.arguments)}`;
          if (seenSignatures.has(signature)) {
            toolResults.push({
              toolCallId: call.id,
              name: call.name,
              status: 'error',
              code: 'duplicate_tool_call',
              message: 'The same tool call was already made this turn; use the existing evidence.',
              evidence: [],
            });
            continue;
          }
          seenSignatures.add(signature);

          if (isRetrievalTool(call.name)) {
            if (retrievalCallCount >= policyConfig.maxRetrievalCalls) {
              toolResults.push({
                toolCallId: call.id,
                name: call.name,
                status: 'error',
                code: 'retrieval_budget_exhausted',
                message: 'The retrieval budget for this turn is exhausted. Answer with the evidence already gathered.',
                evidence: [],
              });
              stopReason = 'retrieval_budget_exhausted';
              agentStatus = 'budget_exhausted';
              continue;
            }
            retrievalCallCount += 1;
          }

          toolCallCount += 1;
          const result = await executeTool(call.name, call.arguments, {
            registry,
            includeFixtures: isDemoMode,
          });
          toolResults.push({ ...result, toolCallId: call.id });

          if (result.meta?.semanticUsed) evidenceMeta.semanticUsed = true;
          if (result.meta?.degraded) evidenceMeta.degraded = true;
          if (result.meta?.store) evidenceMeta.store = result.meta.store;

          if (result.clarification) {
            clarificationFromTool = result.clarification;
            break;
          }
        }

        if (clarificationFromTool) {
          clarification = clarificationFromTool;
          break;
        }

        const allFailed = toolResults.every((result) => result.status !== 'ok');
        if (allFailed && retrievalCallCount >= policyConfig.maxRetrievalCalls) {
          stopReason = stopReason || 'retrieval_failed';
          break;
        }
        continue;
      }
    }

    if (!stopReason && steps >= policyConfig.maxSteps) {
      stopReason = 'step_budget_exhausted';
      agentStatus = 'budget_exhausted';
    }

    if (clarification) {
      answer = {
        answer: clarification.question,
        evidenceIds: [],
        needsClarification: true,
        followUpQuestion: clarification.question,
        confidence: 'low',
        answerType: 'clarification',
      };
      return await finishRun({
        run,
        result: answer,
        registry,
        language,
        stopReason: stopReason || 'clarification_requested',
        agentStatus,
        startedAt,
        usage,
        counts: { toolCallCount, retrievalCallCount },
        verification,
        evidenceMeta,
      });
    }

    if (directText) {
      answer = {
        answer: directText,
        evidenceIds: [],
        needsClarification: false,
        followUpQuestion: null,
        confidence: 'medium',
        answerType: 'general',
      };
      return await finishRun({
        run,
        result: answer,
        registry,
        language,
        stopReason: stopReason || 'answered_without_retrieval',
        agentStatus,
        startedAt,
        usage,
        counts: { toolCallCount, retrievalCallCount },
        verification,
        evidenceMeta,
      });
    }

    // Final synthesis from collected evidence.
    let synthesis;
    try {
      synthesis = await synthesizeFinalAnswer({
        llm,
        messages,
        evidence: registry.list(),
        language,
        latestUserMessage,
        responseStyle: 'clear, concise, citizen-friendly',
        policy: policyConfig,
      });
      addUsage(usage, synthesis.usage);
      answer = synthesis.answer;
    } catch (error) {
      stopReason = stopReason || error.code || 'llm_error';
      agentStatus = 'failed';
      answer = {
        answer: fallbackText(language, error.code || 'llm_error'),
        evidenceIds: [],
        needsClarification: false,
        followUpQuestion: null,
        confidence: 'low',
        answerType: 'abstention',
      };
      return await finishRun({
        run,
        result: answer,
        registry,
        language,
        stopReason,
        agentStatus,
        startedAt,
        usage,
        counts: { toolCallCount, retrievalCallCount },
        verification,
        evidenceMeta,
      });
    }

    const sources = await Source.find({
      _id: { $in: [...new Set(registry.list().map((item) => item.sourceId))] },
    }).lean();
    const sourcesById = new Map(sources.map((source) => [String(source._id), source]));

    let citationResult = buildCitations({
      evidenceIds: answer.evidenceIds,
      registry,
      sourcesById,
    });

    const audit = auditAnswerAgainstEvidence({
      answer: answer.answer,
      answerType: answer.answerType,
      citations: citationResult.citations,
      registry,
      evidenceIds: answer.evidenceIds,
    });

    if (audit.issues.some((issue) => issue.type === 'unknown_url')) {
      const allowed = new Set(registry.list().map((item) => item.sourceUrl));
      answer.answer = answer.answer.replace(/https?:\/\/[^\s)\]"'<>]+/gi, (url) =>
        allowed.has(url) ? url : 'the official source linked below',
      );
    }

    if (
      (answer.answerType === 'grounded' || answer.answerType === 'mixed') &&
      citationResult.citations.length === 0
    ) {
      answer.answerType = 'abstention';
      answer.answer = `${answer.answer}\n\n${unverifiedNote(language)}`;
      stopReason = stopReason || 'citation_validation_failed';
    }

    // Bounded verification: at most one extra model call, plus at most one
    // targeted retrieval iteration if budget remains.
    if (answer.answerType === 'grounded' || answer.answerType === 'mixed') {
      const verifyResult = await runVerificationPass({ llm, answer: answer.answer, evidence: registry.list() });
      addUsage(usage, verifyResult.usage);
      verification = verifyResult.verification;

      if (
        verification.verdict === 'issues' &&
        verification.unsupportedClaims.length > 0 &&
        retrievalCallCount < policyConfig.maxRetrievalCalls &&
        steps < policyConfig.maxSteps &&
        Date.now() - startedAt < policyConfig.maxRuntimeMs
      ) {
        retrievalCallCount += 1;
        toolCallCount += 1;
        steps += 1;
        const followUp = await executeTool(
          'searchKnowledgeBase',
          { query: truncate(verification.unsupportedClaims[0], 300), service: 'irctc', limit: 5 },
          { registry, includeFixtures: isDemoMode },
        );
        if (followUp.status === 'ok' && followUp.evidence?.length) {
          try {
            const retry = await synthesizeFinalAnswer({
              llm,
              messages,
              evidence: registry.list(),
              language,
              latestUserMessage,
              responseStyle: 'clear, concise, citizen-friendly',
              policy: policyConfig,
            });
            addUsage(usage, retry.usage);
            answer = retry.answer;
            citationResult = buildCitations({ evidenceIds: answer.evidenceIds, registry, sourcesById });
          } catch {
            // keep the first answer
          }
        }
      }
    }

    const coverage =
      registry.size === 0
        ? 0
        : registry
            .list()
            .slice(0, 5)
            .reduce((max, item) => Math.max(max, termCoverage(latestUserMessage, item.text)), 0);

    answer.confidence = computeConfidence({
      evidence: registry.list(),
      answerType: answer.answerType,
      verification,
      coverage,
      citationCount: citationResult.citations.length,
    });

    return await finishRun({
      run,
      result: answer,
      registry,
      language,
      stopReason: stopReason || 'completed',
      agentStatus,
      startedAt,
      usage,
      counts: { toolCallCount, retrievalCallCount },
      verification,
      evidenceMeta,
      citationResult,
      sourcesById,
      steps,
    });
  } catch (error) {
    logger.error({ requestId, err: { name: error.name, message: error.message } }, 'Agent turn failed');
    await AgentRun.updateOne(
      { _id: run._id },
      {
        $set: {
          status: 'failed',
          finishedAt: new Date(),
          totalLatencyMs: Date.now() - startedAt,
          toolCallCount,
          retrievalCallCount,
          errorCode: error.code || 'agent_error',
          stopReason: 'agent_error',
        },
      },
    ).catch(() => {});
    throw error;
  }
}

async function finishRun({
  run,
  result,
  registry,
  language,
  stopReason,
  agentStatus,
  startedAt,
  usage,
  counts,
  verification,
  evidenceMeta,
  citationResult,
  sourcesById,
  steps = 0,
  safetyCategory = null,
}) {
  let citations = citationResult?.citations || [];
  if (!citationResult && result.evidenceIds?.length) {
    const sources = await Source.find({
      _id: { $in: [...new Set(registry.list().map((item) => item.sourceId))] },
    }).lean();
    const map = sourcesById || new Map(sources.map((source) => [String(source._id), source]));
    citations = buildCitations({ evidenceIds: result.evidenceIds, registry, sourcesById: map }).citations;
  }

  const latency = Date.now() - startedAt;
  await AgentRun.updateOne(
    { _id: run._id },
    {
      $set: {
        status: agentStatus === 'completed' ? 'completed' : agentStatus === 'timeout' ? 'timeout' : agentStatus,
        finishedAt: new Date(),
        totalLatencyMs: latency,
        toolCallCount: counts.toolCallCount,
        retrievalCallCount: counts.retrievalCallCount,
        tokenUsage: usage,
        stopReason,
        steps,
        verificationVerdict: verification?.verdict || null,
        safetyCategory,
      },
    },
  ).catch(() => {});

  return {
    runId: String(run._id),
    answer: result.answer,
    citations,
    needsClarification: Boolean(result.needsClarification),
    followUpQuestion: result.followUpQuestion ?? null,
    confidence: result.confidence,
    answerType: result.answerType,
    agentStatus: agentStatus === 'completed' ? 'completed' : agentStatus,
    demoMode: isDemoMode,
    evidenceCount: registry.size,
    retrieval: evidenceMeta,
    verification,
    safetyCategory,
    stopReason,
    latencyMs: latency,
    tokenUsage: usage,
    toolCallCount: counts.toolCallCount,
    retrievalCallCount: counts.retrievalCallCount,
    language,
  };
}

import { AppError } from '../utils/errors.js';
import { sanitizeFinalAnswer, sanitizeVerification } from '../adapters/llm/schemas.js';

export async function synthesizeFinalAnswer({
  llm,
  messages,
  evidence,
  language,
  latestUserMessage,
  responseStyle,
  policy,
}) {
  if (evidence.length > policy.maxEvidenceChunks) {
    evidence = evidence.slice(0, policy.maxEvidenceChunks);
  }
  const { result, usage } = await llm.generateFinalAnswer({
    messages,
    evidence,
    language,
    latestUserMessage,
    responseStyle,
    policy,
  });
  const parsed = sanitizeFinalAnswer(result);
  if (!parsed.success) {
    throw new AppError('The model returned an answer that does not match the required schema.', {
      statusCode: 502,
      code: 'llm_schema_invalid',
      details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return { answer: parsed.data, usage: usage || {} };
}

export async function runVerificationPass({ llm, answer, evidence }) {
  if (evidence.length === 0) {
    return { verification: { verdict: 'ok', unsupportedClaims: [], missingCitations: [], notes: [] }, usage: {} };
  }
  const { result, usage } = await llm.verifyAnswer({ answer, evidence });
  const parsed = sanitizeVerification(result);
  if (!parsed.success) {
    return {
      verification: {
        verdict: 'ok',
        unsupportedClaims: [],
        missingCitations: [],
        notes: ['verification_schema_invalid'],
      },
      usage: usage || {},
    };
  }
  return { verification: parsed.data, usage: usage || {} };
}

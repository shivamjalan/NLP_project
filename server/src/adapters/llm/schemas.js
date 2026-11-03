import { z } from 'zod';

export const toolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.record(z.unknown()).default({}),
});

export const agentDecisionSchema = z
  .object({
    action: z.enum(['respond', 'ask_clarification', 'call_tools']),
    text: z.string().max(4000).optional(),
    question: z.string().max(500).optional(),
    reason: z.string().max(300).optional(),
    toolCalls: z.array(toolCallSchema).max(4).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'call_tools' && (!value.toolCalls || value.toolCalls.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'call_tools requires at least one tool call.',
      });
    }
    if (value.action === 'ask_clarification' && !value.question) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ask_clarification requires a question.',
      });
    }
  });

export const finalAnswerSchema = z.object({
  answer: z.string().min(1).max(12_000),
  evidenceIds: z.array(z.string().max(80)).max(20).default([]),
  needsClarification: z.boolean().default(false),
  followUpQuestion: z.string().max(500).nullable().default(null),
  confidence: z.enum(['high', 'medium', 'low']).default('low'),
  answerType: z.enum(['grounded', 'general', 'mixed', 'clarification', 'abstention']),
});

export const verificationSchema = z.object({
  verdict: z.enum(['ok', 'issues']).default('ok'),
  unsupportedClaims: z.array(z.string().max(500)).max(20).default([]),
  missingCitations: z.array(z.string().max(500)).max(20).default([]),
  notes: z.array(z.string().max(500)).max(10).default([]),
});

export const agentToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.unknown()),
});

export function sanitizeAgentDecision(value) {
  return agentDecisionSchema.safeParse(value);
}

export function sanitizeFinalAnswer(value) {
  return finalAnswerSchema.safeParse(value);
}

export function sanitizeVerification(value) {
  return verificationSchema.safeParse(value);
}

import { z } from 'zod';

export const name = 'askClarification';

export const schema = z.object({
  question: z.string().trim().min(3).max(300),
  reason: z.string().trim().max(200).optional(),
});

export const definition = {
  name,
  description: 'Ask the user one concise clarification question and pause the agent run.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['question'],
    additionalProperties: false,
  },
};

export const isRetrieval = false;

export async function execute(args) {
  return {
    status: 'ok',
    name,
    clarification: { question: args.question, reason: args.reason || '' },
    evidence: [],
  };
}

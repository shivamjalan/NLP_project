import { z } from 'zod';

export const name = 'compareEvidence';

export const schema = z.object({
  evidenceIds: z.array(z.string().min(2).max(40)).min(2).max(12),
  comparisonQuestion: z.string().trim().min(3).max(500),
});

export const definition = {
  name,
  description:
    'Organise already-retrieved evidence into a side-by-side comparison. Does not fetch new content or add facts.',
  parameters: {
    type: 'object',
    properties: {
      evidenceIds: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 12 },
      comparisonQuestion: { type: 'string' },
    },
    required: ['evidenceIds', 'comparisonQuestion'],
    additionalProperties: false,
  },
};

export const isRetrieval = false;

export async function execute(args, context) {
  const selected = args.evidenceIds.map((id) => context.registry.get(id)).filter(Boolean);
  if (selected.length < 2) {
    return {
      status: 'error',
      name,
      code: 'evidence_unavailable',
      message: 'At least two evidence IDs from this turn are required for a comparison.',
    };
  }

  const groups = new Map();
  for (const item of selected) {
    if (!groups.has(item.sourceId)) {
      groups.set(item.sourceId, {
        sourceId: item.sourceId,
        title: item.sourceTitle,
        authority: item.authority,
        lastVerifiedAt: item.lastVerifiedAt,
        passages: [],
      });
    }
    groups.get(item.sourceId).passages.push({ evidenceId: item.evidenceId, text: item.text });
  }

  return {
    status: 'ok',
    name,
    evidence: selected.map((item) => ({
      evidenceId: item.evidenceId,
      sourceId: item.sourceId,
      sourceTitle: item.sourceTitle,
      authority: item.authority,
      text: item.text,
      score: item.score,
      retrievalMethod: item.retrievalMethod,
    })),
    comparison: { question: args.comparisonQuestion, sources: [...groups.values()] },
  };
}

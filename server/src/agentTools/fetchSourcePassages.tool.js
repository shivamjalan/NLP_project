import { z } from 'zod';
import { getPassagesByIds } from '../services/retrieval.service.js';
import { registerEvidence } from './shared.js';

export const name = 'fetchSourcePassages';

export const schema = z.object({
  sourceId: z.string().regex(/^[a-f\d]{24}$/i),
  passageIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(5),
});

export const definition = {
  name,
  description:
    'Fetch additional passages from an already-known approved source. passageIds must come from earlier tool results.',
  parameters: {
    type: 'object',
    properties: {
      sourceId: { type: 'string' },
      passageIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
    },
    required: ['sourceId', 'passageIds'],
    additionalProperties: false,
  },
};

export const isRetrieval = true;

export async function execute(args, context) {
  const { source, chunks } = await getPassagesByIds({
    sourceId: args.sourceId,
    passageIds: args.passageIds,
  });
  if (!source) {
    return {
      status: 'error',
      name,
      code: 'source_not_found',
      message: 'That source is not available in the approved registry.',
    };
  }
  if (!chunks.length) {
    return {
      status: 'error',
      name,
      code: 'passages_not_found',
      message: 'No matching passages were found for that source.',
    };
  }
  const evidence = registerEvidence(
    chunks.map((chunk) => ({ chunk, source, score: 0.5, retrievalMethod: 'passage_fetch' })),
    context.registry,
  );
  return { status: 'ok', name, evidence, meta: { returned: evidence.length } };
}

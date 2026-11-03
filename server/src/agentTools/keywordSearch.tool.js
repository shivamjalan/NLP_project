import { z } from 'zod';
import { hybridSearch } from '../services/retrieval.service.js';
import { languageSchema, limitSchema, registerEvidence, serviceSchema } from './shared.js';

export const name = 'keywordSearch';

export const schema = z.object({
  query: z.string().trim().min(1).max(500),
  service: serviceSchema,
  language: languageSchema,
  limit: limitSchema,
});

export const definition = {
  name,
  description:
    'Lexical search for exact phrases, form names, codes and terminology. Complements semantic search.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      service: { type: 'string', enum: ['irctc'] },
      language: { type: 'string', enum: ['en', 'hi', 'kn'] },
      limit: { type: 'integer', minimum: 1, maximum: 10 },
    },
    required: ['query'],
    additionalProperties: false,
  },
};

export const isRetrieval = true;

export async function execute(args, context) {
  const search = await hybridSearch({
    query: args.query,
    filters: {
      service: args.service,
      language: args.language,
      includeFixtures: context.includeFixtures,
    },
    limit: args.limit,
  });
  const lexical = search.items.filter((item) => item.retrievalMethod.includes('keyword'));
  const evidence = registerEvidence(lexical, context.registry);
  return {
    status: 'ok',
    name,
    evidence,
    meta: { ...search.meta, mode: 'keyword', returned: evidence.length },
  };
}

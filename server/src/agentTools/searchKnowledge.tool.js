import { z } from 'zod';
import { hybridSearch } from '../services/retrieval.service.js';
import { languageSchema, limitSchema, registerEvidence, serviceSchema } from './shared.js';

export const name = 'searchKnowledgeBase';

export const schema = z.object({
  query: z.string().trim().min(1).max(500),
  service: serviceSchema,
  language: languageSchema,
  sourceTypes: z
    .array(z.enum(['official_page', 'official_pdf', 'faq', 'notice', 'fixture']))
    .max(5)
    .optional(),
  limit: limitSchema,
});

export const definition = {
  name,
  description:
    'Semantic-plus-lexical search over approved indexed public-service passages. Use for open-ended questions and to discover relevant sources.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "Search query in the user's own words." },
      service: { type: 'string', enum: ['irctc'] },
      language: { type: 'string', enum: ['en', 'hi', 'kn'] },
      sourceTypes: { type: 'array', items: { type: 'string' } },
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
      sourceTypes: args.sourceTypes,
      includeFixtures: context.includeFixtures,
    },
    limit: args.limit,
  });
  const evidence = registerEvidence(search.items, context.registry);
  return {
    status: 'ok',
    name,
    evidence,
    meta: { ...search.meta, requestedLimit: args.limit, returned: evidence.length },
  };
}

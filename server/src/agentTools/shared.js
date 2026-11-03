import { z } from 'zod';

export const serviceSchema = z.enum(['irctc']).default('irctc');
export const languageSchema = z.enum(['en', 'hi', 'kn']).optional();
export const limitSchema = z.coerce.number().int().min(1).max(10).default(5);

export function registerEvidence(items, registry) {
  return items
    .map((item) => registry.add(item))
    .filter(Boolean)
    .map((evidence) => ({
      evidenceId: evidence.evidenceId,
      sourceId: evidence.sourceId,
      sourceTitle: evidence.sourceTitle,
      authority: evidence.authority,
      text: evidence.text,
      score: evidence.score,
      retrievalMethod: evidence.retrievalMethod,
    }));
}

import { truncate } from '../utils/text.js';

/**
 * Turn model-selected evidence IDs into public citation objects. The URL,
 * title and authority always come from the stored Source record - never from
 * model output. Unknown IDs are dropped and reported.
 */
export function buildCitations({ evidenceIds = [], registry, sourcesById = new Map(), maxCitations = 6 }) {
  const accepted = [];
  const dropped = [];

  for (const rawId of evidenceIds) {
    const evidence = registry.get(rawId);
    if (!evidence) {
      dropped.push(String(rawId));
      continue;
    }
    if (accepted.length >= maxCitations) continue;
    if (!accepted.some((item) => item.sourceId === evidence.sourceId)) {
      const source = sourcesById.get(evidence.sourceId);
      if (!source || source.active === false) {
        dropped.push(String(rawId));
        continue;
      }
      accepted.push({
        sourceId: evidence.sourceId,
        title: source.title,
        authority: source.authority,
        url: source.canonicalUrl,
        publishedAt: source.publishedAt ? new Date(source.publishedAt).toISOString() : null,
        lastVerifiedAt: new Date(source.lastVerifiedAt).toISOString(),
        snippet: truncate(evidence.text, 320),
        trustLevel: source.trustLevel,
        sourceType: source.sourceType,
      });
    }
  }

  return { citations: accepted, dropped, validEvidenceIds: evidenceIds.filter((id) => registry.has(id)) };
}

/**
 * Structural checks that do not depend on the model: the answer must not leak
 * URLs it invented, and grounded answers must cite at least one valid source.
 */
export function auditAnswerAgainstEvidence({ answer, answerType, citations, registry, evidenceIds }) {
  const issues = [];
  const urlPattern = /https?:\/\/[^\s)\]"'<>]+/gi;
  const allowedUrls = new Set(registry.list().map((item) => item.sourceUrl));
  for (const url of answer.match(urlPattern) || []) {
    if (!allowedUrls.has(url)) issues.push({ type: 'unknown_url', value: url });
  }
  const validIds = evidenceIds.filter((id) => registry.has(id));
  if ((answerType === 'grounded' || answerType === 'mixed') && citations.length === 0) {
    issues.push({ type: 'grounded_without_citation' });
  }
  return { issues, validEvidenceIds: validIds };
}

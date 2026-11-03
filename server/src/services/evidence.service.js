import { truncate } from '../utils/text.js';

/**
 * Per-turn evidence registry. Evidence IDs are minted here, so an ID can only
 * exist if a tool actually returned that chunk during this run. Model output is
 * validated against this registry - invented IDs and URLs are discarded.
 */
export class EvidenceRegistry {
  constructor({ maxEvidence = 24 } = {}) {
    this.maxEvidence = maxEvidence;
    this.byId = new Map();
    this.byChunkId = new Map();
    this.sequence = 0;
  }

  add({ chunk, source, score = 0, retrievalMethod = 'unknown' }) {
    if (!chunk || !source) return null;
    const chunkId = String(chunk._id || chunk.chunkId || '');
    if (!chunkId) return null;

    const existing = this.byChunkId.get(chunkId);
    if (existing) {
      if (score > existing.score) existing.score = score;
      return existing;
    }
    if (this.byId.size >= this.maxEvidence) return null;

    this.sequence += 1;
    const evidence = {
      evidenceId: `ev_${this.sequence}`,
      chunkId,
      sourceId: String(source._id),
      text: truncate(String(chunk.text || ''), 1200),
      score: Number(score) || 0,
      retrievalMethod,
      sourceTitle: source.title,
      authority: source.authority,
      sourceUrl: source.canonicalUrl,
      sourceType: source.sourceType,
      trustLevel: source.trustLevel,
      publishedAt: source.publishedAt || null,
      lastVerifiedAt: source.lastVerifiedAt,
      language: source.language || chunk.language || 'en',
    };
    this.byId.set(evidence.evidenceId, evidence);
    this.byChunkId.set(chunkId, evidence);
    return evidence;
  }

  get(evidenceId) {
    return this.byId.get(String(evidenceId)) || null;
  }

  has(evidenceId) {
    return this.byId.has(String(evidenceId));
  }

  list() {
    return [...this.byId.values()];
  }

  get size() {
    return this.byId.size;
  }
}

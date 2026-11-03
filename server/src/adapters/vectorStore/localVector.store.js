import { Chunk } from '../../models/Chunk.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { buildChunkFilter, MongoTextVectorStore } from './mongoText.store.js';

const MAX_CANDIDATES = 5000;

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = Number(a[index]) || 0;
    const right = Number(b[index]) || 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Keyless local semantic search.
 *
 * Chunk embeddings are stored in MongoDB and ranked in-process with cosine
 * similarity. This keeps the full hybrid retrieval pipeline usable without an
 * Atlas cluster or a paid embedding key. It is intended for the local pilot's
 * small reviewed corpus; it intentionally caps candidates and falls back to
 * lexical search for keyword queries.
 */
export class LocalVectorStore {
  constructor({ dimensions = env.EMBEDDING_DIMENSIONS } = {}) {
    this.name = 'local-vector';
    this.semantic = true;
    this.dimensions = dimensions;
    this.fallback = new MongoTextVectorStore();
    this.candidateCount = 0;
  }

  get capabilities() {
    return { semantic: true, keyword: true, provider: this.name, dimensions: this.dimensions };
  }

  async search(queryVector, filters = {}, limit = 8) {
    if (!Array.isArray(queryVector) || queryVector.length !== this.dimensions) {
      throw new Error('Query vector dimension does not match the configured embedding dimension.');
    }

    const filter = {
      ...buildChunkFilter(filters),
      embedding: { $exists: true },
      embeddingDimensions: this.dimensions,
    };
    const boundedLimit = Math.min(Math.max(limit, 1), 50);

    const docs = await Chunk.find(filter)
      .select('+embedding')
      .limit(MAX_CANDIDATES)
      .lean({ virtuals: false });

    if (docs.length === MAX_CANDIDATES) {
      logger.warn(
        { candidates: docs.length, maxCandidates: MAX_CANDIDATES },
        'Local vector search hit its candidate cap; results may be incomplete for this corpus size.',
      );
    }
    this.candidateCount = docs.length;

    const ranked = docs
      .map((doc) => {
        const { embedding, ...chunk } = doc;
        return { ...chunk, score: cosineSimilarity(queryVector, embedding), retrievalMethod: 'semantic' };
      })
      .filter((chunk) => chunk.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, boundedLimit);

    return ranked;
  }

  async keywordSearch(query, filters = {}, limit = 8) {
    return this.fallback.keywordSearch(query, filters, limit);
  }
}

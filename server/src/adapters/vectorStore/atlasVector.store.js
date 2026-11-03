import mongoose from 'mongoose';
import { Chunk } from '../../models/Chunk.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { MongoTextVectorStore } from './mongoText.store.js';

/**
 * Atlas Vector Search adapter. The aggregation is assembled from a fixed
 * pipeline; user input only ever appears as the query vector and validated
 * filter values, never as stages or operators.
 *
 * If the index is missing (or the cluster does not support the stage), the
 * store falls back to $text and reports `degraded: true` so the API can label
 * the limitation instead of silently pretending semantic search worked.
 */
export class AtlasVectorStore {
  constructor({ indexName = env.VECTOR_INDEX_NAME, dimensions = env.EMBEDDING_DIMENSIONS } = {}) {
    this.name = 'atlas-vector';
    this.semantic = true;
    this.indexName = indexName;
    this.dimensions = dimensions;
    this.fallback = new MongoTextVectorStore();
    this.degraded = false;
    this.lastError = null;
  }

  get capabilities() {
    return {
      semantic: !this.degraded,
      keyword: true,
      provider: this.name,
      degraded: this.degraded,
      reason: this.lastError,
    };
  }

  async search(queryVector, filters = {}, limit = 8) {
    if (!Array.isArray(queryVector) || queryVector.length !== this.dimensions) {
      throw new Error('Query vector dimension does not match the configured embedding dimension.');
    }

    const filter = { active: true };
    if (filters.service) filter.service = String(filters.service);
    if (filters.language) filter.language = String(filters.language);
    if (filters.sourceTypes?.length) filter.sourceType = { $in: filters.sourceTypes.map(String) };
    if (filters.sourceIds?.length) {
      filter.sourceId = {
        $in: filters.sourceIds
          .filter((id) => mongoose.isValidObjectId(id))
          .map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    const boundedLimit = Math.min(Math.max(limit, 1), 50);
    try {
      const docs = await Chunk.aggregate([
        {
          $vectorSearch: {
            index: this.indexName,
            path: 'embedding',
            queryVector,
            numCandidates: Math.max(boundedLimit * 20, 100),
            limit: boundedLimit,
            filter,
          },
        },
        { $addFields: { score: { $meta: 'vectorSearchScore' } } },
        { $project: { embedding: 0, __v: 0 } },
      ]);
      this.degraded = false;
      this.lastError = null;
      return docs.map((doc) => ({ ...doc, retrievalMethod: 'semantic' }));
    } catch (error) {
      this.degraded = true;
      this.lastError = error.codeName || error.name || 'vector_search_unavailable';
      logger.warn(
        { reason: this.lastError },
        'Atlas Vector Search unavailable; falling back to MongoDB text search. Create the vector index described in docs/ARCHITECTURE.md.',
      );
      return [];
    }
  }

  async keywordSearch(query, filters = {}, limit = 8) {
    return this.fallback.keywordSearch(query, filters, limit);
  }
}

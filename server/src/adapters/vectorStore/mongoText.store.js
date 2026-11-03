import mongoose from 'mongoose';
import { Chunk } from '../../models/Chunk.js';
import { escapeRegex } from '../../utils/text.js';

const BLOCKED_OPERATORS = ['$where', '$function', '$accumulator', '$jsonSchema'];

export function buildChunkFilter(filters = {}) {
  const filter = { active: true };
  if (filters.service) filter.service = String(filters.service);
  if (filters.language) filter.language = String(filters.language);
  if (filters.sourceTypes?.length) filter.sourceType = { $in: filters.sourceTypes.map(String) };
  if (filters.sourceIds?.length) {
    filter.sourceId = {
      $in: filters.sourceIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id)),
    };
  }
  if (filters.documentId && mongoose.isValidObjectId(filters.documentId)) {
    filter.documentId = new mongoose.Types.ObjectId(filters.documentId);
  }
  return filter;
}

function assertSafeQuery(query) {
  const serialized = JSON.stringify(query);
  if (BLOCKED_OPERATORS.some((operator) => serialized.includes(operator))) {
    throw new Error('Blocked MongoDB operator in retrieval query.');
  }
}

/**
 * MongoDB Atlas `$text` search. This is the documented local/no-index
 * fallback: it is lexical, not semantic, and the API reports that explicitly.
 */
export class MongoTextVectorStore {
  constructor() {
    this.name = 'mongodb-text';
    this.semantic = false;
  }

  get capabilities() {
    return { semantic: false, keyword: true, provider: this.name };
  }

  async search() {
    return [];
  }

  async keywordSearch(query, filters = {}, limit = 8) {
    const text = String(query || '').trim();
    if (!text) return [];
    const filter = { ...buildChunkFilter(filters), $text: { $search: text } };
    assertSafeQuery(filter);

    try {
      const docs = await Chunk.find(filter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(Math.min(Math.max(limit, 1), 50))
        .lean({ virtuals: false });
      return docs.map((doc) => ({ ...doc, score: doc.score ?? 0, retrievalMethod: 'keyword' }));
    } catch {
      // A missing text index should degrade to a bounded regex search rather
      // than failing the conversation.
      const terms = text
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length > 2)
        .slice(0, 4);
      if (!terms.length) return [];
      const regex = new RegExp(terms.map(escapeRegex).join('|'), 'i');
      const docs = await Chunk.find({ ...buildChunkFilter(filters), text: regex })
        .limit(Math.min(Math.max(limit, 1), 20))
        .lean({ virtuals: false });
      return docs.map((doc) => ({ ...doc, score: 0.1, retrievalMethod: 'keyword_regex' }));
    }
  }
}

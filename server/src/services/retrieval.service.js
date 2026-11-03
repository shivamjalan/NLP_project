import { Chunk } from '../models/Chunk.js';
import { Source } from '../models/Source.js';
import { getVectorStore } from '../adapters/vectorStore/index.js';
import { getEmbeddingProvider } from '../adapters/embeddings/index.js';
import { env, isDemoMode } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function mergeRetrievalResults(semanticResults = [], keywordResults = [], { k = 60 } = {}) {
  const merged = new Map();

  const addAll = (results, method) => {
    results.forEach((result, rank) => {
      const id = String(result._id);
      const existing = merged.get(id);
      const rrf = 1 / (k + rank + 1);
      if (existing) {
        existing.score += rrf;
        if (!existing.methods.includes(method)) existing.methods.push(method);
      } else {
        merged.set(id, { chunk: result, score: rrf, methods: [method] });
      }
    });
  };

  addAll(semanticResults, 'semantic');
  addAll(keywordResults, 'keyword');

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .map((item) => ({
      chunk: item.chunk,
      score: Number(item.score.toFixed(6)),
      retrievalMethod: item.methods.join('+'),
    }));
}

/**
 * Hybrid retrieval: optional semantic results (local-vector or Atlas) plus
 * lexical results, merged with reciprocal-rank fusion, then filtered against
 * active, approved source records. Language filtering is relaxed if it would
 * starve the result set, because official sources are often English-only.
 */
export async function hybridSearch({ query, filters = {}, limit = 8, vectorStore, embeddingProvider } = {}) {
  const store = vectorStore || getVectorStore();
  const embedder = embeddingProvider || getEmbeddingProvider();
  const service = filters.service || 'irctc';
  const includeFixtures = filters.includeFixtures ?? isDemoMode;

  const baseFilters = { service, sourceTypes: filters.sourceTypes };
  if (filters.language) baseFilters.language = filters.language;

  let semanticUsed = false;
  let degraded = false;
  let languageRelaxed = false;

  const runSearch = async (searchFilters) => {
    let semantic = [];
    if (store.capabilities?.semantic && embedder) {
      try {
        const vector = await embedder.embedQuery(query);
        semantic = await store.search(vector, searchFilters, limit);
        semanticUsed = semanticUsed || semantic.length > 0;
        if (store.capabilities?.degraded) degraded = true;
      } catch (error) {
        degraded = true;
        logger.warn({ err: { name: error.name } }, 'Semantic retrieval failed; using keyword results');
      }
    }
    const keyword = await store.keywordSearch(query, searchFilters, limit);
    return { semantic, keyword };
  };

  let { semantic, keyword } = await runSearch(baseFilters);
  if (semantic.length + keyword.length < 2 && baseFilters.language) {
    const relaxed = { ...baseFilters };
    delete relaxed.language;
    const retry = await runSearch(relaxed);
    semantic = [...semantic, ...retry.semantic];
    keyword = [...keyword, ...retry.keyword];
    languageRelaxed = true;
  }

  const merged = mergeRetrievalResults(semantic, keyword).slice(0, Math.min(Math.max(limit, 1), 20));
  if (!merged.length) {
    return {
      items: [],
      meta: { semanticUsed, degraded, languageRelaxed, store: store.name, count: 0 },
    };
  }

  const sourceIds = [...new Set(merged.map((item) => String(item.chunk.sourceId)))];
  const sources = await Source.find({
    _id: { $in: sourceIds },
    active: true,
    ...(includeFixtures ? {} : { trustLevel: { $ne: 'fixture' } }),
  }).lean();
  const sourceMap = new Map(sources.map((source) => [String(source._id), source]));

  const items = merged
    .filter((item) => sourceMap.has(String(item.chunk.sourceId)))
    .map((item) => ({
      chunk: item.chunk,
      source: sourceMap.get(String(item.chunk.sourceId)),
      score: item.score,
      retrievalMethod: item.retrievalMethod,
    }));

  return {
    items,
    meta: {
      semanticUsed,
      degraded: degraded || store.capabilities?.degraded === true,
      languageRelaxed,
      store: store.name,
      count: items.length,
    },
  };
}

export async function getPassagesByIds({ sourceId, passageIds = [] }) {
  const source = await Source.findOne({ _id: sourceId, active: true }).lean();
  if (!source) return { source: null, chunks: [] };
  const chunks = await Chunk.find({
    _id: { $in: passageIds },
    sourceId,
    active: true,
  })
    .limit(Math.min(passageIds.length, 10))
    .lean();
  return { source, chunks };
}

export function retrievalStoreLabel() {
  const store = getVectorStore();
  return {
    provider: store.name,
    semantic: store.capabilities?.semantic === true,
    degraded: store.capabilities?.degraded === true,
    index: store.name === 'atlas-vector' ? env.VECTOR_INDEX_NAME : null,
  };
}

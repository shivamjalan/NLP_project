import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hybridSearch, getPassagesByIds, mergeRetrievalResults } from '../../src/services/retrieval.service.js';
import { seedDemoFixtures } from '../../src/services/seed.service.js';
import { Source } from '../../src/models/Source.js';
import { Chunk } from '../../src/models/Chunk.js';
import { LocalVectorStore, cosineSimilarity } from '../../src/adapters/vectorStore/localVector.store.js';
import { getEmbeddingProvider } from '../../src/adapters/embeddings/index.js';
import { startTestDb, stopTestDb } from '../helpers/db.js';

beforeAll(async () => {
  await startTestDb();
  await seedDemoFixtures({ reset: true });
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

describe('reciprocal-rank fusion', () => {
  it('merges semantic and keyword hits and records both methods', () => {
    const a = { _id: 'a' };
    const b = { _id: 'b' };
    const merged = mergeRetrievalResults([a, b], [b]);
    expect(merged).toHaveLength(2);
    const hitB = merged.find((item) => String(item.chunk._id) === 'b');
    expect(hitB.retrievalMethod).toContain('semantic');
    expect(hitB.retrievalMethod).toContain('keyword');
    expect(hitB.score).toBeGreaterThan(merged.find((item) => String(item.chunk._id) === 'a').score);
  });
});

describe('local semantic vector store', () => {
  it('computes cosine similarity defensively', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [1])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('ranks stored chunk embeddings without Atlas', async () => {
    const store = new LocalVectorStore();
    const embedder = getEmbeddingProvider();
    const vector = await embedder.embedQuery('Tatkal booking rules');
    const results = await store.search(vector, { service: 'irctc' }, 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].retrievalMethod).toBe('semantic');
    expect(results[0].embedding).toBeUndefined();
    expect(store.capabilities.semantic).toBe(true);
  });

  it('feeds semantic results into hybrid retrieval with RRF', async () => {
    const result = await hybridSearch({
      query: 'Tatkal booking rules',
      limit: 5,
      vectorStore: new LocalVectorStore(),
      embeddingProvider: getEmbeddingProvider(),
    });

    expect(result.meta.store).toBe('local-vector');
    expect(result.meta.semanticUsed).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
  });
});

describe('hybrid retrieval over demo fixtures', () => {
  it('finds Tatkal fixture passages with a keyword fallback', async () => {
    const result = await hybridSearch({ query: 'Tatkal booking rules', limit: 5 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.some((item) => item.source.trustLevel === 'fixture')).toBe(true);
    expect(result.meta.store).toBe('mongodb-text');
    expect(result.meta.semanticUsed).toBe(false);
  });

  it('excludes fixtures in non-demo mode', async () => {
    const result = await hybridSearch({
      query: 'Tatkal booking rules',
      filters: { includeFixtures: false },
      limit: 5,
    });
    expect(result.items).toEqual([]);
  });

  it('relaxes the language filter when results would be starved', async () => {
    const result = await hybridSearch({
      query: 'Tatkal booking rules',
      filters: { language: 'hi' },
      limit: 5,
    });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.meta.languageRelaxed).toBe(true);
  });

  it('never returns chunks from inactive sources', async () => {
    const fixtureSources = await Source.find({ trustLevel: 'fixture' }).lean();
    await Source.updateOne({ _id: fixtureSources[0]._id }, { $set: { active: false } });
    try {
      const result = await hybridSearch({ query: 'Tatkal booking rules', limit: 10 });
      expect(result.items.every((item) => item.source.active !== false)).toBe(true);
      expect(result.items.some((item) => item.source._id.equals(fixtureSources[0]._id))).toBe(false);
    } finally {
      await Source.updateOne({ _id: fixtureSources[0]._id }, { $set: { active: true } });
    }
  });

  it('fetches additional passages for an approved source', async () => {
    const source = await Source.findOne({ trustLevel: 'fixture' }).lean();
    const chunks = await Chunk.find({ sourceId: source._id }).limit(2).lean();
    const result = await getPassagesByIds({ sourceId: source._id, passageIds: chunks.map((chunk) => chunk._id) });
    expect(result.source._id.toString()).toBe(source._id.toString());
    expect(result.chunks.length).toBeGreaterThan(0);

    const missing = await getPassagesByIds({
      sourceId: '0123456789abcdef01234567',
      passageIds: [chunks[0]._id],
    });
    expect(missing.source).toBeNull();
  });
});

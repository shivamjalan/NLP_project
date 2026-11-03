import { describe, expect, it } from 'vitest';
import { LocalEmbeddingProvider } from '../../src/adapters/embeddings/localEmbedding.provider.js';

function fakePipelineFactory(vectors) {
  const calls = [];
  const factory = async (model) => {
    calls.push(model);
    return async (texts, options) => {
      expect(options).toEqual({ pooling: 'mean', normalize: true });
      const list = Array.isArray(texts) ? texts : [texts];
      expect(list.length).toBeLessThanOrEqual(vectors.length);
      return { tolist: () => vectors.slice(0, list.length) };
    };
  };
  factory.calls = calls;
  return factory;
}

describe('LocalEmbeddingProvider', () => {
  it('embeds documents and queries lazily with the configured dimensions', async () => {
    const factory = fakePipelineFactory([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
    const provider = new LocalEmbeddingProvider({
      model: 'test-model',
      dimensions: 3,
      pipelineFactory: factory,
    });

    expect(provider.metadata).toEqual({ provider: 'local', model: 'test-model', dimensions: 3 });
    expect(factory.calls).toHaveLength(0);

    const vectors = await provider.embedDocuments(['hello', 'नमस्ते']);
    expect(vectors).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
    expect(factory.calls).toEqual(['test-model']);

    const query = await provider.embedQuery('hello');
    expect(query).toEqual([0.1, 0.2, 0.3]);
    expect(factory.calls).toEqual(['test-model']);
  });

  it('returns no vectors for an empty input without loading the model', async () => {
    const factory = fakePipelineFactory([]);
    const provider = new LocalEmbeddingProvider({ dimensions: 3, pipelineFactory: factory });
    await expect(provider.embedDocuments([])).resolves.toEqual([]);
    expect(factory.calls).toHaveLength(0);
  });

  it('rejects dimension mismatches', async () => {
    const provider = new LocalEmbeddingProvider({
      dimensions: 4,
      pipelineFactory: fakePipelineFactory([[0.1, 0.2, 0.3]]),
    });
    await expect(provider.embedDocuments(['hello'])).rejects.toMatchObject({
      code: 'embedding_dimension_mismatch',
    });
  });

  it('resets the lazy model after a load failure so it can be retried', async () => {
    let attempts = 0;
    const provider = new LocalEmbeddingProvider({
      model: 'flaky-model',
      dimensions: 2,
      pipelineFactory: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('download failed');
        return async () => ({ tolist: () => [[1, 0]] });
      },
    });

    await expect(provider.embedQuery('hello')).rejects.toMatchObject({ code: 'embedding_unavailable' });
    await expect(provider.embedQuery('hello')).resolves.toEqual([1, 0]);
    expect(attempts).toBe(2);
  });
});

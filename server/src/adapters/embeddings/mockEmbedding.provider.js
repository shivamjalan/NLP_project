import { env } from '../../config/env.js';
import { tokenizeForSearch } from '../../utils/text.js';
import { createHash } from 'node:crypto';

/**
 * Deterministic, keyless embedding provider for demo mode and tests.
 * It is a hashed bag-of-words projection: good enough to exercise the retrieval
 * pipeline, explicitly *not* a semantic model. It never leaves the process.
 */
export class MockEmbeddingProvider {
  constructor({ dimensions = env.EMBEDDING_DIMENSIONS } = {}) {
    this.dimensions = dimensions;
    this.model = `mock-hash-embedding-v1-${dimensions}d`;
    this.provider = 'mock';
  }

  get metadata() {
    return { provider: this.provider, model: this.model, dimensions: this.dimensions };
  }

  embedQuery(text) {
    return this.#embed(text);
  }

  async embedDocuments(texts) {
    return texts.map((text) => this.#embed(text));
  }

  #embed(text) {
    const vector = new Array(this.dimensions).fill(0);
    const terms = tokenizeForSearch(text);
    if (!terms.length) return vector;

    const counts = new Map();
    for (const term of terms) counts.set(term, (counts.get(term) || 0) + 1);

    for (const [term, count] of counts) {
      const digest = createHash('sha256').update(term).digest();
      const index = digest.readUInt32BE(0) % this.dimensions;
      const sign = digest[4] % 2 === 0 ? 1 : -1;
      vector[index] += sign * (1 + Math.log(count));
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => Number((value / norm).toFixed(8)));
  }
}

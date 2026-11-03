import { env } from '../../config/env.js';
import { serviceUnavailable } from '../../utils/errors.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

async function postJson(url, body, { apiKey, timeoutMs = 15_000, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const error = new Error(`Embedding provider returned ${response.status}: ${text.slice(0, 200)}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      const status = error.status || (error.name === 'TimeoutError' ? 408 : 0);
      const retryable = status === 0 || RETRYABLE.has(status);
      if (!retryable || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  logger.warn({ err: { name: lastError?.name, message: lastError?.message } }, 'Embedding request failed');
  if (lastError?.name === 'TimeoutError') {
    throw new AppError('Embedding provider timed out.', { statusCode: 504, code: 'embedding_timeout' });
  }
  throw serviceUnavailable('Embedding provider is unavailable.', 'embedding_unavailable');
}

export class OpenAICompatibleEmbeddingProvider {
  constructor({
    baseUrl = env.EMBEDDING_BASE_URL,
    apiKey = env.EMBEDDING_API_KEY,
    model = env.EMBEDDING_MODEL,
    dimensions = env.EMBEDDING_DIMENSIONS,
  } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
    this.provider = 'openai-compatible';
  }

  get metadata() {
    return { provider: this.provider, model: this.model, dimensions: this.dimensions };
  }

  async embedQuery(text) {
    const [vector] = await this.embedDocuments([text]);
    return vector;
  }

  async embedDocuments(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    const payload = await postJson(
      `${this.baseUrl}/embeddings`,
      { model: this.model, input: texts },
      { apiKey: this.apiKey },
    );
    const vectors = (payload.data || [])
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => item.embedding);
    if (vectors.length !== texts.length) {
      throw serviceUnavailable('Embedding provider returned an unexpected result count.', 'embedding_bad_response');
    }
    for (const vector of vectors) {
      if (!Array.isArray(vector) || vector.length !== this.dimensions) {
        throw serviceUnavailable(
          `Embedding dimension mismatch: expected ${this.dimensions}, received ${Array.isArray(vector) ? vector.length : 'none'}.`,
          'embedding_dimension_mismatch',
        );
      }
    }
    return vectors.map((vector) => vector.map(Number));
  }
}

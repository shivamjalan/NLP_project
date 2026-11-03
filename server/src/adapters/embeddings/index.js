import { env } from '../../config/env.js';
import { MockEmbeddingProvider } from './mockEmbedding.provider.js';
import { LocalEmbeddingProvider } from './localEmbedding.provider.js';
import { OpenAICompatibleEmbeddingProvider } from './openaiCompatibleEmbedding.provider.js';

let cached = null;

export function createEmbeddingProvider(providerName = env.EMBEDDING_PROVIDER) {
  if (providerName === 'mock') return new MockEmbeddingProvider();
  if (providerName === 'local') return new LocalEmbeddingProvider();
  if (providerName === 'openai-compatible') return new OpenAICompatibleEmbeddingProvider();
  throw new Error(`Unsupported embedding provider: ${providerName}`);
}

export function getEmbeddingProvider() {
  if (!cached) cached = createEmbeddingProvider();
  return cached;
}

export function setEmbeddingProvider(provider) {
  cached = provider;
}

export function resetEmbeddingProvider() {
  cached = null;
}

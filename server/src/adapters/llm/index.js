import { env } from '../../config/env.js';
import { MockLLMProvider } from './mock.provider.js';
import { OpenAICompatibleLLMProvider } from './openaiCompatible.provider.js';

let cached = null;

export function createLLMProvider(providerName = env.LLM_PROVIDER) {
  if (providerName === 'mock') return new MockLLMProvider();
  if (providerName === 'openai-compatible') return new OpenAICompatibleLLMProvider();
  throw new Error(`Unsupported LLM provider: ${providerName}`);
}

export function getLLMProvider() {
  if (!cached) cached = createLLMProvider();
  return cached;
}

export function setLLMProvider(provider) {
  cached = provider;
}

export function resetLLMProvider() {
  cached = null;
}

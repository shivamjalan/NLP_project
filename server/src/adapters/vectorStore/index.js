import { env } from '../../config/env.js';
import { MongoTextVectorStore } from './mongoText.store.js';
import { LocalVectorStore } from './localVector.store.js';
import { AtlasVectorStore } from './atlasVector.store.js';

let cached = null;

export function createVectorStore(providerName = env.VECTOR_STORE_PROVIDER) {
  if (providerName === 'local-vector') return new LocalVectorStore();
  if (providerName === 'atlas-vector') return new AtlasVectorStore();
  return new MongoTextVectorStore();
}

export function getVectorStore() {
  if (!cached) cached = createVectorStore();
  return cached;
}

export function setVectorStore(store) {
  cached = store;
}

export function resetVectorStore() {
  cached = null;
}

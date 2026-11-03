import path from 'node:path';
import { env, projectRootPath } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { serviceUnavailable } from '../../utils/errors.js';

export const DEFAULT_LOCAL_EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const DEFAULT_LOCAL_EMBEDDING_DIMENSIONS = 384;

let transformersModulePromise = null;

async function defaultPipelineFactory(model) {
  if (!transformersModulePromise) {
    transformersModulePromise = import('@huggingface/transformers').then((module) => {
      // Keep model files inside the repository data directory instead of the
      // user's global cache. The first run downloads the model; later runs are
      // fully offline.
      module.env.cacheDir = path.join(projectRootPath, 'data/models');
      module.env.allowRemoteModels = true;
      return module;
    });
  }
  const { pipeline } = await transformersModulePromise;
  return pipeline('feature-extraction', model, { dtype: 'q8' });
}

/**
 * Keyless, in-process multilingual embedding provider.
 *
 * It uses a quantized sentence-transformer through transformers.js. Nothing
 * leaves the machine and no embedding API key is required. The model is loaded
 * lazily so tests and demo-mode installs that use the mock provider never pay
 * the download/startup cost.
 */
export class LocalEmbeddingProvider {
  constructor({
    model = env.EMBEDDING_MODEL || DEFAULT_LOCAL_EMBEDDING_MODEL,
    dimensions = env.EMBEDDING_DIMENSIONS || DEFAULT_LOCAL_EMBEDDING_DIMENSIONS,
    pipelineFactory = defaultPipelineFactory,
  } = {}) {
    this.model = model;
    this.dimensions = dimensions;
    this.provider = 'local';
    this.pipelineFactory = pipelineFactory;
    this.extractorPromise = null;
  }

  get metadata() {
    return { provider: this.provider, model: this.model, dimensions: this.dimensions };
  }

  async #getExtractor() {
    if (!this.extractorPromise) {
      this.extractorPromise = this.pipelineFactory(this.model).catch((error) => {
        this.extractorPromise = null;
        logger.warn(
          { err: { name: error.name, message: error.message }, model: this.model },
          'Local embedding model could not be loaded',
        );
        throw serviceUnavailable(
          `Local embedding model "${this.model}" could not be loaded. Check the model name and network access for the first download.`,
          'embedding_unavailable',
        );
      });
    }
    return this.extractorPromise;
  }

  async embedQuery(text) {
    const [vector] = await this.embedDocuments([text]);
    return vector;
  }

  async embedDocuments(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    const extractor = await this.#getExtractor();
    let output;
    try {
      output = await extractor(texts, { pooling: 'mean', normalize: true });
    } catch (error) {
      logger.warn(
        { err: { name: error.name, message: error.message }, model: this.model },
        'Local embedding inference failed',
      );
      throw serviceUnavailable('Local embedding inference failed.', 'embedding_unavailable');
    }

    const vectors = typeof output?.tolist === 'function' ? output.tolist() : output;
    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw serviceUnavailable(
        'Local embedding provider returned an unexpected result count.',
        'embedding_bad_response',
      );
    }
    for (const vector of vectors) {
      if (!Array.isArray(vector) || vector.length !== this.dimensions) {
        throw serviceUnavailable(
          `Embedding dimension mismatch: expected ${this.dimensions}, received ${Array.isArray(vector) ? vector.length : 'none'}. Set EMBEDDING_DIMENSIONS to match the model.`,
          'embedding_dimension_mismatch',
        );
      }
    }
    return vectors.map((vector) => vector.map(Number));
  }
}

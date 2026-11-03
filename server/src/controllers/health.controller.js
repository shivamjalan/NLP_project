import { dbState, pingDb } from '../config/database.js';
import { env, isDemoMode } from '../config/env.js';
import { retrievalStoreLabel } from '../services/retrieval.service.js';
import { SUPPORTED_LANGUAGES } from '../utils/language.js';

export async function getHealth(_req, res) {
  const dbConnected = await pingDb();
  const store = retrievalStoreLabel();

  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    service: 'bharatseva-ai',
    version: '0.1.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    database: { state: dbState(), connected: dbConnected },
    agent: {
      provider: isDemoMode ? 'mock' : 'openai-compatible',
      demoMode: isDemoMode,
    },
    retrieval: {
      provider: store.provider,
      semantic: store.semantic,
      degraded: store.degraded,
      index: store.index,
    },
    supportedLanguages: SUPPORTED_LANGUAGES,
    disclaimer:
      'BharatSeva AI is an independent information assistant and is not an official government website or service.',
  });
}

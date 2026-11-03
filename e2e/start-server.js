#!/usr/bin/env node
/**
 * E2E bootstrap. Starts an in-memory MongoDB, seeds the synthetic fixtures and
 * runs the real Express app so Playwright can exercise the full stack without
 * an Atlas cluster or any paid API key.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

const port = Number(process.env.E2E_SERVER_PORT || process.env.PORT || 5055);

process.env.NODE_ENV = 'test';
process.env.PORT = String(port);
process.env.MONGODB_DB = 'bharatseva_e2e';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/bharatseva_e2e_placeholder';
process.env.SESSION_SECRET = 'e2e-session-secret-0123456789abcdef';
process.env.LLM_PROVIDER = 'mock';
process.env.EMBEDDING_PROVIDER = 'mock';
process.env.VECTOR_STORE_PROVIDER = 'mongodb';
process.env.LOG_LEVEL = 'warn';
process.env.CLIENT_ORIGIN = 'http://127.0.0.1:5173,http://localhost:5173';
process.env.RATE_LIMIT_MAX_REQUESTS = '10000';

let mongod;
let server;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[e2e] ${signal} received, shutting down`);
  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    const { disconnectDb } = await import('../server/src/config/database.js');
    await disconnectDb();
    if (mongod) await mongod.stop();
  } catch (error) {
    console.error('[e2e] shutdown error', error);
  } finally {
    process.exit(0);
  }
}

async function main() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { connectDb } = await import('../server/src/config/database.js');
  const { seedDemoFixtures } = await import('../server/src/services/seed.service.js');
  const { createApp } = await import('../server/src/app.js');

  await connectDb();
  const summary = await seedDemoFixtures({ reset: true });
  const app = createApp();

  await new Promise((resolve, reject) => {
    server = app.listen(port, '127.0.0.1', resolve);
    server.once('error', reject);
  });

  console.log(
    `[e2e] server ready on http://127.0.0.1:${port} (fixtures: ${summary.sourcesSeeded ?? summary.sources ?? 'seeded'})`,
  );
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch(async (error) => {
  console.error('[e2e] failed to start', error);
  if (mongod) await mongod.stop().catch(() => {});
  process.exit(1);
});

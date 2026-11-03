import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

async function start() {
  try {
    await connectDb();
  } catch (error) {
    logger.error(
      { err: { name: error.name, message: error.message } },
      'Could not start: database connection failed. Check MONGODB_URI in .env and your Atlas IP access list.',
    );
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, demoMode: env.LLM_PROVIDER === 'mock' },
      'BharatSeva AI API listening',
    );
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason instanceof Error ? { name: reason.name, message: reason.message } : reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (error) => {
  logger.error({ err: { name: error.name, message: error.message, stack: error.stack } }, 'Uncaught exception');
});

start();

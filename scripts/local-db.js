#!/usr/bin/env node
/**
 * Persistent local MongoDB for the local-only pilot.
 *
 * This uses the MongoDB binary already managed by mongodb-memory-server, but
 * with an explicit on-disk dbPath so data survives restarts. It is NOT a
 * container and NOT Atlas; it is a developer-workstation database.
 *
 * Usage:
 *   npm run db                  # start on 127.0.0.1:27017
 *   npm run db -- --reset       # delete the local data directory first
 *   LOCAL_DB_PORT=27018 npm run db
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const dbPath = path.resolve(projectRoot, process.env.LOCAL_DB_PATH || 'data/local-db');
const port = Number(process.env.LOCAL_DB_PORT || 27017);
const dbName = process.env.MONGODB_DB || 'bharatseva_ai';
const reset = process.argv.includes('--reset');

async function main() {
  if (reset) {
    await fs.rm(dbPath, { recursive: true, force: true });
    console.log(`Removed local database directory: ${dbPath}`);
  }
  await fs.mkdir(dbPath, { recursive: true });

  const server = await MongoMemoryServer.create({
    instance: {
      port,
      dbPath,
      storageEngine: 'wiredTiger',
    },
    binary: { version: process.env.MONGODB_VERSION || '7.0.24' },
  });

  const uri = `mongodb://127.0.0.1:${port}/${dbName}`;
  console.log(`Local MongoDB ready: ${uri}`);
  console.log(`Data directory: ${dbPath}`);
  console.log('Press Ctrl+C to stop. Data persists across restarts unless you use --reset.');

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`\nStopping local MongoDB (${signal})...`);
    await server.stop({ doCleanup: false }).catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(`Local MongoDB failed to start: ${error.message}`);
  if (/port|EADDRINUSE/i.test(error.message)) {
    console.error(`Port ${port} is already in use. Set LOCAL_DB_PORT to a free port or stop the other process.`);
  }
  process.exitCode = 1;
});

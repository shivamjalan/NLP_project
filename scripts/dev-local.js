#!/usr/bin/env node
/**
 * One-command local developer loop:
 *   1. start a persistent local MongoDB (data/local-db)
 *   2. start the Express server and Vite client
 *
 * Usage: npm run dev:local
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const dbPath = path.resolve(projectRoot, process.env.LOCAL_DB_PATH || 'data/local-db');
const port = Number(process.env.LOCAL_DB_PORT || 27017);
const dbName = process.env.MONGODB_DB || 'bharatseva_ai';

function npmProcess(args) {
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `npm ${args.join(' ')}`],
    };
  }
  return { command: 'npm', args };
}

async function main() {
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

  const npmCommand = npmProcess(['run', 'dev']);
  const env = {
    ...process.env,
    MONGODB_URI: uri,
    MONGODB_DB: dbName,
  };

  if (process.argv.includes('--seed')) {
    console.log('Seeding synthetic demo fixtures (idempotent)...');
    const seedCommand = npmProcess(['run', 'seed']);
    const seed = spawnSync(seedCommand.command, seedCommand.args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env,
    });
    if (seed.status !== 0) {
      await server.stop({ doCleanup: false }).catch(() => {});
      process.exit(seed.status || 1);
    }
  }

  const child = spawn(npmCommand.command, npmCommand.args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env,
  });

  let stopping = false;
  const killChild = (signal) => {
    if (!child.pid || child.killed) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill(signal);
    }
  };
  const shutdown = async (signal, code = 0) => {
    if (stopping) return;
    stopping = true;
    killChild(signal);
    await server.stop({ doCleanup: false }).catch(() => {});
    process.exit(code);
  };

  child.on('exit', (code) => shutdown('SIGTERM', code ?? 0));
  child.on('error', (error) => {
    console.error(`Failed to start the application: ${error.message}`);
    shutdown('SIGTERM', 1);
  });
  process.on('SIGINT', () => shutdown('SIGINT', 0));
  process.on('SIGTERM', () => shutdown('SIGTERM', 0));
}

main().catch((error) => {
  console.error(`Local development stack failed to start: ${error.message}`);
  if (/port|EADDRINUSE/i.test(error.message)) {
    console.error(`Port ${port} is already in use. Set LOCAL_DB_PORT to a free port or stop the other process.`);
  }
  process.exitCode = 1;
});

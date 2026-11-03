#!/usr/bin/env node
import { connectDb, disconnectDb } from '../server/src/config/database.js';
import { ingestRegistry, loadSourceRegistry } from '../server/src/services/ingestion.service.js';
import { logger } from '../server/src/utils/logger.js';

const dryRun = process.argv.includes('--dry-run');
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const sourceIds = sourceArg ? [sourceArg.split('=')[1]] : [];

async function main() {
  const registry = await loadSourceRegistry();
  if (registry.sources.length === 0) {
    console.log(
      'The source registry is empty. Add verified official IRCTC/Indian Railways URLs to data/source_registry/irctc.sources.json first. See docs/SOURCE_POLICY.md.',
    );
    return;
  }

  await connectDb();
  logger.info({ count: registry.sources.length, dryRun }, 'Starting ingestion');
  const summary = await ingestRegistry({ sourceIds, trigger: 'cli', dryRun });
  console.log(JSON.stringify(summary, null, 2));

  const failures = summary.results.filter((result) => result.status === 'failed');
  if (failures.length) {
    console.error(`${failures.length} source(s) failed. See ingestion jobs for redacted error summaries.`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`Ingestion failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });

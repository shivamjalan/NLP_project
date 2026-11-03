#!/usr/bin/env node
import { connectDb, disconnectDb } from '../server/src/config/database.js';
import { seedDemoFixtures } from '../server/src/services/seed.service.js';
import { env } from '../server/src/config/env.js';
import { logger } from '../server/src/utils/logger.js';

const reset = process.argv.includes('--reset');

async function main() {
  await connectDb();
  logger.info({ db: env.MONGODB_DB, reset }, 'Seeding demo fixtures');
  const summary = await seedDemoFixtures({ reset });
  console.log(JSON.stringify(summary, null, 2));
  console.log(
    '\nDemo fixtures are synthetic and are NOT official sources. They are labelled as such in the UI and API.',
  );
}

main()
  .catch((error) => {
    console.error(`Seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });

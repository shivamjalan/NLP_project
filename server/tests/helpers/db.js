import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../../src/config/database.js';

let mongod = null;

export async function startTestDb() {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri(), { dbName: 'bharatseva_test' });
  await clearDatabase();
}

export async function stopTestDb() {
  await disconnectDb();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

export async function clearDatabase() {
  const { collections } = mongoose.connection;
  for (const name of Object.keys(collections)) {
    await collections[name].deleteMany({});
  }
}

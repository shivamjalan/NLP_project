import mongoose from 'mongoose';
import { env, isTest } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

let connectionPromise = null;

/**
 * Connect to MongoDB. Accepts an explicit URI so tests can point at an
 * in-memory server without mutating process.env.
 */
export async function connectDb(uri = env.MONGODB_URI, options = {}) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  const target = uri === env.MONGODB_URI ? '[configured MongoDB URI]' : '[test URI]';
  logger.info({ target, db: env.MONGODB_DB }, 'Connecting to MongoDB');

  connectionPromise = mongoose
    .connect(uri, {
      dbName: options.dbName || env.MONGODB_DB,
      serverSelectionTimeoutMS: options.serverSelectionTimeoutMS ?? 10_000,
      maxPoolSize: isTest ? 5 : 20,
      autoIndex: env.NODE_ENV !== 'production',
    })
    .then((m) => {
      logger.info({ db: m.connection.name }, 'MongoDB connected');
      return m.connection;
    })
    .catch((error) => {
      connectionPromise = null;
      logger.error(
        { err: { name: error.name, message: error.message } },
        'MongoDB connection failed. Check MONGODB_URI and the Atlas IP access list.',
      );
      throw error;
    });

  return connectionPromise;
}

export async function disconnectDb() {
  connectionPromise = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function dbState() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
}

export async function pingDb() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

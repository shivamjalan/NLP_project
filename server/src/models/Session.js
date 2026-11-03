import mongoose from 'mongoose';
import { objectIdSchema, toJSONPlugin } from './helpers.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const sessionSchema = new mongoose.Schema(
  {
    sessionTokenHash: { type: String, required: true },
    language: { type: String, enum: ['en', 'hi', 'kn'], default: 'en' },
    summary: { type: String, default: '' },
    summarizedThrough: { type: Date, default: null },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + SESSION_TTL_MS),
    },
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ sessionTokenHash: 1 }, { unique: true });
toJSONPlugin(sessionSchema);

export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);

export const SESSION_TTL = SESSION_TTL_MS;

export { objectIdSchema };

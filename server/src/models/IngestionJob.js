import mongoose from 'mongoose';
import { toJSONPlugin } from './helpers.js';

const INGESTION_JOB_TTL_SECONDS = 90 * 24 * 60 * 60;

const ingestionJobSchema = new mongoose.Schema(
  {
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Source', default: null, index: true },
    sourceUrl: { type: String, default: '' },
    trigger: { type: String, enum: ['admin', 'cli', 'seed'], default: 'cli' },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'skipped', 'failed'],
      default: 'queued',
      index: true,
    },
    attempts: { type: Number, default: 1, min: 0 },
    startedAt: { type: Date, default: () => new Date() },
    finishedAt: { type: Date, default: null },
    errorSummary: { type: String, maxlength: 500, default: '' },
    chunkCount: { type: Number, default: 0 },
    skippedReason: { type: String, default: '' },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + INGESTION_JOB_TTL_SECONDS * 1000),
    },
  },
  { timestamps: true },
);

ingestionJobSchema.index({ createdAt: -1 });
ingestionJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
toJSONPlugin(ingestionJobSchema);

export const IngestionJob = mongoose.models.IngestionJob || mongoose.model('IngestionJob', ingestionJobSchema);

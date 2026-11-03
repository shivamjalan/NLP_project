import mongoose from 'mongoose';
import { toJSONPlugin } from './helpers.js';

const documentSchema = new mongoose.Schema(
  {
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Source', required: true, index: true },
    contentHash: { type: String, required: true, index: true },
    rawText: { type: String, required: true },
    parserVersion: { type: String, required: true, default: 'v1' },
    fetchedAt: { type: Date, default: () => new Date() },
    ingestedAt: { type: Date, default: () => new Date() },
    language: { type: String, enum: ['en', 'hi', 'kn'], default: 'en' },
    service: { type: String, default: 'irctc', index: true },
    status: {
      type: String,
      enum: ['active', 'superseded', 'failed'],
      default: 'active',
      index: true,
    },
    chunkCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

documentSchema.index({ sourceId: 1, contentHash: 1 }, { unique: true });
toJSONPlugin(documentSchema);

export const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);

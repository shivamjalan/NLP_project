import mongoose from 'mongoose';
import { toJSONPlugin } from './helpers.js';

const chunkSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Source', required: true, index: true },
    chunkIndex: { type: Number, required: true, min: 0 },
    text: { type: String, required: true, maxlength: 8000 },
    tokenEstimate: { type: Number, default: 0, min: 0 },
    language: { type: String, enum: ['en', 'hi', 'kn'], default: 'en', index: true },
    service: { type: String, default: 'irctc', index: true },
    sourceType: { type: String, default: 'official_page' },
    embedding: { type: [Number], default: undefined },
    embeddingModel: { type: String, default: null },
    embeddingDimensions: { type: Number, default: null },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

chunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });
chunkSchema.index(
  { text: 'text' },
  {
    name: 'chunk_text_index',
    // `language` is a domain field ('en' | 'hi' | 'kn'), not a MongoDB text
    // language. Without this, inserting a Hindi/Kannada chunk fails with
    // "language override unsupported". `none` disables stemming.
    default_language: 'none',
    language_override: 'textLanguage',
  },
);
chunkSchema.index({ service: 1, language: 1, active: 1 });
toJSONPlugin(chunkSchema);

export const Chunk = mongoose.models.Chunk || mongoose.model('Chunk', chunkSchema);

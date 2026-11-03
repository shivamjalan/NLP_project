import mongoose from 'mongoose';
import { toJSONPlugin } from './helpers.js';

const sourceSchema = new mongoose.Schema(
  {
    canonicalUrl: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, maxlength: 300 },
    authority: { type: String, required: true, maxlength: 200 },
    service: { type: String, required: true, default: 'irctc', index: true },
    language: { type: String, enum: ['en', 'hi', 'kn'], default: 'en' },
    sourceType: {
      type: String,
      enum: ['official_page', 'official_pdf', 'faq', 'notice', 'fixture'],
      default: 'official_page',
    },
    publishedAt: { type: Date, default: null },
    lastVerifiedAt: { type: Date, required: true, default: () => new Date() },
    trustLevel: {
      type: String,
      enum: ['official', 'semi_official', 'fixture'],
      default: 'official',
    },
    active: { type: Boolean, default: true, index: true },
    notes: { type: String, maxlength: 500, default: '' },
  },
  { timestamps: true },
);

sourceSchema.index({ service: 1, active: 1, trustLevel: 1 });
toJSONPlugin(sourceSchema);

export const Source = mongoose.models.Source || mongoose.model('Source', sourceSchema);

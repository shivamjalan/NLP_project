import mongoose from 'mongoose';
import { toJSONPlugin } from './helpers.js';

const FEEDBACK_TTL_SECONDS = 90 * 24 * 60 * 60;

const feedbackSchema = new mongoose.Schema(
  {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null, index: true },
    rating: { type: String, enum: ['helpful', 'not_helpful'], required: true },
    reason: { type: String, maxlength: 500, default: '' },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + FEEDBACK_TTL_SECONDS * 1000),
    },
  },
  { timestamps: true },
);

feedbackSchema.index({ messageId: 1 }, { unique: true });
feedbackSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
toJSONPlugin(feedbackSchema);

export const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);

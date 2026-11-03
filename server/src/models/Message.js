import mongoose from 'mongoose';
import { toJSONPlugin } from './helpers.js';

const MESSAGE_TTL_SECONDS = 30 * 24 * 60 * 60;

const messageSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 20_000 },
    citations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Source' }],
    confidence: { type: String, enum: ['high', 'medium', 'low'], default: null },
    language: { type: String, enum: ['en', 'hi', 'kn'], default: 'en' },
    answerType: {
      type: String,
      enum: ['grounded', 'general', 'mixed', 'clarification', 'abstention'],
      default: null,
    },
    agentStatus: { type: String, default: null },
    demoMode: { type: Boolean, default: false },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + MESSAGE_TTL_SECONDS * 1000),
    },
  },
  { timestamps: true },
);

messageSchema.index({ sessionId: 1, createdAt: 1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
toJSONPlugin(messageSchema);

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

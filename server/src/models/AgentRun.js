import mongoose from 'mongoose';
import { toJSONPlugin } from './helpers.js';

const AGENT_RUN_TTL_SECONDS = 90 * 24 * 60 * 60;

const agentRunSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed', 'budget_exhausted', 'timeout'],
      default: 'running',
      index: true,
    },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    toolCallCount: { type: Number, default: 0, min: 0 },
    retrievalCallCount: { type: Number, default: 0, min: 0 },
    modelProvider: { type: String, default: 'mock' },
    modelName: { type: String, default: 'mock' },
    totalLatencyMs: { type: Number, default: 0, min: 0 },
    tokenUsage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
    stopReason: { type: String, default: null },
    errorCode: { type: String, default: null },
    steps: { type: Number, default: 0, min: 0 },
    verificationVerdict: { type: String, default: null },
    safetyCategory: { type: String, default: null },
    demoMode: { type: Boolean, default: true },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + AGENT_RUN_TTL_SECONDS * 1000),
    },
  },
  { timestamps: true },
);

agentRunSchema.index({ createdAt: -1 });
agentRunSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
toJSONPlugin(agentRunSchema);

export const AgentRun = mongoose.models.AgentRun || mongoose.model('AgentRun', agentRunSchema);

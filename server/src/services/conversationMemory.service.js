import { env } from '../config/env.js';
import { Message } from '../models/Message.js';
import { Session } from '../models/Session.js';
import { truncate } from '../utils/text.js';

const CONTEXT_LIMIT = env.AGENT_MAX_CONTEXT_MESSAGES;

/**
 * Bounded conversation memory. The immediate window is the last N messages; a
 * compact, deterministic extractive summary covers older turns. Summaries are
 * context only - they are never treated as evidence for policy claims.
 */
export async function buildConversationContext(sessionId) {
  const messages = await Message.find({ sessionId })
    .sort({ createdAt: -1 })
    .limit(CONTEXT_LIMIT)
    .lean();
  const ordered = messages.reverse().map((message) => ({
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    citations: message.citations,
  }));

  const session = await Session.findById(sessionId).lean();
  return {
    messages: ordered,
    sessionSummary: session?.summary || '',
  };
}

/**
 * When a session grows beyond twice the context window, fold the oldest turns
 * into a summary. Called at most once per turn and bounded in size.
 */
export async function maybeSummarizeSession(sessionId) {
  const total = await Message.countDocuments({ sessionId });
  if (total <= CONTEXT_LIMIT * 2) return null;

  const older = await Message.find({ sessionId })
    .sort({ createdAt: 1 })
    .limit(total - CONTEXT_LIMIT)
    .lean();
  if (!older.length) return null;

  const lines = [];
  for (const message of older.slice(-12)) {
    const prefix = message.role === 'user' ? 'User' : 'Assistant';
    lines.push(`${prefix}: ${truncate(message.content.replace(/\s+/g, ' '), 160)}`);
  }
  const summary = truncate(lines.join('\n'), 1600);

  await Session.updateOne(
    { _id: sessionId },
    { $set: { summary, summarizedThrough: older[older.length - 1].createdAt } },
  );
  return summary;
}

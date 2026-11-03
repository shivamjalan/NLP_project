import { Session } from '../models/Session.js';
import { Message } from '../models/Message.js';
import { createSessionToken, hashSessionToken, constantTimeEquals } from '../utils/crypto.js';
import { notFound } from '../utils/errors.js';
import { SESSION_TTL } from '../models/Session.js';

export async function createSession(language = 'en') {
  const token = createSessionToken();
  const session = await Session.create({
    sessionTokenHash: hashSessionToken(token),
    language,
    expiresAt: new Date(Date.now() + SESSION_TTL),
  });
  return { session, token };
}

/**
 * Capability-based access: the caller must present the secret token that was
 * issued when the session was created. A wrong or missing token yields 404 so
 * session IDs cannot be probed or enumerated.
 */
export async function authorizeSession(sessionId, token) {
  if (!sessionId || !token) throw notFound('Session not found.');
  const session = await Session.findById(sessionId);
  if (!session) throw notFound('Session not found.');
  if (!constantTimeEquals(hashSessionToken(token), session.sessionTokenHash)) {
    throw notFound('Session not found.');
  }
  if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
    throw notFound('Session not found.');
  }
  return session;
}

export async function touchSession(session, { language } = {}) {
  const patch = { expiresAt: new Date(Date.now() + SESSION_TTL) };
  if (language && language !== session.language) patch.language = language;
  await Session.updateOne({ _id: session._id }, { $set: patch });
}

export async function listRecentMessages(sessionId, limit = 40) {
  const docs = await Message.find({ sessionId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .lean();
  return docs.reverse();
}

export async function listMessagesForClient(sessionId, limit = 100) {
  const docs = await Message.find({ sessionId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .lean();
  return docs.reverse();
}

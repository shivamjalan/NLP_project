import { Feedback } from '../models/Feedback.js';
import { Message } from '../models/Message.js';
import { notFound } from '../utils/errors.js';
import { redactSensitiveData } from '../utils/sanitize.js';
import { authorizeSession } from './session.service.js';

export async function submitFeedback({ messageId, rating, reason = '', sessionToken }) {
  const message = await Message.findById(messageId).lean();
  if (!message) throw notFound('Message not found.');
  if (message.role !== 'assistant') throw notFound('Message not found.');

  // Feedback can only be submitted by the holder of the session capability
  // token for the conversation that contains the message.
  await authorizeSession(message.sessionId, sessionToken);

  const feedback = await Feedback.findOneAndUpdate(
    { messageId },
    {
      $set: {
        messageId,
        sessionId: message.sessionId,
        rating,
        reason: redactSensitiveData(String(reason || '')).slice(0, 500),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return {
    feedbackId: String(feedback._id),
    messageId: String(feedback.messageId),
    rating: feedback.rating,
    reason: feedback.reason,
    createdAt: feedback.createdAt,
  };
}

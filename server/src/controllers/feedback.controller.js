import { submitFeedback } from '../services/feedback.service.js';

export async function postFeedback(req, res) {
  const { messageId, rating, reason } = req.validated.body;
  const feedback = await submitFeedback({
    messageId,
    rating,
    reason,
    sessionToken: req.get('x-session-token') || '',
  });
  res.status(201).json(feedback);
}

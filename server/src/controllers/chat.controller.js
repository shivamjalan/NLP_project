import { handleChat, getSessionHistory } from '../services/chat.service.js';

export async function postChat(req, res) {
  const { message, sessionId, language } = req.validated.body;
  const sessionToken = req.get('x-session-token') || '';

  const response = await handleChat({
    message,
    sessionId: sessionId || null,
    language,
    sessionToken,
    requestId: req.id,
  });

  res.status(sessionId ? 200 : 201).json(response);
}

export async function getMessages(req, res) {
  const { sessionId } = req.validated.params;
  const sessionToken = req.get('x-session-token') || '';
  const history = await getSessionHistory({ sessionId, sessionToken });
  res.json(history);
}

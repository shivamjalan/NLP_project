import { Router } from 'express';
import { chatBodySchema, sessionParamsSchema } from '../validators/index.js';
import { validate } from '../middleware/validate.js';
import { chatRateLimiter } from '../middleware/rateLimiter.js';
import { requireSessionToken } from '../middleware/sessionAccess.js';
import { postChat, getMessages } from '../controllers/chat.controller.js';
import { asyncHandler } from '../utils/errors.js';

export const chatRoutes = Router();

chatRoutes.post('/chat', chatRateLimiter, validate({ body: chatBodySchema }), asyncHandler(postChat));

chatRoutes.get(
  '/sessions/:sessionId/messages',
  requireSessionToken,
  validate({ params: sessionParamsSchema }),
  asyncHandler(getMessages),
);

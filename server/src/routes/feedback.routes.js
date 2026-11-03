import { Router } from 'express';
import { feedbackBodySchema } from '../validators/index.js';
import { validate } from '../middleware/validate.js';
import { requireSessionToken } from '../middleware/sessionAccess.js';
import { postFeedback } from '../controllers/feedback.controller.js';
import { asyncHandler } from '../utils/errors.js';

export const feedbackRoutes = Router();

feedbackRoutes.post('/feedback', requireSessionToken, validate({ body: feedbackBodySchema }), asyncHandler(postFeedback));

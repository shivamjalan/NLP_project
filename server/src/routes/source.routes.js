import { Router } from 'express';
import { sourceParamsSchema } from '../validators/index.js';
import { validate } from '../middleware/validate.js';
import { getSource } from '../controllers/source.controller.js';
import { asyncHandler } from '../utils/errors.js';

export const sourceRoutes = Router();

sourceRoutes.get('/sources/:sourceId', validate({ params: sourceParamsSchema }), asyncHandler(getSource));

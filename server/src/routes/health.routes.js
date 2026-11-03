import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';
import { asyncHandler } from '../utils/errors.js';

export const healthRoutes = Router();

healthRoutes.get('/health', asyncHandler(getHealth));

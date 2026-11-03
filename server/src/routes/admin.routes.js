import { Router } from 'express';
import { adminIngestionBodySchema, adminJobParamsSchema, adminSourcesQuerySchema } from '../validators/index.js';
import { validate } from '../middleware/validate.js';
import { adminRateLimiter } from '../middleware/rateLimiter.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { runIngestion, getJob, listSources } from '../controllers/admin.controller.js';
import { asyncHandler } from '../utils/errors.js';

export const adminRoutes = Router();

adminRoutes.use(requireAdmin, adminRateLimiter);

adminRoutes.post('/ingestion/run', validate({ body: adminIngestionBodySchema }), asyncHandler(runIngestion));
adminRoutes.get('/ingestion/jobs/:jobId', validate({ params: adminJobParamsSchema }), asyncHandler(getJob));
adminRoutes.get('/sources', validate({ query: adminSourcesQuerySchema }), asyncHandler(listSources));

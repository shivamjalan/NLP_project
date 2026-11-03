import { Router } from 'express';
import { chatRoutes } from './chat.routes.js';
import { healthRoutes } from './health.routes.js';
import { feedbackRoutes } from './feedback.routes.js';
import { sourceRoutes } from './source.routes.js';
import { adminRoutes } from './admin.routes.js';

export const apiRouter = Router();

apiRouter.use(healthRoutes);
apiRouter.use(chatRoutes);
apiRouter.use(feedbackRoutes);
apiRouter.use(sourceRoutes);
apiRouter.use('/admin', adminRoutes);

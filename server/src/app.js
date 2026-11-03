import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import path from 'node:path';
import fs from 'node:fs';
import { env, isProduction, projectRootPath } from './config/env.js';
import { logger } from './utils/logger.js';
import { requestId } from './middleware/requestId.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';
import { AppError } from './utils/errors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  const allowedOrigins = env.CLIENT_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: {
        ignore: (req) => req.url === '/api/v1/health',
      },
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        if (
          env.NODE_ENV === 'development' &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ) {
          return callback(null, true);
        }
        return callback(new AppError('Origin not allowed by CORS.', { statusCode: 403, code: 'cors_blocked' }));
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['content-type', 'x-session-token', 'x-request-id', 'authorization'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '64kb', strict: true }));

  app.use('/api/v1', apiRouter);

  if (isProduction) {
    const clientDist = path.join(projectRootPath, 'client/dist');
    if (fs.existsSync(clientDist)) {
      app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
      app.get(/^\/(?!api\/).*/, (_req, res) => {
        res.sendFile(path.join(clientDist, 'index.html'));
      });
    }
  }

  app.use(notFoundHandler);
  app.use((error, req, res, next) => {
    if (error?.type === 'entity.parse.failed') {
      return errorHandler(
        new AppError('Request body is not valid JSON.', { statusCode: 400, code: 'invalid_json' }),
        req,
        res,
        next,
      );
    }
    if (error?.type === 'entity.too.large') {
      return errorHandler(
        new AppError('Request body is too large.', { statusCode: 413, code: 'payload_too_large' }),
        req,
        res,
        next,
      );
    }
    return errorHandler(error, req, res, next);
  });

  return app;
}

import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError('Route not found.', { statusCode: 404, code: 'not_found' }));
}

export function errorHandler(error, req, res, _next) {
  const isKnown = error instanceof AppError;
  const statusCode = isKnown ? error.statusCode : 500;
  const code = isKnown ? error.code : 'internal_error';
  const message = isKnown && statusCode < 500 ? error.message : 'Something went wrong. Please try again.';

  logger[statusCode >= 500 ? 'error' : 'warn'](
    {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode,
      code,
      err: { name: error.name, message: error.message },
    },
    'Request failed',
  );

  if (res.headersSent) return;

  const body = { error: { code, message, requestId: req.id } };
  if (isKnown && error.details) body.error.details = error.details;
  res.status(statusCode).json(body);
}

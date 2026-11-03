import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { constantTimeEquals } from '../utils/crypto.js';

/**
 * Admin endpoints stay invisible (404) unless ADMIN_TOKEN is configured. There
 * is deliberately no default credential and no admin UI in the client bundle.
 */
export function requireAdmin(req, _res, next) {
  if (!env.ADMIN_TOKEN) {
    return next(new AppError('Not found.', { statusCode: 404, code: 'not_found' }));
  }
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !constantTimeEquals(token, env.ADMIN_TOKEN)) {
    return next(new AppError('Admin authentication required.', { statusCode: 401, code: 'unauthorized' }));
  }
  return next();
}

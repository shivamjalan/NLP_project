import { AppError } from '../utils/errors.js';

/**
 * Require the capability token header for routes that act on an existing
 * session. Full authorisation (hash comparison) happens in the service layer.
 */
export function requireSessionToken(req, _res, next) {
  const token = req.get('x-session-token');
  if (!token) {
    return next(new AppError('Session token required.', { statusCode: 401, code: 'session_token_required' }));
  }
  return next();
}

export { requireSessionToken as default };

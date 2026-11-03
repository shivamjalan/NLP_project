export class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'internal_error', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = statusCode < 500;
  }
}

export const badRequest = (message, code = 'bad_request', details) =>
  new AppError(message, { statusCode: 400, code, details });

export const unauthorized = (message = 'Not authorised.', code = 'unauthorized') =>
  new AppError(message, { statusCode: 401, code });

export const forbidden = (message = 'Forbidden.', code = 'forbidden') =>
  new AppError(message, { statusCode: 403, code });

export const notFound = (message = 'Not found.', code = 'not_found') =>
  new AppError(message, { statusCode: 404, code });

export const tooManyRequests = (message = 'Too many requests.', code = 'rate_limited') =>
  new AppError(message, { statusCode: 429, code });

export const serviceUnavailable = (message, code = 'service_unavailable') =>
  new AppError(message, { statusCode: 503, code });

export const gatewayTimeout = (message, code = 'provider_timeout') =>
  new AppError(message, { statusCode: 504, code });

export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

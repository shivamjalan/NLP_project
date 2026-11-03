import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';

/**
 * Validate request parts against Zod schemas and expose only validated data on
 * `req.validated`. Controllers never read raw `req.body`.
 */
export function validate(schemas = {}) {
  return function validateMiddleware(req, _res, next) {
    const validated = {};
    try {
      if (schemas.body) validated.body = schemas.body.parse(req.body ?? {});
      if (schemas.params) validated.params = schemas.params.parse(req.params ?? {});
      if (schemas.query) validated.query = schemas.query.parse(req.query ?? {});
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new AppError('Request validation failed.', {
            statusCode: 400,
            code: 'validation_error',
            details: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          }),
        );
      }
      return next(error);
    }
    req.validated = validated;
    return next();
  };
}

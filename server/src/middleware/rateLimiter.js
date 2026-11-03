import rateLimit from 'express-rate-limit';
import { env, isTest } from '../config/env.js';

function buildLimiter({ windowMs, max, name }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    message: {
      error: {
        code: 'rate_limited',
        message: 'Too many requests. Please wait a moment and try again.',
      },
    },
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many requests. Please wait a moment and try again.',
          requestId: req.id,
          limit: name,
        },
      });
    },
  });
}

export const chatRateLimiter = buildLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  name: 'chat',
});

export const adminRateLimiter = buildLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: Math.max(1, Math.floor(env.RATE_LIMIT_MAX_REQUESTS / 3)),
  name: 'admin',
});

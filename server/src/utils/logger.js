import pino from 'pino';
import { env } from '../config/env.js';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-session-token"]',
  'res.headers["set-cookie"]',
  '*.apiKey',
  '*.api_key',
  '*.token',
  '*.password',
  '*.secret',
  '*.content',
  '*.message',
  'messages',
  'toolResults',
];

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[redacted]' },
  base: { service: 'bharatseva-ai' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function childLogger(bindings) {
  return logger.child(bindings);
}

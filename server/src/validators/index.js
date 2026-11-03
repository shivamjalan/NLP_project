import { z } from 'zod';
import { env } from '../config/env.js';

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Must be a valid 24-character identifier.');

export const languagePreferenceSchema = z.enum(['auto', 'en', 'hi', 'kn']);
export const sessionTokenSchema = z.string().min(20).max(200);

export const chatBodySchema = z.object({
  message: z
    .string({ required_error: 'message is required' })
    .trim()
    .min(1, 'message must not be empty')
    .max(env.MAX_MESSAGE_LENGTH, `message must be at most ${env.MAX_MESSAGE_LENGTH} characters`),
  sessionId: objectIdSchema.nullable().optional(),
  language: languagePreferenceSchema.default('auto'),
});

export const sessionParamsSchema = z.object({
  sessionId: objectIdSchema,
});

export const feedbackBodySchema = z.object({
  messageId: objectIdSchema,
  rating: z.enum(['helpful', 'not_helpful']),
  reason: z.string().trim().max(500, 'reason must be at most 500 characters').optional().default(''),
});

export const sourceParamsSchema = z.object({
  sourceId: objectIdSchema,
});

export const adminIngestionBodySchema = z.object({
  sourceIds: z.array(objectIdSchema).max(50).optional(),
  dryRun: z.boolean().optional().default(false),
});

export const adminJobParamsSchema = z.object({
  jobId: objectIdSchema,
});

export const adminSourcesQuerySchema = z.object({
  service: z.string().trim().max(40).optional(),
  active: z.enum(['true', 'false']).optional(),
});

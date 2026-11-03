import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');

// Root `.env` wins; a server-local `.env` is accepted as a fallback for people
// who prefer keeping server config next to the server package.
dotenv.config({ path: path.join(projectRoot, '.env') });
dotenv.config({ path: path.join(projectRoot, 'server/.env') });

const emptyToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().url().optional(),
);

const booleanLike = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),

    MONGODB_URI: z
      .string()
      .min(1, 'MONGODB_URI is required (MongoDB Atlas connection string).')
      .refine(
        (uri) => uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'),
        'MONGODB_URI must start with mongodb:// or mongodb+srv://',
      ),
    MONGODB_DB: z.string().min(1).default('bharatseva_ai'),

    SESSION_SECRET: z
      .string()
      .min(16, 'SESSION_SECRET must be at least 16 characters. Use a long random value.')
      .default('development-only-insecure-session-secret'),

    LLM_PROVIDER: z.enum(['mock', 'openai-compatible']).default('mock'),
    LLM_API_KEY: optionalString,
    LLM_MODEL: optionalString,
    LLM_BASE_URL: optionalUrl,
    LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
    LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(8192).default(1200),

    EMBEDDING_PROVIDER: z.enum(['mock', 'local', 'openai-compatible']).default('mock'),
    EMBEDDING_API_KEY: optionalString,
    EMBEDDING_MODEL: optionalString,
    EMBEDDING_BASE_URL: optionalUrl,
    EMBEDDING_DIMENSIONS: z.coerce.number().int().min(8).max(4096).default(384),

    VECTOR_STORE_PROVIDER: z.enum(['mongodb', 'local-vector', 'atlas-vector']).default('mongodb'),
    VECTOR_INDEX_NAME: z.string().min(1).default('chunk_vector_index'),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(30),
    MAX_MESSAGE_LENGTH: z.coerce.number().int().min(1).max(50_000).default(4000),

    AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(20).default(6),
    AGENT_MAX_RETRIEVAL_CALLS: z.coerce.number().int().min(0).max(10).default(3),
    AGENT_MAX_RUNTIME_MS: z.coerce.number().int().min(1000).max(120_000).default(25_000),
    AGENT_MAX_CONTEXT_MESSAGES: z.coerce.number().int().min(2).max(50).default(12),
    AGENT_MAX_EVIDENCE_CHUNKS: z.coerce.number().int().min(1).max(50).default(12),

    ADMIN_TOKEN: z.preprocess(
      emptyToUndefined,
      z.string().min(24, 'ADMIN_TOKEN must be at least 24 characters when set.').optional(),
    ),

    // Not user-facing; reserved for operational toggles.
    LOG_CHAT_CONTENT: z.preprocess(emptyToUndefined, booleanLike.optional()),
  })
  .superRefine((value, ctx) => {
    if (value.LLM_PROVIDER === 'openai-compatible') {
      if (!value.LLM_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LLM_API_KEY'],
          message: 'LLM_API_KEY is required when LLM_PROVIDER=openai-compatible.',
        });
      }
      if (!value.LLM_MODEL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LLM_MODEL'],
          message: 'LLM_MODEL is required when LLM_PROVIDER=openai-compatible.',
        });
      }
      if (!value.LLM_BASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LLM_BASE_URL'],
          message: 'LLM_BASE_URL is required when LLM_PROVIDER=openai-compatible.',
        });
      }
    }
    if (value.EMBEDDING_PROVIDER === 'openai-compatible') {
      if (!value.EMBEDDING_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMBEDDING_API_KEY'],
          message: 'EMBEDDING_API_KEY is required when EMBEDDING_PROVIDER=openai-compatible.',
        });
      }
      if (!value.EMBEDDING_MODEL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMBEDDING_MODEL'],
          message: 'EMBEDDING_MODEL is required when EMBEDDING_PROVIDER=openai-compatible.',
        });
      }
      if (!value.EMBEDDING_BASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMBEDDING_BASE_URL'],
          message: 'EMBEDDING_BASE_URL is required when EMBEDDING_PROVIDER=openai-compatible.',
        });
      }
    }
  });

export function parseEnv(source = process.env) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    const error = new Error(
      `Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and fix the values above.`,
    );
    error.name = 'EnvironmentValidationError';
    error.issues = result.error.issues;
    throw error;
  }
  return result.data;
}

export const env = parseEnv();

export const isTest = env.NODE_ENV === 'test';
export const isProduction = env.NODE_ENV === 'production';
export const isDemoMode = env.LLM_PROVIDER === 'mock';

export const projectRootPath = projectRoot;

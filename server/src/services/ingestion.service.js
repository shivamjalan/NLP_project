import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { projectRootPath } from '../config/env.js';
import { Source } from '../models/Source.js';
import { Document } from '../models/Document.js';
import { Chunk } from '../models/Chunk.js';
import { IngestionJob } from '../models/IngestionJob.js';
import { fetchSourceContent } from '../adapters/sourceFetcher/index.js';
import { getEmbeddingProvider } from '../adapters/embeddings/index.js';
import { assertAllowedSourceUrl } from '../utils/urlSafety.js';
import { chunkText } from '../utils/chunking.js';
import { hashContent } from '../utils/crypto.js';
import { normalizeText, truncate } from '../utils/text.js';
import { describeAllowedDomains } from '../config/sourcePolicy.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const registryEntrySchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(300),
  authority: z.string().min(1).max(200),
  service: z.literal('irctc').default('irctc'),
  language: z.enum(['en', 'hi', 'kn']).default('en'),
  sourceType: z.enum(['official_page', 'official_pdf', 'faq', 'notice']).default('official_page'),
  active: z.boolean().default(true),
  lastReviewedAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(500).optional().default(''),
});

export const registryFileSchema = z.object({
  version: z.number().int().default(1),
  updatedAt: z.string().optional(),
  sources: z.array(registryEntrySchema).default([]),
});

export const DEFAULT_REGISTRY_PATH = path.join(projectRootPath, 'data/source_registry/irctc.sources.json');

export async function loadSourceRegistry(filePath = DEFAULT_REGISTRY_PATH) {
  const raw = await fs.readFile(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError('Source registry is not valid JSON.', {
      statusCode: 500,
      code: 'registry_invalid_json',
    });
  }
  const result = registryFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError('Source registry does not match its schema.', {
      statusCode: 500,
      code: 'registry_invalid_schema',
      details: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return result.data;
}

async function upsertSource(entry) {
  return Source.findOneAndUpdate(
    { canonicalUrl: entry.url },
    {
      $set: {
        title: entry.title,
        authority: entry.authority,
        service: entry.service,
        language: entry.language,
        sourceType: entry.sourceType,
        trustLevel: 'official',
        active: entry.active,
        notes: entry.notes || '',
      },
      $setOnInsert: { lastVerifiedAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function embedInBatches(embedder, texts, batchSize = 16) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embedded = await embedder.embedDocuments(batch);
    vectors.push(...embedded);
  }
  return vectors;
}

/**
 * Ingest one reviewed registry entry: fetch, parse, hash, dedupe, chunk, embed
 * and persist. Never accepts a URL from a public chat user.
 */
export async function ingestSourceEntry(entry, { trigger = 'cli', dryRun = false } = {}) {
  assertAllowedSourceUrl(entry.url, { service: entry.service });
  const source = await upsertSource(entry);

  if (dryRun) {
    return { status: 'validated', sourceId: String(source._id), url: entry.url, chunkCount: 0 };
  }

  const job = await IngestionJob.create({
    sourceId: source._id,
    sourceUrl: entry.url,
    trigger,
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const fetched = await fetchSourceContent(entry.url, { service: entry.service });
    const text = normalizeText(fetched.text);
    if (text.length < 200) {
      throw new AppError('Extracted text is too short to be a usable source document.', {
        statusCode: 422,
        code: 'source_text_too_short',
      });
    }

    const contentHash = hashContent(text);
    const existing = await Document.findOne({ sourceId: source._id, contentHash }).lean();
    if (existing) {
      await IngestionJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'skipped',
            finishedAt: new Date(),
            skippedReason: 'unchanged_content',
            chunkCount: existing.chunkCount || 0,
          },
        },
      );
      return { status: 'skipped', reason: 'unchanged_content', sourceId: String(source._id) };
    }

    const embedder = getEmbeddingProvider();
    const chunks = chunkText(text);
    if (!chunks.length) {
      throw new AppError('No usable passages could be extracted.', {
        statusCode: 422,
        code: 'source_no_chunks',
      });
    }
    const vectors = await embedInBatches(
      embedder,
      chunks.map((chunk) => chunk.text),
    );

    await Document.updateMany({ sourceId: source._id, status: 'active' }, { $set: { status: 'superseded' } });
    await Chunk.updateMany({ sourceId: source._id, active: true }, { $set: { active: false } });

    const document = await Document.create({
      sourceId: source._id,
      contentHash,
      rawText: text,
      parserVersion: 'v1',
      fetchedAt: new Date(),
      ingestedAt: new Date(),
      language: entry.language,
      service: entry.service,
      status: 'active',
      chunkCount: chunks.length,
    });

    await Chunk.insertMany(
      chunks.map((chunk, index) => ({
        documentId: document._id,
        sourceId: source._id,
        chunkIndex: chunk.index,
        text: chunk.text,
        tokenEstimate: chunk.tokenEstimate,
        language: entry.language,
        service: entry.service,
        sourceType: entry.sourceType,
        embedding: vectors[index],
        embeddingModel: embedder.metadata.model,
        embeddingDimensions: embedder.metadata.dimensions,
        active: true,
      })),
    );

    await Source.updateOne(
      { _id: source._id },
      { $set: { lastVerifiedAt: new Date(), active: entry.active } },
    );

    await IngestionJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'completed',
          finishedAt: new Date(),
          chunkCount: chunks.length,
          documentId: document._id,
        },
      },
    );

    return {
      status: 'completed',
      jobId: String(job._id),
      sourceId: String(source._id),
      chunkCount: chunks.length,
      url: fetched.finalUrl,
    };
  } catch (error) {
    logger.warn(
      { url: entry.url, code: error.code || error.name },
      'Source ingestion failed',
    );
    await IngestionJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'failed',
          finishedAt: new Date(),
          errorSummary: truncate(`${error.code || error.name}: ${error.message}`, 400),
        },
      },
    ).catch(() => {});
    return {
      status: 'failed',
      jobId: String(job._id),
      sourceId: String(source._id),
      url: entry.url,
      error: error.code || error.name,
    };
  }
}

export async function ingestRegistry({ sourceIds = [], trigger = 'cli', dryRun = false } = {}) {
  const registry = await loadSourceRegistry();
  let entries = registry.sources;
  if (sourceIds.length) {
    const sources = await Source.find({ _id: { $in: sourceIds } }).lean();
    const urls = new Set(sources.map((source) => source.canonicalUrl));
    entries = entries.filter((entry) => urls.has(entry.url));
  }

  const results = [];
  for (const entry of entries) {
    if (!entry.active) {
      results.push({ status: 'skipped', url: entry.url, reason: 'inactive_registry_entry' });
      continue;
    }
    results.push(await ingestSourceEntry(entry, { trigger, dryRun }));
    if (!dryRun) await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return {
    allowedDomains: describeAllowedDomains('irctc'),
    total: entries.length,
    results,
  };
}

export async function getIngestionJob(jobId) {
  const job = await IngestionJob.findById(jobId).lean();
  if (!job) return null;
  return {
    jobId: String(job._id),
    sourceId: job.sourceId ? String(job.sourceId) : null,
    sourceUrl: job.sourceUrl,
    status: job.status,
    attempts: job.attempts,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    errorSummary: job.errorSummary,
    chunkCount: job.chunkCount,
    skippedReason: job.skippedReason,
    createdAt: job.createdAt,
  };
}

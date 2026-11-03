import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadSourceRegistry,
  ingestRegistry,
  ingestSourceEntry,
  getIngestionJob,
} from '../../src/services/ingestion.service.js';
import { Source } from '../../src/models/Source.js';
import { startTestDb, stopTestDb } from '../helpers/db.js';

let registry;

beforeAll(async () => {
  await startTestDb();
  registry = await loadSourceRegistry();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

describe('source registry', () => {
  it('loads and validates the reviewed registry file', () => {
    expect(registry.version).toBe(1);
    expect(registry.sources.length).toBe(3);
    expect(registry.sources.filter((entry) => entry.active)).toHaveLength(2);
    expect(registry.sources.some((entry) => entry.active === false)).toBe(true);
    registry.sources.forEach((entry) => {
      expect(entry.url).toMatch(/^https:\/\//);
      expect(entry.service).toBe('irctc');
    });
  });
});

describe('ingestion safety', () => {
  it('refuses a URL outside the approved allowlist before creating anything', async () => {
    const before = await Source.countDocuments();
    await expect(
      ingestSourceEntry({
        url: 'https://evil.example/internal',
        title: 'Bad source',
        authority: 'Unknown',
        service: 'irctc',
        language: 'en',
        sourceType: 'official_page',
        active: true,
      }),
    ).rejects.toMatchObject({ code: 'source_domain_not_allowed' });
    expect(await Source.countDocuments()).toBe(before);
  });

  it('refuses an IP-literal URL', async () => {
    await expect(
      ingestSourceEntry({
        url: 'https://127.0.0.1/admin',
        title: 'Bad source',
        authority: 'Unknown',
        service: 'irctc',
        language: 'en',
        sourceType: 'official_page',
        active: true,
      }),
    ).rejects.toMatchObject({ code: 'invalid_source_url_ip' });
  });

  it('validates an approved registry entry without fetching in dry-run mode', async () => {
    const entry = registry.sources.find((item) => item.active);
    const result = await ingestSourceEntry(entry, { dryRun: true, trigger: 'test' });
    expect(result.status).toBe('validated');
    expect(result.sourceId).toMatch(/^[a-f\d]{24}$/);
    expect(result.chunkCount).toBe(0);

    const source = await Source.findById(result.sourceId).lean();
    expect(source).toMatchObject({
      trustLevel: 'official',
      service: 'irctc',
      active: true,
    });
  });

  it('skips inactive registry entries and reports allowed domains', async () => {
    const result = await ingestRegistry({ dryRun: true, trigger: 'test' });
    expect(result.total).toBe(3);
    expect(result.allowedDomains).toContain('irctc.co.in');
    expect(result.results.filter((item) => item.status === 'skipped')).toHaveLength(1);
    expect(result.results.filter((item) => item.status === 'validated')).toHaveLength(2);
  });

  it('returns null for an unknown ingestion job', async () => {
    expect(await getIngestionJob('0123456789abcdef01234567')).toBeNull();
  });
});

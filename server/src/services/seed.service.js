import { Source } from '../models/Source.js';
import { Document } from '../models/Document.js';
import { Chunk } from '../models/Chunk.js';
import { DEMO_FIXTURES } from '../data/demoFixtures.js';
import { getEmbeddingProvider } from '../adapters/embeddings/index.js';
import { hashContent } from '../utils/crypto.js';
import { estimateTokens } from '../utils/text.js';

/**
 * Seed the synthetic demo fixtures. Idempotent: unchanged documents are
 * skipped, and `reset` replaces a fixture's chunks.
 */
export async function seedDemoFixtures({ reset = false } = {}) {
  const embedder = getEmbeddingProvider();
  const results = [];

  await Chunk.syncIndexes();

  for (const fixture of DEMO_FIXTURES) {
    const source = await Source.findOneAndUpdate(
      { canonicalUrl: fixture.url },
      {
        $set: {
          title: fixture.title,
          authority: fixture.authority,
          service: 'irctc',
          language: fixture.language,
          sourceType: fixture.sourceType,
          trustLevel: 'fixture',
          active: true,
          notes: 'Synthetic demo fixture. Not an official source. Contains no real policy.',
          lastVerifiedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const fullText = fixture.texts.join('\n\n');
    const contentHash = hashContent(fullText);
    const existingDoc = await Document.findOne({ sourceId: source._id, contentHash }).lean();

    if (existingDoc && !reset) {
      results.push({ url: fixture.url, status: 'skipped', sourceId: String(source._id) });
      continue;
    }

    await Document.deleteMany({ sourceId: source._id });
    await Chunk.deleteMany({ sourceId: source._id });

    const document = await Document.create({
      sourceId: source._id,
      contentHash,
      rawText: fullText,
      parserVersion: 'demo-fixture-v1',
      language: fixture.language,
      service: 'irctc',
      status: 'active',
      chunkCount: fixture.texts.length,
    });

    const vectors = await embedder.embedDocuments(fixture.texts);

    await Chunk.insertMany(
      fixture.texts.map((text, index) => ({
        documentId: document._id,
        sourceId: source._id,
        chunkIndex: index,
        text,
        tokenEstimate: estimateTokens(text),
        language: fixture.language,
        service: 'irctc',
        sourceType: 'fixture',
        embedding: vectors[index],
        embeddingModel: embedder.metadata.model,
        embeddingDimensions: embedder.metadata.dimensions,
        active: true,
      })),
    );

    results.push({
      url: fixture.url,
      status: 'seeded',
      sourceId: String(source._id),
      chunks: fixture.texts.length,
    });
  }

  return {
    embedding: embedder.metadata,
    sources: results,
    seeded: results.filter((item) => item.status === 'seeded').length,
    skipped: results.filter((item) => item.status === 'skipped').length,
  };
}

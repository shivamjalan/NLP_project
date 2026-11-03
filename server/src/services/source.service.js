import { Source } from '../models/Source.js';
import { notFound } from '../utils/errors.js';

const PUBLIC_SOURCE_FIELDS = {
  title: 1,
  authority: 1,
  canonicalUrl: 1,
  service: 1,
  language: 1,
  sourceType: 1,
  publishedAt: 1,
  lastVerifiedAt: 1,
  trustLevel: 1,
  active: 1,
  updatedAt: 1,
};

export async function getPublicSource(sourceId) {
  const source = await Source.findOne({ _id: sourceId, active: true }, PUBLIC_SOURCE_FIELDS).lean();
  if (!source) throw notFound('Source not found.');
  return {
    sourceId: String(source._id),
    title: source.title,
    authority: source.authority,
    url: source.canonicalUrl,
    service: source.service,
    language: source.language,
    sourceType: source.sourceType,
    publishedAt: source.publishedAt,
    lastVerifiedAt: source.lastVerifiedAt,
    trustLevel: source.trustLevel,
    updatedAt: source.updatedAt,
  };
}

export async function listSourcesForAdmin({ service, active } = {}) {
  const filter = {};
  if (service) filter.service = service;
  if (active === 'true') filter.active = true;
  if (active === 'false') filter.active = false;
  const sources = await Source.find(filter).sort({ updatedAt: -1 }).limit(200).lean();
  return sources.map((source) => ({
    sourceId: String(source._id),
    title: source.title,
    authority: source.authority,
    url: source.canonicalUrl,
    service: source.service,
    language: source.language,
    sourceType: source.sourceType,
    trustLevel: source.trustLevel,
    active: source.active,
    publishedAt: source.publishedAt,
    lastVerifiedAt: source.lastVerifiedAt,
    updatedAt: source.updatedAt,
  }));
}

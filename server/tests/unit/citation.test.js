import { describe, expect, it } from 'vitest';
import { EvidenceRegistry } from '../../src/services/evidence.service.js';
import { buildCitations, auditAnswerAgainstEvidence } from '../../src/services/citation.service.js';
import { computeConfidence } from '../../src/services/confidence.service.js';

const FRESH_AGO = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

function chunk(id, text = 'Synthetic demo passage about Tatkal.') {
  return { _id: id, text, language: 'en' };
}

function source(id, overrides = {}) {
  return {
    _id: id,
    title: 'Demo fixture - Tatkal booking',
    authority: 'Synthetic demo fixture',
    canonicalUrl: 'https://demo.invalid/irctc/tatkal-demo',
    sourceType: 'fixture',
    trustLevel: 'fixture',
    lastVerifiedAt: FRESH_AGO,
    publishedAt: null,
    language: 'en',
    active: true,
    ...overrides,
  };
}

describe('EvidenceRegistry', () => {
  it('mints stable sequential evidence IDs', () => {
    const registry = new EvidenceRegistry();
    const first = registry.add({ chunk: chunk('a1'), source: source('s1'), score: 0.5 });
    const second = registry.add({ chunk: chunk('a2'), source: source('s1'), score: 0.4 });
    expect(first.evidenceId).toBe('ev_1');
    expect(second.evidenceId).toBe('ev_2');
    expect(registry.size).toBe(2);
    expect(registry.has('ev_1')).toBe(true);
    expect(registry.get('missing')).toBeNull();
  });

  it('deduplicates the same chunk and keeps the higher score', () => {
    const registry = new EvidenceRegistry();
    registry.add({ chunk: chunk('a1'), source: source('s1'), score: 0.2 });
    const again = registry.add({ chunk: chunk('a1'), source: source('s1'), score: 0.9 });
    expect(registry.size).toBe(1);
    expect(again.score).toBe(0.9);
  });

  it('enforces the maximum evidence budget', () => {
    const registry = new EvidenceRegistry({ maxEvidence: 2 });
    registry.add({ chunk: chunk('a1'), source: source('s1') });
    registry.add({ chunk: chunk('a2'), source: source('s2') });
    expect(registry.add({ chunk: chunk('a3'), source: source('s3') })).toBeNull();
    expect(registry.size).toBe(2);
  });

  it('ignores incomplete inputs', () => {
    const registry = new EvidenceRegistry();
    expect(registry.add({ chunk: null, source: source('s1') })).toBeNull();
    expect(registry.add({ chunk: chunk('a1'), source: null })).toBeNull();
    expect(registry.add({ chunk: { text: 'no id' }, source: source('s1') })).toBeNull();
  });
});

describe('citation building', () => {
  it('uses stored source metadata, not model-provided fields', () => {
    const registry = new EvidenceRegistry();
    registry.add({ chunk: chunk('a1'), source: source('s1') });
    const result = buildCitations({
      evidenceIds: ['ev_1'],
      registry,
      sourcesById: new Map([['s1', source('s1')]]),
    });
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      sourceId: 's1',
      title: 'Demo fixture - Tatkal booking',
      url: 'https://demo.invalid/irctc/tatkal-demo',
      trustLevel: 'fixture',
      sourceType: 'fixture',
    });
    expect(result.dropped).toEqual([]);
  });

  it('drops invented IDs, duplicate sources and inactive sources', () => {
    const registry = new EvidenceRegistry();
    registry.add({ chunk: chunk('a1'), source: source('s1') });
    registry.add({ chunk: chunk('a2'), source: source('s1') });
    registry.add({ chunk: chunk('a3'), source: source('s2') });

    const result = buildCitations({
      evidenceIds: ['ev_1', 'ev_2', 'ev_3', 'ev_42'],
      registry,
      sourcesById: new Map([
        ['s1', source('s1')],
        ['s2', source('s2', { active: false })],
      ]),
    });

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].sourceId).toBe('s1');
    expect(result.dropped).toEqual(['ev_3', 'ev_42']);
  });

  it('caps the number of citations', () => {
    const registry = new EvidenceRegistry();
    const sourcesById = new Map();
    for (let index = 0; index < 8; index += 1) {
      const id = `s${index}`;
      registry.add({ chunk: chunk(`a${index}`), source: source(id) });
      sourcesById.set(id, source(id));
    }
    const result = buildCitations({
      evidenceIds: registry.list().map((item) => item.evidenceId),
      registry,
      sourcesById,
      maxCitations: 3,
    });
    expect(result.citations).toHaveLength(3);
  });
});

describe('answer audit', () => {
  it('flags URLs that are not present in retrieved evidence', () => {
    const registry = new EvidenceRegistry();
    registry.add({ chunk: chunk('a1'), source: source('s1') });
    const audit = auditAnswerAgainstEvidence({
      answer: 'See https://evil.invalid/fake and https://demo.invalid/irctc/tatkal-demo',
      answerType: 'grounded',
      citations: [{ sourceId: 's1' }],
      registry,
      evidenceIds: ['ev_1'],
    });
    expect(audit.issues).toContainEqual({ type: 'unknown_url', value: 'https://evil.invalid/fake' });
    expect(audit.issues.some((issue) => issue.type === 'unknown_url' && issue.value.includes('demo.invalid'))).toBe(
      false,
    );
  });

  it('flags a grounded answer with no valid citation', () => {
    const registry = new EvidenceRegistry();
    const audit = auditAnswerAgainstEvidence({
      answer: 'A rule without a citation.',
      answerType: 'grounded',
      citations: [],
      registry,
      evidenceIds: [],
    });
    expect(audit.issues).toContainEqual({ type: 'grounded_without_citation' });
  });
});

describe('confidence scoring', () => {
  const officialEvidence = [
    {
      evidenceId: 'ev_1',
      sourceId: 's1',
      trustLevel: 'official',
      lastVerifiedAt: FRESH_AGO,
    },
    {
      evidenceId: 'ev_2',
      sourceId: 's2',
      trustLevel: 'official',
      lastVerifiedAt: FRESH_AGO,
    },
  ];

  it('returns low confidence for abstentions and clarifications', () => {
    expect(computeConfidence({ answerType: 'abstention', evidence: [] })).toBe('low');
    expect(computeConfidence({ answerType: 'clarification', evidence: [] })).toBe('low');
  });

  it('can reach high confidence for fresh, multi-source official evidence', () => {
    expect(
      computeConfidence({
        answerType: 'grounded',
        evidence: officialEvidence,
        verification: { verdict: 'ok' },
        coverage: 0.9,
        citationCount: 2,
      }),
    ).toBe('high');
  });

  it('penalises fixture-only evidence', () => {
    expect(
      computeConfidence({
        answerType: 'grounded',
        evidence: [
          { sourceId: 's1', trustLevel: 'fixture', lastVerifiedAt: FRESH_AGO },
          { sourceId: 's2', trustLevel: 'fixture', lastVerifiedAt: FRESH_AGO },
        ],
        verification: { verdict: 'ok' },
        coverage: 1,
        citationCount: 2,
      }),
    ).toBe('medium');
  });

  it('penalises missing citations and verification issues', () => {
    const withIssues = computeConfidence({
      answerType: 'grounded',
      evidence: officialEvidence,
      verification: { verdict: 'issues' },
      coverage: 0.5,
      citationCount: 0,
    });
    expect(withIssues).toBe('low');
  });
});

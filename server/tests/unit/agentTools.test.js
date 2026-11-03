import { describe, expect, it } from 'vitest';
import {
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  isAllowedTool,
  isRetrievalTool,
  validateToolArguments,
  executeTool,
} from '../../src/agentTools/index.js';
import { EvidenceRegistry } from '../../src/services/evidence.service.js';

describe('agent tool allowlist', () => {
  it('exposes exactly the five approved tools', () => {
    expect(TOOL_NAMES.sort()).toEqual(
      ['askClarification', 'compareEvidence', 'fetchSourcePassages', 'keywordSearch', 'searchKnowledgeBase'].sort(),
    );
    expect(TOOL_DEFINITIONS).toHaveLength(5);
    TOOL_DEFINITIONS.forEach((definition) => {
      expect(definition.name).toBeTruthy();
      expect(definition.parameters.type).toBe('object');
    });
  });

  it('recognises allowed and retrieval tools', () => {
    expect(isAllowedTool('searchKnowledgeBase')).toBe(true);
    expect(isAllowedTool('deleteDatabase')).toBe(false);
    expect(isRetrievalTool('searchKnowledgeBase')).toBe(true);
    expect(isRetrievalTool('askClarification')).toBe(false);
  });

  it('validates arguments with Zod', () => {
    expect(validateToolArguments('searchKnowledgeBase', { query: 'Tatkal rules' })).toMatchObject({
      query: 'Tatkal rules',
      service: 'irctc',
      limit: 5,
    });
    expect(() => validateToolArguments('searchKnowledgeBase', { query: '' })).toThrowError(/Invalid arguments/);
    expect(() => validateToolArguments('fetchSourcePassages', { sourceId: 'nope', passageIds: [] })).toThrowError(
      /Invalid arguments/,
    );
  });

  it('returns a structured error for non-allowlisted tools', async () => {
    const result = await executeTool('runShellCommand', {}, { registry: new EvidenceRegistry() });
    expect(result.status).toBe('error');
    expect(result.code).toBe('tool_not_allowed');
  });

  it('returns a clarification without touching retrieval', async () => {
    const result = await executeTool(
      'askClarification',
      { question: 'Which service do you mean?', reason: 'ambiguous' },
      { registry: new EvidenceRegistry() },
    );
    expect(result.status).toBe('ok');
    expect(result.clarification.question).toMatch(/Which service/);
  });

  it('refuses comparisons without registered evidence', async () => {
    const result = await executeTool(
      'compareEvidence',
      { evidenceIds: ['ev_1', 'ev_2'], comparisonQuestion: 'Compare' },
      { registry: new EvidenceRegistry() },
    );
    expect(result.status).toBe('error');
    expect(result.code).toBe('evidence_unavailable');
  });

  it('compares two registered evidence items', async () => {
    const registry = new EvidenceRegistry();
    const source = {
      _id: 's1',
      title: 'Fixture',
      authority: 'Synthetic',
      canonicalUrl: 'https://demo.invalid/a',
      sourceType: 'fixture',
      trustLevel: 'fixture',
      lastVerifiedAt: new Date().toISOString(),
    };
    registry.add({ chunk: { _id: 'c1', text: 'One' }, source });
    registry.add({ chunk: { _id: 'c2', text: 'Two' }, source });
    const result = await executeTool(
      'compareEvidence',
      { evidenceIds: ['ev_1', 'ev_2'], comparisonQuestion: 'Compare' },
      { registry },
    );
    expect(result.status).toBe('ok');
    expect(result.comparison.sources).toHaveLength(1);
    expect(result.comparison.sources[0].passages).toHaveLength(2);
  });
});

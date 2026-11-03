import { describe, expect, it } from 'vitest';
import {
  normalizeText,
  collapseToLine,
  estimateTokens,
  truncate,
  tokenizeForSearch,
  termCoverage,
} from '../../src/utils/text.js';
import { chunkText } from '../../src/utils/chunking.js';
import { detectLanguage, resolveLanguage, isSupportedLanguage } from '../../src/utils/language.js';

describe('text utilities', () => {
  it('normalizes whitespace, newlines and zero-width characters', () => {
    expect(normalizeText('  Hello\u200B\r\n\r\n\r\nworld  \t again ')).toBe('Hello\n\nworld again');
    expect(normalizeText(null)).toBe('');
  });

  it('collapses newlines for single-line contexts', () => {
    expect(collapseToLine('one\n\ntwo\nthree')).toBe('one two three');
  });

  it('estimates tokens with Indic-aware heuristics', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('नमस्ते')).toBe(3);
  });

  it('truncates on a word boundary and marks the cut', () => {
    const result = truncate('The quick brown fox jumps over the lazy dog', 20);
    expect(result.length).toBeLessThanOrEqual(21);
    expect(result.endsWith('…')).toBe(true);
    expect(truncate('short', 20)).toBe('short');
  });

  it('tokenizes multilingual text and computes coverage', () => {
    expect(tokenizeForSearch('PNR, status! 123')).toEqual(['pnr', 'status', '123']);
    expect(termCoverage('tatkal booking', 'Tatkal booking rules')).toBe(1);
    expect(termCoverage('tatkal refund', 'Tatkal booking rules')).toBe(0.5);
    expect(termCoverage('', 'anything')).toBe(0);
  });
});

describe('chunkText', () => {
  it('returns no chunks for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('keeps short paragraphs together', () => {
    const chunks = chunkText('First short paragraph.\n\nSecond short paragraph.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('First short paragraph.');
  });

  it('splits long text into bounded, ordered chunks', () => {
    const paragraph = Array.from({ length: 80 }, (_, index) => `Sentence number ${index} explains a rule.`).join(' ');
    const chunks = chunkText(paragraph, { targetChars: 400, maxChars: 500, overlapChars: 40, minChars: 40 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, index) => {
      expect(chunk.index).toBe(index);
      expect(chunk.text.length).toBeLessThanOrEqual(500);
      expect(chunk.tokenEstimate).toBeGreaterThan(0);
    });
  });

  it('hard-splits a single enormous sentence', () => {
    const chunks = chunkText('x'.repeat(2500), { targetChars: 500, maxChars: 600, minChars: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 600)).toBe(true);
  });
});

describe('language detection', () => {
  it('detects Devanagari and Kannada reliably', () => {
    expect(detectLanguage('टिकट बुकिंग की प्रक्रिया क्या है?').language).toBe('hi');
    expect(detectLanguage('ಟಿಕೆಟ್ ಬುಕ್ಕಿಂಗ್ ಪ್ರಕ್ರಿಯೆ ಏನು?').language).toBe('kn');
    expect(detectLanguage('What is the refund process?').language).toBe('en');
  });

  it('marks mixed scripts as code-mixed', () => {
    const detected = detectLanguage('Tatkal booking के नियम क्या हैं?');
    expect(detected.language).toBe('hi');
    expect(detected.codeMixed).toBe(true);
  });

  it('lets an explicit user preference win', () => {
    const resolved = resolveLanguage('kn', 'What is the refund process?');
    expect(resolved.language).toBe('kn');
    expect(resolved.source).toBe('user');
  });

  it('falls back to detection in auto mode', () => {
    const resolved = resolveLanguage('auto', 'टिकट के नियम');
    expect(resolved.language).toBe('hi');
    expect(resolved.source).toBe('auto');
  });

  it('validates supported language values', () => {
    expect(isSupportedLanguage('hi')).toBe(true);
    expect(isSupportedLanguage('ta')).toBe(false);
  });
});

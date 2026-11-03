const WHITESPACE_RE = /[ \t\f\v]+/g;
const NEWLINE_RE = /\n{3,}/g;
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;

export function normalizeText(input) {
  if (typeof input !== 'string') return '';
  return input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(ZERO_WIDTH_RE, '')
    .replace(WHITESPACE_RE, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(NEWLINE_RE, '\n\n')
    .trim();
}

export function collapseToLine(input) {
  return normalizeText(input).replace(/\n+/g, ' ');
}

export function estimateTokens(text) {
  if (!text) return 0;
  // Mixed-script heuristic: ~4 characters per token for Latin, ~2 for Indic.
  const indic = (text.match(/[\u0900-\u097F\u0C80-\u0CFF]/g) || []).length;
  const latin = text.length - indic;
  return Math.ceil(latin / 4 + indic / 2);
}

export function truncate(text, maxChars) {
  if (typeof text !== 'string') return '';
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, Math.max(0, maxChars - 1));
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}\u2026`;
}

export function tokenizeForSearch(text) {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Cheap lexical coverage heuristic used for confidence scoring. */
export function termCoverage(query, text) {
  const queryTerms = [...new Set(tokenizeForSearch(query))];
  if (queryTerms.length === 0) return 0;
  const haystack = new Set(tokenizeForSearch(text));
  let hits = 0;
  for (const term of queryTerms) {
    if (haystack.has(term)) hits += 1;
  }
  return hits / queryTerms.length;
}

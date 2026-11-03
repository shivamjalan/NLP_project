import { estimateTokens, normalizeText } from './text.js';

export const DEFAULT_CHUNK_OPTIONS = {
  targetChars: 900,
  maxChars: 2000,
  overlapChars: 120,
  minChars: 80,
};

/**
 * Split text into coherent, overlapping passages. Paragraph boundaries are
 * preserved first; paragraphs that are too long are split on sentence
 * boundaries, and only then on hard character limits.
 */
export function chunkText(input, options = {}) {
  const opts = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const text = normalizeText(input);
  if (!text) return [];

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const segments = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= opts.targetChars) {
      segments.push(paragraph);
      continue;
    }
    const sentences = paragraph.match(/[^.!?\u0964\u0965\u3002]+[.!?\u0964\u0965\u3002]?/g) || [paragraph];
    let buffer = '';
    for (const sentence of sentences) {
      if (sentence.length > opts.maxChars) {
        if (buffer) {
          segments.push(buffer.trim());
          buffer = '';
        }
        for (let i = 0; i < sentence.length; i += opts.targetChars) {
          segments.push(sentence.slice(i, i + opts.targetChars).trim());
        }
        continue;
      }
      if ((buffer + sentence).length > opts.targetChars && buffer) {
        segments.push(buffer.trim());
        buffer = '';
      }
      buffer += sentence;
    }
    if (buffer.trim()) segments.push(buffer.trim());
  }

  const chunks = [];
  let current = '';
  for (const segment of segments) {
    if (!current) {
      current = segment;
    } else if ((current + '\n' + segment).length <= opts.targetChars) {
      current += '\n' + segment;
    } else {
      chunks.push(current);
      const overlap = current.slice(Math.max(0, current.length - opts.overlapChars));
      current = overlap ? `${overlap}\n${segment}` : segment;
    }
  }
  if (current) chunks.push(current);

  return chunks
    .map((chunk) => chunk.trim())
    .filter((chunk, _index, list) => chunk.length >= opts.minChars || list.length === 1)
    .map((chunk, index) => ({
      index,
      text: chunk.slice(0, opts.maxChars),
      tokenEstimate: estimateTokens(chunk.slice(0, opts.maxChars)),
    }));
}

import { normalizeText } from './text.js';

export const SUPPORTED_LANGUAGES = ['en', 'hi', 'kn'];
export const LANGUAGE_PREFERENCE_VALUES = ['auto', ...SUPPORTED_LANGUAGES];

const DEVANAGARI_RE = /[\u0900-\u097F]/g;
const KANNADA_RE = /[\u0C80-\u0CFF]/g;

/**
 * Script-based language detection. This is intentionally transparent instead
 * of a probabilistic language-id model: for the supported set, the writing
 * system is a reliable signal and a wrong guess is otherwise very visible.
 * Romanised Hindi/Kannada is reported as English with `codeMixed: true`, and
 * the LLM is still asked to reply in the user's chosen language.
 */
export function detectLanguage(text) {
  const normalized = normalizeText(text);
  if (!normalized) return { language: 'en', confidence: 'low', codeMixed: false };

  const devanagari = (normalized.match(DEVANAGARI_RE) || []).length;
  const kannada = (normalized.match(KANNADA_RE) || []).length;
  const letters = (normalized.match(/\p{L}/gu) || []).length || 1;

  const devanagariRatio = devanagari / letters;
  const kannadaRatio = kannada / letters;

  if (kannadaRatio > 0.2 && kannadaRatio >= devanagariRatio) {
    return {
      language: 'kn',
      confidence: kannadaRatio > 0.5 ? 'high' : 'medium',
      codeMixed: devanagariRatio > 0.1 || hasLatinWords(normalized),
    };
  }
  if (devanagariRatio > 0.2) {
    return {
      language: 'hi',
      confidence: devanagariRatio > 0.5 ? 'high' : 'medium',
      codeMixed: hasLatinWords(normalized),
    };
  }
  return { language: 'en', confidence: 'medium', codeMixed: false };
}

function hasLatinWords(text) {
  return (text.match(/[A-Za-z]{3,}/g) || []).length > 0;
}

/**
 * Resolve the response language from an explicit preference and the message.
 * `auto` falls back to detection; an explicit preference always wins (the API
 * layer separately checks that the configured provider supports it).
 */
export function resolveLanguage(preferred, text) {
  if (SUPPORTED_LANGUAGES.includes(preferred)) {
    return { language: preferred, detected: detectLanguage(text), source: 'user' };
  }
  const detected = detectLanguage(text);
  return { language: detected.language, detected, source: 'auto' };
}

export function isSupportedLanguage(value) {
  return SUPPORTED_LANGUAGES.includes(value);
}

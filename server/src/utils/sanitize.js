import { hashContent } from './crypto.js';

const PATTERNS = [
  { type: 'aadhaar', re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g },
  { type: 'pan', re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { type: 'card', re: /\b(?:\d[ -]?){13,19}\b/g },
  { type: 'otp', re: /\b(?:otp|one[- ]time password)\b[^\n]{0,24}?\b\d{4,8}\b/gi },
  { type: 'pin', re: /\b(?:upi\s*pin|atm\s*pin|pin)\b\s*(?:is|:|=|-)?\s*\d{4,6}\b/gi },
  { type: 'password', re: /\b(?:password|passwd|pwd)\b\s*[:=-]\s*\S+/gi },
  { type: 'cvv', re: /\bcvv\b\s*[:=-]?\s*\d{3,4}\b/gi },
  { type: 'ifsc', re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
];

const SECRET_ASK_RE =
  /\b(?:send|share|give|tell|provide|enter|type)\b[^.\n]{0,40}\b(?:otp|password|pin|cvv|aadhaar|pan|card number|bank details|account number)\b/i;

export function detectSensitiveData(text) {
  const value = String(text || '');
  const found = [];
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    if (pattern.re.test(value)) found.push(pattern.type);
  }
  return { hasSensitiveData: found.length > 0, types: [...new Set(found)] };
}

/** Mask obviously sensitive substrings before anything is stored or logged. */
export function redactSensitiveData(text) {
  let value = String(text || '');
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    value = value.replace(pattern.re, (match) => `[redacted:${pattern.type}:${hashContent(match).slice(0, 8)}]`);
  }
  return value;
}

/** True when the user is asking the assistant to handle secret credentials. */
export function isRequestingSecrets(text) {
  return SECRET_ASK_RE.test(String(text || ''));
}

export const UNSUPPORTED_ACTION_PATTERNS = [
  /\b(book|booking|reserve|reservation)\b.*\b(ticket|seat|berth|train)\b/i,
  /\b(cancel|cancellation)\b.*\b(ticket|booking|pnr)\b/i,
  /\b(pay|payment|refund|money|amount)\b.*\b(ticket|booking|refund|irctc)\b/i,
  /\b(refund status|pnr status|booking status|ticket status|my (?:booking|ticket|refund|account))\b/i,
  /\b(check|track|look ?up|find|show)\b.*\b(my|our)\b.*\b(pnr|booking|ticket|refund|account|application|claim)\b/i,
  /\b(log ?in|sign ?in|login|signin)\b.*\b(irctc|account|portal|website)\b/i,
  /\b(change|modify|update|delete)\b.*\b(my|our)\b.*\b(account|profile|booking|ticket)\b/i,
  /\b(submit|fill|file)\b.*\b(form|application|claim)\b/i,
  // Indic-language equivalents: "my ticket/booking/refund/account" requests.
  /(मेरा|मेरी|मेरे).*(टिकट|बुकिंग|रिफंड|खाता|आवेदन)/,
  /(टिकट|बुकिंग|रिफंड|खाता|आवेदन).*(बुक\s*करो|रद्द\s*करो|बताओ|दिखाओ)/,
  /(ನನ್ನ).*(ಟಿಕೆಟ್|ಬುಕ್ಕಿಂಗ್|ಮರುಪಾವತಿ|ಖಾತೆ|ಅರ್ಜಿ)/,
  /(ಟಿಕೆಟ್|ಬುಕ್ಕಿಂಗ್|ಮರುಪಾವತಿ|ಖಾತೆ|ಅರ್ಜಿ).*(ಬುಕ್\s*ಮಾಡಿ|ರದ್ದು\s*ಮಾಡಿ|ತಿಳಿಸಿ|ನೋಡಿ)/,
];

export function detectUnsupportedAction(text) {
  const value = String(text || '').trim();
  if (!value) return false;

  // Distinguish "How do I check PNR status?" / "What is the refund process?"
  // (public information) from "check my PNR status" or "book a ticket for me"
  // (asking the assistant to act on a private record or transaction).
  const startsAsQuestion =
    /^(how|what|when|where|why|which|who|explain|tell me about|is|are|does|do)\b/i.test(value);
  const asksAssistantToAct = /^(please\s+)?(can|could|would|will)\s+you\b/i.test(value);
  const hasPossessive = /\b(my|our)\b|मेरा|मेरी|मेरे|ನನ್ನ/i.test(value);
  const userDoesItThemselves = /^how\b/i.test(value) && /\b(i|we)\b/i.test(value);
  const howToLanguage = /\bkaise\b|कैसे|ಹೇಗೆ/i.test(value);

  if (
    (startsAsQuestion || howToLanguage) &&
    !asksAssistantToAct &&
    (!hasPossessive || userDoesItThemselves || howToLanguage)
  ) {
    return false;
  }

  return UNSUPPORTED_ACTION_PATTERNS.some((re) => re.test(value));
}

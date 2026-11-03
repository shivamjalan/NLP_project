import { describe, expect, it } from 'vitest';
import {
  detectSensitiveData,
  redactSensitiveData,
  isRequestingSecrets,
  detectUnsupportedAction,
} from '../../src/utils/sanitize.js';
import { evaluateSafety } from '../../src/services/safety.service.js';

describe('sensitive data handling', () => {
  it('detects Aadhaar, PAN, OTP, PIN and card numbers', () => {
    expect(detectSensitiveData('my aadhaar is 1234 5678 9012').types).toContain('aadhaar');
    expect(detectSensitiveData('PAN ABCDE1234F').types).toContain('pan');
    expect(detectSensitiveData('otp is 456789').types).toContain('otp');
    expect(detectSensitiveData('upi pin: 1234').types).toContain('pin');
    expect(detectSensitiveData('my UPI PIN is 4321').types).toContain('pin');
    expect(detectSensitiveData('card 4111 1111 1111 1111').types).toContain('card');
  });

  it('redacts values without keeping the original secret', () => {
    const redacted = redactSensitiveData('aadhaar 1234 5678 9012 and otp is 456789');
    expect(redacted).not.toContain('1234 5678 9012');
    expect(redacted).not.toContain('456789');
    expect(redacted).toContain('[redacted:aadhaar:');
    expect(redacted).toContain('[redacted:otp:');
  });

  it('leaves ordinary questions untouched', () => {
    expect(detectSensitiveData('What is the Tatkal rule?').hasSensitiveData).toBe(false);
    expect(redactSensitiveData('What is the Tatkal rule?')).toBe('What is the Tatkal rule?');
  });

  it('recognises requests that ask for secrets', () => {
    expect(isRequestingSecrets('Please share your OTP with me')).toBe(true);
    expect(isRequestingSecrets('How do I reset my password?')).toBe(false);
  });
});

describe('unsupported action detection', () => {
  it('blocks transactional actions', () => {
    expect(detectUnsupportedAction('Book a Tatkal ticket for me')).toBe(true);
    expect(detectUnsupportedAction('Cancel my ticket')).toBe(true);
    expect(detectUnsupportedAction('check my PNR status')).toBe(true);
    expect(detectUnsupportedAction('log in to my IRCTC account')).toBe(true);
    expect(detectUnsupportedAction('मेरा टिकट रद्द कर दो')).toBe(true);
  });

  it('does not block public how-to questions', () => {
    expect(detectUnsupportedAction('How do I check PNR status?')).toBe(false);
    expect(detectUnsupportedAction('How can I cancel a ticket on IRCTC?')).toBe(false);
    expect(detectUnsupportedAction('How can I check my PNR status?')).toBe(false);
    expect(detectUnsupportedAction('How does the refund process work after I cancel a train ticket?')).toBe(false);
    expect(detectUnsupportedAction('What is the refund process?')).toBe(false);
    expect(detectUnsupportedAction('PNR status kaise check karein?')).toBe(false);
    expect(detectUnsupportedAction('What are the Tatkal booking rules?')).toBe(false);
    expect(detectUnsupportedAction('ಟಿಕೆಟ್ ಬುಕ್ಕಿಂಗ್ ಪ್ರಕ್ರಿಯೆ ಏನು?')).toBe(false);
    expect(detectUnsupportedAction('टिकट बुकिंग की सामान्य प्रक्रिया क्या है?')).toBe(false);
    expect(detectUnsupportedAction('Tell me about passport application fees')).toBe(false);
  });

  it('still blocks direct requests to act on a private record', () => {
    expect(detectUnsupportedAction('Check my PNR status')).toBe(true);
    expect(detectUnsupportedAction('What is my PNR status?')).toBe(true);
    expect(detectUnsupportedAction('Can you book a ticket for me?')).toBe(true);
    expect(detectUnsupportedAction('Please cancel my ticket.')).toBe(true);
  });
});

describe('safety gates', () => {
  it('refuses secret requests before any model call', () => {
    const result = evaluateSafety({ message: 'Send me the OTP and password', language: 'en' });
    expect(result.category).toBe('secret_request');
    expect(result.answerType).toBe('abstention');
    expect(result.answer).toMatch(/never share/i);
  });

  it('refuses unsupported actions in the user language', () => {
    const result = evaluateSafety({ message: 'Book a train ticket for me', language: 'hi' });
    expect(result.category).toBe('unsupported_action');
    expect(result.answer).toContain('टिकट बुक');
  });

  it('rejects out-of-scope services without IRCTC context', () => {
    const result = evaluateSafety({ message: 'Tell me about passport application fees', language: 'en' });
    expect(result.category).toBe('out_of_scope');
    expect(result.answer).toContain('passport');
  });

  it('allows IRCTC-adjacent public questions through', () => {
    expect(evaluateSafety({ message: 'What is the baggage rule for trains?', language: 'en' })).toBeNull();
    expect(evaluateSafety({ message: 'How do I check PNR status?', language: 'en' })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { isPrivateIp, assertAllowedSourceUrl } from '../../src/utils/urlSafety.js';
import { isDomainAllowed, describeAllowedDomains } from '../../src/config/sourcePolicy.js';

describe('source domain policy', () => {
  it('allows only approved domains and their subdomains', () => {
    expect(isDomainAllowed('irctc.co.in')).toBe(true);
    expect(isDomainAllowed('www.irctc.co.in')).toBe(true);
    expect(isDomainAllowed('contents.irctc.co.in')).toBe(true);
    expect(isDomainAllowed('indianrailways.gov.in')).toBe(true);
    expect(isDomainAllowed('evil.example.com')).toBe(false);
    expect(isDomainAllowed('irctc.co.in.evil.example')).toBe(false);
    expect(isDomainAllowed('notirctc.co.in')).toBe(false);
  });

  it('describes the allowlist for operators', () => {
    expect(describeAllowedDomains('irctc')).toContain('irctc.co.in');
  });
});

describe('SSRF and URL validation', () => {
  it('identifies private and loopback addresses', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.1.2.3')).toBe(true);
    expect(isPrivateIp('192.168.0.10')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('169.254.1.1')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
  });

  it('accepts allowlisted HTTPS registry URLs', () => {
    expect(assertAllowedSourceUrl('https://www.irctc.co.in/nget/train-search').hostname).toBe(
      'www.irctc.co.in',
    );
  });

  it('rejects unapproved hosts', () => {
    expect(() => assertAllowedSourceUrl('https://example.com/page')).toThrowError(
      /approved official-domain allowlist/,
    );
  });

  it('rejects IP literals and non-HTTP schemes', () => {
    expect(() => assertAllowedSourceUrl('https://127.0.0.1/admin')).toThrowError(/hostname, not an IP/);
    expect(() => assertAllowedSourceUrl('ftp://www.irctc.co.in/file')).toThrowError(/http or https/);
    expect(() => assertAllowedSourceUrl('javascript:alert(1)')).toThrowError(/http or https/);
  });

  it('rejects credentials embedded in URLs', () => {
    expect(() => assertAllowedSourceUrl('https://user:pass@www.irctc.co.in/')).toThrowError(
      /must not contain credentials/,
    );
  });
});

import dns from 'node:dns/promises';
import net from 'node:net';
import { isDomainAllowed } from '../config/sourcePolicy.js';
import { badRequest } from './errors.js';

const PRIVATE_V4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

export function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const value = ipv4ToInt(address);
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fe80') || normalized.startsWith('fc') || normalized.startsWith('fd')) {
      return true;
    }
    if (normalized.startsWith('::ffff:')) {
      return isPrivateIp(normalized.replace('::ffff:', ''));
    }
  }
  return false;
}

/**
 * Validate a registry URL: scheme, credentials, approved host, no IP literals.
 */
export function assertAllowedSourceUrl(rawUrl, { service = null } = {}) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    throw badRequest('Source URL is not a valid absolute URL.', 'invalid_source_url');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw badRequest('Source URL must use http or https.', 'invalid_source_url_scheme');
  }
  if (parsed.username || parsed.password) {
    throw badRequest('Source URL must not contain credentials.', 'invalid_source_url_credentials');
  }
  if (net.isIP(parsed.hostname)) {
    throw badRequest('Source URL must use a hostname, not an IP address.', 'invalid_source_url_ip');
  }
  if (!isDomainAllowed(parsed.hostname, service)) {
    throw badRequest(
      `Source host "${parsed.hostname}" is not on the approved official-domain allowlist.`,
      'source_domain_not_allowed',
    );
  }
  return parsed;
}

/**
 * Resolve a hostname and refuse private/loopback/link-local targets. This
 * guards against DNS records pointing into the internal network (SSRF).
 */
export async function assertPublicHost(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw badRequest('Refusing to fetch a private network address.', 'ssrf_blocked');
    }
    return;
  }
  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw badRequest('Source host could not be resolved.', 'source_host_unresolvable');
  }
  if (!records.length) {
    throw badRequest('Source host could not be resolved.', 'source_host_unresolvable');
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw badRequest('Refusing to fetch a host that resolves to a private address.', 'ssrf_blocked');
    }
  }
}

export async function assertSafeFetchTarget(url, options = {}) {
  const parsed = assertAllowedSourceUrl(url, options);
  await assertPublicHost(parsed.hostname);
  return parsed;
}

/**
 * Approved public-service source policy.
 *
 * Ingestion may only fetch URLs whose host is on this allowlist (or a
 * subdomain of one). Public chat users can never supply a URL that is fetched -
 * ingestion is driven exclusively by the reviewed registry in
 * `data/source_registry/`.
 */
export const ALLOWED_SOURCE_DOMAINS = Object.freeze([
  'irctc.co.in',
  'irctc.com',
  'indianrailways.gov.in',
  'indianrail.gov.in',
  'indianrailways.gov.in',
]);

export const SERVICE_DOMAINS = Object.freeze({
  irctc: ['irctc.co.in', 'irctc.com', 'indianrailways.gov.in', 'indianrail.gov.in'],
});

export function isDomainAllowed(hostname, service = null) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  const allowed = service && SERVICE_DOMAINS[service] ? SERVICE_DOMAINS[service] : ALLOWED_SOURCE_DOMAINS;
  return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function describeAllowedDomains(service = null) {
  const list = service && SERVICE_DOMAINS[service] ? SERVICE_DOMAINS[service] : ALLOWED_SOURCE_DOMAINS;
  return [...new Set(list)];
}

import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { assertSafeFetchTarget } from '../../utils/urlSafety.js';
import { normalizeText } from '../../utils/text.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

const USER_AGENT = 'BharatSevaAI/0.1 (+local information-assistant crawler; contact: project maintainer)';
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;

const robotsCache = new Map();

async function fetchRaw(url, { service, accept } = {}) {
  const target = await assertSafeFetchTarget(url, { service });
  let current = target.toString();

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, accept: accept || 'text/html,application/xhtml+xml,text/plain,application/pdf' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new AppError('Source redirected without a location.', { statusCode: 502, code: 'source_bad_redirect' });
      const next = new URL(location, current).toString();
      // Re-validate every hop so a redirect cannot escape the allowlist or SSRF guards.
      await assertSafeFetchTarget(next, { service });
      current = next;
      continue;
    }

    if (!response.ok) {
      throw new AppError(`Source returned HTTP ${response.status}.`, {
        statusCode: 502,
        code: 'source_fetch_failed',
      });
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_BYTES) {
      throw new AppError('Source document is too large to ingest.', {
        statusCode: 413,
        code: 'source_too_large',
      });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      throw new AppError('Source document is too large to ingest.', {
        statusCode: 413,
        code: 'source_too_large',
      });
    }
    return {
      buffer,
      contentType: (response.headers.get('content-type') || '').toLowerCase(),
      finalUrl: current,
    };
  }

  throw new AppError('Too many redirects while fetching the source.', {
    statusCode: 502,
    code: 'source_too_many_redirects',
  });
}

async function assertRobotsAllowed(url, service) {
  const parsed = new URL(url);
  const origin = parsed.origin;
  let entry = robotsCache.get(origin);
  if (!entry || Date.now() - entry.fetchedAt > 60 * 60 * 1000) {
    let body = '';
    try {
      const robotsUrl = `${origin}/robots.txt`;
      const response = await fetchRaw(robotsUrl, { service, accept: 'text/plain' });
      body = response.buffer.toString('utf8');
    } catch {
      body = '';
    }
    entry = { fetchedAt: Date.now(), robots: robotsParser(`${origin}/robots.txt`, body) };
    robotsCache.set(origin, entry);
  }
  const allowed = entry.robots.isAllowed(url, USER_AGENT);
  if (allowed === false) {
    throw new AppError('robots.txt disallows automated retrieval of this page.', {
      statusCode: 403,
      code: 'source_robots_disallowed',
    });
  }
}

function extractReadableText(html, pageUrl) {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, svg, form, nav, footer, header, aside').remove();

  const title =
    normalizeText($('meta[property="og:title"]').attr('content') || '') ||
    normalizeText($('title').first().text()) ||
    normalizeText($('h1').first().text()) ||
    pageUrl;

  const main = $('main, article, [role="main"]').first();
  const container = main.length ? main : $('body');

  container.find('p, li, tr, h1, h2, h3, h4, h5, h6, div, section, br').each((_, element) => {
    $(element).append('\n');
  });

  const text = normalizeText(container.text());
  return { title: title.slice(0, 300), text };
}

async function extractPdfText(buffer) {
  let pdfjs;
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    throw new AppError(
      'PDF ingestion requires the optional pdfjs-dist dependency. Run `npm install` again.',
      { statusCode: 501, code: 'pdf_support_unavailable' },
    );
  }
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str || '').join(' ');
    pages.push(text);
  }
  await document.destroy();
  return normalizeText(pages.join('\n\n'));
}

/**
 * Fetch a reviewed registry source. Public chat users can never reach this
 * function with their own URL: ingestion is registry-driven only.
 */
export async function fetchSourceContent(url, { service = 'irctc' } = {}) {
  await assertRobotsAllowed(url, service);
  const { buffer, contentType, finalUrl } = await fetchRaw(url, { service });

  const isPdf =
    contentType.includes('application/pdf') || new URL(finalUrl).pathname.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    const text = await extractPdfText(buffer);
    return { finalUrl, title: new URL(finalUrl).pathname.split('/').pop() || 'PDF document', text, contentType: 'application/pdf' };
  }

  if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('xml')) {
    throw new AppError(`Unsupported source content type: ${contentType || 'unknown'}.`, {
      statusCode: 415,
      code: 'source_unsupported_content_type',
    });
  }

  const html = buffer.toString('utf8');
  if (contentType.includes('text/plain')) {
    return { finalUrl, title: new URL(finalUrl).pathname, text: normalizeText(html), contentType };
  }

  const { title, text } = extractReadableText(html, finalUrl);
  logger.debug({ finalUrl, chars: text.length }, 'Extracted source text');
  return { finalUrl, title, text, contentType };
}

export function clearRobotsCache() {
  robotsCache.clear();
}

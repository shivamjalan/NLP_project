# Source Policy

BharatSeva AI answers public-service questions **only** from reviewed, stored
sources. This document defines what may be ingested, how it is reviewed, how it
is labelled, and what the assistant must do when trustworthy evidence is
missing.

## Core rules

1. **Official sources only** for real answers. The pilot accepts IRCTC and
   Indian Railways domains only.
2. **No arbitrary URLs.** Public chat cannot supply a URL, and no chat tool
   fetches the web. Ingestion is driven exclusively by
   `data/source_registry/irctc.sources.json`.
3. **No guessed deep links.** A URL must be opened and verified by a human
   before it is added. “It probably exists” is not enough.
4. **No unverified claims.** If indexed evidence does not support an answer,
   the assistant abstains rather than inferring a fee, deadline, quota, or
   eligibility rule.
5. **Fixtures are not sources of truth.** Synthetic demo fixtures are clearly
   labelled `.invalid` placeholders and are never presented as official
   guidance.
6. **Citations are data-backed.** Every citation comes from an active Source
   record that was retrieved in the current turn. Model-generated URLs are
   stripped.
7. **Review is continuous.** Source metadata records `lastReviewedAt` and
   `lastVerifiedAt`; re-verify pages when they change or before relying on them.

## Approved domains

The allowlist is defined in `server/src/config/sourcePolicy.js`:

- `irctc.co.in` (and subdomains)
- `irctc.com` (and subdomains)
- `indianrailways.gov.in` (and subdomains)
- `indianrail.gov.in` (and subdomains)

Hostnames are checked exactly or as a subdomain. IP literals, embedded
credentials, non-HTTP schemes, and hosts outside the list are rejected.
Redirects are re-validated at every hop.

Adding a new service (for example EPFO or Passport Seva) requires:

1. A reviewed domain allowlist for that service.
2. A human-reviewed registry with official entries.
3. Service-specific retrieval filters and evaluation questions.
4. Updated safety/out-of-scope configuration.

Until then, the assistant abstains honestly for other services.

## What may be ingested

Allowed, after human review:

- Official IRCTC / Indian Railways policy, FAQ, notice, and landing pages.
- Official PDFs (notices, rule documents) hosted on an approved domain.
- Official pages in English, Hindi, or Kannada.

Not allowed:

- News articles, blogs, forums, social media, Wikipedia, or third-party
  aggregators.
- Travel agencies or commercial “IRCTC rules” pages.
- User-generated content or chat transcripts.
- Screenshots or copied text without a verifiable official URL.
- Pages behind a login, paywall, CAPTCHA, or explicit robots.txt prohibition.
- Guessed URLs, short links, URL shorteners, or redirectors.
- Any page with credentials, personal data, or private booking information.
- Mirrors or archived copies when a live official source exists.

The `Source` model has `trustLevel` values `official`, `semi_official`, and
`fixture`. Registry ingestion currently writes `official` only. There is no
semi-official source in this pilot; do not use that label without a written
review standard.

## Registry format

`data/source_registry/irctc.sources.json`:

```json
{
  "version": 1,
  "updatedAt": "2026-11-01T00:00:00.000Z",
  "notes": "Reviewed registry. Only verified official URLs.",
  "sources": [
    {
      "url": "https://www.indianrail.gov.in/",
      "title": "Indian Railways - Passenger Reservation Enquiry (official landing page)",
      "authority": "Indian Railways",
      "service": "irctc",
      "language": "en",
      "sourceType": "official_page",
      "active": true,
      "lastReviewedAt": "2026-11-01T00:00:00.000Z",
      "notes": "Verified with an HTTP 200 response. Landing page only."
    }
  ]
}
```

Schema rules (`registryEntrySchema`):

| Field | Rule |
| --- | --- |
| `url` | Absolute URL on an approved domain |
| `title` | 1–300 chars, descriptive, no clickbait |
| `authority` | 1–200 chars, the publishing body |
| `service` | Currently `irctc` only |
| `language` | `en`, `hi`, or `kn` |
| `sourceType` | `official_page`, `official_pdf`, `faq`, or `notice` |
| `active` | `true` to ingest; `false` keeps the record but skips fetching |
| `lastReviewedAt` | ISO datetime or null |
| `notes` | Max 500 chars; why it is trusted, scope, caveats |

The current registry has three entries: two active official landing pages and
one inactive legacy IRCTC FAQ page. The registry’s own notes say the URLs were
verified with an HTTP 200 response on 2026-11-01; re-verify before relying on
them, because government sites change.

## Review checklist

Before setting `active: true`, a reviewer should:

- [ ] Open the URL in a clean browser and confirm it is the official domain.
- [ ] Confirm the page is publicly accessible and not a login/paywall.
- [ ] Confirm the content is current and relevant to the pilot.
- [ ] Record the actual publishing authority, not a guessed one.
- [ ] Set `publishedAt`/`lastReviewedAt` where known.
- [ ] Check `robots.txt` and terms; do not ingest disallowed content.
- [ ] Prefer the canonical page over mirrors or deep links that may move.
- [ ] Note limitations in `notes` (for example, “landing page only”).
- [ ] Run `npm run ingest -- --dry-run` to validate URL policy.
- [ ] Run ingestion and spot-check the stored chunks and citations.

## Ingestion behaviour

`POST /admin/ingestion/run` or `npm run ingest`:

1. Loads and schema-validates the registry.
2. Skips `active: false` entries.
3. Validates URL policy and resolves DNS to reject private addresses (SSRF).
4. Fetches HTML/PDF with a 20 s timeout, 2 MB cap, and at most 3 redirects.
5. Normalizes readable text; rejects pages with under 200 usable characters.
6. Hashes content and skips unchanged documents (`unchanged_content`).
7. Chunks with paragraph/sentence awareness and bounded size.
8. Embeds in batches and writes a `Document` plus `Chunk` records.
9. Marks prior documents/chunks for the same source as superseded/inactive.
10. Records an `IngestionJob` and a redacted error summary on failure.

A source becomes active only after it is in the registry and ingestion
succeeds. If the source is later marked inactive, retrieval filters it out
because only active Sources are eligible for citations.

## Trust, display, and citation rules

- `trustLevel: official` means “ingested from the reviewed registry,” not a
  government endorsement of BharatSeva AI.
- `trustLevel: fixture` means synthetic demo content. The UI shows a
  **Demo fixture — not official** badge and renders the URL as non-clickable.
- Confidence is lower for fixture-only evidence and capped at `medium`.
- Answers must cite a retrieved evidence ID to be labelled `grounded` or
  `mixed`. If no valid citation remains, the answer is downgraded to
  `abstention` with an unverified note.
- URLs in the answer must match an evidence source URL. Otherwise they are
  replaced with “the official source linked below”.
- Source cards show title, authority, verification date, trust badge, and a
  snippet. The snippet is evidence text, not model invention.
- The app never calls a source “verified by the government” or implies official
  partnership.

## Demo fixtures

Fixtures live in `server/src/data/demoFixtures.js`. They:

- Use `https://demo.invalid/...` URLs (reserved, never resolvable).
- Have `sourceType: "fixture"`, `trustLevel: "fixture"`.
- Begin with “SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY”.
- Contain no real fees, timings, quotas, or eligibility conditions.
- Are included only when `LLM_PROVIDER=mock` (demo mode); real mode excludes
  fixture sources from retrieval.
- Exist to demonstrate retrieval, citation, redaction, and UI states, not to
  answer real travel questions.

Do not replace fixture text with real policy text and keep the `fixture` label.
Add real content through the reviewed registry instead.

## Correction, update, and removal

- **Content changed:** re-run ingestion for the source. The new content hash
  creates a new document and supersedes old chunks.
- **URL moved:** add the new verified URL to the registry and mark the old entry
  inactive. Do not silently point at an unverified redirect.
- **Page wrong or withdrawn:** set `active: false`, re-run ingestion or remove
  its chunks, and confirm citations disappear. Public `/sources/:id` returns
  `404` for inactive sources.
- **Urgent correction:** mark inactive first, then investigate. Never leave a
  known-wrong source active while editing fixtures or prompts.
- **Retraction:** delete the source’s documents/chunks and its Source record if
  policy requires; retain an internal note for audit outside the app.

## Legal and ethical notes

- Respect robots.txt, site terms, rate limits, and copyright. The fetcher pauses
  between sources and identifies itself with a project user agent.
- Do not ingest personal data, private booking records, or content behind
  authentication.
- Summaries and quotations should be short and attributed. The app links to the
  official source rather than reproducing entire documents.
- This pilot is independent and must not imply government affiliation. The
  disclaimer is shown in the UI and returned in API responses.
- When in doubt, do not ingest. An abstention is better than a confident wrong
  answer about travel rules.

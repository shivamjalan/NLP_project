# Security

This document describes the controls actually implemented in the local-only
build, the threats they address, and the residual risks that remain. It does
not claim production readiness.

> **Scope:** local development workstation, single Node process, bundled local
> MongoDB (`data/local-db`) or an Atlas/MongoDB deployment you control. There is
> no Docker, CI, TLS termination, reverse proxy, WAF, or deployment hardening in
> this repository. Do not expose the app directly to the public internet.

## Security goals

1. The browser never receives provider keys, database credentials, session
   secrets, admin credentials, or raw prompts.
2. Users cannot make the assistant perform transactions, read private records,
   or retrieve arbitrary URLs.
3. Model output cannot fabricate citations or URLs.
4. A session ID alone is not enough to read or extend a conversation.
5. Sensitive values typed by users are redacted before storage and before the
   model sees them.
6. Ingestion cannot be used as an SSRF primitive or a way to fetch untrusted
   content.
7. Logs and API errors do not leak secrets or raw chat content.
8. Resource use is bounded: agent steps, retrieval calls, runtime, context,
   evidence, body size, rate.

## Threat model

| Threat | Control | Residual risk |
| --- | --- | --- |
| Prompt injection ("ignore instructions") | Server-side safety gates; allowlisted tools; evidence-only citations; prompts treat retrieved text as untrusted data | A sufficiently clever model may still produce a bad *style* of answer; it cannot gain new capabilities or fabricate URLs |
| User asks to book/cancel/pay/look up PNR | `detectUnsupportedAction` refuses before any model call; public how-to questions remain allowed | Heuristic regex can misfire on unusual phrasing; tests cover common English/Hindi/Hinglish/Kannada cases |
| Secret exfiltration via chat | Secret-request refusal; redaction of OTP/PIN/CVV/Aadhaar/PAN/card/IFSC; no raw content logging | Redaction is pattern-based and cannot catch every possible secret format |
| Session hijacking / enumeration | 32-byte capability token; HMAC-SHA256 at rest; constant-time compare; invalid/foreign sessions return 404; 7-day sliding expiry | Token lives in `localStorage`; an XSS bug in the client would expose it |
| Admin takeover | No admin routes without `ADMIN_TOKEN`; bearer token; constant-time compare; stricter rate limit; no admin UI | Token is a static shared secret with no rotation UI |
| SSRF during ingestion | Domain allowlist; hostname-only (no IP literals); credentials rejected; DNS resolution rejects private/loopback/link-local; every redirect re-validated | DNS rebinding between validation and fetch remains a theoretical TOCTOU risk; Node `fetch` cannot pin the resolved IP here |
| Fetching malicious documents | 2 MB cap, 20 s timeout, 3 redirects, content-type aware parsing, robots.txt check, text normalization | PDF/HTML parsers are large attack surfaces; keep dependencies updated |
| Model/provider outage | Timeouts, bounded retries, safe fallback, `AgentRun` failure status | No circuit breaker across requests; each turn may still wait for its own timeout |
| Resource exhaustion | Body limit 64 KB, message 4000 chars, step/retrieval/time/token budgets, rate limiter | Rate limiter is in-memory per process; multi-instance deployment needs a shared store |
| Log leakage | Pino redaction of auth/cookies/session tokens/secrets/content/messages/tool results; raw content off by default | A future contributor could log an unredacted field; review log calls |
| Cross-site request abuse | Strict CORS allowlist; custom `X-Session-Token` header is not sent by simple cross-site forms; JSON-only bodies; no cookies | `localStorage` token is readable by same-origin JavaScript if XSS exists |
| Dependency compromise | Lockfile committed; small dependency surface; optional PDF parser isolated | No automated vulnerability scanning in this local build |
| Data retention overreach | TTL indexes on sessions/messages/feedback/agent runs/ingestion jobs; bounded summaries; no analytics | TTL deletion is asynchronous (MongoDB background task) |

## Authentication and authorization

### Session capability tokens

- Created with `crypto.randomBytes(32).toString('base64url')`.
- Returned once, only when a new session is created.
- Stored server-side as `HMAC-SHA256(token, SESSION_SECRET)`, hex encoded.
- Compared with `crypto.timingSafeEqual` after length check.
- Required in `X-Session-Token` for history, feedback, and continuing chat.
- A missing token on a protected route yields `401
  session_token_required`; an invalid/expired/foreign token yields `404
  not_found` to prevent enumeration.
- Sliding expiry: 7 days from the most recent turn. MongoDB TTL removes the
  session after expiry.
- `SESSION_SECRET` must be at least 16 characters; use a long random value.
  The default in development is explicitly insecure and should never be used
  outside local development.

### Admin endpoints

- Disabled entirely (`404`) unless `ADMIN_TOKEN` is set.
- `ADMIN_TOKEN` must be at least 24 characters when set.
- Requires `Authorization: Bearer <token>` and a constant-time comparison.
- Admin rate limit is one third of the public chat limit.
- No admin credentials enter the client bundle and there is no admin UI.
- Admin routes cannot accept arbitrary URLs; ingestion still uses the reviewed
  registry file and all SSRF checks.

## Input validation and transport

- Zod validates environment variables at startup; invalid config fails fast.
- Zod validates every request body, param, and query at the route boundary.
  Controllers consume only `req.validated`.
- JSON body limit is 64 KB; `strict: true` rejects non-object JSON.
- Malformed JSON → `400 invalid_json`; oversized body → `413
  payload_too_large`.
- CORS allows only origins listed in `CLIENT_ORIGIN` (comma-separated). No
  wildcard. Allowed headers are limited to content type, session token, request
  ID, and authorization.
- `helmet` sets security headers. **CSP is disabled** in this build because the
  server primarily serves JSON and the local Vite client has its own dev server.
  A production deployment that serves the static client should add a strict CSP.
- There is no HTTPS/TLS in this repository. Local traffic is plain HTTP. A
  production deployment must terminate TLS and set secure headers.

## Output safety

- Model decisions and final answers are schema-validated. Invalid shapes are
  rejected or downgraded.
- Citation IDs must exist in the per-turn evidence registry. Unknown IDs are
  dropped.
- Citation title, authority, and URL come from the stored Source record, never
  from model text.
- Any URL in the answer that is not an evidence source URL is replaced with
  "the official source linked below".
- Grounded/mixed answers without a valid citation are downgraded to abstention
  with an unverified note.
- A single verification pass checks claims; issues reduce confidence and can
  trigger one targeted retrieval retry, never an unbounded loop.
- Hidden reasoning, raw prompts, provider payloads, and chain-of-thought are not
  returned.

## Prompt-injection resistance

- The system prompt instructs the model to treat retrieved passages, source
  text, and user content as untrusted data, not instructions.
- Tool calls are allowlisted and arguments re-validated. The model cannot invoke
  shell commands, HTTP fetches, database queries, or arbitrary URLs.
- Retrieval can only search indexed chunks from active Sources.
- The safety gates run before the model, so a prompt cannot grant the assistant
  transaction capabilities.
- Evidence and citation validation are structural, not model-trust-based.
- Evaluation includes adversarial questions; results are a regression signal,
  not proof of immunity.

## Ingestion and SSRF

- Only the reviewed JSON registry can trigger ingestion. Public chat has no
  fetch tool and cannot supply a URL.
- URL checks: absolute `http`/`https`, no embedded credentials, no IP literal,
  hostname on the allowlist (or subdomain).
- DNS resolution rejects private, loopback, link-local, CGNAT, and reserved
  ranges before fetching.
- Redirects are followed manually (max 3) and re-validated at every hop.
- Fetch limits: 20 s timeout, 2 MB maximum, robots.txt respected where
  available.
- Content is parsed to text, normalized, hashed, and deduplicated. Raw content
  is stored in `documents.rawText` for traceability but is never served by the
  public API.
- Failures are stored as short summaries (`errorSummary`, max 400 chars) and
  logged without content.

## Logging

Pino redacts at minimum:

- `authorization`, `cookie`, `x-session-token`, `set-cookie`
- `*.apiKey`, `*.api_key`, `*.token`, `*.password`, `*.secret`
- `*.content`, `*.message`, `messages`, `toolResults`

`LOG_CHAT_CONTENT` exists as an operational toggle but raw chat logging is not
enabled by default and is not used by the request path. Health requests are
excluded from HTTP access logs. Errors return a generic message with a request
ID; internal details stay in server logs.

## Rate limiting and resource bounds

- Chat: `RATE_LIMIT_MAX_REQUESTS` per `RATE_LIMIT_WINDOW_MS` (default 30/min).
- Admin: one third of that.
- Body: 64 KB.
- Message: `MAX_MESSAGE_LENGTH` (default 4000).
- Agent: `AGENT_MAX_STEPS=6`, `AGENT_MAX_RETRIEVAL_CALLS=3`,
  `AGENT_MAX_RUNTIME_MS=25000`, `AGENT_MAX_CONTEXT_MESSAGES=12`,
  `AGENT_MAX_EVIDENCE_CHUNKS=12`.
- Model output: `LLM_MAX_OUTPUT_TOKENS=1200`.
- Tool arguments are bounded by their Zod schemas; search limits are clamped.
- Duplicate tool calls are rejected within a turn.

The limiter uses Express Rate Limit's default in-memory store. It is suitable
for one local process only.

## Secrets management

- Provider keys, `SESSION_SECRET`, `MONGODB_URI`, and `ADMIN_TOKEN` live only in
  `.env` (root or `server/.env`) or process environment.
- `.env` is git-ignored; `.env.example` contains placeholders only.
- Vite only exposes variables prefixed `VITE_`; no server secret uses that
  prefix, and the client never imports server configuration.
- Startup validation rejects `openai-compatible` providers without key, model,
  and base URL.
- Error responses never include provider bodies or environment values.
- Docker/CI secret handling is intentionally out of scope for this build.

## Known gaps (must be closed before any public deployment)

This build intentionally stops at local-only. Before exposing it publicly, add
at least:

1. TLS/HTTPS and HSTS at a reverse proxy.
2. A strict Content Security Policy and other production headers.
3. A shared rate-limit store and per-user quotas.
4. Admin token rotation, audit logging, and network restriction.
5. Persistent, monitored log storage with retention policy.
6. Dependency and container/image scanning, plus a patched PDF parser or
   sandboxed parsing.
7. A real source-review workflow with periodic re-verification and rollback.
8. CSRF review if cookies are introduced; currently no cookies are used.
9. A privacy/legal review for the intended jurisdiction and user population.
10. Monitoring, alerting, backups, and disaster recovery.

These are documented as gaps on purpose; they are not secretly implemented.

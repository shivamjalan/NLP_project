# API Reference

Base URL: `http://localhost:5000/api/v1` in local development, proxied by Vite
at `/api/v1` from the client. All request and response bodies are JSON.

This is a local-only build. The API is designed for a single trusted developer
workstation and is not hardened for public internet exposure. See
[`SECURITY.md`](SECURITY.md).

## Conventions

### Authentication

Two different mechanisms are used:

| Scope | Mechanism |
| --- | --- |
| Conversation session | `X-Session-Token: <token>` header |
| Admin endpoints | `Authorization: Bearer <ADMIN_TOKEN>` |

A session token is generated when the first message creates a session and is
returned **only** in that first `POST /chat` response. The client stores it in
`localStorage` and sends it on later chat, history, and feedback requests.

Session access is capability-based. A session ID is not a secret and is not
sufficient. A missing, wrong, expired, or foreign token returns `404` so
session IDs cannot be enumerated (the client treats this as a clean restart).
The server stores only an HMAC-SHA256 hash of the token, never the token
itself.

Admin routes are completely invisible (`404`) unless `ADMIN_TOKEN` is set.
There is no admin UI.

### Content type and limits

- `Content-Type: application/json` is required for POST bodies.
- JSON body limit: **64 KB**.
- `message` limit: `MAX_MESSAGE_LENGTH`, default **4000 characters**.
- Feedback `reason` limit: **500 characters**.
- Chat rate limit: `RATE_LIMIT_MAX_REQUESTS` per `RATE_LIMIT_WINDOW_MS`
  (default 30 per 60 seconds). Admin limit is one third of that.

### Error format

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "requestId": "b4b1f54e-8b1f-4d1e-9c1a-6a8f0f0f0f0f",
    "details": [{ "path": "message", "message": "message must not be empty" }]
  }
}
```

`requestId` is also returned in the `X-Request-Id` response header. Internal
errors return a generic message; stack traces and provider details are never
returned to the client.

Common codes: `validation_error`, `not_found`, `session_token_required`,
`unauthorized`, `rate_limited`, `cors_blocked`, `invalid_json`,
`payload_too_large`, `internal_error`, `provider_timeout`,
`provider_unavailable`.

---

## GET `/health`

Public. Reports database connectivity, provider mode, and retrieval state.
Returns `200` when MongoDB responds to a ping and `503` with `status:
"degraded"` otherwise.

```json
{
  "status": "ok",
  "service": "bharatseva-ai",
  "version": "0.1.0",
  "environment": "development",
  "timestamp": "2026-11-01T10:00:00.000Z",
  "database": { "state": "connected", "connected": true },
  "agent": { "provider": "mock", "demoMode": true },
  "retrieval": {
    "provider": "local-vector",
    "semantic": true,
    "degraded": false,
    "index": null
  },
  "supportedLanguages": ["en", "hi", "kn"],
  "disclaimer": "BharatSeva AI is an independent information assistant and is not an official government website or service."
}
```

`retrieval.provider` is `local-vector`, `mongodb-text`, or `atlas-vector`.
`semantic` is true for `local-vector` and for a healthy `atlas-vector`.
`degraded` is true when Atlas semantic search was requested but failed and
keyword fallback is in use. The default local stack reports `local-vector`,
`semantic: true`, `degraded: false` with no Atlas index.

Health is excluded from HTTP access logs to avoid noise.

---

## POST `/chat`

Public endpoint, rate-limited. Creates a session on the first call and continues
one when `sessionId` is supplied.

### Request

```json
{
  "message": "What are the public rules for Tatkal booking?",
  "sessionId": null,
  "language": "auto"
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `message` | string | yes | Trimmed, 1–4000 chars by default |
| `sessionId` | string \| null | no | 24-char ObjectId. Omit or `null` for a new session |
| `language` | `"auto"` \| `"en"` \| `"hi"` \| `"kn"` | no | Default `auto`; detected from Unicode script |

When continuing a session, also send the capability header:

```http
X-Session-Token: <token from the first response>
```

### Status codes

| Code | Meaning |
| --- | --- |
| `201` | New session created; response includes `sessionToken` |
| `200` | Existing session continued |
| `400` | Validation failure |
| `404` | Session not found / invalid or missing token |
| `429` | Rate limited |

### Response

```json
{
  "sessionId": "6710f0f0f0f0f0f0f0f0f0f0",
  "messageId": "6710f0f0f0f0f0f0f0f0f0f1",
  "answer": "Demo mode (synthetic fixtures): ...",
  "language": "en",
  "citations": [
    {
      "sourceId": "6710f0f0f0f0f0f0f0f0f0f2",
      "title": "Demo fixture - Tatkal booking (synthetic, not official)",
      "authority": "Synthetic demo fixture (not an official source)",
      "url": "https://demo.invalid/irctc/tatkal-demo",
      "publishedAt": null,
      "lastVerifiedAt": "2026-11-01T10:00:00.000Z",
      "snippet": "SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY. ...",
      "trustLevel": "fixture",
      "sourceType": "fixture"
    }
  ],
  "needsClarification": false,
  "followUpQuestion": null,
  "confidence": "medium",
  "answerType": "grounded",
  "agentStatus": "completed",
  "demoMode": true,
  "disclaimer": "Independent information assistant; verify important details with the official source.",
  "retrieval": {
    "mode": "semantic+keyword",
    "degraded": false,
    "evidenceCount": 2,
    "store": "local-vector"
  },
  "sensitiveDataDetected": false,
  "safetyCategory": null,
  "sessionToken": "<only present for a new session>"
}
```

#### Field notes

- `answerType`: `grounded`, `general`, `mixed`, `clarification`, or
  `abstention`.
- `confidence` is computed by application code from evidence, citations, and
  verification, not self-reported by the model. Fixture-only answers are capped
  at `medium`; answers without citations are `low`.
- `agentStatus`: typically `completed`; may be `budget_exhausted`, `timeout`, or
  `failed` if a bounded limit was hit. The answer is still safe and labelled.
- `needsClarification` / `followUpQuestion` are set when the agent asks for a
  missing detail.
- `retrieval.mode`: `semantic+keyword`, `keyword_fallback`, or `keyword`.
  `retrieval.degraded` is true if semantic search was expected but unavailable.
- `citations` only include Source records that were actually retrieved as
  evidence. Citation IDs are validated server-side and stale/invalid IDs are
  dropped. URLs always come from the stored Source record.
- `safetyCategory`: `null`, `secret_request`, `unsupported_action`, or
  `out_of_scope`.
- `sensitiveDataDetected`: true when OTP/PIN/CVV/Aadhaar/PAN-like input was
  redacted before storage and model use. A safety note is appended to the
  answer.
- `sessionToken` is returned only for a brand-new session. Store it; it cannot
  be recovered later.
- `demoMode` is true when the mock provider is active. The UI labels such
  answers and source cards explicitly.

### Behavioural contract

- Safety gates run before any model call. Unsupported transactions, secret
  requests, and out-of-scope services receive a deterministic abstention and do
  not invoke the LLM.
- The model decides whether to retrieve; there is no fixed FAQ or intent
  whitelist.
- The agent loop enforces `AGENT_MAX_STEPS`, `AGENT_MAX_RETRIEVAL_CALLS`,
  `AGENT_MAX_RUNTIME_MS`, `AGENT_MAX_CONTEXT_MESSAGES`, and
  `AGENT_MAX_EVIDENCE_CHUNKS`.
- If evidence is insufficient, the response abstains instead of guessing.
- A timeout or budget exhaustion returns a safe fallback answer, not an
  unfinished chain of thought.

---

## GET `/sessions/:sessionId/messages`

Returns the stored conversation, oldest first. Requires
`X-Session-Token`. `limit` is fixed at 100 for the client (internally bounded
to 200).

### Request

```http
GET /api/v1/sessions/6710f0f0f0f0f0f0f0f0f0f0/messages
X-Session-Token: <token>
```

### Response

```json
{
  "sessionId": "6710f0f0f0f0f0f0f0f0f0f0",
  "messages": [
    {
      "messageId": "6710f0f0f0f0f0f0f0f0f0f3",
      "role": "user",
      "content": "What are the public rules for Tatkal booking?",
      "language": "en",
      "confidence": null,
      "answerType": null,
      "agentStatus": null,
      "demoMode": false,
      "createdAt": "2026-11-01T10:00:00.000Z",
      "citations": []
    },
    {
      "messageId": "6710f0f0f0f0f0f0f0f0f0f4",
      "role": "assistant",
      "content": "Demo mode (synthetic fixtures): ...",
      "language": "en",
      "confidence": "medium",
      "answerType": "grounded",
      "agentStatus": "completed",
      "demoMode": true,
      "createdAt": "2026-11-01T10:00:01.000Z",
      "citations": [
        {
          "sourceId": "6710f0f0f0f0f0f0f0f0f0f2",
          "title": "Demo fixture - Tatkal booking (synthetic, not official)",
          "authority": "Synthetic demo fixture (not an official source)",
          "url": "https://demo.invalid/irctc/tatkal-demo",
          "publishedAt": null,
          "lastVerifiedAt": "2026-11-01T10:00:00.000Z",
          "snippet": "",
          "trustLevel": "fixture",
          "sourceType": "fixture"
        }
      ]
    }
  ]
}
```

Expired sessions and invalid tokens return `404`. A missing token returns
`401 session_token_required`.

---

## POST `/feedback`

Records or replaces the feedback for one assistant message. The caller must
hold the session token for the conversation that owns the message. Feedback is
upserted per message.

### Request

```http
POST /api/v1/feedback
X-Session-Token: <token>
Content-Type: application/json

{
  "messageId": "6710f0f0f0f0f0f0f0f0f0f4",
  "rating": "helpful",
  "reason": ""
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `messageId` | ObjectId string | yes | Must be an assistant message |
| `rating` | `"helpful"` \| `"not_helpful"` | yes | |
| `reason` | string | no | Default empty, max 500 chars |

### Status codes

`201` created or replaced. `400` validation error. `401` missing token.
`404` message not found, is not an assistant message, belongs to another
session, or the token is invalid.

### Response

```json
{
  "feedbackId": "6710f0f0f0f0f0f0f0f0f0f5",
  "messageId": "6710f0f0f0f0f0f0f0f0f0f4",
  "rating": "helpful",
  "reason": "",
  "createdAt": "2026-11-01T10:01:00.000Z"
}
```

---

## GET `/sources/:sourceId`

Public metadata for one **active** Source. Inactive or unknown sources return
`404`. Only public fields are exposed; raw documents and chunks are never
served.

```json
{
  "sourceId": "6710f0f0f0f0f0f0f0f0f0f2",
  "title": "Demo fixture - Tatkal booking (synthetic, not official)",
  "authority": "Synthetic demo fixture (not an official source)",
  "url": "https://demo.invalid/irctc/tatkal-demo",
  "service": "irctc",
  "language": "en",
  "sourceType": "fixture",
  "publishedAt": null,
  "lastVerifiedAt": "2026-11-01T10:00:00.000Z",
  "trustLevel": "fixture",
  "updatedAt": "2026-11-01T10:00:00.000Z"
}
```

`trustLevel` is `official` for ingested registry sources and `fixture` for
synthetic demo data.

---

## Admin endpoints

These exist for local operator use. They are disabled (`404`) unless
`ADMIN_TOKEN` is configured and require a bearer token. There is no admin UI.

```http
Authorization: Bearer <ADMIN_TOKEN>
```

### POST `/admin/ingestion/run`

Validates and optionally ingests entries from the reviewed registry. URLs are
never accepted from this body. The public registry file is the source of truth.

```json
{
  "sourceIds": ["6710f0f0f0f0f0f0f0f0f0f6"],
  "dryRun": false
}
```

- `sourceIds` optional, max 50 database IDs. Omit to process the whole registry.
- `dryRun` defaults to `false`. A dry run validates the URL/allowlist and
  upserts Source metadata without fetching.

Returns `202` with:

```json
{
  "allowedDomains": ["irctc.co.in", "irctc.com", "indianrailways.gov.in", "indianrail.gov.in"],
  "total": 3,
  "results": [
    { "status": "validated", "sourceId": "6710...", "url": "https://www.indianrail.gov.in/", "chunkCount": 0 },
    { "status": "skipped", "url": "https://contents.irctc.co.in/en/faq.html", "reason": "inactive_registry_entry" }
  ]
}
```

Per-source statuses: `completed`, `validated` (dry run), `skipped`
(`inactive_registry_entry`, `unchanged_content`), or `failed`.

Ingestion fetches sequentially with a one-second pause, applies SSRF checks,
deduplicates by content hash, supersedes old chunks, and records an
`IngestionJob`. Failures are summarized without leaking raw content.

### GET `/admin/ingestion/jobs/:jobId`

Returns the redacted ingestion job record: status, chunk count, timestamps,
skip reason, and a short error summary. Jobs expire after 90 days.

### GET `/admin/sources`

Lists up to 200 sources, newest updated first. Optional query:

- `service=irctc`
- `active=true` or `active=false`

```json
{
  "sources": [
    {
      "sourceId": "6710...",
      "title": "Indian Railways - Passenger Reservation Enquiry (official landing page)",
      "authority": "Indian Railways",
      "url": "https://www.indianrail.gov.in/",
      "service": "irctc",
      "language": "en",
      "sourceType": "official_page",
      "trustLevel": "official",
      "active": true,
      "publishedAt": null,
      "lastVerifiedAt": "2026-11-01T00:00:00.000Z",
      "updatedAt": "2026-11-01T00:00:00.000Z"
    }
  ]
}
```

---

## CORS

Only origins listed in `CLIENT_ORIGIN` (comma-separated) are allowed. Requests
without an `Origin` header (curl, server-to-server) are accepted. Allowed
headers: `content-type`, `x-session-token`, `x-request-id`, `authorization`.
Methods: `GET`, `POST`, `OPTIONS`. A disallowed origin receives `403
cors_blocked`.

## Versioning

The pilot uses a single versioned prefix, `/api/v1`. There is no compatibility
guarantee across breaking changes; this is a local reference implementation.

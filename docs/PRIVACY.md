# Privacy

BharatSeva AI is an independent local-only pilot. This document describes what
the application collects, why, where it goes, how long it is kept, and what it
does not do.

It is a technical description, not legal advice. A real deployment would need a
jurisdiction-specific privacy review, a lawful basis, user notices, and a data
protection contact.

## Summary

- No account, email address, phone number, or password is required.
- No analytics, advertising, fingerprinting, or third-party tracking scripts.
- Chat sessions use a random capability token stored in the browser; no cookie
  is set.
- Messages are stored server-side, redacted for common secrets, and expire
  automatically.
- Raw chat content is not logged by default.
- In demo mode, no data leaves the machine. In real-provider mode, message text
  and retrieved public passages are sent to the configured LLM/embedding
  endpoint.

## What is stored

| Data | Collection | Contents | Retention |
| --- | --- | --- | --- |
| Session | `sessions` | HMAC hash of capability token, language, optional short summary, expiry | 7 days sliding; TTL deletion |
| Messages | `messages` | Redacted user text, assistant answer, citation source IDs, confidence, language, answer type, demo flag | 30 days; TTL deletion |
| Feedback | `feedbacks` | Rating, optional redacted reason, linked message/session ID | 90 days; TTL deletion |
| Agent telemetry | `agentruns` | Step/tool/retrieval counts, latency, token usage, status, stop reason, model name, safety category | 90 days; TTL deletion |
| Ingestion jobs | `ingestionjobs` | Source ID/URL, status, chunk count, redacted error summary | 90 days; TTL deletion |
| Sources/documents/chunks | `sources`, `documents`, `chunks` | Public official content and metadata; no user data | Until replaced or removed by operator |

The browser stores only:

```json
{
  "sessionId": "...",
  "sessionToken": "...",
  "createdAt": "..."
}
```

under `localStorage["bharatseva.session.v1"]`. Chat messages are not kept in
localStorage; they are fetched from the server with the token. Clearing
localStorage loses access to the conversation but does not immediately delete
server-side records.

## Why it is stored

- **Session and messages:** to provide multi-turn conversation, history,
  clarification context, feedback association, and debugging of answer quality.
- **Feedback:** to measure whether answers are helpful. A reason field is
  optional and limited to 500 characters.
- **Agent telemetry:** to audit bounded-loop behaviour, budget exhaustion,
  provider errors, and safety refusals without storing hidden reasoning.
- **Ingestion jobs:** to audit which reviewed public sources were fetched and
  whether ingestion succeeded.

No data is used for advertising or profiling. The local build has no analytics
pipeline and no user tracking beyond the session itself.

## Sensitive data handling

Before storage and before any model call, the server detects and redacts:

- Aadhaar-like 12-digit numbers
- PAN-like identifiers
- Card-like 13–19 digit sequences
- OTP values near "OTP" / "one-time password"
- UPI/ATM PINs and generic PINs
- Passwords
- CVV values
- IFSC codes

Redaction replaces the matched value with
`[redacted:<type>:<short hash>]`. The short hash is only for correlating
repeated redactions; it is not reversible and is not a secret store.

The same redaction is applied to feedback reasons. The response sets
`sensitiveDataDetected: true` and appends a safety note asking the user never to
share such values.

**Limitations:** pattern matching cannot catch every possible secret, names,
addresses, health information, or free-form personal data. Users should not
paste personal records into the chat. The assistant explicitly asks users not
to share OTPs, PINs, passwords, Aadhaar, PAN, or bank details, and it refuses
requests to handle them.

## Logging

- Pino logs request metadata (method, path, status, request ID, latency) and
  redacted error details.
- Redacted paths include authorization, cookies, session tokens, API keys,
  passwords, secrets, message content, and tool results.
- Raw chat content is not logged by default. `LOG_CHAT_CONTENT` is reserved and
  not used by the request path.
- Health checks are excluded from HTTP access logs.
- Log retention is controlled by the operator's terminal/log sink. The
  application does not ship logs anywhere.

## Third-party data flows

### Demo mode (`LLM_PROVIDER=mock`)

Everything stays local. The mock LLM runs in the Node process. With the default
`EMBEDDING_PROVIDER=local`, the multilingual embedding model runs in-process
too; the only network access is the one-time model download from Hugging Face
into `data/models`. No user data is sent to an AI provider. MongoDB receives the
stored records, either from the bundled local database (`data/local-db`) or from
Atlas if you configure it.

### Real mode (`openai-compatible` LLM)

The server sends the following to the configured provider endpoint:

- The current user message (after redaction)
- A bounded window of recent conversation messages (redacted)
- An extractive session summary, if one exists
- Retrieved public source passages and their metadata
- Tool definitions and the model's own prior tool results

The provider's handling of that data is governed by the provider's terms and
your agreement with them. This project does not send data to any provider by
default, does not train models, and does not control provider retention. Choose
a provider and endpoint that meet your privacy requirements. Provider keys and
base URLs stay server-side.

With the default local embedding provider, embeddings run in-process and no
query text is sent to an embedding API. If you explicitly switch to
`EMBEDDING_PROVIDER=openai-compatible`, public source text is sent during
ingestion and query text is sent at chat time.

### MongoDB

Session/message/feedback/telemetry data is stored in the MongoDB database named
by `MONGODB_DB`, on the cluster in `MONGODB_URI`. If that is Atlas, MongoDB's
own security and region settings apply. In tests and e2e, an ephemeral
in-memory MongoDB is used and discarded.

### No other sharing

There is no analytics vendor, ad network, CDN, error-reporting SaaS, or social
embed in this build. Source URLs are official public pages; clicking a citation
navigates the browser to that site under its own privacy policy. Demo fixture
URLs use `.invalid` and are rendered as non-clickable cards.

## Cookies and local storage

- No HTTP cookies are set by the API.
- Session state uses one localStorage key, readable by same-origin JavaScript.
  This is a capability token; treat it like a password. It is protected by the
  app's XSS posture, not by `HttpOnly`.
- Clearing site data removes the local copy. The server copy remains until its
  TTL expires or an operator deletes it.
- CORS is restricted to configured client origins. There is no third-party
  script allowed by this build.

## Retention and deletion

Automatic retention uses MongoDB TTL indexes:

| Record | TTL |
| --- | --- |
| Session | 7 days after last activity (sliding) |
| Message | 30 days after creation |
| Feedback | 90 days |
| Agent run | 90 days |
| Ingestion job | 90 days |

TTL deletion is asynchronous; MongoDB's background task usually removes expired
documents within about a minute, but this is not a hard real-time guarantee.

There is no user-facing "delete my data" button in this pilot. To delete a
session immediately, an operator can remove the session, its messages,
feedback, and agent runs by `sessionId`/`_id` using MongoDB tooling. Since this
is a local-only build, the operator is the developer running it.

## Children and sensitive categories

The service is a general public-information assistant, not directed at
children. It does not intentionally collect health, financial, biometric, or
precise location data, and it refuses private booking/account/refund lookups.
Users must not submit such data; redaction is a safety net, not a guarantee.

## User-facing notice

The UI shows a persistent banner:

> **Not a government service.** BharatSeva AI is an independent information
> assistant and is not an official government website or service. It explains
> public information and links to official sources; it cannot book tickets,
> take payments, log in, or check personal booking, refund or account status.

Demo mode adds a second notice that answers and sources are synthetic fixtures,
not official guidance, and that a configured deployment would use verified
official sources.

## Changes

If data flows, retention, or providers change, update this document and
`IMPLEMENTATION_STATUS.md` in the same change. The master specification requires
documentation to stay aligned with implementation.

# Architecture

BharatSeva AI is a single-page React client and a single Node.js/Express
backend. MongoDB is the only data store. There is no second backend, no
TypeScript, no Python service, and no client-side LLM or database access.

This is a **local-only reference build**. There is no Docker, CI, reverse proxy,
or deployment automation. See the amendment at the end of the master
specification.

## Design principles

1. **Model-led, not FAQ-led.** The model chooses whether to answer, clarify, or
   call a retrieval tool. There is no intent whitelist and no fixed question
   bank. The tool surface is allowlisted; the question space is not.
2. **Evidence before confidence.** A grounded answer must cite evidence gathered
   during the same turn. Evidence IDs are minted server-side and validated.
3. **URLs come from data, not generation.** The only URL that can appear in a
   citation is the `canonicalUrl` of a stored, active `Source` record. Model-
   generated URLs are stripped.
4. **Safety before the model.** Unsupported transactions, private-record
   lookups, secret requests, and out-of-scope services are refused in backend
   code before any provider call.
5. **Bounded everything.** Steps, retrieval calls, runtime, context messages,
   evidence chunks, output length, request body size, and rate limits are all
   bounded.
6. **Honest degradation.** If a semantic vector store is unavailable or
   degraded, retrieval reports it and uses lexical search. If evidence is
   missing, the answer abstains. If the model fails, the answer says so; it does
   not invent one.
7. **Demo mode is visibly synthetic.** Mock answers and fixture sources are
   labelled in both API output and UI. `.invalid` fixture URLs are intentionally
   non-clickable.

## Component map

```text
client/
  src/api/client.js             fetch wrapper, session token header
  src/hooks/useChat.js          session persistence, send/retry/history
  src/hooks/useHealth.js        provider/retrieval status
  src/components/               header, banner, messages, sources, feedback
  src/pages/ChatPage.jsx        composition and layout

server/src/
  app.js                        helmet, CORS, JSON limit, routes, errors
  server.js                     connect DB, listen, graceful shutdown
  routes/                       route definitions and per-route middleware
  controllers/                  HTTP -> service mapping
  middleware/                   validation, auth, rate limits, request IDs
  services/
    safety.service.js           backend safety gates
    chat.service.js             session, redaction, orchestration, response
    agentOrchestrator.service.js bounded tool loop and budgets
    evidence.service.js         per-turn evidence registry
    evidenceSynthesis.service.js final answer + one verification pass
    citation.service.js         citation assembly and URL/citation audit
    confidence.service.js       app-computed display confidence
    retrieval.service.js        hybrid search + RRF + source filtering
    ingestion.service.js        registry fetch/parse/chunk/embed/store
    conversationMemory.service.js bounded context + extractive summary
    session.service.js          capability-token sessions
    feedback.service.js         per-message feedback
    seed.service.js             synthetic fixtures
  agentTools/                   five allowlisted tools
  adapters/
    llm/                        mock and openai-compatible providers
    embeddings/                 local multilingual, mock, and openai-compatible
    vectorStore/                local-vector, Atlas vector, and MongoDB text
    sourceFetcher/              SSRF-guarded HTTP/PDF fetching
  models/                       Mongoose schemas and indexes
  prompts/                      server-only model instructions
  config/                       Zod env validation, DB, source policy
  utils/                        redaction, language, text, crypto, logging
```

## Request flow

```text
Browser
  │  POST /api/v1/chat {message, sessionId?, language?}
  ▼
Express middleware
  │  request ID, Pino HTTP log, helmet, CORS, 64 KB JSON limit, rate limit
  ▼
Zod validation
  │  body/params/query; controllers never read raw input
  ▼
chat.service
  │  authorize session or create one (capability token)
  │  resolve language (explicit or Unicode script)
  │  detect + redact sensitive values
  │  persist redacted user message
  │  update sliding session expiry
  │  build bounded conversation context
  ▼
agentOrchestrator
  │  evaluate safety gates (may return before any LLM call)
  │  bounded loop:
  │    model.planTurn / model.continueTurn
  │    respond | ask_clarification | call_tools
  │    allowlist + argument validation + duplicate detection
  │    retrieval budget enforcement
  │  final synthesis from evidence registry
  │  citation assembly + URL audit
  │  one bounded verification pass (+ at most one targeted retry)
  │  app-computed confidence
  │  persist assistant message + AgentRun telemetry
  ▼
response
  │  answer, citations, confidence, answerType, retrieval state,
  │  demo flag, safety category, redaction flag, new session token
  ▼
React client
  │  render answer, source cards, disclaimer, feedback controls
  │  store session token + id in localStorage on first turn
```

## Safety gates

`evaluateSafety()` runs before `getLLMProvider()` is used. It returns a
deterministic answer for:

| Category | Trigger | Result |
| --- | --- | --- |
| `secret_request` | User asks to send/enter an OTP, PIN, password, CVV, etc. | Refusal + "never share" guidance |
| `unsupported_action` | Booking, cancellation, payment, refund/PNR/account lookup, login, form submission, or a request to act on `my` record | Capability refusal |
| `out_of_scope` | Non-IRCTC services (EPFO, passport, Parivahan, etc.) with no IRCTC context | Honest "no indexed sources" abstention |

Public how-to questions are allowed: "How do I check PNR status?" is public
information, while "check my PNR status" is a private-record action. Hinglish
and Indic equivalents (`kaise`, `कैसे`, `ಹೇಗೆ`) are recognised.

Sensitive values (OTP, PIN, CVV, Aadhaar, PAN, account/card-like numbers) are
redacted before the user message is stored and before the model sees it. A
safety note is appended to the answer when redaction occurred.

## Agent loop

The orchestrator receives bounded context and a policy:

```js
{
  maxSteps: env.AGENT_MAX_STEPS,                 // default 6
  maxRetrievalCalls: env.AGENT_MAX_RETRIEVAL_CALLS, // default 3
  maxRuntimeMs: env.AGENT_MAX_RUNTIME_MS,          // default 25s
  maxEvidenceChunks: env.AGENT_MAX_EVIDENCE_CHUNKS,// default 12
  maxAnswerChars: 9000,
}
```

Each iteration asks the model for a validated decision:

- `respond` — direct text, only accepted without evidence; a grounded answer
  must be produced through synthesis.
- `ask_clarification` — returns a question and a low-confidence clarification.
- `call_tools` — one or more allowlisted tool calls.

Enforcement:

- Unknown tools are rejected without execution.
- Tool arguments are re-validated with Zod even when the provider already did.
- Identical `name + arguments` calls are rejected as duplicates.
- Retrieval tools consume the retrieval budget; exhaustion sets
  `agentStatus = "budget_exhausted"` and the model must answer with existing
  evidence.
- Wall-clock checks run before every step.
- Step exhaustion sets `budget_exhausted` rather than looping forever.
- Provider errors produce a safe fallback and an `AgentRun` failure status.

No hidden reasoning, chain-of-thought, or raw prompts are returned to the
client.

## Tools

The model may call exactly five tools:

| Tool | Purpose | Retrieval budget |
| --- | --- | --- |
| `searchKnowledgeBase` | Hybrid semantic + keyword search over active chunks | yes |
| `keywordSearch` | Explicit lexical search for names, codes, notifications | yes |
| `fetchSourcePassages` | Fetch more passages from an already-retrieved source | yes |
| `compareEvidence` | Compare passages already in the evidence registry | no |
| `askClarification` | Ask one targeted question | no |

Tool results are returned to the model as structured JSON. They never include
raw database internals. Each retrieved chunk is registered with an
`evidenceId` such as `ev_3`; only these IDs can be cited.

## Retrieval

`hybridSearch()`:

1. Optionally embeds the query and asks the vector store for semantic results.
   `local-vector` ranks stored embeddings in-process with cosine similarity;
   `atlas-vector` uses Atlas when configured and available.
2. Runs `$text` keyword search in parallel (always).
3. Merges with reciprocal-rank fusion (RRF, `k = 60`).
4. Filters chunks against active `Source` records.
5. In demo mode (`LLM_PROVIDER=mock`), fixture sources are included; in real
   mode they are excluded.
6. If a language filter would produce fewer than two results, retries without
   the language filter and sets `languageRelaxed: true`.
7. Returns `{items, meta: {semanticUsed, degraded, languageRelaxed, store,
   count}}`.

The MongoDB text index is created with `default_language: "none"` and
`language_override: "textLanguage"` so Hindi and Kannada chunks are not rejected
by MongoDB's unsupported-language check. Local semantic search loads at most
5,000 candidate chunks, filters incompatible embedding dimensions, and ranks
with cosine similarity. Atlas vector search uses a fixed aggregation pipeline;
user input is only a query vector and validated filter values, never a pipeline
stage.

### Local vector search

`local-vector` is the default and needs no Atlas account. Chunk embeddings are
stored in MongoDB and ranked in-process. This is appropriate for the pilot's
small reviewed corpus; it is not a replacement for a distributed vector index at
large scale.

### Atlas fallback

`AtlasVectorStore` catches `$vectorSearch` failures (missing index, unsupported
tier, dimension mismatch) and returns no semantic results while marking itself
degraded. `hybridSearch()` then relies on `$text`, and `GET /health` plus
`POST /chat` expose the degradation. This is deliberate: the app does not
pretend semantic search worked.

### Language handling

- Script heuristic: any Devanagari → `hi`; any Kannada → `kn`; otherwise `en`.
- Explicit `language` in the request overrides detection.
- The model is instructed to answer in the resolved language.
- Sources are often English-only; language relaxation avoids empty results.
- The default local embedding model is multilingual
  (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`), so Kannada and Hindi queries
  can match English evidence semantically. On the synthetic fixture evaluation,
  Kannada citation coverage improved from 20% (hash embeddings) to 80%.
  The fixture set is still synthetic and is not a real-world accuracy claim.

## Evidence, citations, and verification

- `EvidenceRegistry` assigns IDs only to chunks returned by tools in the
  current turn, deduplicated by chunk ID.
- `buildCitations()` maps model-selected IDs to stored Sources. Unknown IDs are
  dropped. Title, authority, and URL always come from MongoDB, not from the
  model. Maximum six citations, one per source.
- `auditAnswerAgainstEvidence()` checks for URLs not present in evidence and
  for grounded/mixed answers without a valid citation. Unknown URLs are
  replaced with "the official source linked below".
- A single verification call checks whether claims are supported by evidence.
  If it reports unsupported claims and budget remains, the orchestrator performs
  at most one targeted retrieval and one re-synthesis. This is bounded; it
  cannot become an unbounded self-correction loop.
- Confidence is computed by `computeConfidence()` from evidence count, source
  authority, freshness, distinct sources, lexical coverage, citation count, and
  verification verdict. Fixture-only evidence is capped at `medium`; no
  citation caps at `low`.

## Conversation memory

- The immediate context window is the last `AGENT_MAX_CONTEXT_MESSAGES`
  messages (default 12).
- When a session exceeds twice that window, an extractive summary of older
  turns is stored on the Session. Summaries are context only and are never
  treated as evidence for policy claims.
- Session expiry slides forward on each turn (7 days). Messages expire after 30
  days via TTL indexes.

## Data model (MongoDB collections)

| Collection | Purpose | Key indexes |
| --- | --- | --- |
| `sessions` | Session capability hash, language, summary, expiry | TTL on `expiresAt`, unique `sessionTokenHash` |
| `messages` | Redacted user/assistant turns, citations, confidence | `sessionId + createdAt`, TTL on `expiresAt` |
| `sources` | Reviewed source metadata and trust level | unique `canonicalUrl` |
| `documents` | Fetched raw text, content hash, parser version | `sourceId + contentHash` |
| `chunks` | Chunk text, language, embedding, active flag | text index, source/document indexes, Atlas vector index |
| `agentruns` | Bounded-loop telemetry, usage, stop reason; 90-day TTL | `sessionId`, `status`, `createdAt`, `expiresAt` |
| `feedbacks` | Per-message rating and optional redacted reason; 90-day TTL | unique `messageId`, `expiresAt` |
| `ingestionjobs` | Ingestion status and redacted error summary | `sourceId`, `status`, TTL |

Index definitions live in `server/src/models/`. `Chunk.syncIndexes()` runs
during seeding; ingestion uses the same collection.

## Ingestion pipeline

```text
registry JSON (reviewed by a human)
  → schema validation (Zod)
  → URL allowlist + IP-literal/credential checks
  → SSRF check: resolve DNS, reject private/loopback/link-local
  → fetch with timeout + size cap + redirect re-validation
  → parse HTML/PDF to text
  → normalize + hash
  → deduplicate unchanged content
  → chunk (paragraph/sentence aware, size bounded)
  → embed in batches
  → supersede old document/chunks
  → insert new document + chunks
  → record IngestionJob
```

Notable constraints:

- Public chat users cannot supply a URL, and there is no web-search tool.
- Only approved official domains are accepted:
  `irctc.co.in`, `irctc.com`, `indianrailways.gov.in`, `indianrail.gov.in`
  (subdomains included).
- Inactive registry entries are skipped, not fetched.
- Ingestion is sequential with a one-second pause between sources.
- Failures store a short, redacted summary; raw content is not logged.
- `--dry-run` validates registry entries without fetching or writing chunks.

## LLM and embedding adapters

### `mock`

Deterministic, local, no paid keys. It implements the same tool-calling
interface as the real provider: it can ask for retrieval, request clarification,
or synthesise a labelled answer from evidence. It refuses/abstains when evidence
is missing. Greeting and closing shortcuts exist for demos, and very short
ambiguous topics trigger a clarification. Mock answers begin with an explicit
demo/synthetic label. It is intended for tests and demonstrations, not as a
claim of production model behaviour.

### `openai-compatible`

Uses a configurable base URL, model, API key, temperature, and output-token
limit. Supports chat-completions tool calling. Requests have timeouts and
bounded retries; provider error bodies are not echoed to the client. The adapter
is optional and validated at startup: missing key/model/base URL fails fast.

### Local embeddings (default)

`LocalEmbeddingProvider` runs a quantized multilingual sentence-transformer
(`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, 384 dimensions) through
transformers.js. The model is downloaded once into `data/models` and then runs
offline. No embedding API key is required. Model loading is lazy, so demo and
test runs that use `EMBEDDING_PROVIDER=mock` never download or load it.

### `mock` embeddings

Hashed bag-of-words vectors (384 dimensions by default, matching the local
model). They support the pipeline shape and deterministic tests but are **not**
semantically meaningful. Use `mock` only for tests/demos.

### `openai-compatible` embeddings

Optional. Uses a configurable base URL, model, API key, and dimensions. When
switching embedding provider, model, or dimensions, rebuild all chunks and
recreate any vector index if the dimension changed.

## Failure behaviour

| Failure | Behaviour |
| --- | --- |
| MongoDB unavailable at startup | Process exits with a clear error |
| MongoDB ping fails at runtime | `/health` returns 503 `degraded` |
| Atlas vector index missing | Fallback to `$text`; `degraded: true` |
| Local embedding model unavailable | Retrieval degrades to `$text`; `/chat` reports it |
| Local vector candidate cap reached | Warning logged; best available semantic results returned |
| LLM timeout/provider error | Safe fallback answer; `AgentRun` status `timeout`/`failed` |
| Invalid model decision | Loop stops; safe synthesis/fallback path |
| No evidence | Abstention; no invented rules or URLs |
| Invalid citation IDs | Dropped; grounded answer downgraded to abstention if none remain |
| Invented URL in model text | Replaced with a pointer to the official source link |
| Verification issues | Citation/confidence penalties; at most one targeted retry |
| Budget exhausted | `agentStatus: budget_exhausted`, answer still bounded/safe |

## Why there is no fixed FAQ

A fixed FAQ or intent classifier would fail the core requirement: unseen,
open-ended questions in three languages. The model must be able to decide that
it needs a different query, more passages, or a clarification. The safety and
capability limits are enforced in code, not in the prompt, so a model cannot
talk its way past them.

## Test architecture

- **Unit tests:** env validation, validators, language, redaction/safety,
  chunking, citations, confidence, URL safety.
- **Integration tests (Supertest + real Express app):** API contracts,
  sessions, safety gates, privacy/redaction, agent budgets, provider failure,
  retrieval fallback, ingestion dry run.
- **Client tests:** React Testing Library + jsdom, mocked fetch.
- **E2E:** Playwright boots an in-memory MongoDB, seeds fixtures, starts the
  real server and Vite client, and exercises the browser flow.
- **Evaluation:** 70 synthetic questions through the real chat service against
  in-memory MongoDB, with mock embeddings or keyless local multilingual
  embeddings (`--local-embeddings`).

`mongodb-memory-server` is used for tests and for the bundled persistent local
database (`npm run db`, `data/local-db`). It runs a real MongoDB binary, so
TTL/index/aggregation behaviour is close to a real deployment, but it does not
exercise Atlas-only features. The local `local-vector` store is exercised by
integration tests and the local-stack smoke run.

See [`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md) for verified vs
unverified pieces.

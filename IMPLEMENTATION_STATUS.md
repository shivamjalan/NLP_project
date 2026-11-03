# Implementation Status

Last updated: **2026-11-02** (local build, Windows workstation).

BharatSeva AI is implemented end to end in this repository as a local-only
pilot. This file separates what was actually executed and verified from what
remains unverified. It should be read alongside the master specification and
its amendment.

## At a glance

| Area | Status |
| --- | --- |
| React + Vite client (plain JS/JSX) | Implemented |
| Node + Express ESM server | Implemented |
| MongoDB/Mongoose models and indexes | Implemented; tested with in-memory MongoDB and a persistent local database |
| Bundled persistent local MongoDB | Implemented and verified (`npm run db`, `data/local-db`) |
| LLM-led agentic RAG with 5 allowlisted tools | Implemented; mock path verified end to end |
| Bounded agent loop and budgets | Implemented; integration-tested |
| Safety gates and secret redaction | Implemented; unit/integration/e2e-tested |
| Source ingestion, chunking, embeddings | Implemented; dry-run, live-run and unit/integration-tested |
| Keyless local multilingual embeddings | Implemented and verified; no embedding API key required |
| Hybrid retrieval with local vectors + `$text` fallback | Implemented; local-vector verified, Atlas not live-tested |
| Citation validation and URL allowlisting | Implemented; unit/integration/e2e/regression-tested |
| Demo mode without paid keys | Implemented and verified |
| Playwright e2e | **6 tests passing** |
| Server/client tests | **112 server + 7 client tests passing** |
| Evaluation harness | **70 questions, 0 errors, 0 fabricated URLs** |
| Lint / build | **Passing** |
| Live official-source ingestion | **2 active landing pages fetched and stored** |
| Atlas connection and `$vectorSearch` | **Not verified** (no cluster available) |
| Real LLM provider calls | **Not verified** (no key configured in this environment) |
| Docker / CI / deployment | **Intentionally absent** (local-only scope) |

## What was run and observed

### Install

```bash
npm install --no-audit --no-fund
```

Completed; 574 packages. npm reported unapproved install scripts for
`mongodb-memory-server`, `esbuild`, `onnxruntime-node`, and `protobufjs`; runtime,
tests, builds, and local inference work anyway. `mongodb-memory-server`
downloaded and cached MongoDB 7.0.24.

### Lint

```bash
npm run lint
```

Passed with no warnings or errors.

### Automated tests

```bash
npm test
```

- Server: **112 tests in 11 files**, all passing.
  - Unit: env/safety/redaction, validators, language, text/chunking, citations,
    confidence, URL safety, mock provider, agent tools, local embedding provider.
  - Integration: API contracts, sessions/auth, privacy, agent budgets/provider
    failure, retrieval fallback, local-vector semantic retrieval, ingestion.
- Client: **7 tests**, all passing.
  - Chat send/render/citations/fixture badge/session storage
  - Feedback
  - Error + retry
  - Language selection propagation

Tests use `mongodb-memory-server`, not Atlas or the local development database.
The test environment forces mock providers, silent logs, and rate-limit bypass.
The local embedding provider is tested with an injected fake pipeline, so the
test suite never downloads the model.

### End-to-end

```bash
npx playwright install chromium
npm run test:e2e
```

**6 Playwright tests passing** against a real Express server and Vite client,
with an in-memory MongoDB seeded with fixtures:

1. Demo-mode, disclaimer, and starter prompts render.
2. Grounded answer with synthetic citation cards.
3. Helpful feedback recorded.
4. Transaction request refused, no sources shown.
5. Hindi answer when Hindi is selected.
6. Conversation survives reload and clears with New chat.

The e2e bootstrap is `e2e/start-server.js`; it seeds fixtures and starts the
real app on `E2E_SERVER_PORT` (default 5055). Vite is forced to
`127.0.0.1` because the default `localhost` binding on Windows resolved to IPv6
and made Playwright's `127.0.0.1` base URL unreachable.

### Build

```bash
npm run build
```

Passed. Vite produced `client/dist` (about 242 KB JS / 11 KB CSS before gzip;
75.8 KB / 3.05 KB gzip).

### Persistent local database and live ingestion

```bash
npm run db
npm run seed -- --reset
npm run ingest -- --dry-run
npm run ingest
```

Verified on 2026-11-02:

- `npm run db` starts a real MongoDB 7.0.24 binary on `127.0.0.1:27017` with an
  explicit `data/local-db` path. Data persisted across a stop/restart: 7
  fixture sources and 9 chunks were still present.
- `npm run seed -- --reset` seeded 7 synthetic sources (9 chunks) using the
  keyless local embedding model (384 dimensions).
- `npm run ingest -- --dry-run` validated 3 registry entries (2 active, 1
  inactive).
- `npm run ingest` fetched and stored both active public landing pages:
  `indianrail.gov.in` (1 chunk) and `indianrailways.gov.in` (6 chunks). This is
  a live-network run, not a fixture.
- `npm run dev:local -- --seed` was verified end to end: it started the local
  MongoDB, seeded fixtures, then launched Vite and the Express server. A
  Windows `spawn EINVAL` bug was found and fixed during this check.
- `GET /api/v1/health` and `POST /api/v1/chat` were exercised against the local
  stack. Health reported `retrieval.provider: local-vector`,
  `semantic: true`, `degraded: false`; chat returned a grounded answer with
  citations and `retrieval.mode: semantic+keyword`.

### Evaluation

```bash
npm run evaluate -- --memory --local-embeddings
```

Executed 70 questions with **0 errors**. Latest report
(`data/evaluation/report.md`, generated 2026-11-01T19:46Z):

- Refusal accuracy 100%; false refusals 0
- Clarification accuracy 100%
- Citation validity 100% across 41 cited answers
- Fabricated URLs 0
- Retrieval Recall@5 96.2%, MRR 0.942
- Adversarial abstention/clarification 20%
- Average latency 33 ms (warm model cache); P95 66 ms
- Kannada citation coverage 80% (up from 20% with hash embeddings)
- Hindi citation coverage 80%

These are **synthetic-fixture pipeline results**, not real IRCTC policy accuracy.
The Kannada improvement comes from multilingual embeddings on synthetic
fixtures; real-source Kannada coverage has not been measured. See
[`docs/EVALUATION.md`](docs/EVALUATION.md).

## Implemented components

### Client

- Chat page with persistent disclaimer and skip link.
- Header with language selector (`auto`/English/Hindi/Kannada), new-chat action,
  demo-mode badge, retrieval-degraded warning.
- Message bubbles with app-computed confidence, answer-type chips,
  clarification marker, demo badge, timestamps.
- Source cards: title, authority, verification date, trust badge, snippet.
  Fixture URLs are rendered as non-clickable URLs.
- Feedback controls: helpful / not helpful + optional reason.
- Session token + ID in `localStorage`; history reload; clean restart for
  401/404 sessions.
- Error banner with retry of the same text.
- Starter prompts and accessible composer with character counter.
- Health polling for demo/retrieval status.
- Responsive CSS and reduced-motion support.

### Server

- Express app with request IDs, Pino HTTP logs, helmet, strict CORS, 64 KB JSON
  limit, Zod validation, centralized error handling, 404 handler.
- Health route with DB ping, provider mode, retrieval state, languages.
- Chat route: create/continue session, redaction, history.
- Feedback route: session-scoped upsert.
- Source route: active source metadata only.
- Admin routes: disabled unless `ADMIN_TOKEN`; bearer auth, ingestion run, job
  status, source listing.
- Session capability tokens (32 bytes, HMAC-SHA256 at rest, constant-time
  compare, 404 for invalid/foreign, 7-day sliding expiry, TTL index).
- Conversation memory: bounded window + extractive summary.
- Safety gates: secret request, unsupported action, out-of-scope service.
- Sensitive-data detection/redaction in messages and feedback.
- Bounded orchestrator: step/retrieval/runtime/evidence budgets, duplicate call
  detection, allowlisted tools, structured decisions, safe fallback.
- Five tools: `searchKnowledgeBase`, `keywordSearch`, `fetchSourcePassages`,
  `compareEvidence`, `askClarification`.
- Evidence registry, final synthesis, one verification pass, at most one
  targeted retrieval retry.
- Citation assembly from stored Sources; URL audit; grounded-without-citation
  downgrade.
- App-computed confidence with fixture/no-citation caps.
- Hybrid retrieval with RRF, source filtering, language relaxation, keyless
  `local-vector` cosine ranking, Atlas adapter with textual fallback, and
  `degraded` reporting.
- Keyless local multilingual embedding provider (transformers.js,
  `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, 384d, lazy model load,
  dimension checks, offline after first download).
- Persistent local MongoDB launcher (`npm run db`) and one-command local stack
  (`npm run dev:local`), using an on-disk `data/local-db` path.
- Ingestion: registry validation, SSRF checks, fetch/parse/chunk/embed/dedupe,
  supersede old chunks, jobs.
- Seed service for synthetic fixtures.
- Models: Session, Message, Source, Document, Chunk, AgentRun, Feedback,
  IngestionJob, with idempotent model registration and indexes.
- Pino redaction for auth, cookies, session tokens, secrets, content, messages,
  tool results.

### Data and docs

- `data/source_registry/irctc.sources.json`: 3 reviewed entries (2 active, 1
  inactive legacy FAQ).
- `data/evaluation/sample-questions.json`: 70 questions across 7 categories.
- `data/local-db/`: persistent local MongoDB data (gitignored).
- `data/models/`: cached local multilingual embedding model (gitignored).
- `docs/`: architecture, API, security, privacy, evaluation, source policy.
- README, this status file, `opencode.md`.
- Master spec amended for local-only scope.

## Fixes made during verification

Testing found and fixed real defects, rather than only cosmetic issues:

1. Express 4 could hang on rejected async controllers. Every route now wraps
   handlers with `asyncHandler`.
2. The chunk text index used a MongoDB `language` override, so Hindi/Kannada
   inserts failed with “language override unsupported: hi”. The index now uses
   `default_language: "none"` and `language_override: "textLanguage"`.
3. Chunking dropped short documents; single-chunk documents are now retained.
4. Confidence could show `high` for fixture-only or no-citation answers; it is
   now capped at `medium` / `low` respectively.
5. The agent could echo a typed OTP/PIN in an abstention because it received raw
   text; it now receives the redacted text.
6. The PIN detector missed “my UPI PIN is 4321”; it now accepts `is`.
7. Kannada public questions were misclassified as unsupported actions; the
   action regex was tightened.
8. Mongoose `OverwriteModelError` appeared when test files ran together; all
   models are now idempotently registered.
9. Duplicate index warnings for session token hash and feedback message ID were
   removed.
10. Retrieval-budget exhaustion did not set `agentStatus`; it now reports
    `budget_exhausted`.
11. Playwright could not reach Vite on Windows because of `localhost`/IPv6
    binding; e2e now uses an explicit `127.0.0.1` host.
12. Public how-to questions such as “How does the refund process work after I
    cancel a ticket?” were falsely refused; the safety heuristic now separates
    public how-to from private actions, including Hinglish/Indic `kaise`.
13. Feedback reasons are now redacted too; feedback and agent-run records have
    90-day TTLs.
14. The root `evaluate` script did not forward `--memory` through npm; it now
    passes arguments through correctly.
15. `dev:local` spawned `npm.cmd` directly on Windows, which fails with
    `spawn EINVAL`; it now uses `ComSpec` and kills the full child tree on exit.
16. The default embedding dimension changed from 256 to 384 to match the local
    multilingual model; seed/ingest records model and dimension metadata so
    incompatible vectors are excluded from local semantic search.

## Not verified — explicit gaps

These are genuine gaps in this environment, not hidden claims:

1. **No MongoDB Atlas cluster was provided.** `MONGODB_URI` was run against the
   bundled persistent local MongoDB and `mongodb-memory-server`, not Atlas.
   Consequently:
   - Atlas `$vectorSearch` and the `chunk_vector_index` definition were not
     executed.
   - Atlas network/security/region behaviour is untested.
   - The default `local-vector` semantic path and the MongoDB text fallback were
     verified locally.
2. **No real LLM call was made in this environment.** A key was not configured
   here, so the `openai-compatible` adapter is unit-tested for request/response
   shape and failure paths but no live provider call was made. Non-determinism,
   real tool-calling quality, provider rate limits, and paid-tier behaviour are
   unverified. Local multilingual embeddings **were** run for real; no embedding
   key is required.
3. **The source corpus remains small.** Live ingestion was executed against the
   two active registry landing pages (1 + 6 chunks). Landing pages do not cover
   every policy. Add verified deep links before relying on answers; the app is
   designed to abstain when evidence is missing.
4. **The evaluation corpus is synthetic.** It measures pipeline behaviour, not
   real IRCTC policy accuracy. Kannada coverage improved from 20% to 80% with
   multilingual embeddings on fixtures, but real-source Kannada coverage has not
   been measured.
5. **Adversarial abstention is 20%.** Some adversarial questions are answered
   safely or refused without matching the narrow metric label. Hard safety and
   citation-integrity checks pass; this is diagnostic, not a pass mark.
6. **Rate limiting is in-memory and per-process.** Fine for one local process;
   not for multiple instances.
7. **No production hardening.** No HTTPS, no CSP, no deployment, no CI, no
   monitoring, no backups. This is intentional for the local-only scope and
   listed as a gap in `docs/SECURITY.md`.
8. **Admin API is not UI-tested in a browser.** It is covered by integration
   tests with `ADMIN_TOKEN`; no admin UI exists by design.
9. **No user-facing data deletion endpoint.** Server data expires by TTL; an
   operator can delete records manually. Documented in `docs/PRIVACY.md`.

## Deliberate deviations from the master specification

The user scoped this build to **local-only**. The master spec originally
included Docker, docker-compose, CI, and deployment. The spec has been amended
with a dated section. Summary:

- No Dockerfiles, compose file, or container/database services.
- No CI pipeline or deployment automation.
- The bundled local MongoDB (`npm run db`, `data/local-db`) is the default
  database; Atlas remains optional. Tests use in-memory MongoDB.
- Vector search defaults to the keyless in-process `local-vector` store. Atlas
  Vector Search is optional; `mongodb` text-only mode is also supported.
- Embeddings default to a keyless local multilingual model, not a paid API.
- Admin routes exist but have no UI.
- `docs/API.md` was added in addition to the files listed in the spec tree.
- Feedback and AgentRun received 90-day TTLs for data minimization.
- `scripts/evaluate.js` and the `evaluate` npm script were added beyond the
  required script list to make the evaluation harness runnable.
- The mock agent includes greeting/closing/clarification shortcuts for
  deterministic demos; it is not a fixed FAQ for real use and is clearly
  labelled.

Any minor directory-name differences from the spec tree are documented here
rather than silently ignored.

## Environment contract

Required at startup (Zod-validated; fail fast):

```dotenv
NODE_ENV=development
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/bharatseva_ai
MONGODB_DB=bharatseva_ai
SESSION_SECRET=<at least 16 chars; use random>
```

Local demo defaults:

```dotenv
LLM_PROVIDER=mock
EMBEDDING_PROVIDER=local
EMBEDDING_DIMENSIONS=384
VECTOR_STORE_PROVIDER=local-vector
```

Atlas is optional: set an Atlas `MONGODB_URI` and, for vector search,
`VECTOR_STORE_PROVIDER=atlas-vector` plus the matching index.

Agent and safety limits from the spec:

```dotenv
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=30
MAX_MESSAGE_LENGTH=4000
AGENT_MAX_STEPS=6
AGENT_MAX_RETRIEVAL_CALLS=3
AGENT_MAX_RUNTIME_MS=25000
AGENT_MAX_CONTEXT_MESSAGES=12
AGENT_MAX_EVIDENCE_CHUNKS=12
LLM_TEMPERATURE=0.7
LLM_MAX_OUTPUT_TOKENS=1200
```

Optional: `ADMIN_TOKEN` (min 24 chars), vector index name, embedding dimensions,
provider base URLs/models/keys, log level.

## Root scripts

| Script | Status |
| --- | --- |
| `dev` | Implemented (concurrently) |
| `dev:local` | Implemented; starts persistent local DB + `dev` |
| `db` | Implemented; persistent MongoDB in `data/local-db` |
| `dev:client` / `dev:server` | Implemented |
| `build` | Passing |
| `lint` | Passing |
| `test` | Passing |
| `test:server` / `test:client` | Passing |
| `test:e2e` | 6 passing (Chromium installed) |
| `seed` | Implemented; verified against the local persistent DB |
| `ingest` | Implemented with `--dry-run`; live run verified on 2 active landing pages |
| `evaluate` | 70 questions; memory + local embeddings verified; real DB verified |
| `start` | Implemented (`NODE_ENV=production` serves `client/dist` if built) |
| `format` | Prettier config present |

## Recommended next steps

1. Put your LLM provider key/model/base URL in `.env`, set
   `LLM_PROVIDER=openai-compatible`, then run an evaluation without `--memory`
   and manually review answers/tool calls.
2. Expand the official source registry with verified policy deep links, then
   re-run `npm run ingest -- --dry-run`, `npm run ingest`, and evaluation.
3. Optionally create an Atlas M0 cluster and vector index to verify the Atlas
   path; the default local stack does not need it.
4. Measure real-source Kannada/Hindi coverage; add reviewed Indic-language
   sources or language-aware evaluation data.
5. Before any public exposure, implement the production gaps listed in
   `docs/SECURITY.md` (TLS, CSP, shared rate limits, monitoring, backups).

## Definition-of-done assessment

Against the spec’s definition of done: the stack, models, demo workflow,
model-led agent, ingestion/retrieval/citation pipeline, budgets, safety,
privacy controls, tests, docs, local keyless embeddings, local semantic search,
persistent local database, and local run path are present. The pieces that
cannot be honestly marked done here are **live Atlas verification** and **real
LLM provider verification**, because no credentials/cluster were available in
this environment. Docker, CI, and deployment are intentionally out of scope by
user instruction and spec amendment. This file is the authoritative, honest
status.

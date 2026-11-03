# BharatSeva AI

BharatSeva AI is an independent, multilingual, LLM-led agentic RAG assistant for
public Indian public-service information. The implemented pilot covers **IRCTC
and Indian Railways public information** (booking rules, Tatkal, refunds, and
related procedures).

It is **not** an official government or IRCTC service. It does not book,
cancel, pay for, or look up tickets, PNRs, refunds, or accounts. Every response
carries a disclaimer, and every cited answer links only to Source records that
were ingested from the reviewed source registry.

> **This build is local-only.** There is no Docker, docker-compose, CI pipeline,
> or deployment configuration. See the amendment at the end of
> `BharatSeva_AI_OpenCode_Master_Specification.md`. The app runs on a developer
> workstation with either the bundled persistent local MongoDB
> (`npm run db`) or a MongoDB Atlas cluster. No embedding API key is required:
> the default embedding provider runs a multilingual model in-process.

## What it does

- Runs a bounded, model-led tool loop. The model decides whether to answer,
  clarify, or retrieve; there is no fixed FAQ and no intent whitelist.
- Supports English, Hindi, and Kannada. Language is auto-detected from Unicode
  script, or can be selected in the UI. The model is asked to reply in the
  chosen language.
- Retrieves from an approved source registry, merges semantic and keyword
  results, validates citations against retrieved evidence, and limits URLs to
  stored Source records.
- Enforces backend safety gates before any model call: no transactions, no
  private records, no secret requests, no out-of-scope services.
- Applies redaction for OTPs, PINs, CVV, Aadhaar, PAN, and similar secrets,
  both before persistence and before the model sees the message.
- Serves a React chat UI with source cards, confidence labels, clarification
  chips, feedback controls, session persistence, and explicit demo-mode
  labelling.
- Ships with a deterministic `mock` LLM and a keyless local multilingual
  embedding model, so the full stack runs without paid API keys. Mock LLM
  answers are labelled synthetic and never presented as official guidance.

## What it does not do

- It is not affiliated with, endorsed by, or operated by IRCTC, Indian
  Railways, or any government body.
- It does not provide legal, financial, or travel advice, and it does not
  guarantee that a source is current. Always check the official IRCTC website
  or app before acting.
- It does not fetch arbitrary URLs from chat, browse the live web, or accept a
  user-supplied source.
- It does not expose chain-of-thought or raw model prompts.
- It does not store raw chat content in logs.

## Stack

| Layer | Implementation |
| --- | --- |
| Client | React 19, Vite 6, plain JavaScript/JSX, CSS |
| Server | Node.js >= 20.11, Express 4, ES modules, Zod |
| Database | MongoDB with Mongoose 8 |
| Retrieval | In-process local vector search, MongoDB `$text`, or Atlas Vector Search |
| LLM / embeddings | LLM: `mock` / `openai-compatible`. Embeddings: keyless local multilingual model, `mock`, or `openai-compatible` |
| Validation | Zod at startup and at API boundaries |
| Logging | Pino with redaction |
| Tests | Vitest, Supertest, Testing Library, Playwright, mongodb-memory-server |

## Architecture

```text
┌──────────────────────────────┐
│ React + Vite client          │
│ chat, sources, feedback     │
│ session token in localStorage│
└──────────────┬───────────────┘
               │ /api/v1 (same-origin via Vite proxy)
┌──────────────▼───────────────┐
│ Express API                  │
│ helmet, CORS, rate limits    │
│ Zod validation, request IDs  │
│ session/admin auth           │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│ Backend safety gates         │
│ unsupported actions, secrets │
│ out-of-scope services        │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│ Bounded agent orchestrator   │
│ max steps / retrievals / time│
│ allowlisted tools only       │
│ verification + citations     │
└───────┬──────────────┬───────┘
        │              │
┌───────▼──────┐ ┌─────▼──────────────┐
│ LLM adapter  │ │ Retrieval service  │
│ mock /       │ │ hybrid search, RRF │
│ openai-compat│ │ local-vector /     │
│              │ │ Atlas / $text      │
└──────────────┘ └─────┬──────────────┘
                       │
              ┌────────▼────────┐
              │ MongoDB         │
              │ sessions, msgs, │
              │ sources, chunks │
              └─────────────────┘
```

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Repository layout

```text
.
├── client/                 React app, components, hooks, styles, tests
├── server/                 Express app, models, services, adapters, tests
│   └── src/
│       ├── adapters/       LLM, embeddings, vector store, source fetcher
│       ├── agentTools/     five allowlisted tools
│       ├── config/         env validation, database, source policy
│       ├── controllers/    thin HTTP handlers
│       ├── middleware/     auth, validation, limits, errors, request IDs
│       ├── models/         Mongoose schemas and indexes
│       ├── prompts/        model instructions (never exposed to the client)
│       ├── routes/         API route definitions
│       ├── services/       agent loop, retrieval, citations, safety, etc.
│       └── utils/          redaction, language, text, crypto, logging
├── e2e/                    Playwright spec and in-memory server bootstrap
├── scripts/                local-db, dev-local, seed, ingest, evaluate
├── data/
│   ├── source_registry/    reviewed official-source registry
│   ├── evaluation/         70-question synthetic evaluation dataset
│   ├── local-db/           persistent local MongoDB data (gitignored)
│   └── models/             cached local embedding model (gitignored)
├── docs/                   architecture, API, security, privacy, etc.
├── .env.example
├── playwright.config.js
└── BharatSeva_AI_OpenCode_Master_Specification.md
```

## Prerequisites

- Node.js **20.11 or newer** and npm 10+.
- MongoDB is supplied in two supported ways:
  - **Bundled local database (default):** `npm run db` starts a persistent
    MongoDB instance on `127.0.0.1:27017`, storing data in `data/local-db`.
    No separate MongoDB install, Atlas account, or Docker is needed.
  - **MongoDB Atlas (optional):** set `MONGODB_URI` to an Atlas SRV string.
- For real LLM mode: an OpenAI-compatible chat-completions endpoint and key.
  **No embedding key is needed** — the default embedding provider is local.
- Playwright Chromium for end-to-end tests:
  `npx playwright install chromium`.

## Installation

From the repository root:

```bash
npm install
```

The project uses npm workspaces (`client` and `server`). If npm warns that
install scripts for `mongodb-memory-server`, `esbuild`, or `onnxruntime-node`
were not approved, that is expected on modern npm; the packages still work. Run
`npm rebuild esbuild` only if Vite reports a missing binary.

## Environment setup

```bash
# PowerShell
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

Minimum required values (the defaults in `.env.example` already work for the
bundled local database):

```dotenv
NODE_ENV=development
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/bharatseva_ai
MONGODB_DB=bharatseva_ai
SESSION_SECRET=<long-random-string-at-least-16-chars>
```

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Keyless demo defaults:

```dotenv
LLM_PROVIDER=mock
EMBEDDING_PROVIDER=local
VECTOR_STORE_PROVIDER=local-vector
EMBEDDING_DIMENSIONS=384
```

The server validates the whole environment with Zod at startup and fails fast
with a readable error if a required value is missing or malformed. `.env` is
never read by the Vite client and must never be committed.

### Local MongoDB (default)

```bash
npm run db                 # start MongoDB on 127.0.0.1:27017
npm run db -- --reset      # delete data/local-db and start fresh
```

The local database is a real MongoDB 7 binary managed by
`mongodb-memory-server`, but with an explicit on-disk `data/local-db` path, so
data survives restarts. It is not a container and is not intended for
multi-user or production use. `npm run dev:local -- --seed` starts the database,
seeds the demo fixtures, and launches server + client in one command.

### MongoDB Atlas (optional)

1. Create a free M0 cluster at <https://cloud.mongodb.com>.
2. Create a database user with read/write access to `bharatseva_ai`.
3. Add your current IP address to the cluster access list.
4. Copy the SRV connection string into `MONGODB_URI`.
5. Start the app once so Mongoose can create collections and indexes.

### Atlas Vector Search (optional)

The default `local-vector` adapter needs no Atlas index. If you prefer Atlas
Vector Search, create an index named `chunk_vector_index` on the `chunks`
collection:

```json
{
  "name": "chunk_vector_index",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      { "type": "vector", "path": "embedding", "numDimensions": 384, "similarity": "cosine" },
      { "type": "filter", "path": "active" },
      { "type": "filter", "path": "service" },
      { "type": "filter", "path": "language" },
      { "type": "filter", "path": "sourceType" },
      { "type": "filter", "path": "sourceId" }
    ]
  }
}
```

Then set:

```dotenv
VECTOR_STORE_PROVIDER=atlas-vector
VECTOR_INDEX_NAME=chunk_vector_index
```

`numDimensions` must match `EMBEDDING_DIMENSIONS` (384 for the default local
multilingual model). If the index is missing or Atlas rejects the query, the
adapter logs a warning and degrades to `$text` instead of failing the
conversation. The API exposes this as `retrieval.degraded` and the UI shows a
warning.

## Run locally

One command (starts the bundled MongoDB, seeds idempotently, then starts the
server and client):

```bash
npm run dev:local -- --seed
```

Open <http://localhost:5173>. The header shows **Demo mode**, and every
assistant answer and source card is labelled as synthetic. Demo fixtures use
`.invalid` URLs on purpose: they are illustrative placeholders, not official
policy.

Or run the pieces separately:

```bash
npm run db                  # terminal 1: local MongoDB, port 27017
npm run seed -- --reset     # terminal 2: rebuild demo fixture vectors
npm run dev                 # terminal 3: server + client
```

Individual processes:

```bash
npm run dev:server   # http://localhost:5000
npm run dev:client   # http://localhost:5173
```

`npm run seed -- --reset` replaces the fixture chunks. The seed operation is
idempotent otherwise. The first `EMBEDDING_PROVIDER=local` run downloads the
multilingual model into `data/models` (one time, then offline).

## Configure a real LLM (no embedding key required)

Embeddings already run locally by default. To use your LLM key, set these
values in `.env` and restart the server:

```dotenv
LLM_PROVIDER=openai-compatible
LLM_API_KEY=<server-side key>
LLM_MODEL=<tool-capable model name>
LLM_BASE_URL=<provider base URL ending in /v1>
LLM_TEMPERATURE=0.7
LLM_MAX_OUTPUT_TOKENS=1200
```

Keep the keyless embedding defaults:

```dotenv
EMBEDDING_PROVIDER=local
EMBEDDING_DIMENSIONS=384
VECTOR_STORE_PROVIDER=local-vector
```

The key must support OpenAI-style `/chat/completions` with tool calling. All
provider calls happen server-side; no key or base URL is sent to the browser.

| Provider | `LLM_BASE_URL` | Example tool-capable model |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | a tool-capable model from its catalog |
| Ollama / vLLM | `http://127.0.0.1:11434/v1` | a local tool-capable model |

Model names and availability change; check the provider's current catalog. Keep
the key in `.env` only; never put it in client code or commit it.

If you later add an embedding provider, set `EMBEDDING_PROVIDER` and its key,
then re-run `npm run seed -- --reset` and `npm run ingest` to rebuild vectors.
Changing embedding model or dimensions invalidates stored vectors.

Provider requests have timeouts and bounded retries. If the provider fails, the
agent returns a safe fallback and records the failure in `AgentRun`; it does not
invent an answer.

## Add a verified official source

1. Add an entry to `data/source_registry/irctc.sources.json`. Only use URLs you
   have verified by hand and only from an approved domain. See
   [`docs/SOURCE_POLICY.md`](docs/SOURCE_POLICY.md).
2. Dry-run the registry:

   ```bash
   npm run ingest -- --dry-run
   ```

3. Ingest for real:

   ```bash
   npm run ingest
   # or one source by database id
   npm run ingest -- --source=<sourceObjectId>
   ```

Ingestion fetches server-side with SSRF protection, deduplicates by content
hash, chunks, embeds, and atomically supersedes older chunks. Public chat can
never trigger a fetch or supply a URL. Sources marked `active: false` are
recorded but not ingested.

## Ingestion

```bash
npm run ingest -- --dry-run   # validate registry entries without fetching
npm run ingest                # fetch, parse, chunk, embed, store
```

Without an admin token the admin ingestion routes return `404`; they are not
part of the public surface. If `ADMIN_TOKEN` is configured, they require
`Authorization: Bearer <token>` and are rate-limited. See
[`docs/API.md`](docs/API.md).

## Tests

```bash
npm run lint          # ESLint over client, server, scripts, e2e
npm test              # server unit/integration + client component tests
npm run test:server   # Vitest + Supertest, in-memory MongoDB
npm run test:client   # Vitest + Testing Library + jsdom
npm run test:e2e      # Playwright, boots in-memory DB + mock providers
npm run evaluate -- --memory   # 70-question regression harness, in-memory DB
npm run evaluate -- --memory --local-embeddings  # keyless semantic retrieval
```

Tests and e2e use `mongodb-memory-server`, not your local database or Atlas. The
first run downloads a MongoDB binary (roughly 600 MB) into the
mongodb-memory-server cache. Later runs are offline. Playwright needs Chromium
installed once: `npx playwright install chromium`.

The evaluation report is written to `data/evaluation/report.md` and
`data/evaluation/report.json`. It is a **pipeline regression harness against
synthetic fixtures**, not a measure of real-world policy accuracy. See
[`docs/EVALUATION.md`](docs/EVALUATION.md).

## Build and run locally

```bash
npm run build          # builds client/dist
NODE_ENV=production npm start
```

In production mode the Express app serves `client/dist` if it exists.
This is still a local build: there is no Docker image, reverse proxy, TLS
termination, or deployment automation in this repository. Do not expose it to
the public internet without adding the operational controls listed in
[`docs/SECURITY.md`](docs/SECURITY.md).

## API

The base path is `/api/v1`. A short summary:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Database, provider, retrieval, and language status |
| POST | `/chat` | Send a message; creates a session on first use |
| GET | `/sessions/:id/messages` | Fetch history; requires `X-Session-Token` |
| POST | `/feedback` | Helpful / not-helpful rating; requires session token |
| GET | `/sources/:id` | Public metadata for an active Source |
| POST | `/admin/ingestion/run` | Admin-only ingestion trigger |
| GET | `/admin/ingestion/jobs/:id` | Admin-only job status |
| GET | `/admin/sources` | Admin-only source listing |

Full request/response contracts, errors, and examples:
[`docs/API.md`](docs/API.md).

## Safety and privacy in one minute

- Safety gates run in backend code before any model call.
- Session IDs alone are not access control: a 32-byte capability token is
  required, stored only as an HMAC, and compared in constant time. Invalid or
  foreign sessions return `404`, not `403`.
- OTPs, PINs, CVVs, Aadhaar, PAN, and similar values are redacted before storage
  and before the model sees them. The UI warns when redaction occurs.
- Logs redact authorization, cookies, session tokens, secrets, message content,
  and tool results. Raw chat content is not logged by default.
- Messages expire after 30 days; sessions expire after 7 days of inactivity.
  Feedback and telemetry expire after 90 days. All use MongoDB TTL indexes.
- No analytics, advertising, or third-party tracking is present.

Details: [`docs/SECURITY.md`](docs/SECURITY.md) and
[`docs/PRIVACY.md`](docs/PRIVACY.md).

## Known limitations / unverified in this build

- **Live Atlas `$vectorSearch` is still unverified.** The Atlas adapter remains
  optional and is not exercised against a real cluster. The default
  `local-vector` path is fully local and tested.
- **No live LLM provider call was made in this build environment.** The
  `openai-compatible` adapter is unit-tested for request/response shape and
  failure paths. Set your key in `.env` and run an evaluation without `--memory`
  to validate your provider, model, tool-calling quality, and rate limits.
- **Live ingestion was executed against the two active registry landing
  pages** (Indian Railways enquiry landing page and Ministry of Railways
  portal) and stored in MongoDB. The registry is still small and landing pages
  do not cover every policy; add
  verified deep links before relying on answers. The app abstains when evidence
  is missing.
- The evaluation corpus is synthetic. It measures pipeline behaviour, not real
  IRCTC policy accuracy. With local multilingual embeddings, Kannada citation
  coverage improved from 20% to 80% on the fixture set, but the fixtures are
  still synthetic.
- Rate limiting is in-memory per process, suitable for a single local process.
  A multi-instance deployment would need a shared store.
- Admin endpoints have no UI. They are intended for local operator use.
- Docker, CI, TLS, public deployment, shared rate limiting, monitoring, and
  backups remain deliberately out of scope under the local-only amendment.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components, agent loop,
  retrieval, data model, and failure behaviour.
- [`docs/API.md`](docs/API.md) — endpoints, auth, validation, errors.
- [`docs/SECURITY.md`](docs/SECURITY.md) — threat model and controls.
- [`docs/PRIVACY.md`](docs/PRIVACY.md) — data collection, retention, redaction.
- [`docs/SOURCE_POLICY.md`](docs/SOURCE_POLICY.md) — what may be ingested.
- [`docs/EVALUATION.md`](docs/EVALUATION.md) — metrics and honest limits.
- [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) — what is built and
  verified.
- [`opencode.md`](opencode.md) — build notes and local commands.

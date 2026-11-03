# opencode.md

Working notes for agents and developers contributing to BharatSeva AI.

## Mission

Build and maintain an independent, multilingual, LLM-led agentic RAG assistant
for **public** IRCTC/Indian Railways information. The model decides whether to
answer, clarify, or retrieve. Safety and capability limits are enforced in code,
not in prompts. This is a local-only pilot, not an official service.

Read these first:

1. `BharatSeva_AI_OpenCode_Master_Specification.md` (authoritative; check the
   local-only amendment at the end before adding infrastructure).
2. `IMPLEMENTATION_STATUS.md` (what is verified vs unverified).
3. `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/SOURCE_POLICY.md`.

## Non-negotiables

- React + Vite + plain JavaScript/JSX on the client.
- Node.js + Express + plain JavaScript ES modules on the server.
- MongoDB + Mongoose. **One backend only.**
- No TypeScript, Angular, Python, FastAPI, second backend, or client-side
  database/LLM calls.
- No secrets in client code, logs, responses, fixtures, or docs.
- No claim of government/IRCTC affiliation or endorsement.
- No fixed FAQ / intent whitelist for the answer path. Bounded tools and safety
  gates are fine; a hard-coded question bank is not.
- Model-proposed citations must be validated against per-turn evidence.
- URLs in answers/citations must come from stored `Source` records.
- Demo mode must run without paid keys, be deterministic, clearly labelled, and
  never present fixtures as official guidance.
- Do not add Docker, CI, or deployment automation while the local-only amendment
  stands.

## Quick commands

```bash
npm install
cp .env.example .env        # defaults work with the bundled local database

npm run db                  # persistent local MongoDB in data/local-db
npm run dev:local -- --seed # database + fixtures + server + client
npm run seed                # synthetic fixtures (requires DB)
npm run dev                 # server :5000 + client :5173
npm run dev:server
npm run dev:client

npm run lint
npm test                    # server + client
npm run test:server
npm run test:client
npm run test:e2e            # boots in-memory DB + mock providers
npm run evaluate -- --memory --local-embeddings
npm run build
```

First e2e run: `npx playwright install chromium`. First test run downloads a
MongoDB binary for `mongodb-memory-server` (large, cached after that). First
local-embedding run downloads the multilingual model into `data/models`.

## Environment

`server/src/config/env.js` validates and exports the environment at import
time. `MONGODB_URI` is required. The root `.env` wins; `server/.env` is a
fallback. The default `.env.example` points at the bundled local MongoDB and
uses keyless local embeddings.

Useful values for local work:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/bharatseva_ai
LLM_PROVIDER=mock
EMBEDDING_PROVIDER=local
EMBEDDING_DIMENSIONS=384
VECTOR_STORE_PROVIDER=local-vector
SESSION_SECRET=<random 32+ chars>
```

Real LLM mode requires a provider key, model, and base URL; startup validation
will refuse to boot without them. No embedding key is needed unless you
explicitly switch `EMBEDDING_PROVIDER` to `openai-compatible`.

Do not import `env.js` before setting test/e2e environment variables in a
bootstrap script. `e2e/start-server.js` and `scripts/evaluate.js` use dynamic
imports for this reason.

## Where things live

| Change | Start here |
| --- | --- |
| API route/validation | `server/src/routes/`, `server/src/validators/index.js` |
| Chat/session behaviour | `server/src/services/chat.service.js`, `session.service.js` |
| Agent loop/budgets | `server/src/services/agentOrchestrator.service.js` |
| Tools | `server/src/agentTools/` (only five; keep the allowlist small) |
| Safety/redaction | `server/src/services/safety.service.js`, `utils/sanitize.js` |
| Retrieval | `server/src/services/retrieval.service.js`, `adapters/vectorStore/` |
| Local embeddings | `adapters/embeddings/localEmbedding.provider.js` (keyless, multilingual) |
| Local database | `scripts/local-db.js`, `scripts/dev-local.js`, `data/local-db/` |
| Ingestion | `server/src/services/ingestion.service.js`, `adapters/sourceFetcher/` |
| Citations/confidence | `services/citation.service.js`, `confidence.service.js` |
| Models/indexes | `server/src/models/` |
| Client UI | `client/src/pages/`, `components/`, `hooks/` |
| Fixtures | `server/src/data/demoFixtures.js` |
| Registry | `data/source_registry/irctc.sources.json` |
| Evaluation | `scripts/evaluate.js`, `data/evaluation/` |

## Conventions

- ESM imports, named exports for services and helpers, default export for React
  components.
- Validate at boundaries with Zod; controllers read only `req.validated`.
- Wrap async route handlers with `asyncHandler` (Express 4 otherwise hangs).
- Return safe `AppError`s; do not leak provider/database internals.
- Log metadata, not chat content. Assume Pino redaction is a safety net, not a
  licence to log secrets.
- Keep model registrations idempotent:
  `mongoose.models.X || mongoose.model('X', schema)`.
- Put service logic in services, not controllers or models.
- New models/fields that contain user data need a retention decision.
- New UI states need demo/fixture labelling if they can show synthetic data.
- Client must never import from `server/` or read server env.

## Adding a tool

1. Create `server/src/agentTools/<name>.tool.js` exporting
   `name`, `description`, `parameters`, `schema` (Zod), `isRetrieval`, and
   `execute(args, context)`.
2. Register it in `server/src/agentTools/index.js`.
3. Keep arguments bounded and use the evidence registry for retrieved chunks.
4. Update tests and `docs/ARCHITECTURE.md`.
5. Remember retrieval tools consume the retrieval budget; `compareEvidence` and
   clarification should not.

Do not add shell, HTTP, database, or URL-fetching tools to the model surface.

## Adding a source

Follow `docs/SOURCE_POLICY.md`. Only reviewed official IRCTC/Indian Railways
URLs, only approved domains, only after manual verification. Ingest with
`npm run ingest -- --dry-run`, then `npm run ingest`. Never let chat supply a
URL to ingestion.

## Common pitfalls

- **Windows/Vite host:** Vite defaults to `localhost`, which can bind IPv6 only;
  Playwright's `127.0.0.1` base URL then fails. e2e passes `--host 127.0.0.1`.
- **MongoDB text index:** use `default_language: "none"` and
  `language_override: "textLanguage"` so Hindi/Kannada inserts are accepted.
- **Atlas vector index:** `numDimensions` must equal `EMBEDDING_DIMENSIONS` (384
  for the default local model) and the index name must equal
  `VECTOR_INDEX_NAME`. Missing index degrades to `$text` by design; check
  `/health`.
- **Changing embeddings:** rebuild chunks (`seed --reset`, `ingest`) and
  recreate the Atlas index if dimensions changed. The default keyless local
  model runs in-process; `data/models` is gitignored.
- **Local database:** `npm run db` uses `mongodb-memory-server` with a custom
  `data/local-db` path, so data persists. `--reset` deletes it. Do not point
  tests at it.
- **Demo labels:** real mode excludes `trustLevel: fixture`; do not “fix” that
  by including fixtures in real answers.
- **Safety heuristics:** distinguish public how-to from private actions. Add
  tests for English, Hindi, Hinglish, and Kannada before changing regexes.
- **Tests share a database process:** model re-registration and index sync can
  cause duplicate/overwrite errors if models are not idempotent.

## Before declaring work done

```bash
npm run lint
npm test
npm run test:e2e
npm run build
npm run evaluate -- --memory --local-embeddings
```

Then update `IMPLEMENTATION_STATUS.md` with what was actually run, and update
the relevant docs. If a claim cannot be verified (Atlas, real LLM), say so
explicitly. Do not let a passing synthetic evaluation imply real policy
accuracy.

## Reporting

When fixing a bug, add a regression test where practical. When changing safety
or citation behaviour, also re-run the evaluation and check:
`fabricatedUrlCount === 0`, `citationValidityRate === 1`,
`refusalAccuracy >= 0.9`, `clarificationAccuracy >= 0.9`.

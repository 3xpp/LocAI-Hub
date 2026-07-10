# Local AI Workflow Hub Build Log

This journal records what is built, why it changes, and how each milestone is verified. It complements the Git commit history and must never contain secrets, real environment values, or sensitive command output.

## 2026-07-10 — Project inception and Phase 0 design

**Status:** Complete

### Added

- Initialized the repository on the `main` branch.
- Captured the approved Phase 0 architecture, API contracts, persistence model, frontend direction, Docker boundaries, testing strategy, and acceptance outcome.
- Established this build journal at the user's request.

### Decisions

- Phase 0 is a read-only observability slice for backend and Ollama state.
- The initial `Prompt` table and Alembic migration are included; prompt API endpoints are deferred to Phase 1.
- The frontend will use plain React and CSS without a UI component library or remote font dependency.
- Every future milestone will update this journal in the same commit as its implementation.

### Verification

- Confirmed the starting directory contained no user project files.
- Reviewed the design for placeholders, conflicting requirements, ambiguous API behavior, and scope creep.

### Commit

- `docs: add phase 0 design and build journal`

## 2026-07-10 — Phase 0 implementation plan

**Status:** Complete

### Added

- Converted the approved design into a seven-task, test-first implementation plan.
- Mapped each planned file to one responsibility and specified exact quality gates.
- Added the six-stage path from observable MVP to a hardened v1 release.

### Decisions

- The Phase 0 implementation remains one vertical slice, delivered through small conventional commits.
- The build journal will be updated inside every implementation milestone.
- Localhost usefulness and network-exposed production readiness are separate maturity targets.

### Verification

- Checked the plan against every section of the approved design.
- Checked dependency names, API fields, route paths, response nullability, and frontend types for consistency.
- Scanned for incomplete task markers and ambiguous implementation instructions.

### Commit

- `docs: add phase 0 implementation plan`

## 2026-07-10 — Monorepo bootstrap and developer guardrails

**Status:** Complete

### Added

- Added repository safety defaults, the MIT license, contributor guardrails, and root Make targets.
- Configured the Python 3.12 backend for uv, FastAPI, SQLAlchemy, Alembic, httpx, pytest, Ruff, and mypy.
- Added the initial backend package markers and resolved `backend/uv.lock`.
- Configured the React 19 and TypeScript frontend for pnpm, Vite, ESLint, and strict compiler checks.
- Added a minimal Vite development shell with a localhost-only default and same-origin proxies for `/api` and `/health`; application UI remains in the dashboard milestone.
- Resolved `web/pnpm-lock.yaml` with pnpm 10.15.1.

### Decisions

- Kept this milestone to tooling and the minimum safe Vite compiler shell; dashboard application source remains in the planned UI milestone.
- Pinned pnpm 10.15.1 in `package.json` so the user-local Corepack shim resolves a Node 20-compatible project version for direct `pnpm` Make commands.
- Added no runtime dependencies beyond the approved Phase 0 dependency set.

### Verification

- `uv lock --check`, `uv sync --locked`, `uv run ruff check .`, and `uv run mypy src` passed.
- Activated the pnpm Corepack shim in the user-local executable directory without changing system files.
- The literal `make install` command passed, using uv for the backend and the pinned pnpm 10.15.1 release for the frontend.
- The literal frontend `pnpm typecheck` and `pnpm lint` scripts passed against the minimal Vite shell.
- Confirmed both backend and frontend lockfiles exist and the root Make targets expand to the planned commands.

### Commit

- `chore: bootstrap local ai workflow hub monorepo`

## 2026-07-10 — SQLite prompt persistence foundation

**Status:** Complete

### Added

- Added process-environment settings with safe local defaults for SQLite and Ollama.
- Added the typed SQLAlchemy `Prompt` model with `id`, `title`, `content`, optional plain-text
  `tags`, and created/updated UTC timestamps.
- Added a focused SQLAlchemy UTC datetime type that normalizes aware inputs and restores UTC
  awareness after SQLite returns naive timestamp values.
- Added reusable database engine and session factories, including SQLite thread handling.
- Added Alembic configuration, migration environment, revision template, and the initial
  `prompts` table migration.
- Added isolated persistence and full migration lifecycle tests; prompt API endpoints remain
  deferred to Phase 1.

### Decisions

- Kept the initial schema to the approved Phase 0 prompt fields and avoided relationships,
  structured tag storage, or HTTP CRUD scope.
- Read configuration only from the process environment; the backend does not load or inspect
  local secret files.
- Defaulted SQLite directly to `./local-ai-hub.db`, relative to the backend working directory, so
  a fresh checkout needs no pre-created data directory.
- Aligned ORM and migration metadata with `CURRENT_TIMESTAMP` server defaults and enabled Alembic
  server-default comparison so future schema drift is detectable.
- Escaped percent signs before passing database URLs through Alembic's interpolating
  configuration layer, preserving valid percent-containing URLs.

### Verification

- Captured the intended TDD failure: the prompt model test initially failed during collection
  because `local_ai_hub.db.models` did not exist.
- Review-driven tests then reproduced SQLite's naive datetime result and Alembic's interpolation
  error for a temporary database filename containing `%20` before their fixes were applied.
- The prompt test verifies UTC-aware timestamps from fresh sessions and confirms `updated_at`
  advances after a persisted modification.
- The migration test upgrades to head, checks its revision, fields, timestamp server defaults,
  and metadata parity, downgrades to base, then deletes its temporary database.
- Full pytest, Ruff lint, Ruff formatting, and strict mypy checks passed.
- An additional `ruff format --check` found one wrapping-only difference in `config.py`; Ruff
  formatted that file and the final formatting check passed.
- A plain default-configuration Alembic upgrade and downgrade also succeeded from the backend
  directory; its ignored SQLite database was removed after verification.

### Commit

- `feat: add sqlite prompt persistence foundation`

## 2026-07-10 — FastAPI health and Ollama observation APIs

**Status:** Complete

### Added

- Added `GET /health` with stable service name, version, and healthy status metadata.
- Added read-only `GET /api/ollama/status` and `GET /api/ollama/models` routes with typed
  Pydantic response contracts.
- Added an async httpx Ollama client with a three-second default timeout and injectable transport
  for isolated tests.
- Added fail-closed Ollama base URL validation and canonicalization: only credential-free HTTP or
  HTTPS origins with a host and no query, fragment, or non-root path are accepted.
- Normalized Ollama model data to name, modification timestamp, and byte size while ignoring
  unsupported upstream fields and malformed model entries.
- Added configuration, client, and HTTP contract tests that require neither a real Ollama server
  nor network access.

### Decisions

- Used Ollama's read-only `/api/tags` endpoint for both reachability and model discovery, avoiding
  model pulls, deletions, or other administrative controls.
- Returned HTTP 200 with explicit `online: false` or an empty model list when Ollama is offline so
  the local dashboard remains usable.
- Mapped transport, HTTP status, and payload failures to fixed safe messages; low-level exception
  text and upstream response bodies are never disclosed by these APIs.
- Invalid or credential-bearing Ollama URLs are never requested or reflected; status responses use
  the fixed display `Invalid configuration` and both APIs use `Invalid Ollama base URL`.
- Disabled httpx environment proxy and certificate inheritance with `trust_env=False`, keeping the
  Ollama request path controlled by explicit application configuration.
- Kept dependency construction replaceable through FastAPI overrides so external I/O is fully
  controlled in tests.

### Verification

- Captured the intended TDD failure: the new tests initially failed during collection because the
  Ollama service and API modules did not exist.
- Review-driven red tests reproduced unsafe reflection of credential-bearing configuration,
  requests attempted from malformed URLs, and missing canonical URL display before correction.
- The completed full backend suite passed with 21 tests, including six end-to-end API and
  migration tests; external Ollama behavior is exercised only through `httpx.MockTransport`.
- Regression tests cover malformed schemes and hosts, credentials, non-root paths, queries,
  fragments, invalid JSON, fixed safe API responses, and canonical valid URL display.
- `uv run ruff check .`, `uv run ruff format --check .`, and strict `uv run mypy src` passed.
- Root `make test`, `make test-e2e`, `make lint`, and `make typecheck` passed.
- The test runner reports one dependency-level Starlette deprecation warning about its TestClient
  integration; it does not affect the Phase 0 contracts or runtime service.

### Commit

- `feat: add fastapi health and ollama endpoints`

## 2026-07-10 — Local control-room dashboard

**Status:** Complete

### Added

- Added the React application entry point and an industrial, responsive control-room interface
  for backend health, Ollama runtime status, and the installed model inventory.
- Added a typed, runtime-validated same-origin API client with explicit HTTP, network, invalid
  response, and request cancellation behavior.
- Added independent loading, success, offline, empty, and error states for all three dashboard
  resources, plus a manual refresh control and last-checked timestamp.
- Added accessible live status messaging, keyboard focus treatment, reduced-motion behavior,
  WCAG AA contrast for compact telemetry labels, and mobile layouts without adding frontend
  dependencies or remote assets.

### Decisions

- Interpreted Ollama's HTTP 200 responses through their `online` and `error` payload fields so an
  offline runtime is not presented as healthy and an empty model list with `error: null` remains a
  valid zero-model state.
- Started all resource requests concurrently while allowing each card to settle independently;
  refreshes abort any superseded request group to prevent stale UI updates.
- Rejected malformed JSON response shapes at the client boundary, including invalid nested model
  fields, so unvalidated backend data never reaches the dashboard components.
- Kept the approved local-control-room visual language in plain CSS using system-resident type,
  restrained signal colors, dense telemetry details, and no external font or component service.

### Verification

- `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed from `web/`.
- Root `make lint` and `make typecheck` passed across the backend and frontend domains.

### Commit

- Pending: `feat: add dashboard shell and ollama model ui`

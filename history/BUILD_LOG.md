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

- `feat: add dashboard shell and ollama model ui`

## 2026-07-10 — Docker Compose development environment

**Status:** Complete

### Added

- Added Python 3.12/uv and Node 22/pnpm development images with focused build contexts that
  exclude local environments, dependency directories, databases, and real environment files.
- Added Compose services for the FastAPI API and Vite dashboard, published only on
  `127.0.0.1:8000` and `127.0.0.1:5173`.
- Added source bind mounts plus named dependency volumes for the backend virtual environment and
  frontend `node_modules`.
- Added a named SQLite data volume mounted at `/data`; API startup runs Alembic before starting
  the FastAPI development server.
- Routed the web development proxy to the private `api` service and routed the API's default
  Ollama connection through `host.docker.internal`, including Linux `host-gateway` support.

### Decisions

- Kept the containers development-only: no production proxy, public host binding, privileged
  mode, Docker socket, Docker SDK, n8n integration, or secret values were added.
- Kept the named data and dependency volumes after `docker compose down` so local database state
  and installed development dependencies survive routine container recreation.

### Verification

- `OLLAMA_BASE_URL=http://host.docker.internal:11434 docker compose config --quiet` passed without
  rendering environment values.
- `docker compose build` built both images successfully. Compose reported that Buildx was not
  installed for its configured Bake path, then used the default Docker builder successfully; this
  was the only infrastructure warning and caused no build failure.
- `docker compose up -d` started both services. Alembic upgraded the named-volume database to the
  initial prompt revision before FastAPI development mode became ready.
- Smoke checks passed for direct API health, dashboard HTML, the Vite-to-API health proxy, and the
  expected HTTP 200 Ollama-offline response without a running Ollama instance.
- Confirmed the SQLite file was non-empty in `/data`, stopped and removed both containers and the
  Compose network, retained all three named volumes, and confirmed no Compose containers remained
  running.
- The full 21-test backend suite, Ruff lint and format checks, strict mypy, frontend ESLint, and
  frontend TypeScript typecheck passed. Pytest retained the already documented dependency-level
  Starlette deprecation warning.

### Commit

- `chore: add docker compose development environment`

## 2026-07-10 — Setup, security, decision, and failure documentation

**Status:** Complete

### Added

- Added the root setup guide with Docker and non-Docker quickstarts, verified environment
  behavior, API contracts, Make targets, limitations, security warning, and six-stage roadmap.
- Added dated architecture decisions for API semantics, persistence, frontend boundaries, Docker,
  integrations, security, and the human-readable build journal.
- Added a factual failure log covering only issues observed during Phase 0 implementation and
  validation, including their resolution or current non-blocking status.
- Added comprehensive security notes for local data, environment files, network exposure, Ollama,
  Compose volumes, dependencies, and future deployment gates.
- Strengthened future-agent rules for failure reporting, build-journal commits, and safe Compose
  validation.
- Hardened both Docker build contexts against common private-key, certificate, and local database
  file formats so the documented secret boundary is enforced by the build inputs.

### Decisions

- Documented private localhost usefulness and network-exposed production readiness as separate
  maturity targets.
- Kept setup instructions aligned with process-environment-only Python configuration and standard
  Docker Compose .env behavior.
- Clarified that .env.example targets native localhost development and must not override Compose's
  host.docker.internal Ollama origin unchanged.
- Documented the optional headless screenshot failure as an environment limitation rather than an
  application or build failure.

### Verification

- Cross-checked documented commands, defaults, ports, routes, response semantics, volumes, and
  limitations against the committed Make, config, API, frontend, and Compose files.
- Checked all repository-relative Markdown links and confirmed their targets exist.
- Scanned documentation for incomplete markers, unsafe deployment claims, real-secret patterns,
  whitespace errors, and contradictory Phase 0 scope.
- Rebuilt both Docker images after the build-context exclusions changed.

### Commit

- `docs: add setup guide security notes and roadmap`

## 2026-07-10 — Phase 0 final acceptance validation

**Status:** Complete

### Scope

- Re-ran the complete Phase 0 acceptance sequence against the clean `main` worktree without
  changing application code, configuration, tests, or documentation outside this journal.
- Disabled automatic Compose environment-file loading, supplied the explicit safe offline Ollama
  origin `http://127.0.0.1:9` to every Make/Compose invocation, and used
  `docker compose --env-file /dev/null` for Compose lifecycle commands. No real environment or
  secret file was read.

### Verification

- Literal `make install` passed: uv resolved 58 packages and checked 56 installed packages; pnpm
  found the lockfile and dependencies up to date. pnpm repeated its non-fatal notice that the
  dependency build script for esbuild is not approved.
- Literal `make test` passed with 21 tests. Literal `make test-e2e` passed with six tests. Both
  reported only the already documented dependency-level Starlette TestClient deprecation warning.
- Literal `make lint` passed Ruff and ESLint. Literal `make typecheck` passed strict mypy across 15
  backend source files and the frontend TypeScript project.
- `cd web && pnpm build` passed, transforming 33 modules and producing the Vite distribution.
- Literal `make build` passed both Docker image builds and the repeated frontend production build.
  Compose again reported the non-fatal missing-Buildx/Bake warning and successfully used Docker's
  default builder.
- With `DATABASE_URL` unset, the default Alembic configuration upgraded a task-created ignored
  `backend/local-ai-hub.db` to `0001_create_prompts`; `alembic check` reported no new upgrade
  operations; downgrade to `base` passed; the disposable database and journal were removed.
- A directly launched API with the safe offline Ollama origin returned the exact healthy service
  payload from `/health`, `online: false` with a safe non-empty error from
  `/api/ollama/status`, and an empty model list with a safe non-empty error from
  `/api/ollama/models`. The API process shut down normally and released its listener.
- Compose started both services with an empty explicit environment file. Direct API health,
  dashboard HTML, Vite-proxied health, proxied offline Ollama status, and proxied empty/error model
  responses all passed. A normal `docker compose down` removed both containers and the network,
  released both localhost ports, retained all three named volumes, and left zero project
  containers.
- The final artifact audit found no untracked files before this journal entry, no tracked secret,
  database, cache, dependency, build-output, or bytecode artifacts, and no stray database or key
  files outside ignored dependency/tool-output directories. `git diff --check` passed.

### Commit

- `test: record phase 0 acceptance validation`

## 2026-07-10 — Phase 1A Prompt Registry design

**Status:** Complete

### Added

- Decomposed Phase 1 into sequential 1A Prompt Registry, 1B Workflow Links, and 1C Import/Export
  releases while preserving the full roadmap objective.
- Specified the complete Phase 1A backend repository, domain service, CRUD/search/pagination API,
  split-registry frontend, error handling, accessibility, security, and test strategy.
- Used the browser visual companion to compare split-registry, card-library, and table/modal
  layouts; the recommended split registry was selected when no alternative preference was
  recorded.

### Decisions

- Reuse the existing Prompt table and plain-text tags column; Phase 1A requires no schema migration.
- Use canonical comma-delimited persisted tags with array-based API contracts.
- Use raw text, explicit save, dirty-state protection, copy-on-action, and confirmed permanent
  single-item deletion.
- Add dev-only frontend behavior-test tooling without adding a runtime UI dependency.
- Keep Phase 1B and 1C as separate design, plan, implementation, and validation cycles.

### Verification

- Reviewed the specification for placeholders, internal contradictions, ambiguous contracts,
  scope creep, schema changes, unsafe prompt rendering, and missing error/test states.
- Cross-checked the design with the committed Prompt model, API/session patterns, dashboard
  structure, roadmap, AGENTS approval boundaries, and Phase 0 security posture.

### Commit

- `docs: add phase 1a prompt registry design`

## 2026-07-10 — Phase 1A implementation plan

**Status:** Complete

### Added

- Converted the approved Prompt Registry specification into seven test-first implementation
  milestones covering domain/repository, HTTP API, frontend test/client boundaries, browsing,
  editing/deletion, documentation, and final acceptance.
- Defined exact file responsibilities, public signatures, status contracts, behavior tests,
  commands, and conventional commit boundaries.

### Decisions

- Retained the previously selected subagent-driven implementation workflow with review before
  each commit.
- Kept Phase 1A schema-neutral and preserved separate future design cycles for Phase 1B and 1C.
- Added dev-only frontend behavior testing as a dedicated milestone before UI implementation.

### Verification

- Checked every Phase 1A design section against at least one implementation task.
- Scanned the plan for placeholders, inconsistent names, missing types, schema drift, untested
  error states, unsafe prompt rendering, and incomplete acceptance evidence.
- Cross-checked commands and paths with the committed uv, pnpm, Make, FastAPI, React, Alembic, and
  Docker structure.

### Commit

- `docs: add phase 1a implementation plan`

## 2026-07-10 — Phase 1A prompt domain and repository

**Status:** Complete

### Added

- Added pure prompt-domain normalization for titles, raw content, optional search text, canonical
  tags, legacy-tolerant tag decoding, and single-line content previews.
- Added a focused SQLAlchemy prompt repository for retrieval, filtered count/list pagination,
  create, complete editable-field replacement, and permanent deletion.
- Added 28 unit cases covering validation boundaries, Unicode-aware tag case folding, stable
  deduplication, malformed legacy tags, CRUD, deterministic ordering, combined filters, pagination,
  Unicode-aware search, exact tag boundaries, literal SQL wildcard handling, refresh behavior, and
  one-commit mutations.

### Decisions

- Reused the Phase 0 Prompt model and comma-delimited tags column without a migration or any schema
  change.
- Kept domain transformations independent of HTTP and persistence, and kept transaction ownership
  inside repository mutations.
- Escaped backslash, percent, and underscore before all LIKE searches; exact tags use one padded
  comma-delimited expression so partial tags do not match.
- Registered deterministic text functions on application-created SQLite connections so search uses
  Unicode case folding and exact filters use the same canonical decoder as API responses.
- Preserved prompt content byte-for-byte after validation and omitted invalid legacy tag fragments
  rather than allowing malformed stored values to break reads.

### Verification

- Confirmed the domain test suite first failed during collection because the prompt service did not
  exist, then confirmed the repository suite first failed because its package did not exist.
- Focused prompt service and repository tests passed: 28 tests.
- The full backend suite passed: 49 tests, with only the previously documented Starlette TestClient
  deprecation warning.
- Ruff lint passed, Ruff reported all 29 backend Python files formatted, and strict mypy passed
  across 19 backend source files.
- The first static-gate run found only import ordering, one 101-character test line, and two test
  files requiring formatter alignment; those findings were corrected before the passing gate run.
- A read-only review found SQLite's built-in case-insensitive comparison was ASCII-only and that
  noncanonical legacy tags could display but fail exact filtering; both gaps received regression
  tests and were repaired before commit without a schema or dependency change.

### Commit

- `feat: add prompt registry domain and repository`

## 2026-07-10 — Phase 1A prompt registry API

**Status:** Complete

### Added

- Added explicit Pydantic create, update, full-item, summary, and paginated-list contracts for
  prompts, including conversion from the existing SQLAlchemy model and legacy-tolerant tag storage.
- Added create, list, retrieve, complete-update, and permanent-delete routes under `/api/prompts`.
- Added 28 isolated API cases for CRUD, duplicate titles, raw-content preservation, safe summaries,
  omitted tags, combined search/filtering, pagination, Unicode search, legacy tags, validation,
  unknown-field rejection, fixed not-found responses, and error redaction.

### Decisions

- Kept synchronous FastAPI handlers aligned with the synchronous SQLAlchemy session lifecycle.
- Normalized query and exact-tag filters before repository access, after HTTP parsing, so limits
  apply to canonical values and validation locations use the public `q` and `tag` names.
- Returned full prompt content only from item and mutation endpoints; collection responses expose
  a one-line preview instead.
- Forbid unknown mutation fields and sanitize shared request-validation responses so misspelled
  fields fail closed and invalid prompt/query values are never reflected to clients or logs.
- Used a per-test StaticPool database with the production SQLite text functions and restored only
  the prompt database dependency override, preventing tests from touching developer data.

### Verification

- Confirmed the new API suite first failed with 23 route-not-found cases before the router existed.
- The focused prompt API suite passed: 28 tests.
- The complete backend suite passed: 77 tests, with only the previously documented Starlette
  TestClient deprecation warning.
- The backend end-to-end suite passed: 34 tests.
- Ruff lint passed, Ruff reported all 32 backend Python files formatted, and strict mypy passed
  across 21 backend source files.
- The first static-gate run found only formatting in the new API test; it was corrected before the
  passing gate. Deprecated 422 status naming was also replaced before final verification.
- A read-only security review found that default validation responses reflected full invalid prompt
  inputs and ignored unknown write keys. Sanitized 422 responses, strict write models, and
  non-mutation regressions resolved both blockers before commit.

### Commit

- `feat: add prompt registry api`

## 2026-07-10 — Phase 1A frontend test harness and prompt client

**Status:** Complete

### Added

- Added a Vitest 4.1.10 and jsdom 29.1.1 browser-like test harness with Testing Library React
  16.3.2, user-event 14.6.1, and jest-dom 6.9.1; all new packages are development-only.
- Added a runtime-validated prompt client for list, retrieve, create, complete update, and 204-only
  delete requests, including typed search/filter/pagination query construction.
- Added 19 client cases covering valid list/detail payloads; malformed nested tags, timestamps,
  counts, limits, offsets, IDs, and content; HTTP/network/JSON failures; write requests; deletion;
  preview bounds; URL encoding; signal forwarding; and fetch/body-read abort preservation.
- Added `pnpm test`, `pnpm test:watch`, and root `make test-web` commands.

### Decisions

- Refactored the existing health/Ollama transport into exported JSON and no-content request helpers
  while preserving its Phase 0 network, HTTP, invalid-response, and abort messages.
- Kept runtime response validation dependency-free and rejected full `content` fields in list
  summaries so an unexpected backend payload cannot silently cross that boundary.
- Used Vitest with globals disabled, jsdom, restored mocks, CSS processing, and one explicit setup
  file; no browser test dependency is shipped in the runtime bundle.

### Verification

- Confirmed the prompt client suite first failed because `src/api/prompts.ts` did not exist.
- Frontend tests passed: 1 file, 19 tests.
- Frontend ESLint and TypeScript project-reference type checking passed.
- The production frontend build passed with 33 transformed modules and a 202.07 kB JavaScript
  bundle (63.32 kB gzip).
- pnpm reported that the esbuild dependency build script remained unapproved; no approval state was
  changed, and both Vitest and the Vite production build completed successfully.
- The first type-check run found an internal request-options inheritance mismatch; replacing the
  extension with an explicit omitted-method type resolved it before the passing gates.
- A read-only client review found that previews lacked their 160-character boundary and body-read
  aborts were being relabeled as invalid JSON. Bounded preview validation, strict calendar checks,
  abort-aware JSON decoding, and regressions resolved those blockers before commit.
- A follow-up spec review found JavaScript code-unit counting disagreed with Python for astral
  Unicode characters; code-point counting plus an emoji regression aligned both boundaries.

### Commit

- `test: add prompt registry frontend harness`

## 2026-07-10 — Phase 1A searchable prompt registry

**Status:** Complete

### Added

- Added Overview/Prompts masthead navigation without a router dependency and kept the existing
  service overview isolated in its original view branch.
- Added a responsive industrial registry rail with labeled search, exact-tag chips, result count,
  semantic rows, loading/empty/no-match/error states, retry, server pagination, and a temporary
  editor workbench for the next milestone.
- Added cancellation-safe list orchestration with a 250 ms trimmed-query debounce, immediate tag
  filters, monotonic request generations, independent abort control, server-derived next offsets,
  deduplicating page merges, and one-shot safe desktop auto-selection.
- Added draft/state helpers and 16 focused cases covering navigation, list states, debounce, tags,
  pagination, stale completion, retry, unmount cancellation, desktop/mobile selection safety,
  normalized dirty comparison, draft copying, and merge behavior.

### Decisions

- Kept prompt list state separate from editor mode so filtering and request failures cannot erase an
  explicit new/selected editor intent.
- Advanced pagination from `response.offset + response.items.length` rather than the deduplicated
  rendered count, preserving the backend cursor when records overlap between pages.
- Matched automatic selection to the existing 600 px mobile breakpoint; mobile stays in list mode
  until the operator explicitly selects or creates a prompt.
- Extended the established dark control-room language with namespaced registry styles, non-color
  status copy, semantic lists, visible focus behavior, and reduced-motion inheritance.

### Verification

- Confirmed state-helper tests first failed because `promptState.ts` did not exist and registry tests
  first failed because `PromptRegistry.tsx` did not exist.
- Frontend tests passed: 3 files, 35 tests.
- Frontend ESLint and TypeScript project-reference type checking passed.
- The production frontend build passed with 38 transformed modules, a 212.99 kB JavaScript bundle
  (66.34 kB gzip), and 17.47 kB CSS (4.34 kB gzip).
- Headless Firefox desktop and mobile-width smoke captures rendered the real Vite registry error
  state with intact hierarchy, controls, responsive stacking, and no horizontal overflow.
- The first registry test run exposed five ambiguous title queries because the safely selected title
  appears in both the semantic row and workbench; role-scoped assertions corrected the tests.
- A read-only preflight identified server-offset pagination, one-shot selection intent, explicit
  mobile behavior, and late mock completion as race boundaries; each received implementation and
  regression coverage before review.
- Read-only behavior reviews found that a failed replacement could retain stale pagination and that
  pre-debounce search intent could accept an old auto-selection. Immediate generation invalidation,
  atomic replacement resets, common Unicode case-fold expansions, and race regressions resolved
  them. A follow-up normalized-query regression also prevents whitespace-only loading deadlocks.
- The debounce commit now carries an explicit pending token so a quick search-and-revert still
  reloads the last committed filter even when its normalized text value is unchanged.

### Commit

- `feat: add searchable prompt registry`

## 2026-07-10 — Phase 1A prompt editor and safe deletion

**Status:** Complete

### Added

- Added create and edit workspaces with title/content validation, Unicode code-point counters,
  controlled canonical tags, persisted timestamps, explicit Save, raw-content Copy, and fixed
  success/error status messages.
- Added independent list, detail, mutation, and clipboard completion boundaries so late requests
  cannot replace another prompt, erase a draft, or announce a copy result in the wrong record.
- Added one shared unsaved-change gate for row selection, New, Overview, mobile Back, and missing
  record recovery, including browser-close protection for every visible pending tag buffer.
- Added a native modal hard-delete confirmation with safe initial focus, Escape/Cancel behavior,
  persisted-title warning, pending-state locking, delete completion announcement, and surviving
  focus restoration.
- Added responsive list/editor pane switching, slow-detail focus handling, Back focus fallback, and
  a complete industrial editor treatment without a component library or rendered prompt markup.
- Added 26 editor/component and end-to-end registry cases on top of the existing frontend suites,
  covering create/update adoption, failures, shortcuts, clipboard ordering, dirty exits,
  beforeunload, stale detail, 404 recovery, delete outcomes, tags, dialogs, and mobile focus.

### Decisions

- Treat any nonempty tag input buffer as unsaved work, even when it contains only whitespace; an
  uncommitted valid buffer is normalized and included automatically on Save.
- Keep full selected prompt data and its immutable baseline independent of filtered list summaries,
  and block editor exits while a mutation outcome may be uncertain.
- Keep raw prompt content in a textarea and clipboard write only; Phase 1A does not render Markdown,
  execute prompts, retry mutations automatically, or expose server validation bodies.
- Use native `dialog.showModal()` for destructive confirmation and perform post-render list focus
  restoration after the modal leaves the browser top layer.

### Verification

- Frontend tests passed: 5 files, 61 tests.
- Frontend ESLint and TypeScript project-reference type checking passed without warnings.
- The production frontend build passed with 41 transformed modules, a 229.32 kB JavaScript bundle
  (70.84 kB gzip), and 28.80 kB CSS (6.23 kB gzip).
- Disposable-database Firefox smoke passed real create/save/delete, canonical pending tags, native
  Cancel and Escape, safe dialog focus, delete announcement/focus, mobile list/editor/Back focus,
  and zero horizontal overflow at 320, 600, 601, and 1280 px.
- Read-only safety review found whitespace-buffer data loss, hidden mobile loading focus, missing
  delete announcement/focus fallback, and stale clipboard completion risks; each received a
  regression and was resolved before commit.
- The first real-browser delete-focus check exposed that a timer could run while the native dialog
  still owned the top layer. Moving focus restoration to a post-render effect fixed the browser-only
  race; the repeated Firefox flow and native Escape check passed.
- No `.env`, secret, project database, Docker socket, prompt execution, or unsafe HTML path was read,
  created, or added.

### Commit

- `feat: add prompt editor and safe deletion`

## 2026-07-11 — Phase 1A integration documentation and regression gates

**Status:** Complete

### Added

- Updated the README from the Phase 0 foundation to the completed Phase 1A product, including
  prompt CRUD/search/filter behavior, all five prompt routes, frontend tests, current limitations,
  and the separately gated Phase 1B then Phase 1C roadmap.
- Recorded canonical tag storage, backend-owned filtering, explicit save, hard deletion, and
  development-only frontend behavior tooling in the architecture decision log.
- Expanded the security notes for unauthenticated prompt read/write/delete exposure, exact clipboard
  copies, irreversible application deletion, SQLite/backup remnants, and the unchanged localhost
  deployment boundary.
- Strengthened future agent guidance so prompt UI behavior changes must run `make test-web` before
  commit.
- Disabled Vite's automatic `.env` loading so frontend development configuration uses only explicit
  process variables; corrected the documented Node range to Vite's installed engine contract.
- Made Compose synchronize the frozen pnpm lock into its persistent dependency volume before Vite
  starts in non-interactive mode, preventing a stale volume after frontend dependency changes
  without deleting prompt data.

### Decisions

- Recorded the observed Compose dependency-volume confirmation stall and its non-interactive
  resolution in `docs/FAILURES.md`; no hypothetical incidents were added.
- Kept documentation explicit that hard delete is not secure erasure and that Phase 1C import/export
  does not yet provide backup or restore guarantees.

### Verification

- Literal `make install` passed from the committed locks; pnpm repeated its known non-blocking
  ignored-esbuild-build-script notice without changing approval state.
- Full backend tests passed: 77 tests with the already documented Starlette deprecation warning;
  backend end-to-end tests passed: 34 tests with the same warning.
- Frontend behavior tests passed: 5 files, 61 tests. Root lint and typecheck targets passed across
  Ruff, ESLint, strict mypy over 21 source files, and TypeScript project references.
- A disposable SQLite database upgraded to Alembic head, and `alembic check` reported no new upgrade
  operations; the disposable file was removed afterward.
- Both Compose images built from frozen locks. Compose again used its documented default-builder
  fallback because Buildx/Bake was unavailable.
- With `/dev/null` as the Compose env file and Ollama fixed to `http://127.0.0.1:9`, both services
  started on host loopback. Direct and Vite-proxied health passed, and offline Ollama status/models
  returned their expected safe HTTP 200 states.
- Compose prompt smoke passed proxied create, direct full-detail retrieval, combined search plus
  exact-tag filtering, direct update, proxied delete, and final HTTP 404 with canonical tags and raw
  multiline content preserved.
- Normal Compose teardown left zero project containers and retained the three named development
  dependency/data volumes present at that check; final acceptance adds and verifies the dedicated
  `web-pnpm-store` volume used to keep generated package data outside the bind-mounted source tree.
- Documentation diff, link/path, content, and whitespace checks passed. No real `.env`, secret,
  Docker socket, or project database was read or added.
- Official Vite configuration guidance and the installed Vite package metadata confirmed
  `envDir: false` disables `.env` loading and the supported Node range is `^20.19.0 || >=22.12.0`.
- The first dependency-volume sync left pnpm waiting for a modules-purge confirmation and Vite reset
  connections; an offline-only retry lacked a required tarball. Network-enabled frozen installation
  with `CI=true` resolved both cases, repeated proxied health passed, and the observed failure is
  recorded in `docs/FAILURES.md`. The next retained-volume start reported dependencies already up to
  date in 501 ms before Vite became reachable.
- A committed-state rebuild exposed a 116.51 MB web context and 115 MB final copy layer. Explicit
  root-directory ignore patterns for generated dependencies/build output and TypeScript build-info
  files were added; the corrective rebuild is recorded in final acceptance.

### Commit

- `chore: finalize phase 1a integration`

## 2026-07-11 — Phase 1A acceptance hardening

**Status:** Complete

### Added

- Raised registry and editor placeholder colors to the existing AA-safe muted token and forced full
  placeholder opacity.
- Tightened the web Docker context against root dependency/build/store directories and TypeScript
  build-info, and moved the Compose pnpm store to its own named volume outside the source bind mount.
- Updated the approved Phase 1A design status from awaiting review to implementation complete.

### Decisions

- Keep frozen pnpm synchronization at web-container startup so a retained `node_modules` volume
  cannot silently drift from the lockfile; use `CI=true` for non-interactive repair and a separate
  `/pnpm/store` volume so generated package data never lands in the source tree.

### Verification

- Calculated placeholder contrast at 5.89:1 for registry search and 5.98:1 for editor fields,
  exceeding the 4.5:1 WCAG AA normal-text threshold.
- Frontend behavior passed: 5 files and 61 tests. ESLint, TypeScript typecheck, and the production
  build passed with 41 transformed modules, 229.32 kB JavaScript, and 28.82 kB CSS.
- The corrected web Docker build context fell from 116.51 MB to 37.45 kB, and the final source-copy
  layer fell from 115 MB to 258 kB while retaining the frozen dependency layer.
- Compose proxied health passed with the dedicated store reporting `/pnpm/store/v10`; the bind-mounted
  source tree contained no pnpm store after startup. Normal teardown removed all project containers
  and retained the named dependency/data volumes.
- The actual confirmation stall, rejected offline-only attempt, and Docker-context leak are recorded
  in `docs/FAILURES.md`. No secret or real environment file was read.

### Commit

- `fix: harden phase 1a acceptance boundaries`

## 2026-07-11 — Phase 1A final acceptance validation

**Status:** Complete

### Validated

- Re-ran the complete backend, frontend, migration, production-build, Docker-build, Compose, and
  real-browser acceptance matrix from the hardened committed revision.
- Exercised the prompt registry through both direct API and Vite-proxied routes without requiring a
  real Ollama server or retaining acceptance prompt data.
- Completed independent acceptance-matrix and artifact/security reviews with no remaining blockers.

### Verification

- Literal `make install` passed from both committed lockfiles. pnpm repeated its known non-blocking
  ignored-esbuild-build-script notice.
- Full backend tests passed: 77 tests. Backend end-to-end tests passed: 34 tests. Both commands emitted
  only the already documented Starlette `TestClient` deprecation warning.
- Frontend behavior passed: 5 files and 61 tests. Root lint and typecheck targets passed across Ruff,
  ESLint, strict mypy over 21 source files, and TypeScript project references.
- Ruff formatting verification passed for 32 files. The production frontend build passed with 41
  transformed modules, a 229.32 kB JavaScript bundle (70.84 kB gzip), and 28.82 kB CSS (6.23 kB gzip).
- A disposable SQLite database upgraded to Alembic head and `alembic check` reported no new upgrade
  operations; the database and sidecar files were removed afterward.
- Both Docker images rebuilt successfully from frozen locks on the exact acceptance revision. The
  known non-blocking default-builder fallback remained documented.
- Headless Firefox exercised real create, search, combined exact-tag filtering, filter clearing,
  detail retrieval, exact raw-content copy, update, delete, repeated-delete 404, disabled empty Copy,
  settled mobile editor focus, and 320 px overflow behavior. Every assertion passed.
- Compose direct and proxied health passed. With a safe unreachable local Ollama URL, direct and
  proxied status returned the expected graceful offline HTTP 200 response.
- Compose prompt smoke passed direct create/update, proxied detail/search/delete, and repeated-delete
  404. The created record was removed, the pnpm store resolved to `/pnpm/store/v10`, and no source-tree
  `.pnpm-store` was created.
- Normal Compose teardown left zero project containers and retained exactly four intended named
  volumes: `api-venv`, `hub-data`, `web-node-modules`, and `web-pnpm-store`.
- Final artifact and security review found no tracked or untracked real environment file, secret,
  project database, cache, dependency directory, build output, or bytecode. Host publishing remains
  loopback-only; no Docker socket/SDK, privileged mode, n8n, cloud AI, prompt execution, Ollama
  mutation, or unsafe HTML path exists.
- Exactly one migration remains (`0001_create_prompts`), `git diff --check` passed, and final Git
  status was verified clean after this acceptance commit.

### Commit

- `test: record phase 1a acceptance validation`

## 2026-07-12 — Phase 1B Workflow Links design

**Status:** Complete

### Added

- Specified a dedicated WorkflowLink persistence domain, additive 0002 migration, five-route CRUD
  API, server search, exact tags, deterministic pagination, and fixed safe-error behavior.
- Defined a third top-level Workflow Links view with a split local-route directory, explicit save,
  cross-view dirty-draft protection, safe persisted-link opening/copying, responsive panes, and
  confirmed permanent deletion.
- Defined an exact HTTP(S) parsing profile without URL userinfo for Python and TypeScript, including
  ASCII host rules, canonical IP forms, port boundaries, raw-authority rejection cases, and a shared
  parity fixture corpus.
- Added migration-preservation, backend, frontend, accessibility, browser, Compose, artifact, and
  security acceptance requirements plus an API-level handoff boundary for Phase 1C.

### Decisions

- The user explicitly approved additive migration 0002_create_workflow_links; the existing prompts
  table remains unchanged.
- Keep workflow links as generic references with flexible canonical tags, not provider-aware remote
  workflow records. The Hub will never fetch, preview, authenticate to, execute, or mutate a stored
  destination in Phase 1B.
- Permit localhost/private-network deep links, paths, query strings, and fragments, while rejecting
  URL userinfo, unsafe schemes, malformed authorities, Unicode host spelling, noncanonical numeric
  hosts, invalid ports, control characters, whitespace, and backslashes.
- Keep prompt and workflow controllers domain-focused. Share only the tag codec and small registry
  primitives after their interfaces become neutral and prompt regressions remain green.

### Verification

- Reviewed the specification for placeholders, contradictions, ambiguous omission/default
  semantics, unapproved dependencies, schema scope, unsafe navigation, secret handling, and Phase 1C
  coupling.
- Cross-checked the design against the current Prompt model, migration round trip, FastAPI error
  handler, repository/search patterns, React navigation, registry controller, native deletion
  dialog, AGENTS approval boundaries, and localhost security posture.
- An adversarial written-spec review found seven ambiguities around URL parser parity, credential
  wording, empty previews, PUT defaults, SQL defaults, auto-selection, and persistence-error
  leakage. Each contract was made explicit, and the follow-up review reported no remaining blocker.
- The user reviewed and approved the committed written specification, including migration 0002, and
  authorized implementation planning and the subsequent build.
- No implementation code, runtime dependency, environment file, secret, or production configuration
  changed during this design milestone.

### Commit

- `docs: add phase 1b workflow links design`

## 2026-07-12 — Phase 1B implementation plan

**Status:** Complete

### Added

- Converted the approved Workflow Links specification into eight test-first milestones covering
  shared domain contracts, additive persistence, safe HTTP APIs, frontend runtime boundaries,
  searchable browsing, guarded editing/navigation, integration documentation, and final acceptance.
- Mapped every created and modified file to one responsibility and defined exact commands, expected
  red/green outcomes, conventional commits, and chronological history updates.
- Added one cross-runtime URL decision corpus, prompt-preserving migration checks, stored-data
  fail-closed behavior, isolated Compose validation, and an explicit Firefox Open test against a
  task-owned loopback sentinel.

### Decisions

- Use fresh implementation and review agents between milestones, matching the Phase 1A workflow,
  while keeping commits on the current clean main branch and never pushing.
- Keep the workflow controller separate from the Prompt controller. Share only canonical tag logic,
  the tag input, deletion dialog, and small text helpers after Prompt regressions pass.
- Validate the full backend/frontend/Docker/browser stack before documentation finalization and
  repeat it from the exact committed candidate during final acceptance.

### Verification

- Checked the plan against every design section, including schema preservation, URL parity,
  redaction, async ownership, dirty navigation, safe Open/Copy, deletion, responsive focus,
  no-dereference security, documentation, and Phase 1C boundaries.
- Scanned for placeholders, undefined public types, inconsistent names, ambiguous defaults,
  incomplete failure handling, unsafe Compose data reuse, missing test commands, and commit gaps.
- Incorporated independent backend, frontend, and acceptance planning reviews before commit.
- No application code, dependency, secret, real environment file, or deployment configuration
  changed during this planning milestone.

### Commit

- `docs: add phase 1b implementation plan`

## 2026-07-12 — Phase 1B workflow-link domain contracts

**Status:** Complete

### Added

- Added a shared field-oriented validation error and extracted canonical tag normalization,
  deduplication, encoding, and defensive legacy decoding into a domain-neutral service.
- Added the pure Workflow Links title, URL, description, search, and preview contract with fixed,
  non-reflective URL failures.
- Added one inert cross-runtime JSON corpus containing 15 accepted and 32 rejected URL decisions,
  plus backend coverage for all approved length, DNS, IP, port, character, and authority boundaries.

### Compatibility

- Preserved every existing Prompt tag import, constant, error alias, canonical storage value,
  Unicode case-folding behavior, malformed-fragment tolerance, and exact-tag filter behavior.
- Renamed the registered SQLite helper to `local_ai_hub_tags`, retained
  `CANONICAL_PROMPT_TAGS_FUNCTION` as a compatibility alias, and moved Prompt queries to the neutral
  function name.

### Decisions

- Preserve the trimmed URL code-point-for-code-point rather than rewriting scheme, host, path,
  query, fragment, or case after validation.
- Allow only literal absolute HTTP(S) destinations with approved ASCII DNS, canonical IPv4, or
  bracketed IPv6 authorities and ports 1–65535; reject URL userinfo, authority percent escapes,
  malformed or noncanonical hosts, whitespace, control/format characters, and backslashes.
- Validate every `xn--` label independently through the already locked `httpx.URL` value parser;
  require raw-host identity, a non-ASCII decoded value, canonical stdlib punycode re-encoding,
  Unicode 3.2-assigned characters, and Unicode 3.2 NFC identity. Reject browser-reinterpreted
  decimal or `0x` terminal labels unless the complete host is already canonical dotted IPv4.
- Deliberately keep the authoritative backend ACE policy as a conservative subset of browser-safe
  hosts. The later frontend validator may accept the browser-safe superset, but server validation
  remains decisive; this compatibility tradeoff is now documented in the approved design and plan.
- Keep URL validation entirely local and pure. The service uses the existing `httpx.URL` value type
  only; it never constructs a Client or AsyncClient and never calls a request API, socket, DNS
  lookup, or destination. The fixture is read from disk and parsed only as strings.

### Verification

- Confirmed the test-first red state: the new service test could not collect while the shared tag
  module was absent.
- Focused domain and Prompt regression gates passed: 170 tests total, comprising 140 workflow-link
  service cases and 30 Prompt service/repository compatibility cases.
- The full backend regression passed all 219 tests with only the already documented Starlette
  `TestClient` deprecation warning.
- Ruff lint passed for backend source and tests; Ruff formatting verified 34 files; strict mypy
  passed across 24 backend source files.
- The first static pass exposed only explicit compatibility-export linting and one mypy narrowing
  issue; both were corrected before the complete green gate above.
- A read-only parity review then exposed invalid punycode and WHATWG numeric-host forms accepted by
  Python but rejected or rewritten by browsers. Thirteen focused assertions reproduced the gap
  before the hostname and numeric-terminal rules closed it with fixed non-reflective errors.
- A local Node URL-constructor check confirmed the three malformed punycode labels are rejected,
  the hexadecimal/mixed numeric forms rewrite to loopback addresses, `example.1` is rejected, and
  the intentionally valid `dead.beef` host remains unchanged; no destination was contacted.
- Python 3.12.3 then reproduced a version-specific uppercase ACE gap: `XN--A`, `Xn--0`, and
  `XN--ABC` passed before case-folding. A further review showed that the stdlib IDNA2003 round trip
  also rejected browser-valid `xn--fa-hia` and `xn--zca` while accepting invalid `xn--00b`.
- Replacing that codec boundary with the existing locked `httpx` 0.28.1 URL value parser made an
  intermediate Python 3.12.3 check pass 10 accepted plus 25 rejected corpus decisions. A narrow
  inert comparison of 16 lowercase, uppercase, and mixed-case ACE labels also matched Node, but
  broader independent reviews subsequently found counterexamples outside that sample.
- The final conservative guard added per-label canonical punycode and Unicode 3.2 assigned/NFC
  checks. Python 3.12.3 passed the expanded 15 accepted plus 32 rejected shared decisions, including
  Arabic/CJK, embedded, multiple, uppercase, and five reviewer counterexamples; backend-only tests
  also prove deliberate rejection of browser-valid post-3.2 labels `xn--v43d` and `xn--oh5h`.
- Explicit per-label regressions cover both directions of the compatibility tradeoff—httpx-valid
  labels rejected by browsers and browser-valid labels conservatively rejected by the backend—and
  prove that an invalid `xn--kybrm` label is still rejected when embedded after a valid prefix.
- Independent broad parity audits over 187,491 labels, another 140,000 labels, and a third run of
  200,000 standalone plus 60,000 embedded hosts found zero backend-accept/Node-reject result with
  the final guard.

### Commit

- `feat: add workflow link domain contracts`

## 2026-07-12 — Phase 1B workflow-link persistence

**Status:** Complete

### Added

- Added the additive `WorkflowLink` SQLAlchemy mapping and
  `0002_create_workflow_links` migration with only the approved seven columns and primary key.
- Added a focused workflow-link repository for deterministic list/count pagination, get, create,
  update, and delete operations.
- Added isolated SQLite repository coverage for duplicate preservation, all-field search, Unicode
  case folding, literal LIKE characters, exact tags, malformed stored fragments, combined filters,
  stable ordering, transaction counts, refresh counts, and empty or out-of-range pages.

### Migration safety

- Preserved the existing Prompt mapping and kept `0001_create_prompts.py` byte-for-byte unchanged
  at SHA-256 `4f1e37711a7d7311a6d138023bc014bd7c755e20ca860082c494bd34ba50f8b5`.
- Proved an existing Prompt payload survives `0001` to `0002` and back to `0001`, while the
  workflow-links table appears only at `0002` and base still removes the Prompt table.
- Asserted exact workflow-link types, string lengths, nullability, empty-string SQL defaults,
  timestamp defaults, primary key, and the absence of indexes, foreign keys, and unique constraints.
- Proved raw SQL inserts receive empty description and tag values plus current timestamps, and
  Alembic reports no model-to-migration drift at head.

### Repository decisions

- Keep URL parsing, HTTP behavior, and rollback policy outside the persistence layer; the repository
  stores normalized service inputs and never contacts a destination.
- Encode tags through the shared domain-neutral codec and use the registered canonical-tag and
  Unicode-casefold SQLite functions for safe, exact filtering.
- Commit each mutation exactly once, refresh create and update exactly once, never refresh delete,
  and keep list/get operations free of commits.

### Verification

- Confirmed the migration test's red state against revision `0001`: `workflow_links` was absent.
- Confirmed the repository test's red state before implementation: its module did not exist.
- Focused migration and repository gates passed all 18 tests after implementation.
- The full backend regression passed all 236 tests with only the already documented Starlette
  `TestClient` deprecation warning.
- Ruff lint passed; Ruff formatting verified all 39 backend Python files; strict mypy passed across
  25 backend source files.
- `git diff --check` and the original migration checksum gate passed before handoff.
- No dependency, Prompt schema, index, foreign key, secret, environment file, network behavior, or
  deployment configuration changed in this milestone.

### Commit

- `feat: add workflow link persistence`

## 2026-07-12 — Phase 1B workflow-link API safety boundary

**Status:** Complete

### Added

- Added strict create and complete-replacement request contracts plus list-summary and full-record
  response contracts for workflow links.
- Added list, create, retrieve, replace, and permanent-delete routes under `/api/workflow-links`
  with search, exact tags, deterministic pagination, fixed 404 responses, and explicit empty 204
  deletion responses.
- Added canonical response conversion that rejects invalid IDs, noncanonical title, URL,
  description, or tag storage, and naive or malformed timestamps before any record reaches a
  browser response.
- Added an idempotent `uvicorn.access` logger filter during application lifespan startup. It copies
  request arguments and replaces every complete query string with `?<redacted>` before formatting.

### Safety decisions

- Keep submitted URL, description, and query values out of validation bodies by preserving the
  global sanitized 422 handler and using only fixed field messages.
- Treat SQLAlchemy errors, scalar-hydration failures, and invalid stored records as one fixed
  `Workflow link operation failed` boundary. Each failure attempts one rollback, suppresses an
  ordinary rollback failure, logs nothing, and does not chain the caught persistence exception.
- Validate stored records explicitly before Pydantic construction so coercion cannot repair or
  expose corrupt values. Tags must round-trip through the shared codec without change and both
  timestamps must be timezone-aware.
- Run the same canonical gate during item lookup so PUT cannot repair and DELETE cannot remove a
  corrupt record; both mutations return the fixed failure and leave the stored row unchanged.
- Bound item IDs and offsets to SQLite's signed 64-bit integer range and catch defensive
  `OverflowError` cases at every operation boundary so oversized user integers remain sanitized
  422 responses instead of escaping as generic text errors or server tracebacks.
- Never resolve, fetch, preview, or otherwise contact a saved workflow destination. The only
  network exercised by this milestone is a test-owned `127.0.0.1` Uvicorn socket used to verify
  formatted access logs.

### Verification

- The first focused test run exposed two test-harness mistakes: the shared URL corpus contains
  named case objects rather than bare strings, and the list repository patch target is plural.
  Correcting those test adapters produced a fully green focused run without changing product
  behavior.
- Workflow-link API coverage passed all 92 cases, including the complete 15-accepted/32-rejected
  shared URL corpus, lifecycle statuses and content types, summary omission, defaults, duplicates,
  filters, pagination, invalid IDs and fields, non-reflection, repository failures, rollback
  failure, suppressed persistence-exception chaining, every stored scalar corruption category,
  mutation fail-closed behavior, exact positive-ID validation, and oversized ID/offset rejection
  across list, GET, PUT, and DELETE requests.
- Access-log coverage passed all 10 cases, including queryless and encoded targets, repeated
  filtering and installation, unexpected argument shapes, and a real Uvicorn request. The
  formatted record retained `/api/workflow-links?<redacted>` while both unique query markers were
  absent.
- The combined focused gate passed all 102 tests. The full backend regression passed all 338 tests
  with only the already documented Starlette `TestClient` deprecation warning.
- Ruff lint passed; Ruff formatting verified all 44 backend Python files; strict mypy passed across
  28 backend source files. `git diff --check` and the original migration checksum gate passed.
- No dependency, migration, Prompt behavior, secret, environment file, destination request, or
  deployment configuration changed in this milestone.

### Commit

- `feat: add workflow link api`

## 2026-07-12 — Phase 1B frontend contracts and shared registry primitives

**Status:** Complete

### Added

- Added a browser-gated workflow-link URL validator and safe origin helper. It checks the literal
  scheme and authority, credentials, characters, ASCII host, DNS labels, ACE labels, canonical
  IPv4, bracketed IPv6, and ports before and after the browser `URL` parser accepts a value.
- Added strict runtime contracts and request functions for workflow-link list, detail, create,
  replace, and 204 deletion responses, including exact query encoding and cancellation support.
- Added a typed `BackendHttpError` that retains only the numeric status and the existing safe
  `Backend returned HTTP N` message without decoding an error response body.
- Added domain-neutral Unicode/tag helpers, TagInput, and ConfirmDialog primitives while preserving
  Prompt compatibility exports and every existing prompt editor interaction.

### Design and safety decisions

- Preserve the established industrial local-console visual language and existing CSS hooks. This
  milestone moves proven behavior without introducing a UI library, new styling system, or visual
  redesign.
- Keep the browser URL check fail-closed but intentionally allow the browser-safe superset described
  by the approved contract; the backend remains authoritative and may conservatively reject newer
  Unicode ACE labels.
- Reject malformed response IDs, titles, URLs, descriptions, previews, tags, timestamps, counts,
  and pagination before typed data reaches React. Summary records cannot contain a full description,
  and full records cannot contain a summary preview.
- Never parse backend error bodies and never issue a request to a stored workflow destination.
  Fetch calls remain limited to the Hub's relative `/api/workflow-links` routes.
- Generate unique dialog heading and description IDs with `useId`, retain Cancel-first focus and
  focus return, and lock both Escape/click actions while a destructive mutation is pending.

### Verification

- Confirmed the new URL and workflow-client tests began red while their implementation modules were
  absent, then passed all 111 API/URL/Prompt-client cases after implementation.
- The shared registry and Prompt component track passed 49 focused tests covering Unicode code
  points, established case folding, Prompt/workflow-link labels, tag limits, unique accessible IDs,
  Cancel, Escape, Confirm, focus return, and pending-state locking.
- The combined and complete frontend suite passed all 160 tests across 8 files. Every one of the 15
  accepted and 32 rejected shared URL cases produced the intended browser decision.
- ESLint and TypeScript project-reference typechecking passed. The Vite production build transformed
  42 modules and produced a 229.48 kB JavaScript bundle (70.94 kB gzip) plus the unchanged 28.82 kB
  CSS bundle (6.23 kB gzip).
- Prompt-local TagInput and ConfirmDialog files were removed only after Prompt regressions passed;
  `promptTextLength` and `normalizePromptTag` remain compatible exports.
- `git diff --check` passed. No dependency, package lock, style, backend, migration, secret,
  environment file, stored-destination request, or deployment configuration changed.

### Commit

- `feat: add workflow link frontend contracts`

## 2026-07-12 — Phase 1B searchable workflow-link directory

**Status:** Complete

### Added

- Added workflow-link draft helpers for independent blank drafts, persisted-record adoption,
  server-style trim-aware dirty comparison, canonical Unicode tag comparison, code-point lengths,
  and stable merge-by-ID pagination.
- Added an independent workflow registry controller with debounced free-text search, one exact-tag
  filter, deterministic pagination, detail selection, retry, desktop standby selection, mobile
  panes, focus ownership, and draft/pending-tag discard protection.
- Added the Workflow Links route with a semantic reference list and route-map workbench. Rows show
  title, runtime-validated origin, explicit empty or bounded description preview, canonical tags,
  and updated time without creating destination anchors.
- Added a third Workflows masthead view and centralized Overview, Prompts, and Workflows changes
  through one navigation function so the existing Prompt dirty guard cannot be bypassed.

### Design and safety decisions

- Extend the established industrial local-console language with a restrained route-map motif:
  teal route nodes and lines distinguish stored references while existing variables, typography,
  registry primitives, focus treatment, and reduced-motion behavior remain shared.
- Keep list and detail requests under separate abort controllers and monotonic generations. Filter
  changes, retries, disabling, replacement requests, and unmounts invalidate their current owner;
  late first-page, next-page, or detail completions cannot replace newer state.
- Preserve loaded detail, draft fields, and pending tag text across list invalidation and errors.
  Desktop first-record selection runs only from true clean standby; explicit selection or New link
  disables it immediately, and mobile never auto-selects.
- Parse row and detail origins only with the existing `workflowLinkOrigin` safety boundary. This
  milestone adds no anchor, `window.open`, clipboard behavior, provider metadata, favicon request,
  destination fetch, editor mutation, or mutation placeholder.
- At 600 px and below, use a true two-row masthead with three equal-width view buttons and 44 px
  minimum targets. Long titles, origins, descriptions, and tags wrap without relying on color to
  communicate state.

### Verification

- Confirmed the test-first red state: workflow state and registry suites could not resolve their
  missing modules, both new App navigation cases failed on the absent Workflows view, and all 160
  pre-existing frontend tests remained green in that run.
- The focused workflow state, directory/controller, and App navigation gate passed all 26 tests.
  Coverage includes initial and background loading, empty and filtered-empty states, retry while
  retaining detail, 250 ms search, whitespace stability and clearing, exact and combined filters,
  merge/dedup totals, stale first/page/detail ownership, disable/unmount aborts, clean desktop-only
  selection, settled mobile focus, pending draft/tag protection, semantic rows, safe origins, and
  Prompt dirty cancel.
- The complete frontend regression passed all 186 tests across 11 files. ESLint and TypeScript
  project-reference typechecking passed.
- The final Vite production build transformed 48 modules and produced a 251.49 kB JavaScript bundle
  (75.27 kB gzip) and 35.84 kB CSS bundle (7.34 kB gzip).
- `git diff --check` passed. No dependency, package lock, backend, database schema, migration,
  secret, environment file, stored-destination request, or deployment configuration changed.

### Commit

- `feat: add searchable workflow link registry`

## 2026-07-12 — Phase 1B workflow-link editor and safe navigation

**Status:** Complete

### Added

- Added the complete Workflow Links editor for title, absolute HTTP(S) URL, raw-text description,
  canonical tags, timestamps, explicit save, Ctrl/Cmd+S, permanent deletion, and mobile Back.
- Added strict client save readiness across required fields, Unicode code-point limits, browser-safe
  URL parsing, canonical tag count/length/deduplication, valid pending-tag inclusion, detail state,
  mutation state, and dirty state.
- Added independent generation ownership for create, update, delete, and clipboard operations.
  Successful writes adopt the complete canonical response into the selected record, baseline,
  draft, and list summary; failed writes retain every draft field and the pending tag buffer without
  automatic retry.
- Added persisted-only destination actions. Open is a literal anchor with the exact saved `href`,
  `_blank`, `noopener noreferrer`, and `no-referrer`; Copy writes the exact last-saved URL and
  reports success or failure through a polite live region. New, unsafe, and unsaved draft URLs
  never become destination actions.
- Added guarded workflow selection, New, mobile Back, missing-record recovery, browser unload, and
  Workflow-to-Overview/Prompts navigation while preserving the existing Prompt-to-Workflow guard.
- Added title-bearing native deletion confirmation with Cancel-first focus, Escape handling,
  pending locks, duplicate-submit prevention, fixed delete-404 recovery, adjacent-row/New focus,
  and ignored late completions.

### Async, navigation, and safety decisions

- A specification review found that an already-running list request could complete after a save or
  delete, overwrite the adopted canonical summary, or reintroduce a removed row. Save adoption and
  delete/404 directory recovery now abort and invalidate list ownership before changing visible
  state; deterministic deferred-request tests prove stale completions are ignored.
- Keep Open and Copy bound to the runtime-validated persisted record even while a different URL is
  dirty. The editor labels the saved origin and full destination and explains that an edited URL
  must be saved before either action uses it.
- Invalidate clipboard ownership on draft, pending-tag, selection, save, delete, and unmount
  transitions. A late clipboard resolution cannot publish status into another record or newer
  state.
- Block every abandonment path without opening a discard prompt while a save or delete is pending.
  Dirty and pending states both register `beforeunload`; ordinary canceled discard keeps the active
  pane and every draft value.
- On deletion, capture the persisted title and list order, remove the ID, clear record state,
  refresh totals/list ownership, announce success only after a real 204, move mobile to the list,
  and restore focus in next-row, previous-row, then New-link order after the native dialog closes.
- Continue to render description, URL, title, and tags only as text or form values. No destination
  metadata, favicon, redirect, proxy, `window.open`, provider call, or automatic target request was
  added.

### Verification

- The test-first red gate produced 17 expected Task 6 failures on the absent editor/mutation UI
  while all 186 pre-existing frontend tests stayed green.
- Final frontend behavior passed all 213 tests across 13 test files. Coverage includes field and URL
  attributes, 200/2,048/5,000 code-point boundaries, pending tags, complete POST/PUT adoption,
  save preservation, exact persisted copy, clipboard failure/staleness, safe-anchor attributes,
  no-dereference interactions, dirty and pending navigation, beforeunload, list/mutation races,
  deletion Cancel/Escape/404/failure/focus paths, duplicate submission, unmount races, and mobile
  settled focus.
- ESLint and TypeScript project-reference typechecking passed. The Vite production build transformed
  49 modules and produced a 261.53 kB JavaScript bundle (77.37 kB gzip) and 38.93 kB CSS bundle
  (7.77 kB gzip).
- A real Firefox 152.0.5 / geckodriver 0.36.0 run used an Alembic-migrated disposable SQLite
  database, safe explicit environment values, Vite proxy, and a task-owned loopback 204 sentinel.
  It passed create, search, exact tag, clear filter, detail, update, exact saved-URL copy, dirty
  canceled navigation, delete Cancel/Escape/Confirm, repeated API delete 404, and settled mobile
  focus.
- WebDriver BiDi exercised exact 320, 600, 601, and 1280 px CSS viewports. Document/body scroll
  widths were respectively 320/320, 588/588, 589/589, and 1268/1268 against viewport widths 320,
  600, 601, and 1280, with no horizontal overflow.
- The sentinel recorded zero requests through render, selection, search, editing, saves, copy, dirty
  navigation, and deletion. Clicking Open created exactly one new tab and one
  `/explicit-open?opaque=task6` request with no `Referer` header.
- Final harness cleanup left zero task-owned API, Vite, geckodriver, Firefox, or sentinel processes
  and removed its disposable database, sidecars, logs, temporary directory, and external script.
  `git diff --check` passed; no dependency, lockfile, backend, migration, secret, environment file,
  Docker, n8n, auth, deployment, or production configuration changed.

### Commit

- `feat: add workflow link editor and safe navigation`

## 2026-07-12 — Phase 1B integration documentation and regression gates

**Status:** Complete; final Phase 1B acceptance pending

### Documentation updates

- Updated the README to describe the implemented Workflow Links registry, all five routes,
  server-side search and exact tags, URL validation profile, persisted-only Open/Copy behavior,
  no-dereference guarantee, full-URL sensitivity, current limitations, validation commands, and
  final-acceptance status.
- Added architecture decisions for the dedicated WorkflowLink domain, explicitly approved additive
  0002 migration, reference-only URL boundary, flexible canonical tags, and provider/n8n deferral.
- Expanded security notes for unauthenticated full-URL/description exposure, sensitive query or
  fragment data, explicit new-tab navigation, clipboard behavior, destination isolation, and the
  absence of n8n/provider calls.
- Updated AGENTS.md so Prompt or Workflow Links UI behavior commits must run `make test-web`, and
  marked the approved Phase 1B design implementation-complete with final acceptance pending.

### Non-Docker verification

- Literal `make install` passed: uv resolved 58 packages and audited 56; pnpm reported the lockfile
  up to date. The only notices were the known ignored esbuild build-script notice and a pnpm update
  notice; both committed locks remained unchanged.
- `make test` passed all 338 backend tests with the one already documented Starlette TestClient
  deprecation warning. `make test-e2e` passed all 136 end-to-end tests with the same single warning.
- `make test-web` passed all 213 frontend tests across 13 files. Root lint passed Ruff and ESLint;
  root typecheck passed strict mypy across 28 backend source files and TypeScript project references.
- Ruff formatting verification passed all 44 backend Python files. The Vite production build
  transformed 49 modules and produced a 261.53 kB JavaScript bundle (77.37 kB gzip) and 38.93 kB
  CSS bundle (7.77 kB gzip).
- A disposable SQLite database upgraded to Alembic head 0002, `alembic check` reported no drift,
  downgrade to `0001_create_prompts` succeeded, and re-upgrade to head succeeded. The disposable
  database and sidecars were removed; the automated migration test remains the prompt-preservation
  proof.

### Isolated Compose verification

- The isolated `local-ai-workflow-hub-phase1b-acceptance` project built and started successfully
  with explicit safe configuration and `/dev/null` as its environment file. Compose emitted only
  the already documented Bake/buildx fallback warning.
- Direct and proxied health returned HTTP 200. Direct and proxied Ollama status returned the expected
  graceful offline HTTP 200 state for the safe unreachable `127.0.0.1:9` origin.
- The workflow-link lifecycle passed direct create 201, proxied detail 200, direct and proxied
  combined query-plus-exact-tag results with total 1, proxied complete PUT 200, direct DELETE 204,
  and proxied repeated DELETE 404. The bridge-owned destination sentinel recorded zero requests.
- The container pnpm store existed at `/pnpm/store/v10`; neither `/app/.pnpm-store` nor source-tree
  `web/.pnpm-store` existed.
- `down --volumes --remove-orphans` removed every acceptance container, network, and all four
  acceptance volumes. The acceptance `ps` and volume lists were empty afterward, while the four
  preexisting main-project volumes remained unchanged.
- No new Task 7 incident required a `docs/FAILURES.md` entry. No dependency lock, runtime code,
  schema, migration, secret, environment file, Docker capability, n8n integration, authentication,
  deployment, or production configuration changed in this documentation milestone.

### Commit

- `chore: finalize phase 1b integration`

## 2026-07-12 — Phase 1B final acceptance validation

**Status:** Complete

### Exact candidate

- Repeated the complete acceptance matrix against committed candidate
  `1a152f992b8458f0a464d90cc68e495874b0fdba` without changing runtime behavior.
- Independent requirement-matrix, backend subaudit, and artifact/security reviewers approved the
  candidate with no remaining blocker. A focused backend audit passed 260 tests; the artifact audit
  additionally passed 58 Prompt tests and all 213 frontend tests.

### Dependency, test, and build gates

- Literal `make install` passed with both locks unchanged. uv resolved 58 packages and audited 56;
  pnpm reported its lock up to date. The known ignored esbuild build-script notice was the only
  package-install warning relevant to the repository.
- `make test` passed all 338 backend tests and `make test-e2e` passed all 136 end-to-end tests. Each
  emitted only the already documented single Starlette TestClient deprecation warning.
- `make test-web` passed all 213 frontend tests across 13 files. Ruff and ESLint lint passed; strict
  mypy passed across 28 backend source files and TypeScript project-reference typechecking passed.
- Ruff format verification passed all 44 Python files. The Vite production build transformed 49
  modules and produced a 261.53 kB JavaScript bundle (77.37 kB gzip) and 38.93 kB CSS bundle
  (7.77 kB gzip).
- The default Docker image build passed. Compose emitted only the already documented Bake/buildx
  fallback warning and used its successful default-builder path.

### Migration preservation

- A manually seeded Prompt survived the full disposable migration sequence
  `0001_create_prompts` → `0002_create_workflow_links` → `0001_create_prompts` →
  `0002_create_workflow_links`; Alembic reported no model-to-migration drift at head.
- Downgrade to base removed both Prompt and WorkflowLink tables. The temporary database and sidecar
  files were removed afterward.
- Revision `0001_create_prompts.py` remained byte-for-byte unchanged at SHA-256
  `4f1e37711a7d7311a6d138023bc014bd7c755e20ca860082c494bd34ba50f8b5`.

### Final isolated Compose acceptance

- Direct and proxied health returned HTTP 200. Direct and proxied Ollama status returned the
  expected graceful offline HTTP 200 state for the explicit safe `127.0.0.1:9` origin.
- The final workflow-link lifecycle passed direct create 201, proxied detail 200, direct and proxied
  combined query-plus-exact-tag search with total 1, proxied complete PUT 200, direct DELETE 204,
  proxied repeated DELETE 404, and direct missing-detail 404. The bridge-owned destination sentinel
  recorded zero requests.
- The container pnpm store resolved at `/pnpm/store/v10`; neither the container source tree nor the
  host source tree contained a `.pnpm-store` directory.
- Final teardown removed every acceptance-project container, network, and all four acceptance
  volumes. Acceptance container/volume listings were empty afterward, and the four preexisting
  main-project volumes remained unchanged.

### Exact-candidate browser acceptance

- Firefox 152.0.5 with geckodriver 0.36.0 and WebDriver BiDi repeated create, detail, search, exact
  tag, filter clearing, update, exact persisted-URL copy, dirty-navigation Cancel, delete Cancel,
  native Escape, confirmed delete, repeated-delete 404, and settled mobile editor focus against a
  disposable Alembic database and Vite proxy.
- Exact CSS viewports 320, 600, 601, and 1280 px had document/body scroll widths 320/320, 588/588,
  589/589, and 1268/1268 respectively, with no horizontal overflow.
- The loopback sentinel recorded zero requests before explicit Open. One Open click created exactly
  one new tab and one `/explicit-open?opaque=task8` request with no `Referer` header.
- Browser teardown left zero task-owned API, Vite, geckodriver, Firefox, or sentinel processes and
  removed its database, logs, temporary directory, and external harness script.

### Final scope and artifact audit

- Final generated cache/build/temporary cleanup and prohibited-capability, secret, artifact,
  container, volume, migration, documentation, and Git audits passed.
- No tracked or Git-visible untracked secret, environment file, project database, dependency,
  build, cache, bytecode, or TypeScript artifact remained. Task-generated output outside the ignored
  installed dependency environments was removed; no ignored secret file was inspected.
- Host publishing remains loopback-only. No destination auto-request, n8n integration/key, Docker
  socket/SDK, privileged mode, cloud AI, auth, deployment, production configuration, remote,
  upstream, or push was added or used.
- `docs/FAILURES.md` required no new final-acceptance entry; only the known Starlette and
  Bake/buildx warnings remained. Phase 1B is complete and Phase 1C Import/Export is next.

### Commit

- `test: record phase 1b acceptance validation`

## 2026-07-13 — Phase 1C import/export design approved

### Milestone

- Resumed Phase 1C after explicit selection of the safe append-only transfer approach.
- Approved a complete design for versioned JSON export, non-mutating preview, and atomic import of
  Prompt and Workflow Link records.
- Kept database identifiers and record timestamps local: imported records receive fresh IDs and
  timestamps, and no Alembic migration is required.
- Defined strict version 1 contracts, a 10 MiB encoded-file limit, a 5,000-record limit, bounded safe
  validation issues, deterministic export ordering, and exact duplicate warnings.
- Preserved every existing record and made re-import behavior explicit: duplicates are warned about
  but appended only after confirmation.
- Required one cross-table transaction, full rollback on failure, no remote/file-path imports, and
  zero workflow-destination dereferencing.
- Approved a fourth Transfer view with explicit sensitive-data warnings, memory-only selected-file
  state, accessible preview/confirmation, guarded navigation, and registry refresh after success.
- Defined backend, frontend, migration, Docker, proxy, Firefox, security, artifact, and cleanup
  acceptance evidence for the final Phase 1 milestone.
- Logged the repeated workspace patch-sandbox loopback failure factually in docs/FAILURES.md and
  verified every patch-based fallback before staging.
- Recorded the approved design in
  `docs/superpowers/specs/2026-07-13-phase-1c-import-export-design.md`; implementation remains gated
  on written-spec review and a committed task-by-task implementation plan.

### Commit

- `docs: add phase 1c import export design`

## 2026-07-18 — Phase 1C implementation plan approved

### Milestone

- Converted the approved Phase 1C import/export design into a nine-task, test-first implementation
  plan covering strict transfer contracts, atomic persistence, bounded FastAPI routes, frontend
  runtime validation, memory-only file state, accessible UI, dashboard integration, documentation,
  and exact-candidate acceptance.
- Fixed the implementation boundary at no schema migration, no runtime dependency, no remote import,
  no workflow-destination request, and no change to the existing localhost-first deployment posture.
- Planned deterministic version 1 exports, non-mutating previews, append-all duplicate behavior, and
  one cross-table commit with full rollback on persistence failure.
- Planned explicit 10 MiB, 5,000-record, and 100-safe-issue limits on both backend and frontend
  boundaries, including raw streamed request handling and fatal UTF-8 file decoding.
- Planned a fourth Transfer dashboard view with sensitive-data warnings, prepared-import navigation
  protection, uncertain-outcome handling, no automatic retry, temporary download URL cleanup, and
  accessible focus/live-region behavior.
- Added exact host, migration, isolated Compose, proxy, Firefox viewport, destination-sentinel,
  artifact, cleanup, Git, and remote-state validation steps for completing Phase 1.
- Identified and planned a safe `make build` recipe that uses `/dev/null` as the Compose env file and
  an explicit non-routable sample Ollama URL, preventing implicit reads of an ignored `.env` during
  acceptance.
- Self-reviewed the plan against the approved specification and requested an independent read-only
  audit before implementation.

### Verification

- Confirmed every implementation task names exact files, red-first tests, focused commands, broad
  regression gates, history updates, and a conventional commit.
- Confirmed the plan changes no dependency manifest, lockfile, SQLAlchemy model, migration, Docker
  runtime definition, authentication boundary, or protected secret file.
- Confirmed Phase 1C remains append-only and local-file-only, with zero Docker socket, n8n API,
  cloud AI, arbitrary execution, or production deployment scope.

### Commit

- `docs: add phase 1c implementation plan`

## 2026-07-18 — Strict Phase 1C transfer contracts

### Milestone

- Added pure portable Prompt and Workflow Link records with no local IDs or per-record timestamps.
- Added strict fail-closed projection for canonical stored values while preserving legacy Prompt
  `NULL` and empty tags as an empty portable tag list.
- Added deterministic version 1 manifest serialization, UTF-8 output, type-aware counts, exact
  tag-order-independent fingerprints, in-bundle duplicate counting, and fixed preview warnings.
- Added duplicate-key-safe UTF-8 JSON decoding that rejects non-standard numeric constants,
  trailing content, malformed input, excessive nesting, and unsupported manifests.
- Added closed strict Pydantic schemas for both record types, normalized incoming editable values,
  deterministic application/version/count precedence, and zero-offset RFC 3339 timestamps.
- Added bounded validation issue mapping with at most 100 fixed safe issues; submitted values,
  unknown keys, Prompt content, descriptions, full URLs, and raw Pydantic messages are never
  reflected.
- Kept the database schema, migrations, dependency manifests, lockfiles, Docker definitions, and
  existing Prompt/Workflow behavior unchanged.

### Verification

- Captured the expected red collection failures before the transfer service and schema modules
  existed.
- `uv run pytest tests/unit/test_transfer_service.py tests/unit/test_transfer_schemas.py -q` passed
  all 93 transfer contract tests.
- Existing Prompt and Workflow Link service regression suites passed all 157 tests.
- Repository-wide Ruff lint passed, strict mypy passed across 32 backend source files, and Ruff
  format verification passed all 52 Python files.
- `git diff --check` passed for the milestone candidate.

### Commit

- `feat: add transfer bundle contracts`

## 2026-07-18 — Atomic Phase 1C transfer persistence

### Milestone

- Added deterministic full-registry reads with Prompts ordered by ascending ID before Workflow
  Links ordered by ascending ID.
- Added combined row counting and stable empty read shapes without flushing or committing.
- Added mixed Prompt and Workflow Link append persistence that constructs fresh ORM rows, preserves
  incoming canonical tag order, and performs exactly one commit.
- Kept imported identifiers and aware UTC timestamps database-generated; bundle timestamps are not
  copied into local records.
- Added best-effort rollback that preserves the original add, flush, or commit failure even when
  rollback itself fails.
- Proved a failure after both record types are pending leaves neither table with partial rows and
  existing editable fields remain unchanged.
- Reused the existing models and tag encoding without a migration, dependency, or CRUD repository
  behavior change.

### Verification

- Captured the expected red collection failure before the transfer repository module existed.
- `uv run pytest tests/unit/test_transfer_repository.py -q` passed all 8 atomic persistence tests.
- Existing Prompt and Workflow Link repository regressions passed all 30 tests.
- Repository-wide Ruff lint passed, strict mypy passed across 32 backend source files, and Ruff
  format verification passed all 52 Python files.
- `git diff --check` passed for the milestone candidate.

### Commit

- `feat: add atomic transfer persistence`

## 2026-07-18 — Bounded Phase 1C transfer API

### Milestone

- Added a streamed raw-body reader that accepts only UTF-8 JSON and enforces the final 10 MiB byte
  limit even when `Content-Length` is absent, invalid, or misleading.
- Added fixed no-store, no-cache, nosniff, UTF-8 JSON response headers for every transfer success and
  failure; only successful exports receive a safe download filename.
- Added `GET /api/transfer/export`, `POST /api/transfer/import/preview`, and
  `POST /api/transfer/import`, mounted under the existing FastAPI application.
- Made export deterministic and portable, with Prompts grouped before Workflow Links, no local IDs
  or record timestamps, strict stored-data projection, and count plus encoded-byte fail-closed
  limits.
- Made preview non-mutating and import append-only, independently validating each request, reporting
  exact duplicates, rejecting empty commits, and using the atomic cross-table repository.
- Added fixed operation-specific 500 responses with best-effort rollback and no caught exception,
  submitted value, unknown key, Prompt content, description, full URL, or request body reflection.
- Proved transfer treats Workflow Link URLs only as inert editable data and never constructs an HTTP
  client or requests a workflow destination.
- Kept the schema, migrations, dependencies, lockfiles, Docker definitions, auth boundary, and
  localhost-first deployment posture unchanged.

### Verification

- Captured the expected 19 failing API tests before the transfer routes existed.
- `uv run pytest tests/unit/test_transfer_http.py tests/e2e/test_transfer_api.py -q` passed all 44
  bounded HTTP and end-to-end transfer tests.
- The complete backend suite passed all 483 tests with only the previously documented Starlette
  TestClient deprecation warning.
- Repository-wide Ruff lint passed, strict mypy passed across 33 backend source files, and Ruff
  format verification passed all 54 Python files.
- `git diff --check` passed for the milestone candidate.

### Commit

- `feat: add import and export api`

## 2026-07-18 — Strict Phase 1C frontend transfer contracts

### Milestone

- Added closed TypeScript contracts for portable bundles, preview/import counts, fixed warnings,
  bounded validation issues, safe transfer errors, and uncertain import outcomes.
- Added a dedicated relative-path transfer client that sends selected JSON text as the original raw
  request body and never retries an import.
- Added strict exact-key runtime validation for application/version/type literals, UTC timestamps,
  Prompt and Workflow Link field bounds, canonical tags, inert safe URLs, record grouping, counts,
  warnings, errors, and the 5,000-record limit.
- Added encoded UTF-8 enforcement for the 10 MiB export limit plus a fixed allowlisted download
  filename parser; invalid or missing disposition metadata is rejected.
- Replaced backend-provided error text with fixed local messages and bounded allowlisted metadata so
  submitted values and unknown fields cannot be reflected into the UI.
- Made network loss and malformed successful import responses explicitly uncertain while keeping
  export/preview abortable and exposing no import AbortSignal or retry option.
- Kept the shared API client, dependencies, lockfile, backend, database schema, Docker definitions,
  and deployment boundary unchanged.

### Verification

- Captured the expected module-not-found failure before the transfer client existed.
- `pnpm exec vitest run src/api/transfer.test.ts` passed all 37 focused runtime and request tests.
- The complete pre-controller frontend suite passed all 250 tests across 14 files.
- Scoped ESLint passed for both transfer client files, project frontend lint passed before the
  independent controller files appeared, and `pnpm typecheck` passed.
- Confirmed mocked requests use only the three local `/api/transfer` paths and never contact a
  Workflow Link destination.
- `git diff --check` passed for the milestone candidate.

### Commit

- `feat: add transfer frontend contracts`

## 2026-07-18 — Memory-only Phase 1C transfer controller

### Milestone

- Added a fatal UTF-8 local-file boundary with exact pre-read and post-read 10 MiB checks plus fixed
  non-reflective errors for oversized, unreadable, and invalidly encoded bundles.
- Kept selected raw JSON only in a private controller ref; React state contains filename, byte size,
  bounded preview metadata, fixed errors, and safe result counts but never a File or record values.
- Added generation-based stale-result rejection, explicit activity locking, preview/export
  AbortControllers, disable/unmount cleanup, and Strict Mode lifecycle replay safety.
- Added non-mutating automatic preview after an explicit file selection, valid-empty and invalid
  states, bounded safe issue metadata, and an explicit Preview again transition.
- Added a one-shot import confirmation path with the original private raw body, no AbortSignal, no
  automatic retry, full selected-data release on success, and fresh-preview invalidation on every
  failure.
- Marked network loss or malformed successful import responses as uncertain and required a new
  preview before any later import attempt.
- Added prepared-import navigation confirmation, pending navigation blocking, and a beforeunload
  warning only while an operation is pending or a fresh non-empty import is prepared.
- Added explicit export download handling with a temporary Blob, hidden anchor, object URL, and
  unconditional anchor removal plus URL revocation; only validated safe counts remain afterward.
- Kept browser persistence, direct fetches, dependencies, lockfiles, backend, database schema,
  Docker definitions, and deployment behavior unchanged.

### Verification

- Captured the expected missing-module failures before the state and controller modules existed.
- Reproduced a React Strict Mode lifecycle replay regression with a failing test, then restored the
  mounted flag during effect setup while retaining real unmount abort and release behavior.
- `pnpm exec vitest run src/features/transfer/transferState.test.ts
  src/features/transfer/TransferView.test.tsx` passed all 21 focused tests.
- Required `make test-web` passed all 271 frontend tests across 16 files.
- `pnpm lint` and `pnpm typecheck` passed.
- A scoped memory/safety audit found no localStorage, sessionStorage, IndexedDB, direct fetch, or
  File-in-React-state use in the controller milestone.
- `git diff --check` passed for the milestone candidate.

### Commit

- `feat: add transfer workflow controller`

## 2026-07-18 — Safe Phase 1C import/export interface

### Milestone

- Used the frontend-design guidance to extend the existing industrial control-room language with a
  distinct portable-data airlock: explicit local-boundary telemetry, inbound/outbound panels, and
  restrained high-contrast safety cues without a component library or new asset.
- Added a Transfer header, explicit export panel, memory-only local-file intake panel, bounded
  preview manifest, append-only confirmation dialog, safe announcements, and Phase 01C footer.
- Added prominent export and import warnings for sensitive Prompt text, descriptions, internal
  hosts, query strings, and fragments, with accessible descriptions on the activating controls.
- Kept export and file preview fully operator-triggered; entering the view starts no request, and
  the file input resets immediately so the same local bundle can be selected again.
- Rendered only filename, byte size, type/total/duplicate counts, fixed warnings, and bounded safe
  issue metadata; raw Prompt content, descriptions, complete URLs, and selected JSON never become
  component props or rendered text.
- Added valid-empty, duplicate, preview rejection, definite import rejection, uncertain outcome,
  pending, success, and export-failure presentations with live regions and fixed copy.
- Reused the shared confirmation dialog for an explicit one-transaction append-only explanation;
  every valid record and exact duplicate is imported, with no merge, replace, or skip control.
- Disabled replacement, clear, preview, export, and import actions while work is pending and exposed
  no cancellation action after import confirmation.
- Added dialog Cancel/native Escape focus restoration and deferred focus handoff to committed
  results or fixed alerts after the dialog closes.
- Kept App navigation, global styling, dependencies, lockfiles, backend, schema, Docker, and
  deployment behavior unchanged for this component-only milestone.

### Verification

- Captured the expected module-resolution failure before `TransferView` existed.
- `pnpm exec vitest run src/features/transfer/TransferView.test.tsx` passed all 23 controller and
  accessible interface tests.
- Required `make test-web` passed all 281 frontend tests across 16 files.
- `pnpm lint` and `pnpm typecheck` passed.
- Confirmed the UI never renders a private marker placed in selected Prompt/URL-shaped JSON and
  mocked API calls remain limited to explicit local transfer actions.
- `git diff --check` passed for the milestone candidate.

### Commit

- `feat: add safe import export interface`

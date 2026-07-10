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

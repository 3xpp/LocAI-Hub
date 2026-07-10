# Local AI Workflow Hub Phase 0 MVP Design

**Date:** 2026-07-10  
**Status:** Approved for planning  
**Project:** Local AI Workflow Hub

## Summary

Local AI Workflow Hub Phase 0 is a local-first dashboard that gives developers and homelab users one calm, observable view of their local AI stack. The first vertical slice reports backend health, detects whether Ollama is reachable, lists installed Ollama models, and establishes a SQLite-backed prompt registry schema for later features.

The MVP is intentionally read-only around external services. It will not control containers, mutate Ollama models, call n8n, execute scripts, or provide public deployment features.

## Goals

- Provide an exact, stable backend health contract.
- Report Ollama availability without crashing when Ollama is absent or offline.
- Normalize Ollama's model metadata behind a small application-owned API contract.
- Present health, connection, model, empty, loading, and error states in a polished dashboard.
- Establish SQLAlchemy and Alembic foundations with an initial `Prompt` table.
- Make local development repeatable with `uv`, `pnpm`, Make, and Docker Compose.
- Keep all exposed development ports bound to localhost by default.
- Maintain a human-readable build journal under `history/` throughout implementation.

## Non-goals

Phase 0 will not include:

- Prompt create, update, delete, or list endpoints.
- A prompt management frontend.
- Authentication or authorization.
- Docker socket access, Docker SDK usage, or container controls.
- n8n credentials, API calls, or workflow mutation.
- Ollama model pull, delete, or execution controls.
- Arbitrary shell or script execution.
- Cloud AI providers or API keys.
- A public or production deployment configuration.

Prompt endpoints are deferred to Phase 1 so the first release remains a small, testable observability slice. The Phase 0 schema makes that next step additive.

## Repository Layout

The repository will be organized by domain:

```text
.
├── AGENTS.md
├── README.md
├── LICENSE
├── Makefile
├── docker-compose.yml
├── .env.example
├── .gitignore
├── backend/
│   ├── Dockerfile
│   ├── alembic.ini
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── migrations/
│   ├── src/local_ai_hub/
│   │   ├── api/
│   │   ├── db/
│   │   └── services/
│   └── tests/
│       ├── e2e/
│       └── unit/
├── docs/
│   ├── DECISIONS.md
│   ├── FAILURES.md
│   ├── SECURITY_NOTES.md
│   └── superpowers/
│       ├── plans/
│       └── specs/
├── history/
│   └── BUILD_LOG.md
└── web/
    ├── Dockerfile
    ├── package.json
    ├── pnpm-lock.yaml
    └── src/
        ├── api/
        └── components/
```

Generated caches, local databases, build output, dependency directories, real environment files, and editor artifacts will be ignored.

## Architecture

```text
Browser
  │
  ▼
Vite development server (127.0.0.1:5173)
  │  proxies /health and /api
  ▼
FastAPI service (127.0.0.1:8000)
  ├── health route
  ├── Ollama routes ──► Ollama HTTP API
  └── SQLAlchemy ─────► SQLite database
```

The browser uses same-origin relative URLs. During development, Vite proxies backend paths to FastAPI, avoiding a broad CORS configuration. In Docker Compose, the web service proxies to the API service over the private Compose network.

The backend is divided into focused boundaries:

- `config.py` reads process environment values and supplies safe defaults. It does not load or inspect `.env` files itself.
- `services/ollama.py` owns all Ollama HTTP behavior and response normalization.
- API route modules translate service results into stable JSON contracts.
- `db/` owns the SQLAlchemy base, engine/session factory, and persistence models.
- Alembic owns schema creation and future migrations.

## Backend API Contracts

### `GET /health`

The endpoint always returns HTTP 200 while the application process is healthy:

```json
{
  "status": "ok",
  "service": "local-ai-workflow-hub",
  "version": "0.1.0"
}
```

### `GET /api/ollama/status`

The Ollama client checks the local Ollama API with a short timeout. Both online and offline results return HTTP 200 because Ollama being absent is a normal dashboard state.

Online response:

```json
{
  "online": true,
  "base_url": "http://localhost:11434",
  "error": null
}
```

Offline response:

```json
{
  "online": false,
  "base_url": "http://localhost:11434",
  "error": "Connection failed"
}
```

Expected connection, timeout, HTTP, and malformed-response errors are converted into concise application messages. Raw exception details are not returned or logged, preventing accidental disclosure of internal network information.

### `GET /api/ollama/models`

The endpoint calls Ollama's `/api/tags` route and returns only application-owned fields:

```json
{
  "models": [
    {
      "name": "llama3.1:8b",
      "modified_at": "2026-07-10T10:00:00Z",
      "size": 123456
    }
  ],
  "error": null
}
```

If Ollama is offline, the endpoint returns HTTP 200 with an empty `models` array and `"error": "Connection failed"`. A reachable Ollama instance with no installed models returns an empty array and a null error. This distinction lets the frontend render offline and empty states correctly.

The service will tolerate extra fields from Ollama. A model must have a usable name; `modified_at` and `size` may be null when Ollama omits them.

## Configuration

The backend reads these values from the process environment:

- `OLLAMA_BASE_URL`, defaulting to `http://localhost:11434` outside containers.
- `DATABASE_URL`, defaulting to a local SQLite database path suitable for development.

`.env.example` contains safe sample values only. Application code, tests, documentation commands, and build tooling will never read or print a real `.env` file. Docker Compose may use standard environment interpolation at runtime, but the repository will not create or commit a real `.env`.

## Persistence Design

SQLAlchemy 2.x typed mappings will define the initial `Prompt` model:

- `id`: integer primary key.
- `title`: required short text.
- `content`: required long text.
- `tags`: optional plain text for Phase 0.
- `created_at`: timezone-aware creation timestamp.
- `updated_at`: timezone-aware timestamp updated on modification.

An initial Alembic migration creates the `prompts` table. The API will not automatically delete or recreate tables. SQLite's thread option will be configured for FastAPI's request model, and the database URL remains replaceable for isolated tests.

## Ollama Client Design

The Ollama integration uses `httpx.AsyncClient`. The client receives its base URL and transport-capable HTTP client through explicit construction so tests can use `httpx.MockTransport` without a real server.

The service exposes two operations:

- Determine connectivity and return a normalized status result.
- Fetch and normalize the installed model list.

Routes obtain the service through a FastAPI dependency. Tests can override that dependency or supply a mock transport. Network exceptions remain contained at the service boundary.

## Frontend Design

The dashboard will use a restrained industrial control-room aesthetic: warm near-black surfaces, paper-white primary text, muted steel borders, and clear green or amber state accents. A serif display face paired with a compact monospaced operational face will give the interface character without fetching remote fonts. Styling will be plain CSS with no component library.

The page contains:

1. A header with the project name and local-first description.
2. A backend health card with loading, online, and offline states.
3. An Ollama status card with availability, configured base URL, and a concise error.
4. A model inventory with model names, optional modification dates, readable sizes, an empty state, and an offline state.
5. A single manual refresh control and a last-checked indicator.

API requests start together so a slow or unavailable Ollama service does not block backend health rendering. Each section owns its loading and failure state. The layout collapses to one column on narrow screens, uses semantic headings and lists, preserves visible keyboard focus, and never relies on color alone to communicate status.

## Docker and Local Development

The backend image uses Python 3.12 and `uv`; the frontend image uses Node and pnpm. Docker Compose provides development services with source mounts and dependency caches where practical.

- Host bindings default to `127.0.0.1:8000` and `127.0.0.1:5173`.
- The API stores SQLite data in a named volume.
- The Compose API default reaches host Ollama through `host.docker.internal`, including the Linux host-gateway mapping.
- No service mounts `/var/run/docker.sock`.
- No production proxy, TLS, authentication, or privileged mode is configured.

The Makefile exposes the requested install, development, test, lint, type-check, format, and build commands. `make dev` prints clear two-terminal instructions; `make dev-api` and `make dev-web` run each process directly.

## Error Handling

- A missing Ollama process is expected and represented as dashboard data, not an application exception.
- Ollama timeouts, refused connections, HTTP errors, and invalid payloads produce stable, non-sensitive messages.
- A backend fetch failure causes the relevant frontend card to show an offline/error state while the remaining sections continue rendering.
- Empty Ollama results are visually distinct from connectivity failures.
- Unexpected programming or database errors are not silently converted into successful API results.

## Testing and Quality Gates

Backend tests will verify:

- `/health` returns the exact expected payload.
- The Ollama client converts a connection failure into an offline result.
- The Ollama client normalizes `/api/tags` data through `httpx.MockTransport`.
- `/api/ollama/status` returns `online: false` when its service cannot connect.
- No test depends on a running Ollama instance or external network.

The frontend has no Phase 0 unit-test framework. Its acceptance gate is a strict TypeScript check, ESLint, and a production Vite build. This avoids adding another toolchain before the UI has behavior that warrants it.

Before final handoff, the repository will run:

- `make install`
- `make test`
- `make test-e2e`
- `make lint`
- `make typecheck`
- the frontend production build
- Docker Compose configuration validation and build when the environment supports Docker
- endpoint smoke checks
- `git status` to confirm a clean worktree

## Security Boundaries

- Development services bind to localhost on the host.
- The application never reads, prints, edits, or commits real secrets.
- `.env` and common secret-file patterns are ignored.
- Ollama base URLs are configuration, but error responses do not expose raw network exceptions.
- There is no Docker socket, Docker SDK, n8n integration, authentication system, or command execution.
- Documentation explicitly warns that network exposure requires authentication and deployment hardening.
- Documentation warns that local prompts and model interactions may contain sensitive information.

## Build History Convention

`history/BUILD_LOG.md` is the chronological, human-readable journal for the project. Every implementation milestone updates it in the same commit as the work it describes. Each entry records:

- the date and milestone status;
- what was added or changed;
- important decisions or scope boundaries;
- checks run and their outcomes;
- the conventional commit message used for that milestone.

The journal complements Git history and will not contain secrets, full environment dumps, or sensitive command output. `AGENTS.md` will require future Codex sessions to keep it current.

## Milestones and Commit Strategy

1. Commit the approved design and build-history convention.
2. Bootstrap the monorepo, developer tooling, database, migration, and safe configuration.
3. Add the tested FastAPI health and Ollama implementation.
4. Add the dashboard shell and Ollama model interface.
5. Add and refine backend behavior tests.
6. Complete Docker, README, security, decision, failure, and contributor-agent documentation.
7. Run all acceptance checks and commit any validation-only corrections.

All commits use conventional commit messages. Nothing will be pushed to a remote.

## Acceptance Outcome

Phase 0 is complete when a developer can install dependencies, run the API and dashboard locally or through Docker Compose, see backend and Ollama state without needing a live Ollama server, inspect installed models when Ollama is available, run all required quality checks, understand the security boundaries, review the build journal, and find a clean Git worktree containing only committed project files.

# Local AI Workflow Hub

A local-first control room for Ollama, reusable prompts, workflow references, and homelab automation.

> [!WARNING]
> Phase 0 has no authentication. Keep it on your own machine. Do not expose the dashboard or API to a public or untrusted network without authentication, authorization, TLS, and a deployment security review.

## What it does

Local AI setups tend to spread across terminals, Docker Compose projects, prompt notes, n8n tabs, and one-off dashboards. Local AI Workflow Hub starts consolidating that operational picture without turning a personal machine into a remote administration service.

Phase 0 provides:

- backend service health;
- safe Ollama online/offline status;
- normalized local Ollama model inventory;
- distinct loading, empty, offline, and malformed-response states;
- a SQLite, SQLAlchemy, and Alembic persistence foundation;
- the initial Prompt data model;
- a responsive React dashboard;
- repeatable uv, pnpm, Make, and Docker Compose workflows.

It is intentionally read-only around Ollama and does not expose Docker, n8n, shell, model-management, or prompt-management controls.

## Architecture

~~~text
Browser
  |
  v
Vite dashboard (127.0.0.1:5173)
  |  same-origin proxy: /health and /api
  v
FastAPI (127.0.0.1:8000)
  |-- health API
  |-- read-only Ollama client --> Ollama /api/tags
  '-- SQLAlchemy/Alembic -----> SQLite
~~~

Expected Ollama failures are dashboard state, not application crashes. Tests replace Ollama transport with httpx MockTransport and never require a live Ollama server.

## Prerequisites

- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/)
- Node.js 20.19 or newer
- [pnpm](https://pnpm.io/) 10.x
- Docker Engine with Docker Compose v2 (required only for the Docker quickstart and image build)
- Optional: [Ollama](https://ollama.com/) for live status and model data

The repository pins pnpm 10.15.1 through Corepack. If pnpm is not already available, enable Corepack using the installation method appropriate for your Node.js installation.

## Quickstart with Docker Compose

Ollama is optional. The stack starts normally and shows an offline state when Ollama is unavailable.

~~~bash
docker compose up --build
~~~

Open:

- Dashboard: http://127.0.0.1:5173
- API: http://127.0.0.1:8000
- Interactive API docs: http://127.0.0.1:8000/docs

Stop the stack:

~~~bash
docker compose down
~~~

Compose retains the SQLite and dependency volumes. To deliberately erase all Compose-managed project data:

~~~bash
docker compose down --volumes
~~~

The Compose default points the API at host.docker.internal for Ollama and includes the Linux host-gateway mapping. Ollama must also accept connections from the Docker bridge. Its usual localhost-only binding may not do so. Reconfiguring Ollama to listen on another interface can increase network exposure; apply host firewall rules and never expose it publicly without protection.

The committed .env.example is for the non-Docker localhost workflow. Do not copy it unchanged to .env for Compose: both an existing shell variable and a Compose-loaded .env value override host.docker.internal. Remove that override or set OLLAMA_BASE_URL to the container-reachable host origin before starting Compose.

## Quickstart without Docker

Install dependencies using the committed lockfiles:

~~~bash
make install
~~~

Create or upgrade the local SQLite schema:

~~~bash
make db-upgrade
~~~

Start the API:

~~~bash
make dev-api
~~~

In a second terminal, start the dashboard:

~~~bash
make dev-web
~~~

Open http://127.0.0.1:5173. Vite proxies backend requests to http://127.0.0.1:8000.

## Configuration

The Python application reads process environment variables only. It does not parse a .env file. Export values through your shell or service manager when running without Docker.

Docker Compose follows normal Compose behavior and may load an ignored local .env file automatically. Never commit that file. The committed [.env.example](.env.example) contains safe values for the non-Docker localhost workflow; its Ollama localhost value is not the Compose container default.

| Variable | Local default | Purpose |
| --- | --- | --- |
| DATABASE_URL | sqlite:///./local-ai-hub.db | SQLAlchemy connection URL. The local path is relative to backend/. Compose overrides it with the named /data volume. |
| OLLAMA_BASE_URL | http://localhost:11434 | Ollama HTTP origin used for read-only tags/status requests. |

OLLAMA_BASE_URL accepts only a credential-free HTTP or HTTPS origin with a host and root path. User information, query strings, fragments, and non-root paths are rejected and never reflected by the API.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /health | Exact service health, name, and version payload. |
| GET | /api/ollama/status | Ollama reachability, safe configured-origin display, and normalized error. |
| GET | /api/ollama/models | Normalized name, modification time, and byte size for installed models. |

Ollama being offline is an expected HTTP 200 response:

~~~json
{
  "online": false,
  "base_url": "http://localhost:11434",
  "error": "Connection failed"
}
~~~

A reachable Ollama instance with no models returns an empty models array and a null error. An offline or invalid configuration returns an empty array with a non-null safe error.

## Common commands

| Command | Purpose |
| --- | --- |
| make install | Install backend and frontend dependencies from their project manifests and lockfiles. |
| make dev | Print the two development commands. |
| make dev-api | Start FastAPI development mode. |
| make dev-web | Start Vite development mode. |
| make db-upgrade | Apply Alembic migrations. |
| make test | Run the complete backend test suite. |
| make test-e2e | Run backend end-to-end contract and migration tests. |
| make lint | Run Ruff and ESLint. |
| make typecheck | Run strict mypy and TypeScript checks. |
| make format | Format and auto-fix backend Python files. |
| make build | Build Docker images and the production frontend bundle. |

## Validation

Phase 0 currently verifies:

- exact health and Ollama HTTP contracts;
- connection, HTTP, invalid JSON, invalid URL, and credential-reflection failures;
- model normalization without real network access;
- Prompt persistence, UTC timestamp behavior, and updated timestamps;
- Alembic upgrade, drift check, and downgrade;
- Ruff, strict mypy, ESLint, TypeScript, and Vite production build;
- Compose image build, migration startup, direct/proxied health, offline Ollama, and graceful shutdown.

## Security posture

- Host development ports bind to 127.0.0.1.
- There is no authentication in Phase 0.
- There is no Docker socket or Docker SDK access.
- There is no n8n API or API-key usage.
- Ollama requests ignore ambient proxy variables and use only explicit validated configuration.
- Real .env files, local databases, dependency directories, and common secret-file formats are ignored.
- Prompt content and local model interactions may contain sensitive information.

Read [Security Notes](docs/SECURITY_NOTES.md) before changing network exposure or integration scope.

## Current limitations

- Prompt persistence exists, but prompt CRUD endpoints and UI are deferred.
- Workflow references and search are not implemented.
- Ollama integration is observation-only; there is no run, pull, or delete action.
- n8n and container observability are not implemented.
- No authentication, multi-user support, production proxy, or public deployment profile exists.
- SQLite is intended for this local MVP, not concurrent multi-node deployment.
- Frontend unit tests are deferred; Phase 0 uses strict type, lint, production-build, and API contract gates.

## Roadmap to production-ready v1

1. **Phase 0 — Observable MVP (current):** health, Ollama status/models, persistence foundation, dashboard, and Docker development.
2. **Phase 1 — Usable registry:** prompt CRUD, workflow links, search, tags, validation, and local import/export.
3. **Phase 2 — Read-only integrations:** explicitly approved n8n and service/container visibility through constrained interfaces.
4. **Phase 3 — Safe administration:** authentication, authorization, audit history, and narrowly scoped actions.
5. **Phase 4 — Operational maturity:** backups, restore drills, CI, release artifacts, migration/upgrade tests, observability, and accessibility.
6. **Phase 5 — Hardened v1:** threat model, network deployment guidance, security review, stable APIs, versioning, and signed releases.

The project should be useful on a private localhost setup during Phases 1–2. Safe network exposure is a different standard and belongs around Phases 4–5.

## Project records

- [Architecture decisions](docs/DECISIONS.md)
- [Observed failures and resolutions](docs/FAILURES.md)
- [Security boundaries](docs/SECURITY_NOTES.md)
- [Chronological build log](history/BUILD_LOG.md)
- [Approved Phase 0 design](docs/superpowers/specs/2026-07-10-phase-0-mvp-design.md)
- [Phase 0 implementation plan](docs/superpowers/plans/2026-07-10-phase-0-mvp.md)

## License

Local AI Workflow Hub is available under the [MIT License](LICENSE).

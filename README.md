# Local AI Workflow Hub

A local-first control room for Ollama, reusable prompts, workflow references, and homelab automation.

> [!WARNING]
> The app has no authentication. Keep it on your own machine. Prompt and Workflow Link CRUD can
> reveal, change, or permanently delete local data. Transfer exports include every Prompt and full
> Workflow Link URL in one downloaded JSON file, while confirmed imports append records. Saved URLs
> may include sensitive query strings or fragments. Protect exported files like the local database,
> and do not expose the dashboard or API to a public or untrusted network without authentication,
> authorization, TLS, and a deployment security review.

## What it does

Local AI setups tend to spread across terminals, Docker Compose projects, prompt notes, n8n tabs, and one-off dashboards. Local AI Workflow Hub starts consolidating that operational picture without turning a personal machine into a remote administration service.

Phase 1C provides:

- backend service health;
- safe Ollama online/offline status;
- normalized local Ollama model inventory;
- distinct loading, empty, offline, and malformed-response states;
- a SQLite, SQLAlchemy, and Alembic persistence foundation;
- complete create, list, retrieve, update, and permanent-delete prompt APIs;
- server-side prompt search, exact canonical-tag filtering, and deterministic pagination;
- a responsive prompt registry with raw-text editing, explicit save, dirty-draft protection,
  clipboard copy, and deletion confirmation;
- a dedicated Workflow Links registry with complete CRUD, server search across title, URL,
  description, and tags, exact-tag filtering, and deterministic pagination;
- a responsive workflow-link editor with explicit save, dirty-draft protection, persisted-URL
  Copy/Open actions, permanent-delete confirmation, async race ownership, and mobile focus return;
- a fourth Transfer view with explicit full-registry version 1 JSON download, non-mutating import
  preview, and confirmed atomic append-only import;
- fresh local IDs and timestamps for every imported record, with exact duplicates reported before
  confirmation and still appended when confirmed;
- a responsive React dashboard;
- repeatable uv, pnpm, Make, and Docker Compose workflows;
- backend and frontend behavior tests that do not require a live Ollama server.

It remains intentionally read-only around Ollama and does not expose Docker, n8n, shell,
model-management, prompt-execution, provider synchronization, or cloud-AI controls. Workflow links
are stored references, not live service integrations. Phase 1C final acceptance passed from
corrective commit `7b5ec9f`, completing Phase 1. Phase 2 remains unimplemented and requires a
separately approved integration design.

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
  |-- prompt CRUD/search API
  |-- workflow-link CRUD/search API
  '-- transfer export/preview/import API
          |
          '-- SQLAlchemy/Alembic -----> SQLite
~~~

Expected Ollama failures are dashboard state, not application crashes. Tests replace Ollama transport with httpx MockTransport and never require a live Ollama server.

Prompt list requests return summaries rather than full content. Search, exact tag filtering, counting,
and pagination happen in the backend; create and update responses return the canonical values stored by
the server.

Workflow-link list requests likewise return summaries, but each summary includes the complete saved
URL so the directory can show its validated origin. The backend never dereferences that URL. Create,
retrieve, and replace responses return the full record, including description; deleting a record
removes only the Hub bookmark and never changes its destination.

## Transfer data

The fourth **Transfer** view provides one deliberately explicit local workflow:

1. Choose **Download JSON bundle** to export every Prompt followed by every Workflow Link in the
   version 1 portable format.
2. Select a local JSON file. The server validates and previews counts, exact duplicates, and bounded
   safe issues without changing the database.
3. Choose **Import records**, review the confirmation, and confirm to append every validated record
   in one transaction. Imported records receive fresh local IDs and timestamps.

Version 1 accepts at most 10 MiB (10,485,760 UTF-8 bytes), 5,000 combined records, and returns at
most 100 validation issues. Duplicate matches are advisory: a confirmed import appends them as new
records rather than merging, replacing, or skipping them. Re-importing the same bundle therefore
creates another copy.

This format moves editable registry data; it is not database backup, synchronization, restore, or
disaster recovery. A downloaded bundle may contain private prompt text, internal hostnames, and
sensitive URL query strings or fragments. The file is outside the Hub's control after download, so
store and delete it with appropriate operating-system protections.

## Prerequisites

- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/)
- Node.js `^20.19.0` or `>=22.12.0`
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

At startup, the API applies migrations and synchronizes its uv environment, while the web service
synchronizes the frozen pnpm lock into named dependency volumes before starting Vite. A first start or
lockfile change may need package-registry access. Normal `docker compose down` retains both
dependencies and registry data; do not use `--volumes` merely to refresh packages because it also
deletes the SQLite volume.

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

The Python application reads process environment variables only. It does not parse a .env file.
Vite also disables automatic `.env` loading and reads its development proxy settings only from the
explicit process environment. Export values through your shell or service manager when running
without Docker.

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
| GET | /api/prompts | Server-filtered prompt summaries. Supports `q`, `tag`, `limit`, and `offset`. |
| POST | /api/prompts | Create one prompt and return its canonical full representation. |
| GET | /api/prompts/{prompt_id} | Retrieve one prompt with full raw-text content. |
| PUT | /api/prompts/{prompt_id} | Replace all editable fields and return canonical server values. |
| DELETE | /api/prompts/{prompt_id} | Permanently delete one prompt and return HTTP 204. |
| GET | /api/workflow-links | Server-filtered workflow-link summaries. Supports `q`, `tag`, `limit`, and `offset`. |
| POST | /api/workflow-links | Create one workflow link and return its canonical full representation. |
| GET | /api/workflow-links/{workflow_link_id} | Retrieve one workflow link with its full raw-text description. |
| PUT | /api/workflow-links/{workflow_link_id} | Replace all editable fields and return canonical server values. |
| DELETE | /api/workflow-links/{workflow_link_id} | Permanently delete one stored reference and return HTTP 204. |
| GET | /api/transfer/export | Download the full version 1 Prompt and Workflow Link JSON bundle. |
| POST | /api/transfer/import/preview | Validate and summarize a JSON bundle without database mutation. |
| POST | /api/transfer/import | Revalidate and atomically append a non-empty bundle; returns HTTP 201 after commit. |

Ollama being offline is an expected HTTP 200 response:

~~~json
{
  "online": false,
  "base_url": "http://localhost:11434",
  "error": "Connection failed"
}
~~~

A reachable Ollama instance with no models returns an empty models array and a null error. An offline or invalid configuration returns an empty array with a non-null safe error.

Prompt titles are trimmed and prompt content remains raw text. Tags are whitespace-normalized,
case-folded, deduplicated canonical values; commas and control characters are rejected. A list search
matches title, content, and tags on the server. An exact tag filter can be combined with search, and
missing individual prompts return HTTP 404.

Workflow-link titles and descriptions are trimmed. URLs must be absolute HTTP(S) references with a
valid ASCII hostname, canonical IPv4 address, or bracketed IPv6 address and a valid port. Localhost
and private-network destinations are allowed for homelab use. User information, non-HTTP schemes,
Unicode host spelling, whitespace/control characters, backslashes, malformed authorities and ports,
and ambiguous noncanonical numeric hosts are rejected. Query strings and fragments are allowed and
preserved, but are not inspected for credentials or signed tokens.

Workflow-link tags use the same canonical 10-tag/30-character contract as Prompt tags. List search
matches title, complete URL, description, and tags; an exact canonical tag can be combined with
search. Duplicate titles and destinations are valid.

> [!IMPORTANT]
> Rendering, selecting, searching, editing, saving, copying, or deleting a workflow link does not
> contact its destination. **Open saved link** is the only destination navigation: it appears only
> for a persisted URL that passes the browser safety check and opens after an explicit click in a
> new tab with `noopener`, `noreferrer`, and a no-referrer policy. Copy likewise uses only the exact
> last-saved URL. Treat the full URL as sensitive if its query or fragment contains a token.

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
| make test-web | Run the frontend Vitest behavior suite once. |
| make lint | Run Ruff and ESLint. |
| make typecheck | Run strict mypy and TypeScript checks. |
| make format | Format and auto-fix backend Python files. |
| make build | Build Docker images and the production frontend bundle. |

## Validation

Phase 1B final acceptance verifies:

- exact health and Ollama HTTP contracts;
- connection, HTTP, invalid JSON, invalid URL, and credential-reflection failures;
- model normalization without real network access;
- Prompt persistence, UTC timestamp behavior, and updated timestamps;
- prompt normalization, CRUD, search, exact tag filtering, pagination, validation, and not-found contracts;
- runtime validation of prompt list/detail responses at the browser boundary;
- prompt-registry loading, filtering, editing, keyboard save, dirty navigation guards, clipboard feedback,
  mobile navigation, and confirmed deletion behavior;
- WorkflowLink persistence and reversible additive migration 0002 without changing the Prompt table;
- all five workflow-link routes, safe fixed errors, response validation, search, exact tags,
  pagination, complete replacement, and repeated-delete 404 behavior;
- accepted/rejected URL cases through a shared Python/TypeScript corpus and browser-gated response
  validation;
- workflow-link loading, filtering, editing, keyboard save, pending and dirty navigation guards,
  persisted-only Open/Copy, deletion, focus, clipboard, request-cancellation, and stale-completion
  behavior;
- a real Firefox loopback sentinel flow proving no stored destination is requested before explicit
  Open, followed by exactly one new tab/request with no Referer;
- Alembic upgrade, drift check, and downgrade;
- Ruff, strict mypy, ESLint, Vitest, TypeScript, and Vite production build;
- an isolated Phase 1B Compose image build, migration startup, direct/proxied health and graceful
  offline Ollama state, workflow-link CRUD/search/delete, zero destination dereferences, dependency
  store isolation, and complete acceptance-project teardown.

These gates were repeated from the exact committed Phase 1B candidate, including migration
preservation, isolated Compose teardown, artifact/security review, and clean-Git audits.

Phase 1C final acceptance verifies:

- strict version 1 transfer manifests, normalization, deterministic projection, byte/record bounds,
  100-issue truncation, duplicate fingerprints, and sanitized errors;
- full export headers and ordering, mutation-free previews, fresh imported IDs/timestamps, repeated
  duplicate imports, one-transaction commit, and complete rollback on injected failures;
- browser contract validation, file and memory lifecycle, explicit download, import confirmation,
  uncertain-response handling, focus/live-region behavior, and no automatic retry;
- the fourth-view navigation guards, pending-operation blocking, responsive Transfer states, and
  Prompt/Workflow registry refresh after a successful import;
- zero destination dereferences throughout backend and browser transfer paths.

The exact corrective candidate `7b5ec9f` passed fresh dependency installation, formatting, 483
backend tests, 155 end-to-end tests, 293 frontend tests, lint, strict typechecks, production builds,
the reversible migration lifecycle, and isolated direct/proxied Compose transfer checks. Firefox
152.0.5 also passed the complete operator workflow and exact 320, 600, 601, and 1,280 px viewport
matrix. The acceptance stack, browser processes, temporary databases, and task-owned volumes were
removed, and the final scope/artifact audit found no dependency, schema, deployment, secret, remote,
or prohibited-capability drift.

## Security posture

- Host development ports bind to 127.0.0.1.
- There is no authentication.
- There is no Docker socket or Docker SDK access.
- There is no n8n API or API-key usage.
- Ollama requests ignore ambient proxy variables and use only explicit validated configuration.
- Real .env files, local databases, dependency directories, and common secret-file formats are ignored.
- Prompt list, detail, create, update, delete, and clipboard actions can expose or change sensitive local
  prompt data to any client that can reach the unauthenticated app.
- Workflow-link list/detail/write responses expose complete saved URLs, descriptions, tags, and
  timestamps to any client that can reach the unauthenticated app. Queries and fragments may contain
  sensitive local data even though URL user information is rejected.
- The Hub does not check destination health, fetch metadata, proxy, redirect, authenticate to n8n,
  or call a stored workflow URL. Open and Copy require explicit browser clicks and use persisted
  state only.
- Selected bundle bytes, parsed records, filenames, and previews stay in React memory for the active
  Transfer flow; they are not stored in browser persistence or a server-side staging table.
- Transfer responses use no-store/no-cache privacy headers. Import accepts only bytes from an
  explicitly selected local JSON file—not a filesystem path or URL—and neither preview, import, nor
  export dereferences a Workflow Link destination.
- Downloaded bundles are outside application control and are not encrypted or securely erased by
  the Hub. Browser history, filesystem permissions, backups, and deletion remain the operator's
  responsibility.

Read [Security Notes](docs/SECURITY_NOTES.md) before changing network exposure or integration scope.

## Current limitations

- Prompt version history, archive/restore, soft deletion, and secure deletion are not implemented.
- Hard-deleted prompts and workflow links cannot be restored by the app. Transfer imports append
  new records and provide no undo, replacement, or exact database restoration.
- Transfer has no merge, skip, deduplication, record selection, filtering, encryption, scheduled
  export, backup, synchronization, or restore workflow.
- Workflow links are generic references only. Provider discovery, n8n IDs/API calls, reachability,
  execution state, synchronization, previews, and remote mutation are not implemented.
- Ollama integration is observation-only; there is no run, pull, or delete action.
- n8n and container observability are not implemented.
- No authentication, multi-user support, production proxy, or public deployment profile exists.
- SQLite is intended for this local MVP, not concurrent multi-node deployment.
- Prompt content is raw text only; there is no Markdown rendering, templating, execution, or cloud sync.

## Roadmap to production-ready v1

1. **Phase 0 — Observable MVP (complete):** health, Ollama status/models, persistence foundation, dashboard, and Docker development.
2. **Phase 1A — Prompt Registry (complete):** prompt CRUD, server search, canonical tags, validation, and a protected editing workflow.
3. **Phase 1B — Workflow Links (complete):** dedicated local references, safe URL handling, CRUD/search/tags, guarded editing, and explicit persisted navigation.
4. **Phase 1C — Import/Export (complete):** bounded full-registry JSON export, non-mutating preview, and atomic append-only import.
5. **Phase 2 — Read-only integrations (next):** explicitly approved n8n and service/container visibility through constrained interfaces.
6. **Phase 3 — Safe administration:** authentication, authorization, audit history, and narrowly scoped actions.
7. **Phase 4 — Operational maturity:** backups, restore drills, CI, release artifacts, migration/upgrade tests, observability, and accessibility.
8. **Phase 5 — Hardened v1:** threat model, network deployment guidance, security review, stable APIs, versioning, and signed releases.

The project should be useful on a private localhost setup during Phases 1–2. Safe network exposure is a different standard and belongs around Phases 4–5.

## Project records

- [Architecture decisions](docs/DECISIONS.md)
- [Observed failures and resolutions](docs/FAILURES.md)
- [Security boundaries](docs/SECURITY_NOTES.md)
- [Chronological build log](history/BUILD_LOG.md)
- [Approved Phase 0 design](docs/superpowers/specs/2026-07-10-phase-0-mvp-design.md)
- [Phase 0 implementation plan](docs/superpowers/plans/2026-07-10-phase-0-mvp.md)
- [Approved Phase 1A Prompt Registry design](docs/superpowers/specs/2026-07-10-phase-1a-prompt-registry-design.md)
- [Phase 1A Prompt Registry implementation plan](docs/superpowers/plans/2026-07-10-phase-1a-prompt-registry.md)
- [Approved Phase 1B Workflow Links design](docs/superpowers/specs/2026-07-12-phase-1b-workflow-links-design.md)
- [Phase 1B Workflow Links implementation plan](docs/superpowers/plans/2026-07-12-phase-1b-workflow-links.md)
- [Approved Phase 1C Import/Export design](docs/superpowers/specs/2026-07-13-phase-1c-import-export-design.md)
- [Phase 1C Import/Export implementation plan](docs/superpowers/plans/2026-07-18-phase-1c-import-export.md)

## License

Local AI Workflow Hub is available under the [MIT License](LICENSE).

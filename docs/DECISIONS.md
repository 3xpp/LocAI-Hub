# Architecture Decisions

This file records decisions that materially shape Local AI Workflow Hub. Dates use the project timezone (Europe/Berlin). Revisit a decision through a new entry rather than silently rewriting its history.

## 2026-07-10 — Domain-oriented monorepo

**Decision:** Keep backend, frontend, tests, documentation, infrastructure, and project history in one repository with clear domain directories.

**Why:** Phase 0 crosses API contracts, browser behavior, persistence, and Docker networking. A monorepo makes those boundaries reviewable together while keeping each implementation unit focused.

**Consequence:** Backend uses uv under backend/; frontend uses pnpm under web/. Root Make targets orchestrate both.

## 2026-07-10 — Process environment without an application dotenv loader

**Decision:** Read DATABASE_URL and OLLAMA_BASE_URL from the process environment with safe local defaults. Python code does not open or parse .env.

**Why:** This avoids another dependency and reduces the chance of tools accidentally reading or displaying secret files.

**Consequence:** Local non-Docker users export overrides through their shell or service manager. Docker Compose may use its standard ignored .env behavior.

## 2026-07-10 — Expected Ollama failures return HTTP 200 state

**Decision:** Ollama status and model endpoints return HTTP 200 for connection failures, using explicit online/error fields and an empty model array when necessary.

**Why:** A missing Ollama process is a normal local dashboard condition, not proof that the Hub API itself failed.

**Consequence:** Frontend code must inspect payload fields. A reachable empty inventory is models=[] with error=null; an unavailable inventory has a non-null error.

## 2026-07-10 — Read-only Ollama tags endpoint

**Decision:** Use only Ollama's GET /api/tags operation for reachability and model discovery.

**Why:** Phase 0 is observational. Pulling, deleting, running, or changing models would create an administrative and security boundary outside the MVP.

**Consequence:** Status and inventory currently make separate short requests. Connection, timeout, HTTP, and malformed-payload failures are normalized into fixed messages.

## 2026-07-10 — Fail-closed Ollama URL handling

**Decision:** Accept only credential-free HTTP or HTTPS origins with a host and root path. Reject user information, queries, fragments, non-root paths, invalid ports, surrounding whitespace, and malformed URLs. Disable httpx environment-proxy inheritance.

**Why:** Reflecting a credential-bearing URL could expose secrets, and ambient proxy variables could route local metadata outside the intended machine.

**Consequence:** Invalid configuration is never requested or echoed. The status API displays Invalid configuration and returns Invalid Ollama base URL.

## 2026-07-10 — Vite same-origin proxy instead of broad CORS

**Decision:** Browser code calls relative /health and /api paths. Vite proxies those paths to FastAPI in local and Compose development.

**Why:** This keeps the browser contract deployment-neutral and avoids enabling permissive cross-origin access in an unauthenticated admin-adjacent tool.

**Consequence:** A future production deployment must deliberately design its origin, authentication, TLS, and proxy policy.

## 2026-07-10 — SQLAlchemy 2 and Alembic from the first schema

**Decision:** Establish typed SQLAlchemy mappings and a reversible initial Alembic migration even though prompt endpoints are deferred.

**Why:** Schema creation through migrations is repeatable, inspectable, and safer to evolve than implicit table creation.

**Consequence:** The initial Prompt schema is now an approval boundary. Future schema changes require explicit user approval and a migration.

## 2026-07-10 — Minimal Prompt foundation

**Decision:** Prompt contains id, title, content, nullable plain-text tags, created_at, and updated_at. Phase 0 adds no prompt HTTP endpoints.

**Why:** This is the smallest persistence foundation for the planned registry. Relations, structured tags, versioning, and CRUD validation would expand the MVP.

**Consequence:** Prompt CRUD, search, import/export, and UI belong to Phase 1.

## 2026-07-10 — UTC-aware ORM timestamps on SQLite

**Decision:** Use a focused UTCDateTime SQLAlchemy type that requires aware input, normalizes it to UTC, and restores UTC metadata after SQLite returns a naive value.

**Why:** SQLite does not preserve timezone metadata even when SQLAlchemy declares DateTime(timezone=True).

**Consequence:** ORM reads are UTC-aware across supported Phase 0 paths. Metadata and the migration share CURRENT_TIMESTAMP server defaults, and Alembic compares those defaults for drift.

## 2026-07-10 — Plain React and CSS dashboard

**Decision:** Use React, TypeScript, and plain CSS without a UI component library, remote font, or state-management dependency.

**Why:** The Phase 0 interface is small, and the project should demonstrate intentional frontend craft without unnecessary runtime weight.

**Consequence:** The dashboard uses a local industrial control-room visual system, semantic components, reduced-motion support, WCAG AA compact-text contrast, and strict compiler/lint/build gates.

## 2026-07-10 — Runtime validation at the browser API boundary

**Decision:** Validate every health, Ollama status, model-list, and nested model field before data reaches React components.

**Why:** TypeScript types do not validate JSON at runtime. A parseable but malformed response must become a contained card error rather than a rendering crash.

**Consequence:** Invalid JSON and invalid shapes produce the fixed frontend message Backend returned an invalid response.

## 2026-07-10 — Development-only Docker Compose

**Decision:** Publish services only on host loopback, keep containers development-oriented, persist SQLite in a named volume, and route host Ollama through host.docker.internal with Linux host-gateway support.

**Why:** Compose should make the repository easy to evaluate without pretending to be a production or public deployment.

**Consequence:** Containers listen on 0.0.0.0 only inside their network; host publishing remains 127.0.0.1. There is no reverse proxy, TLS, auth, privileged mode, or Docker socket mount.
API and web startup synchronize their locked dependency environments into named development volumes;
the first web sync after a lock change may require package-registry access.

## 2026-07-10 — No Docker or n8n administration in Phase 0

**Decision:** Do not add Docker SDK/socket access, n8n API keys, n8n calls, workflow mutation, container restart controls, or arbitrary command execution.

**Why:** Each creates a high-impact administrative boundary that requires dedicated authentication, authorization, audit, and threat-model work.

**Consequence:** Future integration work begins read-only and requires explicit approval.

## 2026-07-10 — Human-readable build journal

**Decision:** Update history/BUILD_LOG.md in the same commit as every implementation milestone.

**Why:** Git provides exact diffs; the journal gives the user a concise narrative of what changed, why, and which checks passed.

**Consequence:** The journal records outcomes and safe summaries, never secrets, full environment dumps, or sensitive command output.

## 2026-07-10 — Local usefulness and production readiness are separate

**Decision:** Track six product phases from observable MVP to hardened v1. Treat private localhost usefulness as an earlier target than network-exposed production.

**Why:** Authentication, operational recovery, release engineering, and security review cannot be inferred from a development dashboard that happens to run in containers.

**Consequence:** Phase 1–2 may be useful for private daily use. Network deployment guidance is deferred until the Phase 4–5 security and operations work exists.

## 2026-07-11 — Canonical prompt tags without a schema change

**Decision:** Expose tags as string arrays while continuing to store them in the existing comma-delimited Prompt text column. Normalize whitespace, apply deterministic Unicode case folding, reject commas and control characters, preserve first-occurrence order, and deduplicate before persistence.

**Why:** Phase 1A needs predictable tags without changing the approved Phase 0 schema. The canonical codec keeps the existing column usable while making API and browser behavior consistent.

**Consequence:** A prompt has at most 10 tags of at most 30 Unicode characters each. API responses use canonical tags; legacy null and empty values remain readable as an empty array. Tags containing commas cannot be represented until a future approved schema design replaces the text codec.

## 2026-07-11 — Server-filtered prompt registry

**Decision:** Perform prompt search, exact canonical-tag filtering, counting, deterministic ordering, and offset pagination in the backend. List responses contain summaries with bounded content previews; full content is returned only by single-prompt routes.

**Why:** Loading every full prompt into the browser would expose more content than the registry view needs and would not scale with a growing local collection.

**Consequence:** The list contract accepts `q`, `tag`, `limit`, and `offset`; search and tag filters combine with AND. The browser cancels superseded requests and validates every list and detail response at runtime.

## 2026-07-11 — Explicit prompt persistence and permanent deletion

**Decision:** Keep edits in a local draft until Save or Ctrl/Cmd+S. Guard exits from dirty drafts, copy raw content only after an explicit click, and permanently delete one prompt only after a title-bearing confirmation dialog.

**Why:** Autosave and implicit clipboard access would make sensitive local prompt handling harder to reason about. A destructive action should be deliberate and clearly irreversible.

**Consequence:** There is no autosave, archive, soft delete, undo, or application-level recovery in Phase 1A. Prompt content is never rendered as Markdown or HTML. Operators must treat deletion as final and manage their own database-volume backups until Phase 1C designs portable import/export.

## 2026-07-11 — Development-only frontend behavior test tooling

**Decision:** Use Vitest, jsdom, and Testing Library as frontend development dependencies for Prompt Registry behavior tests.

**Why:** Dirty-draft guards, request cancellation, keyboard save, clipboard feedback, mobile navigation, and deletion confirmation are stateful behaviors that type checking and a production build cannot verify.

**Consequence:** The browser production dependency set remains React and React DOM. Prompt UI commits must run `make test-web` in addition to frontend lint, typecheck, and build checks appropriate to the change.

## 2026-07-11 — Explicit frontend process configuration

**Decision:** Set `envDir: false` in both Vite and Vitest configuration. Development proxy and bind
overrides come only from explicit process environment variables.

**Why:** Automatic frontend `.env` loading is unnecessary for the two safe development overrides and
would weaken the project's rule that application tooling must not open local secret files.

**Consequence:** Vite and Vitest do not load `.env*` files. Docker Compose retains its separately
documented standard environment-file behavior, and acceptance commands select `/dev/null` explicitly.

## 2026-07-12 — Dedicated WorkflowLink reference domain and additive migration

**Decision:** Store workflow references in a dedicated `workflow_links` table and expose them under
`/api/workflow-links`. Use the explicitly approved additive `0002_create_workflow_links` migration;
leave the existing Prompt mapping and `0001_create_prompts` revision unchanged.

**Why:** A browser bookmark with local context is not a Prompt and is not a remotely managed
workflow. A separate domain keeps validation, search, future export records, and provider
integrations reviewable without overloading either the Prompt table or a premature generic-resource
abstraction.

**Consequence:** WorkflowLink contains id, title, URL, description, plain-text canonical tags, and
UTC-aware created/updated timestamps. The five-route API supports complete CRUD, server search,
exact tag filtering, deterministic pagination, duplicates, and permanent single-record deletion.
Migration tests prove Prompt data survives upgrade and downgrade between revisions 0001 and 0002.

## 2026-07-12 — Reference-only URL profile and explicit destination navigation

**Decision:** Accept only absolute HTTP(S) workflow URLs with a valid ASCII DNS/punycode host,
canonical IPv4 address, or bracketed IPv6 address and valid optional port. Reject user information,
unsafe schemes, Unicode host spelling, whitespace/control characters, backslashes, malformed
authorities and ports, and ambiguous noncanonical numeric hosts. Preserve allowed paths, query
strings, and fragments without inspecting or dereferencing them.

**Why:** Homelab references need localhost, private addresses, deep paths, and provider-specific
queries, but turning stored input into a backend request, redirect, preview, or implicit browser
navigation would cross a materially different security boundary.

**Consequence:** List and detail responses expose the complete URL to any client that can reach the
unauthenticated local API, so query strings and fragments must be treated as potentially sensitive.
Rendering, selection, search, editing, save, copy, and deletion never request a destination. A persisted URL
becomes an Open anchor only after backend and browser validation; it requires an explicit click and
uses a new tab with `noopener noreferrer` and `referrerPolicy="no-referrer"`. Copy likewise uses only
the exact persisted URL, never a dirty draft.

## 2026-07-12 — Flexible canonical tags and provider integration deferral

**Decision:** Reuse the canonical tag contract for Workflow Links and do not add provider/category
columns, n8n identifiers, remote status, credentials, synchronization state, or SDK/API calls.

**Why:** Tags such as `n8n`, `grafana`, `repository`, or `docs` organize a mixed local directory
without making the schema provider-specific or implying that the Hub can inspect or control a
destination.

**Consequence:** Workflow links allow at most 10 canonical tags of at most 30 Unicode characters,
stored through the shared plain-text codec and filtered exactly. Provider-aware discovery and
read-only n8n/service visibility remain separately approved Phase 2 work; remote workflow mutation
requires a later authentication, authorization, audit, and threat-model design.

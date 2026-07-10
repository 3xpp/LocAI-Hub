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

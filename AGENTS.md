# AGENTS.md

## Project

Local AI Workflow Hub is a local-first dashboard for observing a developer's local AI automation stack. Keep changes small, safe, and organized by backend, frontend, infrastructure, tests, and documentation domains.

## Tooling

- Use uv as the backend package manager.
- Use pnpm as the frontend package manager.
- Do not substitute pip, Poetry, npm, or yarn.

## Required checks

- Run backend tests before committing backend changes.
- Run frontend typecheck before committing frontend changes.
- Run the relevant lint commands for every changed domain.
- Update history/BUILD_LOG.md in every implementation milestone.

## Approval boundaries

Ask before:

- adding any new runtime dependency;
- changing the database schema after the initial Phase 0 schema;
- touching authentication or authorization;
- adding Docker socket access or Docker SDK usage;
- using n8n API keys or adding n8n API integration;
- changing deployment or production configuration.

## Safety

- Never read, print, edit, or commit .env or real secret files.
- Never commit credentials, tokens, password hashes, local databases, or generated dependency directories.
- Keep development services bound to localhost by default.

## Documentation and Git

- Keep docs/DECISIONS.md, docs/FAILURES.md, docs/SECURITY_NOTES.md, and history/BUILD_LOG.md current.
- Use conventional commit messages.
- Do not push unless the user explicitly asks.

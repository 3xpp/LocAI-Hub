# Local AI Workflow Hub Phase 1A Prompt Registry Design

**Date:** 2026-07-10

**Status:** Approved; implementation complete

**Sequence:** Phase 1A of 1A Prompt Registry → 1B Workflow Links → 1C Import/Export

## Summary

Phase 1A turns the Phase 0 Prompt persistence foundation into a complete local prompt registry. A developer can create, search, filter, inspect, edit, copy, and permanently delete reusable prompts through a tested API and a responsive split-registry interface.

The feature remains local-first and deliberately avoids Markdown rendering, autosave, prompt execution, cloud providers, authentication, workflow links, and import/export. Phase 1B and 1C will receive separate specifications after Phase 1A is implemented and verified.

## Goals

- Deliver complete single-prompt CRUD through stable FastAPI contracts.
- Search title, content, and tags without loading the whole registry into the browser.
- Filter by exact normalized tags and paginate deterministic results.
- Present a fast split registry for browsing and editing.
- Protect unsaved work and require confirmation before permanent deletion.
- Copy prompt content only through an explicit user action.
- Validate untrusted request and response shapes at API boundaries.
- Add backend and frontend behavior tests appropriate for the increased UI complexity.
- Reuse the existing Prompt table without a schema migration.
- Keep the build journal, decisions, failures, security notes, and setup guide current.

## Non-goals

Phase 1A will not include:

- workflow links or a workflow persistence model;
- JSON import, export, backup, or restore;
- Markdown or HTML rendering;
- prompt variables, templating, execution, or Ollama generation;
- prompt version history, archive/restore, or soft deletion;
- bulk editing or bulk deletion;
- folders, sharing, synchronization, or cloud storage;
- authentication, authorization, or public deployment configuration;
- autosave;
- a client-side router or UI component library.

## Product Decisions

### Permanent deletion

Deletion is a single-item hard delete. The UI shows the prompt title and requires explicit confirmation. There is no bulk delete. Phase 1C will later provide portable exports, but Phase 1A does not imply that deleted data is recoverable.

### Raw text content

Prompt content is edited and displayed as raw text. It is never interpreted as Markdown or HTML. Copying uses the browser clipboard only after the operator clicks Copy.

### Split Registry

The desktop layout has a searchable registry rail on the left and a persistent detail/editor pane on the right. On narrow screens, the list transitions to a dedicated editor view with a Back action. The existing industrial local-control-room visual language remains intact.

### Explicit save

Creating or editing a prompt produces a local draft. Changes are persisted only through Save or Ctrl/Cmd+S. Navigating away from a dirty draft requires confirmation. The browser before-unload guard is enabled while a dirty draft exists.

## Architecture

~~~text
Prompt Registry React view
  |
  | runtime-validated JSON over relative /api paths
  v
FastAPI prompt routes
  |
  +--> prompt domain service
  |      - input normalization
  |      - tag codec
  |      - content preview
  |
  +--> prompt repository
         - CRUD
         - search/filter
         - count/pagination
         |
         v
      SQLAlchemy Session --> existing SQLite prompts table
~~~

The API route layer owns HTTP status codes and response models. The prompt service owns deterministic domain transformations. The repository owns database queries and transactions but does not know about HTTP. React components receive typed, runtime-validated data and do not interpret raw network payloads.

## Backend Components

### Prompt domain service

**backend/src/local_ai_hub/services/prompts.py** will provide pure functions for:

- normalizing a title and content;
- normalizing, validating, deduplicating, encoding, and decoding tags;
- generating a one-line content preview;
- converting a Prompt ORM object into API-oriented domain values where useful.

Tags follow this canonical contract:

- API input and output are arrays of strings.
- Leading and trailing whitespace is removed.
- Runs of whitespace collapse to one space.
- Values are case-folded to a canonical lowercase representation.
- Empty values, commas, and control characters are rejected.
- A prompt may have at most 10 tags.
- Each normalized tag may have at most 30 Unicode characters.
- Duplicates are removed while preserving first occurrence order.
- Persistence uses a comma-delimited string in the existing nullable tags column.
- New and updated records encode no tags as an empty string. The decoder treats both legacy null
  and empty strings as an empty API array.

The comma restriction makes the text codec unambiguous. Existing Phase 0 values such as writing,local remain readable.

Content previews collapse whitespace to single spaces, include at most 160 characters, and append an ellipsis only when truncated. Full content is never returned in a list summary.

### Prompt repository

**backend/src/local_ai_hub/db/repositories/prompts.py** will expose focused operations:

- list/count prompts with optional search and exact tag filter;
- retrieve one prompt by integer ID;
- create a prompt;
- update a prompt;
- delete a prompt.

All query values use SQLAlchemy expressions and bound parameters. Default ordering is updated_at descending, then id descending for deterministic ties.

Search behavior:

- q is trimmed; an empty value means no search filter.
- q is limited to 200 characters.
- title, content, and encoded tags are searched case-insensitively.
- tag is normalized with the same tag rules and matched as a complete delimiter-separated value.
- q and tag filters combine with AND.

Pagination:

- limit defaults to 50;
- limit must be 1–100;
- offset defaults to 0 and must be non-negative;
- list responses include total, limit, and offset;
- count uses the same search and tag filters as the item query.

### Session lifecycle

Routes use the existing get_db dependency. Create/update/delete operations commit once, refresh when a response body is needed, and roll back automatically through SQLAlchemy session cleanup if an exception escapes. Expected not-found conditions are handled before mutation.

## API Contracts

### List prompts

GET /api/prompts?q=&tag=&limit=50&offset=0

HTTP 200:

~~~json
{
  "items": [
    {
      "id": 12,
      "title": "Refactor review",
      "content_preview": "Review this code for correctness, clarity, and hidden edge cases…",
      "tags": ["code", "review"],
      "created_at": "2026-07-10T18:00:00Z",
      "updated_at": "2026-07-10T18:20:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
~~~

### Create a prompt

POST /api/prompts

~~~json
{
  "title": "Refactor review",
  "content": "Review this code for correctness, clarity, and hidden edge cases.",
  "tags": ["Code", "review", "code"]
}
~~~

HTTP 201 returns the normalized full prompt:

~~~json
{
  "id": 12,
  "title": "Refactor review",
  "content": "Review this code for correctness, clarity, and hidden edge cases.",
  "tags": ["code", "review"],
  "created_at": "2026-07-10T18:00:00Z",
  "updated_at": "2026-07-10T18:00:00Z"
}
~~~

Duplicate titles are allowed.

### Retrieve a prompt

GET /api/prompts/12

HTTP 200 returns the full prompt. A missing prompt returns HTTP 404 with the fixed detail Prompt not found.

### Update a prompt

PUT /api/prompts/12

The request body has the same title, content, and tags fields as create. PUT is a complete replacement of editable fields. HTTP 200 returns the normalized full prompt. A missing prompt returns HTTP 404.

### Delete a prompt

DELETE /api/prompts/12

HTTP 204 has no body. A missing prompt returns HTTP 404. Repeating a successful deletion therefore returns 404.

### Validation failures

FastAPI returns HTTP 422 for invalid query or body data. Validation messages may identify fields and constraints but never include unrelated prompt content, SQL, database URLs, or raw exceptions.

Unexpected persistence errors remain HTTP 500 and are not translated into successful responses. Application code does not log request bodies or prompt content.

## Validation Rules

- title: string, trimmed, 1–200 characters;
- content: raw string, 1–50,000 characters; leading/trailing content whitespace is preserved except an all-whitespace value is rejected;
- tags: array, default empty, at most 10 canonical values;
- q: optional string, trimmed, at most 200 characters;
- tag: optional single tag using canonical tag rules;
- prompt ID: positive integer;
- limit: 1–100;
- offset: zero or greater.

The API returns canonical values after create/update so the browser does not need to guess what was stored.

## Frontend Information Architecture

The masthead gains two view controls:

- Overview
- Prompts

No router dependency is added. The active view is local application state. Switching away from Prompts while a dirty draft exists requires confirmation.

### Registry rail

The left pane contains:

- New prompt;
- search input with a 250 ms debounce;
- active tag filter and removable filter chip;
- result count;
- prompt rows with title, preview, tags, and updated time;
- Load more when offset + loaded items is below total;
- empty, no-match, loading, and request-error states.

Search and tag requests cancel superseded fetches. A stale response must not replace a newer result. Creating, updating, or deleting refreshes the relevant list without discarding the current search unnecessarily.

### Editor pane

The right pane contains:

- create/edit mode label;
- title input;
- raw content textarea with character count;
- accessible tag-chip input;
- created/updated timestamps for persisted prompts;
- dirty/saving/saved/error status;
- Copy content;
- Save;
- Delete for persisted prompts.

Pressing Enter or comma in the tag input commits a tag, except a comma is never part of the tag. Backspace on an empty tag input removes the last tag. Tags are normalized in the browser for immediate feedback and validated again by the API.

Ctrl/Cmd+S submits a valid dirty draft. Copy is disabled for empty content. Clipboard success/failure is announced through a polite live region.

### Selection behavior

- Creating opens a blank draft in the editor.
- Selecting a row fetches the full prompt.
- On desktop, the first result may be selected automatically only when there is no dirty draft and no explicit current selection.
- On mobile, results remain in list mode until the operator selects or creates a prompt.
- Leaving a dirty draft through selection, New, Overview, Back, or browser close requires confirmation.
- After create, the returned prompt becomes the selected persisted record.
- After update, the selected record and list summary use the server response.
- After delete, the editor clears and the list refreshes.

### Confirmation dialog

Permanent deletion uses an accessible confirmation dialog containing the prompt title, an irreversible-action warning, Cancel, and Delete prompt. Confirmation is never triggered by a keyboard shortcut.

## Frontend API Boundary

Prompt request/response types and runtime parsers live in **web/src/api/prompts.ts**. The existing shared request behavior remains responsible for network, HTTP, invalid JSON, and abort handling.

Runtime parsers validate:

- all prompt summary fields;
- all full prompt fields;
- timestamp strings;
- tag arrays and item strings;
- list pagination metadata;
- successful no-content deletion.

Malformed payloads produce the fixed frontend error Backend returned an invalid response and never reach registry components.

## Frontend Components

Expected focused units:

- **PromptRegistry.tsx** — feature composition and responsive mode.
- **PromptList.tsx** — search/filter/results/pagination presentation.
- **PromptEditor.tsx** — draft form and editor actions.
- **TagInput.tsx** — accessible chip editing.
- **ConfirmDialog.tsx** — reusable explicit confirmation.
- **usePromptRegistry.ts** — async state, cancellation, selection, dirty protection, and mutation orchestration.

App.tsx remains responsible for top-level Overview/Prompts navigation and keeps the existing health dashboard isolated.

## Error and State Handling

- Registry-list failure does not erase a dirty editor draft.
- Detail failure shows a retryable editor error and does not treat the record as editable data.
- Save failure preserves every draft field.
- Delete failure leaves the selected prompt and draft intact.
- Validation maps field errors where possible and provides a safe form-level fallback.
- A 404 during detail/update/delete reports that the prompt no longer exists and offers a registry refresh.
- Aborted requests are silent.
- Copy failure is local UI state and never causes a network request.
- Confirmation cancellation causes no mutation.

## Accessibility

- View controls expose the active state.
- Search and form controls have explicit labels.
- Prompt results are a semantic list.
- Save, error, copy, and deletion outcomes use appropriate live regions.
- The editor follows a logical keyboard order.
- Focus moves to the title after New, to the editor heading after selecting on mobile, and back to the originating control after dialog cancellation.
- The deletion dialog traps focus through the native dialog behavior and closes on Escape.
- Status is never communicated by color alone.
- Reduced-motion preferences remain respected.

## Security and Privacy

- Prompt content is never rendered as HTML.
- API and frontend errors never include SQL, raw exceptions, database URLs, or unrelated prompt content.
- Search and tags use bound SQLAlchemy parameters.
- Request bodies are not logged.
- Clipboard access occurs only after a user click.
- Permanent deletion is explicit and single-item.
- The dashboard remains unauthenticated and localhost-only; existing public-exposure warnings remain.
- Docker socket, n8n, cloud AI, shell execution, and Ollama mutation remain out of scope.

## Testing Strategy

### Backend

Unit tests cover:

- tag normalization, validation, encoding, and decoding;
- preview generation;
- repository create/get/update/delete;
- search across title/content/tags;
- exact tag filtering;
- combined filters;
- count and pagination;
- deterministic ordering and updated timestamps.

End-to-end API tests cover:

- successful create/list/get/update/delete contracts;
- canonical response values;
- 201, 200, 204, 404, and 422 behavior;
- duplicate titles;
- query validation;
- pagination metadata;
- missing-record mutations;
- no prompt content in unexpected error responses where testable.

Tests use isolated temporary SQLite databases and dependency overrides. No test reads the developer database or needs Ollama/network access.

### Frontend

Add dev-only Vitest, Testing Library, user-event, and jsdom tooling. No runtime dependency is added.

Tests cover:

- prompt API runtime parsers;
- registry loading, empty, no-match, malformed, and network-error states;
- debounced search and stale-request cancellation;
- tag filtering and Load more;
- create/edit/save flows;
- normalization feedback;
- dirty navigation protection and before-unload registration;
- copy success/failure;
- confirmed and cancelled deletion;
- 404 mutation recovery;
- Ctrl/Cmd+S;
- mobile list/editor transitions where practical at component level.

Existing Ruff, mypy, pytest, ESLint, TypeScript, Vite build, Alembic drift, Docker build, and smoke gates remain required.

## Documentation and History

Phase 1A updates:

- README feature list, API table, limitations, validation, and roadmap status;
- docs/DECISIONS.md for registry architecture, tag codec, hard delete, and frontend test tooling;
- docs/FAILURES.md only for issues actually observed;
- docs/SECURITY_NOTES.md for prompt CRUD and deletion sensitivity;
- AGENTS.md only if a durable new rule emerges;
- history/BUILD_LOG.md in every implementation milestone.

## Delivery Milestones

1. Commit this approved Phase 1A design.
2. Add backend domain/repository tests and implementation.
3. Add tested CRUD/search/pagination API contracts.
4. Add prompt API client and frontend test harness.
5. Add split-registry browsing and editor flows.
6. Integrate responsive navigation, dirty protection, copy, and deletion.
7. Update documentation and build history.
8. Run full local/Docker acceptance and commit the validation record.

Each implementation milestone uses a conventional commit and leaves unrelated files untouched. Nothing is pushed without explicit instruction.

## Acceptance Outcome

Phase 1A is complete when a developer can create, find, filter, inspect, edit, copy, and deliberately delete local prompts; every network payload is validated; dirty work is protected; backend and frontend behavior tests pass; Docker and non-Docker flows remain functional; security documentation reflects prompt sensitivity and hard deletion; the build journal is current; and Git is clean.

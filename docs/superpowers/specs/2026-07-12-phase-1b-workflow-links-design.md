# Local AI Workflow Hub Phase 1B Workflow Links Design

**Date:** 2026-07-12

**Status:** Approved; implementation complete; final acceptance pending

**Sequence:** Phase 1B of 1A Prompt Registry → 1B Workflow Links → 1C Import/Export

**Schema approval:** The user explicitly approved additive Alembic migration
0002_create_workflow_links on 2026-07-12. The existing prompts table remains unchanged.

**Implementation:** The dedicated model/migration, five-route API, searchable registry, guarded
editor, persisted-only Open/Copy actions, and automated/real-browser behavior checks are complete.
The final repository-wide dependency, migration, Docker Compose, artifact, and clean-Git acceptance
pass remains pending.

## Summary

Phase 1B adds a local registry of browser references to the places where an operator's automation
lives: n8n workflow pages, dashboards, repositories, documentation, and local services. A workflow
link is a bookmark with context, not a remotely managed workflow. The Hub stores, searches, edits,
copies, and opens these references but never requests, inspects, authenticates to, executes, or
modifies their destinations.

The result is a third top-level Workflow Links view with complete local CRUD, search, exact tags,
pagination, guarded editing, explicit safe navigation, and permanent single-record deletion. It
uses a dedicated workflow_links table and /api/workflow-links contracts so future provider
integrations remain a separate domain.

## Goals

- Save useful HTTP or HTTPS workflow references in SQLite.
- Support complete single-record create, read, update, and permanent delete behavior.
- Search title, URL, description, and tags in the backend.
- Filter by an exact canonical tag and paginate deterministic results.
- Open only a persisted, validated destination after an explicit operator action.
- Copy a persisted URL only after an explicit operator action.
- Protect unsaved prompt and workflow-link drafts across every top-level navigation path.
- Validate untrusted request and response shapes before producing a browser link.
- Preserve the current localhost-only, unauthenticated development posture.
- Leave Phase 1C a clean, typed workflow-link contract to export and import.
- Add no runtime dependency, provider SDK, or remote service access.

## Non-goals

Phase 1B will not include:

- n8n API calls, API keys, workflow discovery, or workflow mutation;
- provider-specific IDs, credentials, state, execution history, or synchronization;
- destination reachability checks, health status, redirects, or server-side opening;
- link previews, metadata scraping, favicons, screenshots, iframes, or prefetching;
- arbitrary URL schemes, local file links, or custom application protocols;
- folders, favorites, manual ordering, bulk actions, archive, soft delete, or undo;
- a relationship between workflow links and prompts;
- authentication, authorization, public deployment, or production proxy configuration;
- a client-side router, UI component library, or new runtime dependency;
- import, export, backup, restore, or conflict resolution, which belong to Phase 1C.

## Alternatives Considered

### Dedicated workflow-link registry with tags — selected

A focused WorkflowLink model, API, and view preserve domain clarity while tags provide lightweight,
flexible organization. This fits the existing Prompt Registry architecture and creates a stable
Phase 1C transfer contract without pretending that a saved reference is a live integration.

### Bare bookmarks without tags — rejected

This would reduce the initial field count, but it would become difficult to organize a mixed local
catalog and would not match the useful search and filtering baseline already established by Phase
1A.

### Provider-aware workflow records — deferred

Provider names, remote workflow IDs, status fields, API URLs, and execution metadata would bias the
schema toward n8n and invite credentials, remote calls, and health semantics. Read-only integrations
remain a separately approved Phase 2 concern.

### Browser-only or generalized resource storage — rejected

LocalStorage would bypass SQLite, Compose persistence, API consistency, and Phase 1C portability.
Overloading Prompt or introducing a generic resources table would mix unrelated validation and
search semantics before the product has enough domains to justify that abstraction.

## Product Decisions

### References, not integrations

The API name is /api/workflow-links rather than /api/workflows. A saved record does not imply that
the target exists, is online, belongs to n8n, or can be controlled by the Hub. An unreachable target
is still a valid saved reference.

### Flexible tags, no provider taxonomy

Records use the established canonical tag contract. Operators may add tags such as n8n, grafana,
repository, docs, or production-like, but the database has no provider or category column. This
avoids a fixed taxonomy while preserving exact filtering.

### Explicit persistence and navigation

Edits remain local until Save or Ctrl/Cmd+S. Open and Copy actions use the last persisted,
runtime-validated URL, never a partial unsaved draft. If the URL field differs from persisted state,
the UI explains that the new destination must be saved before it can be opened or copied.

### Permanent single-record deletion

Deletion is a hard delete with a title-bearing native confirmation dialog. There is no bulk delete,
undo, archive, or secure-erasure guarantee. Phase 1C portability does not make deleted records
recoverable unless the operator previously exported them.

### Duplicate references are valid

Titles and URLs are not unique. One destination may have several operator-specific entries, and
different destinations may share a familiar title. Ordering is updated_at descending and then id
descending.

## Architecture

~~~text
Workflow Links React view
  |
  | runtime-validated JSON over relative /api paths
  v
FastAPI workflow-link routes
  |
  +--> workflow-link domain service
  |      - title, URL, and description normalization
  |      - shared canonical tag codec
  |      - description preview
  |
  +--> workflow-link repository
         - CRUD
         - search/exact-tag filtering
         - count/pagination
         |
         v
      SQLAlchemy Session --> SQLite workflow_links table
~~~

Routes own HTTP status codes and response models. Pure services own normalization and serialization
rules. Repositories own bound database queries and transactions without knowing about HTTP. React
components receive typed data only after runtime validation and never turn an unvalidated string
into a link.

Prompt and workflow controllers remain separate because their drafts, fields, actions, and async
state will diverge. Small proven primitives such as tags and confirmation dialogs may be shared
after they are made domain-neutral and both domains retain regression coverage.

## Persistence Design

### WorkflowLink model

Migration 0002_create_workflow_links adds only the workflow_links table:

| Column | SQLite/SQLAlchemy shape | Contract |
| --- | --- | --- |
| id | INTEGER primary key | Positive generated identifier |
| title | VARCHAR(200), not null | Trimmed human-readable title |
| url | VARCHAR(2048), not null | Validated absolute HTTP(S) destination |
| description | TEXT, not null, SQL default empty string | Optional bounded plain text |
| tags | TEXT, not null, SQL default empty string | Canonical comma-delimited tags |
| created_at | UTCDateTime, CURRENT_TIMESTAMP | UTC-aware creation time |
| updated_at | UTCDateTime, CURRENT_TIMESTAMP | UTC-aware last mutation time |

The ORM reuses UTCDateTime, utc_now, and the existing timestamp behavior. Description and tags use
both Python-side empty-string defaults and SQL server defaults of ''. Title and URL have no default.
No index is added in Phase 1B: the expected local collection is small, and substring search across
several fields does not benefit from a conventional single-column index. There is no foreign key to
prompts.

The migration must:

- declare 0001_create_prompts as its down revision;
- create only workflow_links on upgrade;
- remove only workflow_links on downgrade;
- preserve existing prompt rows across upgrade and downgrade to revision 0001;
- remain drift-free under alembic check.

### Shared tag contract

The existing prompt tag rules become a domain-neutral pure codec while preserving compatible prompt
imports:

- at most 10 tags;
- at most 30 Unicode characters per tag;
- collapse internal whitespace and apply deterministic Unicode case folding;
- reject empty tags, commas, and control or format characters;
- stably deduplicate while preserving first-occurrence order;
- encode as a comma-delimited storage string and expose arrays over HTTP.

SQLite registers a domain-neutral canonical-tags function for exact filtering. Existing prompt
search behavior and stored values must remain unchanged through the refactor.

## Domain Validation

### Title

- Input type must be a string.
- Trim surrounding whitespace.
- Require 1–200 Unicode characters after trimming.

### URL

- Input type must be a string.
- Trim surrounding whitespace, then require 1–2048 characters.
- Require a case-insensitive http:// or https:// prefix containing the literal :// delimiter.
- Split the trimmed value with Python's urllib.parse.urlsplit in the backend and the browser URL
  constructor in TypeScript.
- Define the raw authority as the characters after :// and before the first slash, question mark, or
  number sign. Require a nonempty authority and reject any at sign in it, including empty userinfo.
- Require a nonempty ASCII hostname. Allow localhost, valid single-label or dotted DNS names,
  conservatively validated ASCII punycode names, canonical dotted-decimal IPv4, and bracketed IPv6.
- DNS labels must be 1–63 ASCII letters, digits, or internal hyphens, must not begin or end with a
  hyphen, the full DNS hostname must be at most 253 characters, and it must not end in a trailing
  dot. A host made only of digits and dots must pass Python's ipaddress.IPv4Address parser and use
  its canonical dotted-decimal spelling.
- IPv6 must use brackets in the raw authority and pass Python's ipaddress.IPv6Address parser without
  a zone identifier. Unicode hostnames must be entered in ASCII punycode form.
- Validate every xn-- DNS label independently with the already declared, locked httpx.URL value
  parser; no HTTP client or request is created. Require raw-label identity, a non-ASCII decoded
  label, canonical Punycode re-encoding, Unicode 3.2 assignment for every decoded code point, and
  Unicode-3.2 NFC stability.
- The frozen Unicode 3.2 rule deliberately rejects some modern-script IDNs that a current browser
  accepts. It preserves established multilingual domains while preventing the backend from emitting
  ACE labels that browser ICU/UTS46 versions may reject or reinterpret. Exact equivalence across all
  browser Unicode tables is not claimed.
- Allow omitted ports or decimal ports from 1 through 65535. Accessing the parsed port must not
  raise, and the raw port must contain digits only.
- Allow private-network hosts, paths, query strings, and fragments.
- Preserve the validated trimmed string rather than rewriting its path, query, fragment, or case.
- Reject relative and protocol-relative references.
- Reject javascript, data, file, blob, ftp, and custom schemes.
- Reject remaining whitespace, Unicode control or format characters, and backslashes before parsing.
- Reject every percent sign in the raw authority, malformed host syntax, unmatched IPv6 brackets,
  noncanonical numeric-host forms, malformed or out-of-range ports, and every value outside the
  backend's conservative browser-stable subset.

The backend is authoritative and accepts a conservative subset. The frontend independently checks
scheme, authority, userinfo, characters, numeric hosts, ports, and its actual browser URL parser
before producing an anchor. It does not need to reproduce the backend's stricter Unicode-age
policy; it must fail closed whenever its browser cannot represent a backend-emitted value safely. A
committed JSON fixture corpus defines common accepted/rejected edge cases for Python and TypeScript,
and every shared fixture produces the same decision. Backend-only tests document deliberate
rejection of otherwise browser-valid post-Unicode-3.2 labels.

Before emitting a database record, the backend also validates that its ID is positive, title/URL/
description equal their canonical normalized forms, tags equal the canonical codec output, and both
timestamps are timezone-aware datetimes. Corrupt stored data returns the fixed operation-failed
response rather than being repaired or partially exposed.

The project does not heuristically search query parameter names for secrets. That would produce
false confidence. Documentation and field help instead warn that the complete URL is stored,
returned to every client that can reach the unauthenticated API, copied on request, and later
eligible for Phase 1C export. Credentials, signed URLs, and API tokens must not be saved.

### Description

- Omitted input defaults to an empty string.
- Trim surrounding whitespace while preserving internal text and line breaks.
- Allow an empty result.
- Limit to 5,000 Unicode characters.
- Render only as text; never interpret Markdown or HTML.
- Collapse whitespace for list previews. An empty description has an empty preview. A nonempty
  preview contains at most 160 Unicode code points, followed by one ellipsis only when truncated.

### Search and pagination

- q is optional, trimmed, and at most 200 characters; empty input means no query.
- tag uses the shared exact canonical tag contract.
- limit defaults to 50 and accepts 1–100.
- offset defaults to 0 and must be nonnegative.
- Search uses Unicode-aware case folding across title, URL, description, and canonical tags.
- Percent, underscore, and backslash remain literal search characters through explicit LIKE
  escaping and bound SQLAlchemy values.
- q and tag combine with AND.

## HTTP API

### List workflow links

GET /api/workflow-links?q=&tag=&limit=50&offset=0

Returns HTTP 200:

~~~json
{
  "items": [
    {
      "id": 7,
      "title": "Nightly repository summary",
      "url": "http://localhost:5678/workflow/abc",
      "description_preview": "Collects repository activity for the local dashboard.",
      "tags": ["n8n", "repository"],
      "created_at": "2026-07-12T00:00:00Z",
      "updated_at": "2026-07-12T00:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
~~~

Summaries include the validated URL so the list can show a destination origin, but omit the full
description. Results use deterministic updated_at DESC, id DESC ordering.

### Create a workflow link

POST /api/workflow-links

~~~json
{
  "title": "Nightly repository summary",
  "url": "http://localhost:5678/workflow/abc",
  "description": "Collects repository activity for the local dashboard.",
  "tags": ["n8n", "repository"]
}
~~~

Title and URL are required. Omitted description and tags default to an empty string and empty array.
The route returns the canonical full record with HTTP 201. Unknown fields are rejected.

### Retrieve a workflow link

GET /api/workflow-links/{workflow_link_id}

Returns the full canonical record with HTTP 200 or the fixed HTTP 404 response:

~~~json
{"detail": "Workflow link not found"}
~~~

### Replace a workflow link

PUT /api/workflow-links/{workflow_link_id}

Title and URL are required. Description and tags retain their empty defaults, so omitting either on
PUT deliberately clears that field. The route returns the canonical full record with HTTP 200 or
the same fixed 404.

### Delete a workflow link

DELETE /api/workflow-links/{workflow_link_id}

Returns HTTP 204 with no body. A repeated delete returns the fixed 404. The API itself cannot prove
that a human confirmed deletion; the browser owns the confirmation interaction.

### Safe errors

- IDs must be positive integers.
- Invalid bodies and query values return sanitized HTTP 422 details containing field locations and
  fixed validation messages but not submitted titles, URLs, descriptions, or search text.
- Missing items return only the fixed 404 message.
- Expected validation does not become HTTP 500.
- Every route catches SQLAlchemy persistence failures and invalid stored workflow-link data, attempts
  to roll back its session, and returns the fixed HTTP 500 response
  {"detail": "Workflow link operation failed"} without logging or chaining the caught exception.
  A rollback failure is also suppressed so it cannot replace the fixed response. Responses and
  application logs must not contain raw exceptions, SQL, bound parameters, database locations,
  request bodies, or link contents.
- The application installs an idempotent filter on the Uvicorn access logger that replaces the
  complete query string with ?<redacted> before formatting. Method, path, HTTP version, and status
  remain observable, but q, tag, and future query values do not enter development logs. External
  proxies or process supervisors remain outside this development profile and require their own
  redaction policy.

## Repository Behavior

The focused workflow-link repository provides:

- list_workflow_links with count, optional search, exact tag, limit, and offset;
- get_workflow_link;
- create_workflow_link;
- update_workflow_link;
- delete_workflow_link.

Each mutation commits exactly once and refreshes returned records where needed. Collection count and
items use identical filters. Search is implemented with bound SQLAlchemy expressions and explicit
LIKE escaping. The route boundary owns rollback and the fixed response for repository failures. The
repository has no URL parsing, HTTP status, provider, or network behavior.

## Frontend Design

### Top-level navigation

The masthead becomes Overview, Prompts, and Workflows. App navigation is centralized through one
navigateTo function:

- leaving Prompts consults the Prompt Registry discard guard;
- leaving Workflows consults the Workflow Links discard guard;
- cancellation leaves the active view and draft untouched;
- approval discards only the active draft and changes views;
- selecting the already active view is a no-op.

No client-side router is introduced. At 600 px and below, the masthead uses a two-row layout with the
three view buttons spanning a full-width second row and providing at least 44 px touch targets.

### Workflow Links view

The page keeps the proven desktop split of a compact directory rail and a larger workbench while
using a distinct local route-map treatment:

- kicker: Local map · Reference control 02;
- heading: Workflow links;
- description: Index the places your local automation lives. The Hub stores references only—it
  does not inspect, execute, or modify them;
- footer: Local SQLite registry // Reference only // Phase 01B.

Rows show title, validated destination origin, bounded description preview, tags, and updated time.
They use a semantic list. Row selection and destination opening remain separate controls; no anchor
is nested inside a row-selection button. The UI fetches no favicon or destination metadata.

### Directory states

The directory provides:

- debounced free-text search;
- one exact tag filter with a removable active chip;
- deterministic Load more pagination;
- safe desktop first-record selection only in true standby, with no draft, selection, or active
  detail request;
- no automatic selection on mobile;
- initial loading, background refresh, empty registry, filtered empty, and retryable error states.

A list failure never destroys a loaded detail or dirty draft. Superseded searches, pages, and detail
requests are aborted or ignored through explicit generation ownership. Late completions cannot
replace a newer selection.

### Editor states and fields

The workbench supports standby, new draft, detail loading, loaded edit, missing detail, retryable
detail error, saving, and deleting states. Fields are:

- Title;
- URL, using a labeled URL input with URL-oriented keyboard hints and disabled autocorrection;
- Description, using a raw-text textarea;
- Tags, using the shared controlled tag input;
- Created and updated timestamps for persisted records.

Save is explicit and supports Ctrl/Cmd+S. Client validation mirrors length and required-field
constraints for immediate feedback, while the server response remains authoritative. Save failures
preserve title, URL, description, canonical tags, and the pending tag buffer.

### Open and Copy

Open saved link is an explicit anchor shown only for a persisted record whose server URL passed
runtime validation. It uses:

- target="_blank";
- rel="noopener noreferrer";
- referrerPolicy="no-referrer";
- an accessible destination label and visible origin.

Copy saved URL writes the exact persisted URL to the clipboard only after a click and reports
success or failure through a polite live region. New records have neither action. When the URL draft
is dirty, both actions continue to refer to the clearly labeled saved destination and the editor
states that Save is required before the new value can be opened or copied.

Rendering, selecting, searching, editing, or saving a link causes no request to its destination.
There is no backend redirect endpoint and no window.open call.

### Dirty-state protection

Dirty means any editable field differs from the last canonical server response, including a
nonempty pending tag buffer. One workflow discard guard covers:

- selecting another workflow link;
- starting a new link;
- mobile Back;
- navigating to Overview or Prompts;
- missing-record recovery;
- browser beforeunload.

The existing prompt guard receives regression coverage for navigating to Workflows. Pending
mutations cannot be abandoned while their persistence outcome is uncertain.

### Deletion and focus

The native confirmation dialog becomes a tested domain-neutral component with explicit heading,
subject title, explanation, confirm label, pending label, and unique accessible IDs. It retains safe
initial Cancel focus, Escape handling, pending-state locking, and focus restoration.

Successful deletion removes the item, announces the outcome, and restores focus to a safe adjacent
row or New link. Failure preserves the record and editor. A deletion 404 recovers to the directory
without claiming success. Double submission is prevented.

### Responsive and accessible behavior

At 600 px and below, the directory and workbench become exclusive panes. Selecting a record or New
link moves to the editor and focuses the settled editor heading or first invalid field. Back returns
focus to the originating row or New link. Long URLs, origins, titles, and tags wrap without
horizontal overflow at 320 px.

All fields have visible labels and associated descriptions. Loading and successful actions use
polite status regions; actionable failures use alerts. Category or status is never communicated by
color because neither concept exists in this phase. Existing focus-visible, contrast, touch-target,
and reduced-motion rules remain in force.

## Frontend Component Boundaries

Add focused workflow modules:

- web/src/api/workflowLinks.ts;
- web/src/features/workflows/WorkflowRegistry.tsx;
- web/src/features/workflows/WorkflowList.tsx;
- web/src/features/workflows/WorkflowEditor.tsx;
- web/src/features/workflows/useWorkflowRegistry.ts;
- focused tests beside the API and feature modules.

Move TagInput and ConfirmDialog to a small shared registry-components location only after their
public props become domain-neutral and prompt regressions pass. Do not generalize the complete
Prompt Registry controller or repositories into universal CRUD abstractions.

## Security Boundaries

- The application never issues a backend or automatic browser request to a stored URL.
- There is no open-redirect route, proxy route, destination health check, provider SDK, or n8n call.
- Only absolute HTTP(S) URLs without URL userinfo may become persisted anchors. Query strings and
  fragments are not inspected for credentials or signed tokens.
- Localhost and private IP destinations are intentionally allowed for homelab navigation.
- Userinfo, unsafe schemes, malformed authorities, noncanonical numeric hosts, invalid ports,
  control characters, whitespace, and backslashes fail closed.
- URL, title, and description are rendered as text or form values, never HTML or Markdown.
- Open and clipboard actions require explicit clicks and use only canonical persisted state.
- The complete URL is sensitive local data and is exposed through the unauthenticated local API.
- No request body, raw exception, upstream response, SQL statement, or link content is logged.
- Development host publishing remains bound to 127.0.0.1.
- No Docker socket, privileged mode, n8n key, cloud AI key, auth, or deployment change is added.

## Testing Strategy

### Domain tests

- Title, description, query, and tag normalization and every length boundary.
- Accepted localhost, ASCII hostname, punycode, canonical IPv4, bracketed IPv6, port, path, query,
  and fragment URLs.
- Rejected relative, protocol-relative, unsafe-scheme, userinfo, whitespace/control, backslash,
  Unicode-host, noncanonical-numeric-host, malformed-host, malformed-port, out-of-range-port, and
  oversized URLs.
- One committed URL fixture corpus passes identically through Python and TypeScript validators.
- Description preview collapsing and truncation.
- Shared tag behavior remains identical for prompts.

### Repository tests

- CRUD, UTC-aware timestamps, duplicates, deterministic ordering, and one-commit mutations.
- Search across title, URL, description, and tags.
- Unicode case folding and literal percent, underscore, and backslash behavior.
- Exact tag filtering, partial-tag nonmatches, combined filters, and pagination/count agreement.
- Defensive handling of malformed legacy tag fragments.

### API tests

- Complete 201/200/204 lifecycle and repeated-delete 404.
- Summary/full-response boundaries and optional defaults.
- Search, exact tag, combined filters, pagination metadata, and ordering.
- Fixed missing-record responses.
- Unknown fields and invalid body, query, and ID boundaries.
- Submitted URLs, descriptions, and query markers never appear in validation or server errors.
- Persistence failures roll back and produce only the fixed HTTP 500 body; response and caplog
  assertions prove that SQL, parameters, raw exceptions, and record content do not leak.
- A directly corrupted stored URL fails closed with the same fixed HTTP 500 instead of becoming a
  list or detail response.
- Corrupt persisted ID, title, description, tags, or timestamps fail through the same fixed boundary,
  and a rollback failure cannot replace or leak through that response.
- A real Uvicorn loopback request proves workflow search and tag values are absent from formatted
  access logs.
- No test needs a live destination, Ollama, or n8n.

### Migration tests

- Upgrade an existing 0001 database containing a prompt to 0002.
- Assert exact workflow_links columns, nullability, defaults, and current head.
- Confirm the prompt row survives upgrade and downgrade from 0002 to 0001.
- Confirm workflow_links disappears at 0001 while prompts remains.
- Confirm downgrade to base still removes prompts.
- Run alembic check against a disposable database and require no drift.

### Frontend tests

- Runtime validation accepts canonical responses and rejects unsafe URLs or malformed fields.
- Request builders encode q, tag, pagination, CRUD bodies, and 204 deletion correctly.
- Loading, empty, filtered-empty, error/retry, background refresh, and pagination behavior.
- Search debounce, exact-tag filtering, clearing, cancellation, and stale-completion protection.
- Safe desktop auto-selection, mobile no-auto-selection, and detail 404 recovery.
- Create/update response adoption and failure preservation for every field and pending tag.
- Explicit save, keyboard save, saved-link copy, and safe-anchor attributes.
- No render or interaction automatically requests a stored destination.
- Dirty selection, New, Back, top-level navigation, and beforeunload guards.
- Prompt-to-Workflow and Workflow-to-Prompt/Overview navigation in both directions.
- Delete cancel, Escape, success, error, 404, duplicate-click protection, announcement, and focus.
- Mobile settled focus, keyboard flow, reduced motion, and no horizontal overflow at 320 px.
- Special characters remain text and never become HTML.

### Acceptance gates

- make install;
- make test;
- make test-e2e;
- make test-web;
- make lint;
- make typecheck;
- Ruff format verification;
- frontend production build;
- migration upgrade, downgrade, prompt-preservation, and drift checks on disposable SQLite;
- Docker image build;
- Compose direct and proxied health plus workflow-link CRUD/search/delete smoke;
- real Firefox desktop/mobile workflow-link exercise;
- artifact, secret, prohibited-capability, and final clean-Git audits.

## Documentation

The implementation updates:

- README features, API table, setup behavior, limitations, roadmap, and security warning;
- docs/DECISIONS.md with the reference-only model, URL boundary, and additive schema decision;
- docs/SECURITY_NOTES.md with stored URL exposure, explicit navigation, and no-dereference guarantees;
- docs/FAILURES.md only for failures actually observed during implementation or validation;
- AGENTS.md so workflow UI changes run frontend behavior tests;
- history/BUILD_LOG.md in every implementation milestone.

## Phase 1C Compatibility

Phase 1C will export and import typed API-level records rather than SQLite rows. It should introduce
a versioned manifest and a record discriminator, reuse this exact URL and tag validation, and never
dereference imported destinations. Database IDs are local implementation details and need not be
portable for transfer-oriented import/export. Stable UUIDs, exact backup semantics, merge policy,
duplicate handling, and atomic import behavior remain Phase 1C design decisions.

## Completion Criteria

Phase 1B is complete when:

- migration 0002 is reversible, preserves prompts, and has no Alembic drift;
- all five workflow-link routes obey the documented validation and safe-error contracts;
- the browser provides searchable, tag-filtered CRUD and explicit safe navigation;
- no stored destination is contacted without an explicit operator click;
- dirty prompt and workflow drafts survive every canceled navigation path;
- deletion, copy, async races, mobile focus, and 320 px layout have direct behavior coverage;
- full backend, frontend, build, Docker, Compose, browser, artifact, and security gates pass;
- documentation and chronological history match the implemented state;
- every milestone is conventionally committed and final Git status is clean.

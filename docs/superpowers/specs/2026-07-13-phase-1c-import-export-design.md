# Local AI Workflow Hub Phase 1C Import/Export Design

**Date:** 2026-07-13

**Status:** Approved; implementation complete, final acceptance pending

**Sequence:** Phase 1C of 1A Prompt Registry → 1B Workflow Links → 1C Import/Export

**Schema impact:** None. Phase 1C transfers typed API-level records and does not add identifiers,
columns, tables, indexes, or an Alembic revision.

## Summary

Phase 1C adds a portable, local-only JSON transfer path for the Prompt and Workflow Link registries.
An operator can download one versioned bundle, preview a selected bundle without changing SQLite,
and explicitly confirm an atomic append-only import. Existing records are never updated or removed.

The transfer format contains editable domain data rather than SQLite rows. Database identifiers and
per-record timestamps remain local implementation details; imported records receive new local IDs
and timestamps. The server reuses the existing Prompt, Workflow Link, URL, and tag contracts,
reports exact duplicates without blocking them, and never dereferences a workflow destination.

The selected approach prioritizes predictable local portability without introducing schema
migration, merge identity, destructive restore semantics, or a new runtime dependency.

## Goals

- Export every saved Prompt and Workflow Link into one versioned JSON bundle with deterministic
  record ordering.
- Preview an uploaded bundle without mutating either registry.
- Import a valid non-empty bundle in one all-or-nothing transaction across both tables.
- Preserve all existing records and append every valid incoming record.
- Warn about exact duplicates while keeping duplicate records valid.
- Reuse the existing write normalization and validation contracts.
- Enforce bounded request, record, and validation-issue limits.
- Keep untrusted bundle data in browser memory only for the active transfer flow.
- Return safe errors that identify locations without reflecting prompt content or full URLs.
- Keep exports intentionally operator-triggered and mark responses as non-cacheable.
- Preserve localhost-first operation and the existing unauthenticated development posture.
- Add no database migration, runtime dependency, provider integration, or remote network behavior.

## Non-goals

Phase 1C will not include:

- stable UUIDs, portable database IDs, merge identity, or conflict resolution;
- updating, overwriting, deleting, replacing, or restoring existing registry contents;
- skipping or deduplicating records during import;
- exact SQLite backup, timestamp restoration, or recovery guarantees;
- filtered, selected-record, incremental, or scheduled exports;
- ZIP, archive, SQLite, CSV, YAML, Markdown, or encrypted bundle formats;
- password protection, signing, checksums, provenance verification, or tamper evidence;
- remote URLs, remote file retrieval, network shares, or server-side filesystem paths;
- drag-and-drop as a required interaction;
- n8n API access, workflow execution, URL health checks, previews, or destination metadata;
- authentication, authorization, public exposure, or production deployment changes;
- browser persistence of selected files, parsed records, previews, or transfer history;
- undo, import history, audit-log persistence, soft delete, or automatic backups;
- a new UI component library, client router, database tool, or runtime dependency.

## Alternatives Considered

### Atomic append-only portable transfer — selected

The selected design validates an entire bundle, warns about exact duplicates, then inserts every
record in one transaction while preserving existing data. It uses current local database IDs and
requires no migration. Re-importing the same file creates another copy only after the preview and
confirmation make that behavior explicit.

This is the smallest transfer model with understandable failure semantics. It also keeps a future
merge or restore feature from silently inheriting identity rules that have not yet been designed.

### Idempotent merge with stable UUIDs — deferred

Stable cross-installation identifiers could make repeated imports idempotent, but they require an
approved schema migration plus explicit rules for local edits, source edits, conflicts, deletion,
and older bundles. Those rules are larger than Phase 1C and would turn a portable transfer feature
into synchronization semantics.

### Replace/restore import — rejected for Phase 1C

Replacing registry contents would resemble backup restoration, but it is destructive and requires
preflight backup, failure recovery, confirmation, and exact identity/timestamp semantics. A local
dashboard should not erase operator data under an import label.

## Product Decisions

### Transfer, not backup or synchronization

A successful export is a portable content bundle, not a byte-for-byte database backup. A successful
import creates new local records. The interface and documentation must not promise exact recovery,
identity preservation, synchronization, or restoration.

### Complete registry export

Phase 1C has one export scope: all Prompts followed by all Workflow Links. This makes the first
format easy to explain and test. Per-record and filtered exports remain future additions because
they need selection semantics and additional UI states.

### Append every valid record

Duplicate Prompt and Workflow Link records are already valid domain data. Import therefore does not
drop, merge, or update any record. The preview and confirmation report duplicates; the commit still
inserts them. This avoids hidden data loss and keeps import behavior independent of future identity
decisions.

### Fresh local identity and time

Bundle records exclude database IDs, created_at, and updated_at. SQLite and the ORM assign fresh
identifiers and UTC timestamps when the import commits. The top-level exported_at value describes
when the bundle was produced; it is validated on import but is not copied into either table.

### Explicit operator actions

Export begins only when the operator activates Download JSON bundle. Import requires file selection,
a successful server preview, a second Import records action, and a confirmation dialog. Nothing is
exported or imported on page load, file selection alone, hover, focus, navigation, or preview.

## Architecture

~~~text
Transfer React view
  |
  | relative same-origin JSON requests
  v
FastAPI /api/transfer routes
  |
  +--> bounded request reader
  |      - content type
  |      - Content-Length fast rejection
  |      - streamed 10 MiB hard limit
  |      - UTF-8 / JSON decoding
  |
  +--> transfer schemas and service
  |      - strict manifest and record discrimination
  |      - existing domain normalization
  |      - safe issue mapping
  |      - exact duplicate fingerprints
  |      - deterministic export projection
  |
  +--> transfer repository
         - deterministic full-table reads
         - one cross-table append transaction
         - rollback on every failure
         |
         v
      SQLAlchemy Session --> existing prompts + workflow_links tables
~~~

Routes own HTTP media types, status codes, headers, and sanitized error mapping. The bounded reader
owns raw request limits before schema validation. Pure transfer schemas and service functions own
format validation, normalization, projection, counting, and fingerprints. The transfer repository
owns unpaginated ordered reads and the single import transaction.

The existing Prompt and Workflow Link route/repository mutations keep their current transaction
behavior. Phase 1C does not call create_prompt or create_workflow_link repeatedly because each of
those commits independently. Instead, a focused transfer repository adds both model types to one
shared Session and commits once.

## Bundle Format Version 1

### Example

~~~json
{
  "application": "local-ai-workflow-hub",
  "format_version": 1,
  "exported_at": "2026-07-13T12:34:56.789012Z",
  "records": [
    {
      "type": "prompt",
      "title": "Explain this function",
      "content": "Explain the following function and identify edge cases.",
      "tags": ["review", "local"]
    },
    {
      "type": "workflow_link",
      "title": "Local n8n editor",
      "url": "http://localhost:5678/workflow/example",
      "description": "Reference to the local workflow editor.",
      "tags": ["n8n", "local"]
    }
  ]
}
~~~

### Manifest contract

The root value must be a JSON object with exactly these fields:

| Field | Contract |
| --- | --- |
| application | Exact string local-ai-workflow-hub |
| format_version | Strict JSON integer 1; booleans and numeric strings are invalid |
| exported_at | RFC 3339 string with an explicit zero UTC offset; export emits Z |
| records | JSON array containing 0–5,000 discriminated records |

Unknown root fields are invalid. A valid export may contain zero records so an empty registry still
has a portable, inspectable representation. Preview accepts such a bundle, marks it non-importable,
and warns that it contains no records. The import endpoint rejects it without mutation.

### Prompt record

A Prompt record has exactly:

- type with the literal value prompt;
- title using the existing trimmed 1–200 character contract;
- content using the existing non-whitespace, maximum 50,000 character contract, preserving every
  original character;
- tags using the existing canonical zero-to-ten tag contract.

It contains no id, timestamps, preview text, or persistence encoding.

For export, the existing nullable Prompt tag storage remains valid: NULL and the empty string both
project to tags: []. Any other noncanonical stored tag encoding fails closed instead of being
silently repaired. Workflow Link tag storage must remain its existing canonical non-null storage
string.

### Workflow Link record

A Workflow Link record has exactly:

- type with the literal value workflow_link;
- title using the existing trimmed 1–200 character contract;
- url using the existing absolute HTTP(S), maximum 2,048 character contract;
- description using the existing trimmed, maximum 5,000 character contract;
- tags using the existing canonical zero-to-ten tag contract.

It contains no id, timestamps, description preview, provider metadata, or reachability state. URL
validation is pure string processing. No import or export path creates an HTTP client, resolves a
host, follows a redirect, renders a preview, or contacts the destination.

### Strict decoding and normalization

All objects reject unknown fields and all scalar types are strict. The type field selects one of the
two record schemas; an unknown or missing discriminator is invalid. The existing domain functions
then normalize valid strings exactly as ordinary create/update endpoints do. This means:

- title edges are trimmed;
- Prompt content is preserved, including leading and trailing whitespace;
- Workflow Link URL edges are trimmed and its validated destination string is preserved;
- Workflow Link description edges are trimmed;
- tags collapse whitespace, case-fold, and stably deduplicate.

The normalized in-memory records are the only values eligible for preview fingerprints or import.
The uploaded bytes and unvalidated values are never written to SQLite.

## Limits and Bounded Processing

Phase 1C defines these constants:

| Limit | Value | Enforcement |
| --- | --- | --- |
| Maximum UTF-8 encoded bundle | 10 MiB / 10,485,760 bytes | Browser before preview; backend while reading |
| Maximum records | 5,000 | Strict manifest validation and export preflight |
| Maximum returned validation issues | 100 | Safe error collector |

The backend must not rely only on Content-Length because it may be absent or inaccurate. A declared
length above the limit is rejected before reading; otherwise the request is consumed incrementally
and stops as soon as it exceeds 10 MiB. Exactly 10,485,760 bytes is allowed. Invalid UTF-8,
duplicate object keys, non-standard NaN or Infinity constants, malformed JSON, a non-object root,
or trailing non-whitespace JSON data is rejected.

Export first checks the combined row count, builds a normalized bundle in deterministic order,
as UTF-8 JSON, and verifies the final encoded size before returning a response. If the current
registry cannot fit version 1 limits, export fails safely rather than producing a bundle that this
application cannot re-import.

The frontend limit is an early usability check only. Every backend endpoint remains authoritative.

## Deterministic Export

The transfer repository reads Prompts in ascending id order, then Workflow Links in ascending id
order. The service projects each row to a full portable record and rejects corrupt stored values
instead of silently repairing, truncating, or omitting them. The response uses stable top-level key
and record-field order for readable diffs, while import correctness never depends on JSON object key
order or insignificant whitespace.

The export timestamp is generated once in aware UTC after successful projection. The response is a
single JSON document with:

- Content-Type: application/json; charset=utf-8;
- Content-Disposition using the ASCII filename
  local-ai-workflow-hub-YYYYMMDDTHHMMSSZ.json;
- Cache-Control: no-store;
- Pragma: no-cache;
- X-Content-Type-Options: nosniff.

The frontend reads and runtime-validates the response before creating a temporary Blob URL. It
activates a temporary download anchor only for the explicit user action and always revokes the Blob
URL. It reports exported Prompt, Workflow Link, and total counts from the validated bundle.

## Exact Duplicate Semantics

Duplicates are advisory and never change what import writes. A normalized fingerprint consists of
all editable fields:

- Prompt: normalized title, exact content, and canonical tags;
- Workflow Link: normalized title, normalized URL, normalized description, and canonical tags.

Tags are compared as a sorted tuple because tag order has no semantic meaning. Record types remain
part of the fingerprint domain, so a Prompt and Workflow Link can never match one another.

An incoming record counts as an exact duplicate when its fingerprint matches any record already in
the corresponding table or any earlier record in the same incoming array. For example, three equal
incoming records against an empty database produce two duplicate warnings; against an existing
equal record they produce three. Preview reports duplicate Prompt, Workflow Link, and total counts.

The import endpoint recomputes duplicate counts inside its own operation. Registry data may change
between preview and confirmation, so its response supersedes the preview and reports the database
snapshot observed by the committing request. It is not a synchronization or concurrency guarantee.
No preview token, server-side staging table, browser identifier, or optimistic-lock field is
introduced.

## Import Data Flow

### Preview

1. The browser checks file.size against 10 MiB, reads it as an ArrayBuffer, and uses a fatal UTF-8
   TextDecoder so malformed source bytes are rejected rather than replaced.
2. The browser keeps the filename and raw text only in component memory.
3. It posts the raw text with application/json to /api/transfer/import/preview.
4. The backend performs bounded reading, JSON decoding, strict schema validation, and domain
   normalization.
5. The service loads current fingerprints, computes counts and warnings, and returns a preview.
6. The repository performs no insert, update, delete, flush, or commit.

A successful preview response has this shape:

~~~json
{
  "valid": true,
  "importable": true,
  "format_version": 1,
  "counts": {
    "total": 2,
    "prompts": 1,
    "workflow_links": 1
  },
  "duplicates": {
    "total": 0,
    "prompts": 0,
    "workflow_links": 0
  },
  "warnings": []
}
~~~

An empty bundle returns valid true, importable false, zero counts, and one bounded empty_bundle
warning. Duplicate warnings use stable machine codes and safe fixed messages.

Every warning object has exactly code and message. Version 1 emits only:

- empty_bundle: "This bundle contains no records and cannot be imported."
- exact_duplicates: "Exact duplicates will be imported as new records."

The matching warning appears if and only if its condition is present. Warnings never contain record
data, filenames, Prompt content, descriptions, or URLs.

### Confirmation and commit

1. Import records is enabled only for the latest successful, non-empty preview.
2. Activating it opens a confirmation dialog with total/type counts and any duplicate count.
3. Confirmation posts the same in-memory raw JSON text to /api/transfer/import.
4. The backend independently repeats bounded reading, parsing, validation, normalization, and
   duplicate computation.
5. The repository adds every normalized record to one Session and commits exactly once.
6. A flush, constraint, commit, or unexpected database failure rolls the Session back and returns
   no success count.
7. A successful response reports inserted and duplicate-at-commit counts.

The import response uses HTTP 201 and this shape:

~~~json
{
  "imported": {
    "total": 2,
    "prompts": 1,
    "workflow_links": 1
  },
  "duplicates_imported": {
    "total": 0,
    "prompts": 0,
    "workflow_links": 0
  }
}
~~~

There is no partial-success response. The only successful non-empty import has imported.total equal
to the validated input record count. Imported models use existing ORM defaults for IDs and UTC
timestamps.

## API Surface

### GET /api/transfer/export

- Returns 200 with the version 1 bundle and download/privacy headers.
- Returns 413 export_too_large if record or encoded-byte limits would be exceeded.
- Returns a sanitized 500 export_failed if a stored record is invalid or projection/serialization
  cannot safely complete.
- Never returns a partial bundle.

### POST /api/transfer/import/preview

- Requires application/json with no parameter or one case-insensitive charset=utf-8 parameter.
- Returns 200 with a valid preview, including an empty non-importable preview.
- Performs no mutation.
- Returns a sanitized 500 preview_failed if stored data or its database read cannot be validated.

### POST /api/transfer/import

- Requires application/json with no parameter or one case-insensitive charset=utf-8 parameter.
- Returns 201 only after one successful commit.
- Rejects a valid empty bundle with 422 empty_bundle.
- Never partially commits.

### Error mapping

The routes distinguish:

| Condition | HTTP status | Stable code |
| --- | --- | --- |
| Unsupported or missing media type | 415 | unsupported_media_type |
| Invalid UTF-8 or malformed JSON | 400 | malformed_json |
| Request or export exceeds 10 MiB | 413 | bundle_too_large / export_too_large |
| More than 5,000 records | 422 on import; 413 on export | too_many_records / export_too_large |
| Wrong manifest identity or unsupported version | 422 | invalid_application / unsupported_format_version |
| Invalid schema or domain field | 422 | invalid_bundle |
| Empty commit request | 422 | empty_bundle |
| Safe export, preview, or import failure | 500 | export_failed / preview_failed / import_failed |

Every transfer error has exactly one top-level detail object:

~~~json
{"detail":{"code":"invalid_bundle","message":"Bundle validation failed","issues":[],"issues_truncated":false}}
~~~

Each issue has exactly location, record_index, record_type, field, code, and message. location is an
array of string/integer JSON-path segments and is empty when unavailable. record_index is a
non-negative integer or null; record_type is a known discriminator or null; field is a string or
null. Codes and messages come from a fixed safe mapping rather than submitted values.

Validation failures return at most 100 issues plus issues_truncated. Each issue may identify a JSON
location, zero-based record index, known record type, field, stable code, and fixed safe message. It
must not contain submitted values, exception repr output, Prompt content, Workflow Link description,
or a full URL. Internal exceptions are logged only with safe operation metadata and never with the
request body or serialized bundle.

Failures use this deterministic precedence:

1. unsupported media type or charset;
2. declared or streamed byte limit;
3. UTF-8, duplicate-key, non-standard-constant, or JSON syntax failure;
4. root shape, application, version, record count, then record/domain validation;
5. empty commit, followed by safe preview/export/import persistence failures.

All three routes set Cache-Control: no-store, Pragma: no-cache, and
X-Content-Type-Options: nosniff on success and error responses. Content-Disposition appears only on
successful export.

## Transaction and Repository Design

The transfer repository exposes three focused capabilities:

- list all Prompt and Workflow Link rows in deterministic order for export;
- load normalized fingerprints for preview/import duplicate reporting;
- append a prevalidated sequence in one transaction.

The append function accepts typed normalized records, creates ORM objects, adds all to one Session,
and calls commit once. It catches no error merely to continue. Its exception path calls rollback and
re-raises for route-level safe mapping. Tests inject failures after both record types have been added
and at commit time to prove neither table retains a partial import.

Preview may use the request-scoped Session for read queries but must leave it mutation-free. Export
and preview never call commit. The current schema head remains 0002_create_workflow_links, and
alembic check must remain drift-free.

## Frontend Design

### Navigation and page structure

App adds transfer to ActiveView and a fourth Transfer masthead button. The Transfer page follows the
current registry visual system but is a focused operation page rather than an editor. At desktop
width, Export and Import panels may sit side by side; at narrow widths they stack without horizontal
overflow. The existing Overview, Prompts, and Workflows behavior remains unchanged.

Completing Phase 1C completes Phase 1, so the overview footer changes from Phase 00 to Phase 01.

### Export panel

The Export panel:

- states that every Prompt and Workflow Link will be included;
- warns that exported prompt content and URLs may contain sensitive information;
- offers one Download JSON bundle button;
- disables that action while its request is pending;
- shows a polite pending message, sanitized failure, or successful count summary;
- creates no request until the explicit button activation.

### Import panel

The Import panel:

- provides a labeled file input with JSON accept hints;
- treats extension and MIME hints as usability aids, never as trusted validation;
- reports selected filename and size without displaying raw content;
- performs the browser byte-limit check before reading/sending;
- provides a replace-selection and clear-selection path;
- shows server-authoritative Prompt, Workflow Link, total, and duplicate counts;
- disables Import records until the latest preview is valid and importable;
- uses the established accessible confirmation dialog for the final append;
- clears the selected raw text and preview after success;
- announces the committed counts and refreshes registries when they are next opened.

An invalid preview remains selected so the operator can see safe issues and choose another file. Raw
JSON, Prompt content, descriptions, and full URLs are never rendered as error details.

The client never automatically retries an import. Any failed or lost import response invalidates the
prepared preview and disables Import records while retaining the raw text for a fresh preview. A
connection loss after confirmation may hide a successful commit, so the UI explains that refreshed
registries and a new duplicate preview are authoritative before the operator chooses to try again.

### Navigation and async guards

A successful non-empty preview is a prepared import. Navigating away asks whether to discard that
in-memory selection. Cancelling keeps the Transfer view and preview intact; confirming clears it and
navigates. A mere empty file selection or failed preview may be cleared without a destructive-data
claim, but navigation still releases its memory.

Top-level navigation is blocked without a dialog while export, preview, or import is pending. This
matches the current save/delete guard and prevents state teardown during a mutation or Blob
operation. Existing Prompt and Workflow dirty guards apply when navigating to Transfer.

Once an import is confirmed, the UI offers no cancel action. Closing or reloading the browser may not
cancel work already accepted by the server; the operator must inspect the refreshed registries and
preview again before any repeat import.

After an import succeeds, entering Prompts or Workflows triggers their existing active-view reload
path so newly inserted records appear. The design must not duplicate imported items into registry
state client-side.

### Accessibility and browser lifecycle

- Pending and result messages use appropriate polite or assertive live regions.
- Validation summaries are programmatically associated with the file input.
- The confirmation dialog receives deterministic initial focus and restores focus on cancel.
- After successful import, focus moves to the transfer heading or committed-result summary.
- After failed preview/import/export, focus moves to the corresponding safe error summary.
- Filename and count text wrap at narrow widths.
- Temporary object URLs, hidden anchors, preview/export AbortControllers, and file text are released
  on completion, replacement, confirmed navigation, or unmount.
- Import and export actions remain keyboard-operable without drag-and-drop.

## Frontend API and State Boundaries

A dedicated api/transfer.ts module owns relative requests and runtime response validation. It
accepts raw JSON text for preview/import so the two server calls receive the same selected content.
It never accepts a URL or filesystem path. It validates every export, preview, import, and error
response before the view uses it.

The Transfer feature is split into focused units:

- pure transfer types and runtime decoders;
- pure state helpers for selection, preview freshness, limits, and dirty/pending guards;
- a transfer controller hook for preview/export cancellation and async lifecycle;
- an Export panel;
- an Import panel and preview summary;
- a Transfer view composing those units and exposing confirmDiscard/canNavigate behavior to App.

No transfer state is placed in localStorage, sessionStorage, IndexedDB, the URL, service workers, or
module-level caches. React memory is the only browser-side lifetime.

## Security and Privacy

- The feature never reads .env, server filesystem paths, SQLite files, Docker state, or n8n keys.
- It never mounts the Docker socket, adds Docker SDK access, or changes Compose privileges.
- Workflow destinations remain inert text through parsing, duplicate comparison, preview, import,
  export, and rendering.
- The browser performs no preconnect, prefetch, iframe, image, favicon, metadata, or health request
  for imported URLs.
- Export requires explicit activation and uses no-store/no-cache headers.
- The interface warns that downloaded JSON may contain sensitive prompts, internal hostnames, query
  parameters, or signed URL material and should be protected like the local database.
- The application does not encrypt or securely erase downloaded files; OS/browser download history
  and filesystem permissions remain the operator's responsibility.
- Request bodies and bundle contents are excluded from application logging and safe error output.
- Localhost binding remains the default. Network exposure remains unsafe without separately
  designed authentication, authorization, TLS, and request-size controls at the boundary.

## Testing Strategy

### Backend unit and repository tests

Tests cover:

- strict root and record schemas, type discrimination, unknown-field rejection, and no coercion;
- application identity, format version, aware-UTC exported_at, empty arrays, and record limits;
- reuse of every Prompt, Workflow Link, URL, description, and tag boundary;
- content preservation and canonical normalization;
- deterministic record projection and key/record ordering apart from exported_at;
- semantic fingerprints, tag-order independence, existing duplicates, and in-bundle duplicates;
- safe issue mapping, 100-issue truncation, and absence of submitted values;
- deterministic full-table reads;
- one commit on success and rollback on injected flush/commit failure;
- no partial Prompt or Workflow Link rows after any failure.

### Backend API tests

Tests cover:

- empty and populated export bundles, deterministic record grouping, filename, and privacy headers;
- export record/byte limits and corrupt stored-row failure without a partial response;
- missing/wrong media type, misleading or absent Content-Length, exact byte boundary, one-byte-over
  boundary, invalid UTF-8, malformed/trailing JSON, and non-object roots;
- preview counts with no database mutation;
- unsupported versions, unknown record types/fields, and sanitized bounded issues;
- exact duplicate counts against stored and earlier bundle records;
- successful mixed-record HTTP 201 import with fresh IDs/timestamps;
- direct empty-import rejection;
- repeated import appending another full copy and returning updated duplicate counts;
- one transaction and complete rollback under injected failure;
- zero outbound destination requests during every Workflow Link transfer path;
- unchanged Prompt, Workflow Link, health, and Ollama endpoint regressions.

No test requires a real Ollama server or a reachable workflow destination.

### Frontend tests

Tests cover:

- runtime decoding of all successful and error contracts;
- file-size boundary, read failure, selection replacement, and memory clearing;
- no preview request for an oversized file;
- valid, invalid, empty, duplicate, stale, and aborted preview states;
- export pending/failure/success and temporary Blob URL revocation;
- import confirmation, cancel, success, rollback failure, lost-response uncertainty, and re-preview;
- duplicate warnings without a skip option;
- prepared-preview navigation confirmation and pending-operation navigation blocking;
- Prompt/Workflow dirty guards when navigating to Transfer;
- registry reload after successful import;
- accessible names, live regions, focus movement, and narrow-layout behavior;
- no automatic export, import, navigation, or destination request.

### Full acceptance

Before the completion commit, run and record fresh evidence for:

- make install;
- make test and make test-e2e;
- make test-web;
- make lint, make typecheck, make format, and make build;
- Alembic upgrade/check/downgrade preservation with migration 0001 checksum unchanged;
- direct API and Vite-proxied export/preview/import flows in an isolated Compose project;
- a disposable mixed registry export, empty preview, invalid preview, duplicate preview, confirmed
  import, repeat import, and source-record preservation;
- a destination sentinel proving zero requests before and throughout transfer operations;
- Firefox acceptance at the established 320, 600, 601, and 1280 px widths;
- file download headers/content, file selection, preview, confirmation Cancel/Confirm, dirty and
  pending navigation guards, focus, registry refresh, and zero horizontal overflow;
- exact-candidate secret, artifact, prohibited-capability, container, volume, process, migration,
  documentation, and Git audits.

All disposable databases, files, object URLs, browser processes, containers, networks, and test
volumes must be removed afterward. Preexisting project volumes remain untouched.

## Documentation and History

The implementation updates:

- README status, transfer usage, API table, limitations, security warning, and roadmap;
- docs/DECISIONS.md with append-only portable-transfer semantics and limits;
- docs/SECURITY_NOTES.md with export sensitivity, inert URL handling, memory-only upload state, and
  public-exposure warnings;
- docs/FAILURES.md only for failures actually observed during implementation or acceptance;
- history/BUILD_LOG.md in the same commit as every implementation milestone.

The completed milestone records that Phase 1A, Phase 1B, and Phase 1C are accepted, Phase 1 is
complete, and any Phase 2 work requires a separate design. Documentation must continue to distinguish
portable transfer from backup, synchronization, restoration, and secure deletion.

## Acceptance Criteria

Phase 1C is complete only when current evidence proves all of the following:

1. Export returns a strict version 1 bundle containing every valid Prompt and Workflow Link in
   deterministic record order with no database IDs or per-record timestamps.
2. Every successful export stays within and can pass the same version 1 import limits.
3. Preview performs authoritative validation and duplicate counting without any mutation.
4. Import revalidates, appends every record, commits once, and leaves no partial rows on failure.
5. Existing records remain byte-for-byte equivalent in editable fields after import.
6. Re-importing a bundle appends another copy only after an explicit duplicate warning and
   confirmation.
7. Imported records receive fresh local IDs and aware UTC timestamps.
8. Workflow Link destinations receive zero automatic requests from backend or browser.
9. Oversized, malformed, unsupported, invalid, empty-commit, and database-failure paths are bounded
   and sanitized.
10. Exported prompt content and URLs are protected from caches, logs, error reflection, and
    automatic actions within the application's control.
11. Transfer state remains memory-only and is released on clear, replacement, navigation, success,
    or unmount.
12. The fourth masthead view, export/import panels, confirmations, focus behavior, and responsive
    layout pass automated and real-browser acceptance.
13. Existing Overview, Prompt, Workflow Link, Ollama, migration, Compose, and proxy behavior remains
    green.
14. No schema revision, runtime dependency, auth, Docker socket/SDK, n8n key/integration, remote
    import, production config, secret access, or push is introduced.
15. README, decisions, security notes, actual failures, and build history accurately describe the
    delivered behavior and limits.
16. All required checks pass on the exact committed candidate, disposable resources are removed,
    and git status is clean.

## Deferred Follow-up

Future separately designed work may consider scoped exports, stable UUIDs, merge conflict policy,
duplicate skipping, encrypted bundles, signed manifests, exact backup/restore, or read-only service
integrations. None should reinterpret version 1 append-only semantics. An incompatible transfer
format requires a new format_version and explicit migration/compatibility design.

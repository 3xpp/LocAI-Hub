# Local AI Workflow Hub Phase 2B n8n Workflow Inventory Design

**Date:** 2026-07-26

**Status:** Implemented; final exact-candidate acceptance pending

**Sequence:** Phase 2B after accepted Phase 2A n8n health observation

**Schema impact:** None. Workflow inventory, cursors, errors, and configuration are not persisted.

**Runtime dependency impact:** None. The backend reuses `httpx` and the Python standard library; the
frontend reuses React and browser APIs already locked in the repository.

**Credential impact:** Adds optional `N8N_API_KEY` process configuration to the API process only.
The key is never returned, logged, persisted, sent to the browser, sent on Phase 2A health requests,
or forwarded to another application container.

**Authorization impact:** Explicitly accepted trusted-localhost credential delegation. The Hub
remains unauthenticated, so any client that can reach the Hub API can make it use the configured key
for the one fixed operation and can read the bounded workflow summary. Network exposure remains
prohibited without a separate authentication, authorization, TLS, and deployment design.

**Approval:** The operator explicitly approved designing `N8N_API_KEY` handling, one credentialed
fixed-path n8n workflow-list capability, and read-only workflow inventory. During design review, the
operator selected the isolated client and Integrations-panel approach and approved summary-only
projection, trusted-localhost exposure, manual-only loading, bounded backend pagination, fixed safe
failure states, verification scope, local Compose API-only key forwarding, conventional commits,
and pushing verified milestones to GitHub.

The operator completed the written review on 2026-07-26, confirmed that the design looked good,
and thereby accepted the explicitly documented syntactic-loopback HTTP exception and its residual
cleartext-on-loopback risk.

## Summary

Phase 2B adds a manually loaded, read-only summary of workflows visible to one configured n8n API
key. The browser calls one parameter-free Hub route. A new backend client uses the already validated
`N8N_BASE_URL`, adds the process-owned key only to fixed `GET /api/v1/workflows` requests, follows
cursor pagination within hard limits, and immediately projects each full provider workflow object
to three browser-safe fields:

- workflow name;
- active or inactive state;
- last-updated time.

The upstream list response can contain complete node configurations, connections, settings, pinned
data, credential references, project sharing, tags, and other metadata. Those fields are treated as
sensitive provider data. They exist only transiently in the bounded API-process response buffer and
parsed object, are never copied into Hub results, and are discarded after projection. Provider IDs
and cursors remain backend-only and are not exposed through the Hub API.

Phase 2A health observation remains credential-free and behaviorally independent. Entering
Integrations still performs only the existing health observation. Workflow inventory is contacted
only after an explicit **Load workflows** or **Refresh inventory** action. There is no polling,
retry, automatic entry load, browser persistence, database state, provider mutation, execution
access, workflow detail, generic target, or Docker capability.

## Problem

Phase 2A answers whether the configured n8n process is live and ready, but it cannot show what
workflows exist. A bounded workflow summary is useful to a local operator, yet n8n's public API
crosses a materially different boundary:

- calls require an API key;
- non-Enterprise n8n keys have full account capability even when the Hub calls only a list route;
- the list operation returns full workflow objects rather than a metadata-only representation;
- cursor traversal can amplify one unauthenticated Hub request into multiple credentialed requests;
- workflow names and activity timestamps are sensitive local metadata;
- the Hub has no authentication and currently trusts its loopback exposure model.

The design must provide useful summary visibility without turning Phase 2A health into a
credentialed client, exposing workflow definitions, accepting caller-controlled provider requests,
or implying that a read-only application route makes an unscoped provider key least-privileged.

## Provider Contract Basis

The design follows the official n8n public API material available on 2026-07-26:

- [Authentication](https://docs.n8n.io/connect/n8n-api/authentication/) requires the
  `X-N8N-API-KEY` header. Enterprise instances can scope a key, while non-Enterprise API keys have
  full access to the account's resources and capabilities.
- The official
  [workflow collection specification](https://github.com/n8n-io/n8n/blob/734f9573952c3a639518bfd42e03b4d7aa9fd436/packages/cli/src/public-api/v1/handlers/workflows/spec/paths/workflows.yml)
  assigns `workflow:list` to `GET /workflows` and supports `excludePinnedData`, `limit`, and
  `cursor`.
- The official
  [workflow schema](https://github.com/n8n-io/n8n/blob/734f9573952c3a639518bfd42e03b4d7aa9fd436/packages/cli/src/public-api/v1/handlers/workflows/spec/schemas/workflow.yml)
  demonstrates that list items can include nodes, connections, settings, static data, pinned data,
  tags, shared-project data, and other details in addition to the three approved fields.
- [Pagination](https://docs.n8n.io/connect/n8n-api/pagination/) documents a default page size of 100,
  a maximum of 250, and an opaque `nextCursor`.

These external contracts are compatibility inputs, not values the browser may control. Phase 2B
fixes its API version, operation, query shape, bounds, and projection in Hub code. A future n8n
contract change that does not satisfy those expectations becomes a fixed invalid-response state
rather than broadening the Hub response.

## Goals

- List a bounded summary of workflows visible to one configured n8n key.
- Keep Phase 2A health requests credential-free and unchanged.
- Read configuration only from the API process environment.
- Keep the API key opaque, non-represented, non-persisted, and backend-only.
- Recommend a `workflow:list`-scoped key when the n8n edition supports scoped keys.
- Require HTTPS for credentialed inventory except for a syntactically loopback-only HTTP origin.
- Make the credentialed request only after explicit operator action.
- Use only one fixed provider method and collection path.
- Accept no target, path, method, filter, cursor, header, body, key, or timeout from the browser.
- Keep all provider pagination backend-side under page, item, byte, cursor, depth, and wall-time
  limits.
- Return only name, active state, updated time, and a local truncation indicator.
- Treat raw provider bodies, headers, errors, workflow definitions, IDs, and cursors as sensitive.
- Normalize expected failures to fixed Hub-authored states and messages.
- Preserve a successful in-memory snapshot as stale when a later refresh fails.
- Remain accessible and overflow-free across the accepted Firefox viewport matrix.
- Preserve existing Prompt, Workflow Link, Transfer, Ollama, health, migration, and Compose behavior.

## Non-goals

Phase 2B will not include:

- workflow nodes, connections, settings, descriptions, tags, projects, folders, sharing, versions,
  triggers, static data, pinned data, credential references, or raw JSON;
- workflow IDs, provider URLs, provider cursors, or links into n8n in browser responses;
- workflow detail, export, import, creation, update, activation, deactivation, archive, deletion,
  execution, test execution, webhook invocation, or transfer;
- execution inventory, execution data, logs, errors, retries, insights, audit, credentials, users,
  projects, variables, tags, source control, or other n8n API resources;
- caller-supplied active/name/tag/project filters or sorting;
- browser-direct provider calls, CORS expansion, redirects, iframes, prefetch, Open, or Copy;
- automatic loading on Integrations entry, polling, background refresh, visibility listeners,
  service workers, retries, fan-out, or a scheduler;
- persistence, caching, history, synchronization, provider totals, or browser storage;
- API-key creation, validation UI, rotation UI, secret-manager integration, `.env` parsing, or
  database secret storage;
- Hub authentication, authorization, rate limiting, multi-user isolation, public binding, reverse
  proxying, TLS termination, or production deployment changes;
- a generic provider client, request-controlled target, custom API path, API-version setting, custom
  header, proxy setting, TLS bypass, or redirect policy;
- Docker socket, SDK, Engine API, CLI, container inventory, Compose control, or any application
  Docker capability;
- an n8n service bundled into the Hub's Compose project;
- a database schema revision, transfer-format change, runtime dependency, or lockfile change.

## Alternatives Considered

### Separate credentialed client and Integrations panel — selected

A new `N8nWorkflowInventoryClient` owns the key, fixed workflow-list requests, bounded response
ingestion, pagination, projection, and safe result mapping. A separate Hub route and frontend
controller keep inventory lifecycle and failures distinct from health. The inventory panel appears
beneath the existing health card without adding a sixth navigation destination.

This creates more focused files, but it makes the credential boundary independently testable and
prevents the key from being added to `/healthz` or `/healthz/readiness`.

### Extend the Phase 2A health client and controller — rejected

Sharing one client or controller would reduce file count but couple credential-free status to
credentialed body parsing and pagination. Pending, stale, error, and trigger semantics would become
ambiguous, and a future refactor could accidentally attach the key to health requests.

Phase 2A remains a separate proven boundary.

### Add a sixth view or reuse Workflow Links — rejected

A dedicated navigation view would disturb the accepted five-button responsive layout for one small
provider panel. Reusing Workflow Links would incorrectly merge live provider metadata with
operator-authored inert references and could suggest synchronization or remote control that does
not exist.

### Browser-managed pagination — rejected

Returning an n8n cursor, a reversible wrapper around it, or a server-side cursor identifier would
either expose provider state or require storage and lifecycle design. Caller-supplied pagination
would also expand the unauthenticated request surface.

Phase 2B traverses a bounded number of pages inside one Hub request and reports only whether the
result was truncated.

## Product Decisions

### Summary-only inventory

Each successful item contains exactly:

- `name`: the provider workflow name;
- `active`: the provider boolean active state;
- `updated_at`: the provider `updatedAt` timestamp normalized to a timezone-aware ISO 8601 string.

The browser derives **Active** or **Inactive** text from the boolean. It does not distinguish
archived workflows or expose any other provider state. Phase 2B preserves provider ordering across
pages and does not claim an authoritative provider total.

Workflow IDs may be read transiently only if implementation needs them for provider-response
integrity checks. They are not part of the service result, API schema, frontend type, DOM, log, or
storage. React list keys use the bounded summary fields plus the local result position.

### Trusted-localhost exposure

The Hub remains unauthenticated. Any process or browser client able to reach
`GET /api/integrations/n8n/workflows` can cause the Hub to use its configured key and can read the
resulting summaries.

The approved boundary relies on unchanged loopback-only host publishing, the existing same-origin
browser proxy, one trusted operator, and no public or untrusted reverse proxy. `no-store` response
headers reduce application-controlled caching but do not provide access control. Any broader
exposure requires a separate Phase 3-or-later authentication, authorization, audit, rate-limit,
TLS, and deployment design before this route is reachable.

### Manual credentialed lifecycle

Entering Integrations starts only the existing credential-free health observation. Inventory begins
in `idle` with no rows and no provider request.

The first **Load workflows** click starts one Hub request. After a successful load or empty result,
the action becomes **Refresh inventory** and replaces the snapshot. Duplicate activation while
pending coalesces into the existing request rather than creating another request or aborting it.

Leaving Integrations or unmounting aborts the browser request. Re-entering preserves the last
in-memory snapshot but does not refresh it. There is no timer, retry, visibility trigger, focus
trigger, background task, or browser persistence.

### Bounded complete-attempt behavior

One Hub request may make up to four sequential provider requests. The client asks for 50 workflows
per page and stops at the first of:

- no `nextCursor`;
- four pages;
- 200 projected workflows;
- 8 MiB of total identity-encoded provider representation bytes;
- the shared five-second eligibility deadline described in the backend design;
- any invalid or failed provider response.

If the fourth valid page or 200th item still has a non-empty next cursor, the successful Hub
response sets `truncated: true`. Byte, depth, payload, cursor, transport, HTTP, or deadline failures
do not return partial rows. They return a fixed failure state, and the frontend may retain an older
successful snapshot as stale.

### Least-privilege key guidance

An Enterprise n8n operator should create a dedicated key with only `workflow:list`, an explicit
label, and an appropriate expiration. The Hub cannot inspect or prove the key's scope.

Official n8n documentation states that non-Enterprise keys have full access to the account's
resources and capabilities. Phase 2B does not make such a key least-privileged; it only constrains
what this application code sends. Operators using an unscoped key accept its larger theft and
process-compromise blast radius and should isolate, rotate, and expire it accordingly.

### Credential transport

Phase 2A health continues to accept its approved canonical HTTP or HTTPS root origin because it
sends no credential. The Phase 2B inventory client adds a stricter transport rule before attaching
the key:

- `https` is accepted for any origin that passes the shared canonical-origin validator;
- `http` is accepted only when the canonical host is exact `localhost` or a canonical IP address
  whose parsed `ipaddress` value is loopback;
- every other `http` origin is invalid inventory configuration and produces zero provider requests.

The exception is syntactic and performs no DNS-based private/loopback classification. A homelab
name, private address, Docker gateway, `host.docker.internal`, or another container name therefore
requires HTTPS for inventory even though Phase 2A health may observe it over HTTP.

The narrow HTTP exception sends the key in cleartext over the operating system's loopback interface.
It is proposed only for one trusted machine where an attacker able to inspect privileged loopback
traffic could generally also inspect the API process or its environment. The required written
design review must accept this exception explicitly. There is no broader insecure-HTTP opt-in,
certificate bypass, custom CA, or request setting in Phase 2B.

## Architecture

~~~text
Integrations React view
  |
  | entering view
  +---------------- GET /api/integrations/n8n/status
  |                       |
  |                       '-- credential-free N8nHealthClient
  |
  | explicit Load workflows / Refresh inventory
  '-- GET /api/integrations/n8n/workflows
          |
          v
     FastAPI integrations route
          |
          | injected N8nWorkflowInventoryClient
          v
     validated N8N_BASE_URL + backend-only N8N_API_KEY
          |
          | GET /api/v1/workflows?limit=50&excludePinnedData=true
          | GET later pages with one encoded backend cursor, within limits
          v
     bounded full provider payload in API memory
          |
          | immediate allowlist projection
          v
     name + active + updated_at + local truncated flag
          |
          v
     strict browser parser -> in-memory inventory panel
~~~

The units are intentionally provider-specific:

1. Settings owns raw optional process values and redacted representation.
2. The existing n8n origin validator remains the single origin contract.
3. `N8nHealthClient` remains credential-free and unchanged in responsibility.
4. `N8nWorkflowInventoryClient` owns the key, fixed request policy, bounded ingestion, pagination,
   projection, and normalized failures.
5. A dependency factory constructs the inventory client from trusted settings.
6. A thin FastAPI route adds privacy headers and maps the immutable result to a strict schema.
7. A frontend API module validates the exact Hub response and never knows the n8n origin or key.
8. A separate controller owns manual request state, cancellation, generations, and stale snapshots.
9. A presentational panel renders only normalized summaries.

No model, repository, migration, or transfer unit participates.

## Backend Design

### Settings and secret contract

`Settings` gains `n8n_api_key: str | None = field(default=None, repr=False)`.

`Settings.from_env()` reads only `os.environ`:

- missing `N8N_API_KEY` becomes `None`;
- exact empty string becomes `None`;
- every non-empty value is preserved byte-for-byte for client validation;
- whitespace is not trimmed and case is not changed;
- no `.env`, file, browser value, request, database row, command, or provider is read.

The existing `n8n_base_url` remains `repr=False`. Tests use high-entropy synthetic markers and prove
that neither raw value appears in `repr(settings)`, client result objects, exceptions, HTTP
responses, or captured application/access logs.

A configured key is valid for request construction only when it contains 1–8,192 visible ASCII
characters (`0x21` through `0x7e`). This accepts the documented token form while rejecting
whitespace, Unicode, control characters, CR/LF injection, and oversized headers without trimming or
reflecting the raw value. Invalid key configuration produces zero provider requests.

The key is retained only as an in-memory Settings/client field for the API process lifetime. The Hub
does not copy it into a cache, session, context visible to the browser, exception message, telemetry
field, or persisted record.

### Origin reuse and client separation

Inventory reuses the exact Phase 2A canonical n8n root-origin validation. Implementation may expose
the existing private normalizer as a provider-specific internal public helper, with all Phase 2A
tests proving behavior is unchanged. After shared normalization, inventory independently applies the
HTTPS-or-syntactic-loopback-HTTP credential transport rule. Health behavior does not change.

The inventory client is a separate class and module. It does not subclass, wrap, or mutate
`N8nHealthClient`. The health client's request construction never receives the API key.

Missing or exact-empty origin or key means inventory is unconfigured and produces zero requests.
An invalid non-empty origin or invalid non-empty key means invalid configuration and produces zero
requests. The inventory response does not expose which setting is absent or invalid and does not
echo the origin; the existing health card independently owns its already approved origin display.

### Fixed request policy

Every provider request has all behavior fixed in code:

- method: `GET`;
- path: `/api/v1/workflows`;
- first-page query: `limit=50&excludePinnedData=true`;
- later-page query: the same fixed values plus one backend-owned `cursor`;
- headers: `Accept: application/json`, `Accept-Encoding: identity`, and `X-N8N-API-KEY` with the
  exact validated process value;
- body: none;
- redirects: disabled;
- ambient proxy and certificate environment inheritance: disabled with `trust_env=False`;
- TLS certificate verification: enabled;
- shared inventory eligibility deadline: five seconds, with the enforceable semantics below;
- retry: none.

The browser cannot add or override a target, path, query, active/name/tag/project filter, cursor,
header, body, method, timeout, proxy, TLS, or redirect setting.

Each page uses an isolated client context so an upstream `Set-Cookie` cannot become a later-page
`Cookie`. The Hub sends no `Authorization`, browser cookie, `Referer`, forwarding header, request
body, or value derived from the incoming browser request. Normal library transport headers such as
`Host` are not copied into application output.

Only exact HTTP 200 is parsed. Redirects and every other status fail without following `Location`,
reading an error body into an application message, honoring `Retry-After`, or retrying.

One monotonic deadline is created before the first provider request. Every awaited connect, send,
response, and body-stream operation runs under the remaining `asyncio` deadline. Code checks the
same deadline before and after structural scanning, JSON decoding, item projection, and each page.
If a synchronous bounded phase finishes after the deadline, no result or later request is allowed
and the attempt returns `timeout`.

Standard-library JSON decoding is synchronous and cannot be preempted safely mid-call. The
five-second contract therefore guarantees a hard deadline for awaited I/O and guarantees that no
successful result or subsequent page begins after the monotonic deadline; it does not claim a hard
upper bound on CPU occupancy inside one already-started decode. The 8 MiB and depth limits bound
that non-preemptible phase without a new parser dependency.

### Cursor handling

`nextCursor` is an untrusted provider value. A later page is requested only when the cursor:

- is a string of 1–2,048 characters;
- contains no Unicode or ASCII control character;
- is not equal to a previously observed cursor in the same attempt;
- is passed through `httpx` query parameter encoding rather than URL concatenation;
- remains within page, item, byte, and deadline limits.

Missing or JSON `null` means pagination is complete. An exact empty string, wrong type, oversized
value, repeated value, or unsafe character produces `invalid_response`. The cursor is never returned,
persisted, logged, placed in an exception, or sent to the browser.

Tests include cursor values containing `&`, `=`, `?`, `#`, `%`, slashes, quotes, and non-ASCII
characters to prove they cannot add a query parameter, change the target, or reach output. Visible
non-ASCII is rejected by the cursor contract; reserved visible ASCII is safely encoded.

### Bounded response ingestion

The provider response must have an `application/json` media type, with an optional charset
parameter. `Content-Encoding` must be absent or exact `identity`. Missing, ambiguous, or non-JSON
content type, and every compressed or unknown content encoding, produces `invalid_response` before
body consumption.

The client requests identity encoding and consumes identity representation bytes incrementally. It
counts bytes after HTTP transfer framing and before buffering or JSON decoding, enforcing one 8 MiB
cumulative uncompressed-representation limit across all pages. An upstream `Content-Length` greater
than the remaining allowance may fail early, but streaming accounting remains authoritative.
Crossing the limit closes the response and returns `invalid_response` with no partial result.

Before ordinary JSON decoding, implementation performs a string-aware structural scan that rejects
nesting deeper than 64 arrays/objects. Bytes decode as strict UTF-8 with no byte-order mark. JSON
decoding rejects `NaN`, positive or negative infinity, and duplicate object keys at every level
through explicit standard-library hooks. Malformed JSON, invalid UTF-8, recursion, hook validation
failures, and wrong root shapes become `invalid_response` without reflecting source content.

Each page must contain:

- a root JSON object;
- `data` as an array with at most 50 elements;
- optional `nextCursor` following the cursor contract.

Unknown top-level or workflow-object fields are tolerated for n8n forward compatibility but ignored.
They are never recursively validated for business meaning and are never included in normalized
objects. The byte and nesting bounds still apply to the complete provider payload.

Each `data` element must be an object with:

- `name`: a non-empty string of at most 256 Unicode scalar values, with no control character;
- `active`: an exact JSON boolean;
- `updatedAt`: a string of at most 64 characters that parses as an ISO 8601 timestamp with an
  explicit timezone.

The timestamp is normalized to UTC using the repository's established `Z`-suffixed response style.
Names are preserved exactly; the Hub does not trim, case-fold, interpret, truncate, or render them
as markup. Projected strings and cursors reject decoded lone-surrogate code points. Lone surrogates
inside ignored provider fields are tolerated only transiently and disappear with the discarded raw
provider object; they are never encoded, copied, logged, or returned.

The referenced n8n OpenAPI schema marks only workflow name, nodes, connections, and settings as
formally required even though `active` and `updatedAt` are read-only response fields used by this
feature. Phase 2B deliberately defines a narrower supported response contract: a list item missing
`active` or `updatedAt` is `invalid_response`. The Hub does not invent activity or timestamp values
and does not silently omit that workflow.

One invalid item invalidates the complete attempt. The client never returns a partly projected
current response. Once a page has been projected, its raw bytes and parsed provider object are
dropped before requesting the next page, keeping only the bounded summary tuples, cursor set,
counts, and remaining deadline.

### Normalized result

The immutable service result has:

- `state`;
- `items`;
- `truncated`;
- `error`.

Closed states are:

- `unconfigured`;
- `available`;
- `invalid_configuration`;
- `access_denied`;
- `unavailable`;
- `timeout`;
- `invalid_response`.

The exact mapping is:

| Condition | State | Items | Truncated | Error |
| --- | --- | --- | --- | --- |
| Origin or key missing/exact-empty | unconfigured | empty | false | null |
| Non-empty origin or key invalid | invalid_configuration | empty | false | Invalid n8n inventory configuration |
| All requested pages valid | available | 0–200 summaries | provider-cap result | null |
| Provider returns 401 or 403 | access_denied | empty | false | n8n denied workflow inventory access |
| Other non-200 or transport/TLS/DNS/connect failure | unavailable | empty | false | n8n workflow inventory is unavailable |
| Five-second deadline expires | timeout | empty | false | n8n workflow inventory timed out |
| Content type, bytes, JSON, depth, page, cursor, or item invalid | invalid_response | empty | false | n8n returned an invalid workflow inventory |

Expected provider/configuration failures use this table. Raw exceptions, status text, response
headers, body content, key, cursor, setting, URL, DNS/TLS detail, and timing detail never escape.
Unexpected programming errors remain defects handled by the existing application error boundary
rather than being silently relabeled as provider state.

### Dependency and route

`get_n8n_workflow_inventory_client` receives Settings through FastAPI dependencies and constructs the
separate client. Tests override the factory without modifying process configuration.

The route is:

`GET /api/integrations/n8n/workflows`

It has no query parameter, path parameter, request body, cookie requirement, custom request header,
or redirect. All normalized service states return HTTP 200, matching the existing local-provider
observation convention while keeping browser behavior deterministic.

Every response includes:

- `Content-Type: application/json`;
- `Cache-Control: no-store`;
- `Pragma: no-cache`;
- `X-Content-Type-Options: nosniff`.

The route and request logging expose only the fixed path. The API never accepts the key, target, or
cursor from an HTTP client.

### Hub API contract

Available example:

~~~json
{
  "state": "available",
  "items": [
    {
      "name": "Daily local backup",
      "active": true,
      "updated_at": "2026-07-26T08:30:00Z"
    },
    {
      "name": "Draft document pipeline",
      "active": false,
      "updated_at": "2026-07-25T18:15:00Z"
    }
  ],
  "truncated": false,
  "error": null
}
~~~

Unconfigured example:

~~~json
{
  "state": "unconfigured",
  "items": [],
  "truncated": false,
  "error": null
}
~~~

Safe failure example:

~~~json
{
  "state": "access_denied",
  "items": [],
  "truncated": false,
  "error": "n8n denied workflow inventory access"
}
~~~

The Pydantic models forbid extra fields and enforce every bound and cross-field combination.
`available` is the only state that may have items or `truncated: true`; it requires `error: null`.
`unconfigured` requires empty items, false truncation, and a null error. Every failure state requires
empty items, false truncation, and its one fixed error string.

The API response has no ID, base URL, provider URL, cursor, total, page number, key status, provider
status code, raw error, or full workflow field.

## Frontend Design

### API boundary

A dedicated frontend module owns the workflow inventory contract. It:

- calls only the relative `GET /api/integrations/n8n/workflows` path;
- forwards an `AbortSignal`;
- requests no browser credentials beyond the same-origin default and sends no custom provider/key
  header;
- uses no n8n origin, URL, ID, cursor, query, request body, or storage;
- requires HTTP 200 and valid JSON;
- validates exact root and item keys, state literals, fixed errors, item count, string bounds,
  booleans, UTC timestamps, truncation, and cross-field combinations;
- rejects malformed JSON, missing/extra fields, unknown states/errors, invalid timestamps, and
  oversized names as a fixed Hub-contract error.

Provider failures are already normalized within a valid HTTP 200 response. Hub network failure,
non-200 response, body-read failure, and invalid Hub JSON remain distinct frontend request errors and
never become n8n provider states.

### Controller

A separate `useN8nWorkflowInventory` controller owns:

- `idle`, `loading`, `ready`, and `error` request lifecycle;
- the latest valid `available` or `unconfigured` snapshot;
- a local successful-load timestamp;
- stale state and a fixed frontend error;
- one AbortController and monotonic request generation;
- explicit `load()` or `refresh()` and view-active lifecycle.

The controller makes no request merely because Integrations is active. A click starts a request only
when no inventory request is pending. Controller actions return `void`; repeated activation while
pending is ignored and does not create a second fetch, replace the AbortController, or change the
request generation.

Leaving the view or unmounting aborts the active request and prevents late completion from changing
state. Abort is not an error: a first-load abort returns to `idle`, while an abort during refresh
restores the exact previously settled ready, unconfigured, or error presentation. Re-entering
therefore can never remain stuck in `loading`; it leaves the prior in-memory snapshot or prior
settled state visible without a request. A successful `available` response replaces rows and clears
stale/error state. A successful `unconfigured` response clears rows and shows configuration
guidance.

On a normalized configuration/provider failure, Hub network error, or invalid Hub contract:

- with no earlier available snapshot, show the fixed first-load error and no partial rows;
- with an earlier available snapshot, retain it, mark it stale, and show a fixed refresh warning;
- do not change the last successful load time;
- do not retry automatically.

The hook stays mounted at application scope like the existing view controllers, so snapshots remain
in memory across navigation for the current page session. It writes nothing to local storage,
session storage, Cache Storage, IndexedDB, a service worker, URL state, or the clipboard.

### Integrations view

The existing health card remains first. Its entry request, state, and service contract do not depend
on inventory. The health action is renamed **Refresh health** to distinguish it from inventory.
Existing copy that promises no API key is narrowed to the health observation itself.

A new **n8n workflow inventory** section appears beneath the health card:

- initial state: “Workflow inventory not loaded” and **Load workflows**;
- pending first load: `aria-busy="true"` with retained focusable control using the established
  `aria-disabled` pattern;
- unconfigured: neutral API-process setup guidance without a credential input or key-presence
  detail;
- available empty: “No workflows returned” and **Refresh inventory**;
- available rows: “N loaded,” the list, optional truncation notice, successful-load time, and
  **Refresh inventory**;
- first failure: fixed alert and no list;
- stale refresh failure: prior list retained with a visible stale warning and polite announcement.

Rows use semantic `<ul>`/`<li>` structure. Each row includes:

- the workflow name as inert React text;
- textual **Active** or **Inactive**, not color alone;
- a `<time>` with valid `dateTime` and localized display text.

The provider can return duplicate summaries. Because the ordered list is inert, has no row-local
state, and is replaced atomically on refresh, the approved React key is the snapshot index. The
index is never displayed or treated as provider identity.

The panel contains no anchor, button per workflow, disclosure, JSON viewer, ID, origin, copy action,
search, filter, detail, execution, activation, archive, delete, or other mutation affordance.

The page-level safety banner explains two separate read-only paths:

- health uses fixed credential-free liveness/readiness endpoints;
- inventory uses a backend-only key and fixed list endpoint only after explicit operator action.

It does not show the key value, key length, scope, expiration, label, or provider account. The footer
advances the Integrations capability label to Phase 02B without claiming container visibility or
administrative control.

### Accessibility and responsive behavior

The inventory panel follows the existing industrial control-room visual system rather than adding a
new component library. Requirements include:

- semantic section heading and list structure;
- `aria-busy` on the inventory section for the complete first-load or refresh request, including
  refreshes while stale rows remain visible;
- one dedicated inventory polite live region, separate from health announcements;
- exactly one combined inventory settlement message per successful load/refresh, including count
  and truncation when applicable, or one stale-refresh message on failure;
- assertive first-load failure without duplicate announcements;
- no automatic focus movement after loading or appending;
- retained keyboard focus on the pending action;
- controls at least 44 CSS pixels high with a visible focus outline;
- `min-width: 0` and `overflow-wrap: anywhere` for provider names;
- no horizontal row scroller or clipped summary;
- stacked mobile rows at 600 px and below;
- compact name/state/time columns where space permits;
- reduced-motion behavior consistent with the rest of the application;
- zero document overflow at 320, 600, 601, 880, 881, 1,024, 1,080, 1,081, and 1,280 px.

Maximum-length and hostile-looking names such as markup, bidirectional text, shell syntax, and URL
syntax remain inert text. The application does not use `dangerouslySetInnerHTML`.

## Configuration and Local Compose

`.env.example` adds only:

~~~dotenv
N8N_API_KEY=
~~~

The empty placeholder is safe and non-working. Documentation tells operators to provide the value
through the API process environment or an ignored local environment file managed outside
application code. The repository never reads, prints, edits, or commits a real `.env` or secret
file.

Compose forwards `${N8N_API_KEY:-}` to only the API service. It does not forward the key to:

- the web service;
- Vite or any `VITE_` variable;
- build arguments or image layers;
- labels, healthchecks, commands, URLs, volumes, or browser code;
- an n8n service, because the project still bundles none.

Environment variables in a running container and rendered Compose configuration are inspectable by
local operators with sufficient host access. Compose forwarding is convenience for a trusted local
development stack, not a secret-manager guarantee.

Every tracked Makefile, validation, build, config-render, and acceptance command supplies an
explicit synthetic or empty `N8N_API_KEY` and explicit safe n8n origin. `--env-file /dev/null` does
not override exported shell variables, so explicit assignments are mandatory. Tests never print or
derive an ambient protected value.

There is no host binding, Compose service, Dockerfile, public profile, reverse proxy, production
configuration, capability, socket, or privilege change.

## Security Model

### Credential boundary

The API key crosses only this path:

~~~text
operator-controlled API process environment
  -> repr-suppressed Settings field
  -> isolated inventory client field
  -> X-N8N-API-KEY on fixed workflow-list requests
~~~

It does not cross into health, browser, Hub request input, response schema, logs, exceptions,
database, transfer bundles, browser storage, source control, image layers, or other containers.

The Hub cannot prevent a debugger, process-memory inspector, root user, Docker administrator, or
compromised API process from reading an environment secret. Those are host/process security
boundaries outside Phase 2B. Short expiration, rotation, least privilege, local host security, and a
dedicated n8n key reduce impact.

### Confused-deputy boundary

Because the Hub has no authentication, the fixed inventory route is an intentionally approved
confused-deputy surface for trusted-localhost use: an API caller cannot choose what n8n operation is
performed, but can cause the Hub to perform the one configured operation with its key.

The surface is constrained by:

- loopback-only host publishing;
- no CORS expansion or public deployment;
- one process-configured canonical origin;
- one fixed GET collection path and fixed queries;
- no incoming target, cursor, filter, method, header, or body;
- sequential page, item, byte, depth, cursor, and deadline limits;
- no retry, polling, persistence, or mutation;
- summary-only output.

These controls limit capability; they do not authenticate the caller or rate-limit repeated requests.
Network exposure remains prohibited.

### Provider-data minimization

n8n's list response contains far more than the UI needs. Phase 2B must temporarily receive provider
bytes and parse full JSON objects, so it does not claim that sensitive workflow definitions never
enter process memory. It instead guarantees:

- complete identity-encoded representation bytes are bounded before parsing;
- nesting is bounded before ordinary decode;
- pages are processed sequentially;
- only three allowlisted fields are copied into immutable results;
- raw page bytes and provider objects are dropped after projection;
- no partial current result escapes after a later-page failure;
- raw data is never returned, logged, persisted, cached, or rendered;
- response and exception markers are tested across API and logs.

`excludePinnedData=true` reduces exposure but is defense in depth. The client assumes full sensitive
definitions can still arrive and enforces the same projection regardless.

### Fixed-target and redirect boundary

The target comes only from the existing trusted process setting and retains Phase 2A's canonical
HTTP(S) root-origin validation. Saved Workflow Links, request URLs, provider-returned URLs, redirects,
and browser values never become targets.

Redirects are not followed because they could send the key to another origin. A redirect is a fixed
unavailable state; the `Location` header is neither requested nor exposed. Ambient HTTP proxy and
certificate environment settings are ignored, normal TLS verification remains enabled, and there
is no custom CA or TLS-bypass feature. Credentialed inventory additionally requires HTTPS except
for the explicit syntactic loopback-only HTTP exception; ordinary private-network HTTP remains
valid only for credential-free Phase 2A health.

### Metadata exposure

A valid response reveals up to 200 workflow names, active states, and update times to every client
that can reach the Hub route. Names can disclose customers, projects, systems, people, schedules,
and internal operations even without workflow definitions.

The API omits IDs, origins, links, totals, cursors, tags, descriptions, project/folder information,
nodes, settings, credentials, and executions. This reduction does not make the remaining summary
public data. The same localhost-only warning applied to prompts, workflow links, transfers, Ollama,
and n8n health applies here with greater credentialed-provider impact.

### Logging and error isolation

The fixed Hub route has no query, so access logs contain no key, cursor, filter, name, or provider
target. Application code does not log provider request headers, response headers, bodies, parsed
objects, exception strings, URLs, cursors, key configuration, or workflow summaries.

Expected failures become fixed local states. Provider status text, error JSON, `Location`,
`Retry-After`, cookies, certificate detail, DNS result, and transport exception text are never
reflected. Unexpected exceptions use the existing general application handling and tests ensure
synthetic secret/body/cursor markers do not appear in captured logs.

### No provider mutation

The inventory client contains no method for POST, PUT, PATCH, or DELETE and no route for workflow
IDs. It cannot create, retrieve details, update, activate, deactivate, execute, transfer, archive,
delete, or otherwise mutate a workflow. The UI has no mutation affordance.

The larger scope of an unscoped n8n key remains a credential-risk fact, not an application feature.

### Docker boundary

API-process environment forwarding is not Docker Engine access. The application still receives no
Docker socket, SDK, Engine API, CLI, `DOCKER_HOST`, socket proxy, privileged mode, capability,
container metadata, control action, or n8n container.

Phase 2C container visibility remains separate and unapproved until its own design review.

## Failure Handling

| Failure | Backend behavior | Frontend behavior |
| --- | --- | --- |
| Origin or key missing/exact-empty | Zero provider requests; unconfigured 200 | Neutral setup guidance; clear prior rows |
| Origin or key invalid | Zero provider requests; fixed invalid-configuration 200 | Fixed configuration error |
| Provider 401/403 | Stop immediately; fixed access-denied 200 | Fixed access guidance; no raw status/body |
| Redirect, 429, other non-200 | Stop immediately; fixed unavailable 200 | Fixed unavailable message; no retry |
| DNS/connect/TLS/transport failure | Fixed unavailable 200 | Fixed unavailable message |
| Five-second eligibility deadline exceeded | Cancel or reject current work; fixed timeout 200 | Fixed timeout message |
| Wrong/missing content type | Close response; fixed invalid-response 200 | Fixed provider-response message |
| More than 8 MiB total | Close response; discard current partial result | Fixed provider-response message |
| Malformed/deep/wrong-shape JSON | Discard current partial result | Fixed provider-response message |
| Invalid name/active/time | Discard current partial result | Fixed provider-response message |
| Invalid/repeated cursor | No further request; discard current partial result | Fixed provider-response message |
| Valid fourth page with next cursor | Return 200 summaries and `truncated: true` | Retain rows and show bounded-result notice |
| Hub route unreachable/non-200 | No provider contract available | Fixed Hub-unavailable error |
| Hub returns malformed contract | Browser rejects it | Fixed Hub-invalid-response error |
| Refresh fails after valid snapshot | Service returns failure; no partial new rows | Retain prior rows as stale; polite warning |
| Navigation/unmount while pending | Browser aborts request | No late state update or confirmation |

No failure triggers an automatic retry, alternate endpoint, fallback key, detail request, provider
link, or partial current snapshot.

## Testing Strategy

### Backend configuration tests

Tests cover:

- missing and exact-empty key normalization;
- opaque non-empty preservation without trimming;
- `repr=False` for both n8n settings;
- visible ASCII key boundaries at 1 and 8,192 characters;
- rejection of space, tab, CR, LF, control, Unicode, and oversized keys;
- high-entropy key markers absent from Settings representation and safe errors;
- unchanged existing environment defaults and Phase 2A settings behavior.

### Inventory client tests

Controlled `httpx` transports cover:

- zero transport construction for missing/empty/invalid origin or key;
- exact GET method, `/api/v1/workflows` path, first-page query, and `Accept`;
- exact key header only on inventory requests;
- no key on Phase 2A health paths under the same Settings fixture;
- no Authorization, Cookie, Referer, forwarding, request-body, or browser-derived header;
- HTTPS and accepted/rejected syntactic-loopback HTTP origins without DNS classification;
- `trust_env=False`, TLS verification, redirect rejection, and exact deadline semantics;
- fresh cookie jars across pages;
- exact 200 parsing and 401/403/access-denied mapping;
- redirect, 404, 429, 5xx, DNS-like, connect, TLS-like, and transport failure mapping;
- timeout during request, body streaming, parsing, and later pages;
- accepted `application/json` with optional charset and rejected other/missing media types;
- exact `Accept-Encoding: identity`, absent/identity response encoding, and rejected compressed or
  unknown content encoding;
- chunked byte accounting at and beyond 8 MiB;
- depth 64 accepted and depth 65 rejected using string-aware scanning;
- malformed/invalid-UTF-8 JSON, BOM, `NaN`/infinity, duplicate keys, invalid
  root/data/cursor/item types, and too many page items;
- accepted ignored-field lone surrogates and rejected projected-field/cursor lone surrogates;
- empty, oversized, control-containing, and repeated cursors;
- reserved cursor characters safely encoded as one query value;
- exactly 50 items per page, four pages, 200 items, and request-count caps;
- complete pagination, exact cap truncation, and no partial result after a later failure;
- name, boolean, and timezone-aware timestamp boundaries;
- unknown sensitive provider fields ignored and absent from normalized results;
- malicious node, connection, pin, credential, cookie, body, exception, header, status, URL, key,
  and cursor markers absent from results and captured logs;
- no real n8n request.

### Schema and API tests

Tests cover:

- exact models for all seven states;
- cross-field invariants, item/name/time/count bounds, and extra-field rejection;
- exact parameter-free GET route and privacy headers;
- no target, cursor, filter, key, body, or custom request header in OpenAPI;
- no POST, PUT, PATCH, DELETE, detail, execution, or mutation route;
- dependency override construction and cleanup;
- every normalized client result mapped without raw values;
- secret and provider markers absent from HTTP and application/access logs;
- fixed-path access-log redaction remains correct;
- Phase 2A health route schema, behavior, and key-free requests unchanged;
- no regression to health, Ollama, Prompt, Workflow Link, Transfer, or migration APIs.

### Frontend API tests

Tests cover:

- exact relative path, GET method, no provider/key/query/body, and AbortSignal forwarding;
- every valid response state and fixed error;
- exact keys and approved item fields only;
- item/name/time/count and cross-state boundaries;
- rejected missing, extra, mistyped, unknown, malformed, non-200, network, and body-read cases;
- abort during fetch and response parsing;
- proof that no response field is treated as a URL or fetched.

### Frontend controller tests

Tests cover:

- Integrations entry makes zero inventory requests;
- explicit first load makes exactly one request;
- pending duplicate activation remains one request;
- advancing fake timers creates zero polling or retry requests;
- successful empty, populated, and truncated snapshots;
- unconfigured clears prior rows as a valid state;
- first-load configuration/provider/Hub/contract failures;
- refresh failure retains prior rows and timestamp as stale;
- successful refresh replaces rows and clears stale state;
- leave, unmount, abort, and generation ownership;
- re-entry preserves the snapshot and creates zero requests;
- no local/session/Cache/IndexedDB/service-worker/clipboard writes.

### View and navigation tests

Tests cover:

- separate health and inventory headings, actions, pending states, and copy;
- narrowed credential-free health statement and backend-only inventory-key statement;
- idle, unconfigured, loading, empty, populated, truncated, first-error, and stale displays;
- exact name, Active/Inactive text, localized `<time>`, and loaded count;
- no provider total claim;
- no ID, cursor, origin, key state, link, copy, search, filter, detail, execution, or mutation control;
- semantic list and heading relationships;
- `aria-busy`, live-region behavior, focus retention, and 44-pixel controls;
- malicious names rendered inertly;
- existing Prompt, Workflow, Transfer, and Integrations navigation guards;
- no sixth navigation view and no request from Overview or another view;
- responsive structural and root-width regressions.

### Compose and browser acceptance

Acceptance uses only task-owned synthetic keys and provider sentinels. It never needs or reads the
operator's home n8n key.

The sentinel supports fixed paginated JSON pages and controlled:

- empty and populated inventory;
- four-page truncation;
- 401/403;
- redirect, 429, and 5xx;
- delay and timeout;
- malformed, deep, wrong-content-type, and oversized payloads;
- repeated and reserved-character cursors;
- sensitive body, header, cookie, workflow-definition, and key markers.

Acceptance verifies:

- missing/empty/invalid configuration makes zero provider requests;
- every configured request is the exact fixed GET collection path and query;
- the synthetic key appears only in the provider request header and nowhere in Hub/browser/log
  output;
- health requests remain key-free;
- cursor encoding cannot add a provider query or target;
- request/page/item/byte/deadline bounds and no retry;
- direct and Vite-proxied Hub responses match;
- Compose forwards the synthetic key only to API runtime and not web/build metadata;
- every Compose command explicitly overrides ambient n8n values;
- Firefox performs manual load, empty/populated/truncated/error/stale/abort/re-entry flows;
- provider names remain inert and accessible;
- no provider-origin browser request or browser persistence occurs;
- exact 320/600/601/880/881/1,024/1,080/1,081/1,280 px layouts have zero document overflow;
- task-owned processes, ports, files, databases, browser profiles, containers, networks, and volumes
  are removed.

A live home-server smoke is optional follow-up evidence and must use an operator-managed key without
printing it. It is not an implementation or acceptance requirement.

## Regression and Scope Gates

Before each applicable implementation commit:

- run backend tests before committing backend changes;
- run relevant Ruff checks and formatting checks for backend changes;
- run frontend lint and typecheck before committing frontend changes;
- run `make test-web` before committing Integrations UI behavior changes;
- run the relevant production build for changed frontend or Compose behavior;
- update `history/BUILD_LOG.md` in the same commit;
- record only failures actually observed in `docs/FAILURES.md`.

Final acceptance runs the repository's complete established gates:

- dependency installation through uv and pnpm;
- stable formatting and clean diff checks;
- all backend unit and end-to-end tests;
- all frontend behavior tests;
- backend and frontend lint;
- strict backend and frontend typechecks;
- frontend production build and safe Compose image build;
- focused configuration, inventory-client, schema, API, frontend, and sentinel matrices;
- Prompt, Workflow Link, Transfer, Ollama, health, and migration regressions;
- reversible migration lifecycle and `alembic check` despite no schema change;
- isolated direct/proxied Compose checks and cleanup;
- real Firefox functional, accessibility, storage, and viewport checks;
- dependency, lockfile, schema, transfer, artifact, secret, capability, network, deployment, remote,
  and clean-Git audits.

The final scope audit proves:

- no dependency, lockfile, database schema, model, repository, or transfer-format change;
- no real `.env`, database, key, credential, log, browser profile, cache, dependency directory, or
  generated artifact tracked;
- no API key in browser/source output, logs, health requests, responses, build arguments, image
  layers, web container, or persistence;
- no request-supplied target/path/filter/cursor/header/body and no provider browser request;
- no redirect following, ambient proxy use, TLS bypass, provider cookie reuse, or raw error/data
  reflection;
- no execution/detail/mutation, retry, polling, scheduler, persistence, generic client, public
  binding, auth, or production deployment drift;
- no Docker socket/SDK/Engine/CLI/privileged capability or bundled n8n;
- loopback-only publishing and the five-view navigation remain unchanged;
- completed commits and build-log entries match;
- all disposable resources are removed;
- final Git status is clean and the explicitly authorized GitHub push is verified.

## Documentation Changes During Implementation

- README: Phase 2B capability, summary fields, manual lifecycle, configuration, key-scope warning,
  exposure, limits, endpoint, testing, and roadmap state.
- `.env.example`: exact empty `N8N_API_KEY=` placeholder only.
- `docs/DECISIONS.md`: separate credentialed adapter, summary projection, bounded backend
  pagination, and trusted-localhost exposure.
- `docs/SECURITY_NOTES.md`: key lifecycle, unscoped-key risk, confused-deputy route, provider-data
  minimization, logging, and unchanged public/Docker/mutation prohibition.
- `docs/FAILURES.md`: only newly observed incidents.
- `history/BUILD_LOG.md`: every design, plan, implementation, finalization, and acceptance milestone.
- Existing Phase 2A design/status records remain historical and are not rewritten to imply that
  health itself uses a key.

## Expected Implementation Shape

Expected backend additions or focused edits:

- `backend/src/local_ai_hub/config.py`;
- `backend/src/local_ai_hub/services/n8n.py` only to expose shared origin normalization safely;
- new `backend/src/local_ai_hub/services/n8n_inventory.py`;
- `backend/src/local_ai_hub/api/dependencies.py`;
- `backend/src/local_ai_hub/api/integration_schemas.py`;
- `backend/src/local_ai_hub/api/routes/integrations.py`;
- `backend/tests/unit/test_config.py`;
- existing Phase 2A client regression tests;
- new `backend/tests/unit/test_n8n_inventory_client.py`;
- `backend/tests/unit/test_integration_schemas.py`;
- `backend/tests/e2e/test_integrations_api.py`;
- `backend/tests/e2e/test_access_logs.py`.

Expected frontend additions or focused edits:

- new `web/src/api/n8nWorkflowInventory.ts` and tests;
- new `web/src/features/integrations/useN8nWorkflowInventory.ts` and tests;
- new `web/src/features/integrations/N8nWorkflowInventory.tsx` and tests;
- `web/src/features/integrations/IntegrationsView.tsx` and tests;
- `web/src/features/integrations/N8nStatusCard.tsx`;
- `web/src/App.tsx` and navigation tests;
- `web/src/styles.css` and responsive regression tests.

Expected infrastructure and documentation edits:

- `.env.example`;
- `docker-compose.yml` API-runtime forwarding only;
- `Makefile` explicit safe key override;
- README and required project records.

No migration, database model, repository, transfer schema, Dockerfile, dependency manifest,
lockfile, Vite configuration, authentication module, production configuration, or Docker capability
is expected.

## Milestone Shape

The implementation plan should preserve independently verifiable conventional commits,
approximately:

1. `feat: add n8n workflow inventory client`
2. `feat: expose n8n workflow inventory api`
3. `feat: add n8n inventory frontend contract`
4. `feat: add manual n8n inventory controller`
5. `feat: add n8n workflow inventory panel`
6. `chore: configure phase 2b secret boundary`
7. `chore: finalize phase 2b integration`
8. `test: record phase 2b acceptance validation`

The detailed implementation plan may split or combine milestones when test ownership and build-log
entries are clearer. Every milestone includes its build-log entry in the same commit. Verified
milestones may be pushed under the operator's explicit GitHub authorization.

## Acceptance Criteria

Phase 2B is complete only when every statement is true:

1. Missing or exact-empty origin/key returns unconfigured and creates zero provider requests.
2. Invalid non-empty origin/key returns a fixed safe state and creates zero provider requests.
3. `N8N_API_KEY` is API-process-only, opaque, repr-suppressed, non-persisted, and absent from health,
   browser, logs, exceptions, responses, build output, and the web container.
4. Phase 2A health remains credential-free and behaviorally unchanged.
5. Inventory requires HTTPS except for exact `localhost` or a canonical loopback IP over HTTP;
   every other HTTP origin creates zero credentialed requests.
6. The inventory client calls only `GET /api/v1/workflows` with fixed page size,
   `excludePinnedData=true`, and backend-owned encoded cursors.
7. The client sends the key only as `X-N8N-API-KEY`, requests and accepts only identity encoding,
   follows no redirect, ignores ambient proxies, verifies TLS, reuses no provider cookie, and
   retries nothing.
8. One attempt is bounded to four pages, 50 items per page, 200 items total, 8 MiB total
   identity-encoded representation bytes, depth 64, cursor length 2,048, and one five-second
   eligibility deadline with hard awaited-I/O cancellation and no successful result after expiry.
9. Any later-page failure discards the current partial attempt; cap completion alone returns safe
   summaries with `truncated: true`.
10. Provider bodies are projected to only name, active state, and updated time; every other provider
   field, including IDs and cursors, is absent from Hub output.
11. `GET /api/integrations/n8n/workflows` is parameter-free, GET-only, strict, and uses privacy
    headers.
12. Expected configuration, access, transport, timeout, HTTP, payload, and pagination failures map
    only to the approved fixed states and messages.
13. Entering Integrations makes zero inventory requests; explicit Load/Refresh is the only trigger.
14. Pending activation coalesces; navigation/unmount aborts; no polling, retry, background load, or
    persistence exists.
15. Successful results remain in React memory across navigation; failed refresh retains only the
    earlier snapshot as visibly stale.
16. The UI shows only names, textual Active/Inactive state, updated times, loaded count, and a
    possible truncation notice.
17. No provider total, ID, cursor, origin, key state, link, search, filter, detail, execution, JSON,
    Copy/Open, or mutation control appears.
18. The health and inventory boundaries are clearly distinguished in accessible copy and controls.
19. The five-view navigation and Integrations page remain accessible and overflow-free at the exact
    approved Firefox widths.
20. Compose forwards only an optional API runtime key, every tracked Compose command supplies an
    explicit safe value, and no key reaches web/build metadata.
21. No dependency, schema, transfer, auth, public/deployment, provider-mutation, generic-target, or
    Docker-capability change is added.
22. Existing Phase 0–2A tests, migration lifecycle, Compose behavior, and security boundaries pass.
23. Documentation and build history accurately describe the capability, secret risk, metadata
    exposure, limits, and deferred work.
24. Automated acceptance requires no real key or home n8n and removes every disposable resource.
25. Completed work is committed conventionally, Git is clean, and the authorized push is verified
    against `origin/main`.

## Deferred Work

### Workflow details and executions

Nodes, connections, settings, tags, descriptions, folders, projects, provider links, individual
workflow retrieval, execution metadata, and execution logs remain excluded. Each would expose more
sensitive provider content and needs a separate approved design.

### Provider mutations

Activation, deactivation, execution, retry, create, edit, archive, delete, transfer, import, and
other provider changes remain deferred until authentication, authorization, audit, idempotency,
confirmation, least-privilege, and abuse-case work exists.

### Phase 2C container visibility

Authoritative container inventory remains a separate design. The application still has no Docker
access, and n8n HTTP/API observations must not be labeled as container state.

### Authentication and network deployment

Hub authentication, per-capability authorization, rate limiting, audit history, TLS, reverse proxy,
multi-user isolation, and public or LAN deployment belong to later phases. Phase 2B does not imply
that credentialed provider data is safe to expose beyond trusted localhost.

### Generic integrations

Multiple n8n origins, other providers, arbitrary targets, custom paths, request-controlled filters,
saved configuration, secret-manager plugins, aggregate polling, and synchronization require new
configuration, schema, SSRF, authorization, and request-amplification designs.

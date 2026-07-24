# Local AI Workflow Hub Phase 2A n8n Health Observation Design

**Date:** 2026-07-19

**Status:** Implemented; final acceptance pending

**Sequence:** Phase 2A after Phase 1A Prompt Registry, Phase 1B Workflow Links, and Phase 1C
Import/Export

**Schema impact:** None. Phase 2A stores no integration configuration, observations, or history.

**Runtime dependency impact:** None. The backend reuses `httpx`; the frontend reuses the existing
React and browser APIs.

**Credential impact:** None. Phase 2A neither defines nor reads `N8N_API_KEY` and sends no
authorization header.

## Summary

Phase 2A adds an optional, credential-free observation of one operator-configured self-hosted n8n
instance. The backend checks n8n's fixed liveness and readiness endpoints, normalizes the result into
four dashboard states, and exposes that bounded result through one same-origin API route. A fifth
Integrations view requests the observation only when entered or explicitly refreshed.

The feature remains observational. It does not list workflows or executions, read an API key,
contact saved Workflow Links, discover arbitrary services, inspect Docker, persist observations, or
perform any remote action. Missing configuration is a first-class state and causes zero outbound
requests, so implementation and automated acceptance do not require the operator's home n8n server.

## Problem

Phase 1 can store an inert n8n Workflow Link, but it intentionally cannot answer whether n8n is
running or ready. The next useful step is a narrow health signal that preserves the Hub's
localhost-first and read-only posture without prematurely creating a credential broker, generic
network scanner, Docker control plane, or provider synchronization layer.

The first integration must establish boundaries that later Phase 2 work can reuse:

- provider targets come only from trusted process configuration;
- the browser never contacts a provider directly;
- outbound methods and paths are fixed in code;
- expected provider failure becomes normalized state rather than an application crash;
- upstream values, bodies, exceptions, and credentials are not reflected or logged;
- tests use controlled transports and sentinels instead of a real service.

## Goals

- Observe one optional n8n origin without authentication.
- Distinguish not configured, online, degraded, and offline states.
- Use n8n liveness and readiness as separate signals.
- Make zero n8n requests before the operator opens Integrations.
- Refresh once on Integrations entry and only on explicit operator refresh afterward.
- Keep all provider requests on the backend behind a fixed same-origin Hub route.
- Fail closed on malformed configuration before constructing an outbound request.
- Reject redirects and ignore ambient HTTP proxy configuration.
- Avoid reading or buffering n8n response bodies.
- Expose only canonical origin and normalized health metadata.
- Reuse current dependencies, test seams, visual language, and localhost-only development setup.
- Preserve every Phase 1 API, persistence, navigation guard, and security boundary.

## Non-goals

Phase 2A will not include:

- n8n API keys, cookies, sessions, login, OAuth, or authorization headers;
- workflow, project, tag, credential, user, execution, audit, or node inventory;
- workflow activation, execution, creation, update, deletion, export, or import;
- webhook invocation or test execution;
- n8n metrics, version discovery, licensing, queue details, or response-body metadata;
- generic service targets, arbitrary paths, request-supplied URLs, or saved-link probing;
- Docker Engine, Docker socket, Docker SDK, `DOCKER_HOST`, CLI subprocesses, container inventory,
  image data, mounts, networks, logs, environment values, restart, stop, or delete actions;
- persistence, caching, history, uptime calculations, alerting, notifications, or background polling;
- a schema migration or changes to Prompt and Workflow Link transfer format version 1;
- custom health paths, headers, methods, timeouts, proxy settings, redirect policy, or TLS bypass;
- browser-side provider requests, CORS expansion, iframe, prefetch, redirect, or Open actions;
- bundling or deploying n8n in the Hub's Compose project;
- authentication, public deployment, production proxying, or network-exposure changes;
- a new runtime or frontend dependency.

## Alternatives Considered

### Provider-specific backend adapter — selected

A dedicated n8n client owns origin validation and the two fixed health requests. A provider-specific
Hub endpoint returns one strict normalized contract, and the browser renders it without knowing how
to contact n8n.

This is the smallest useful slice and the easiest network surface to audit. It follows the existing
Ollama pattern while adding stricter redirect, body-read, and privacy-header requirements for new
integration work.

### Generic service-health registry — deferred

A generic probe engine could accept multiple named targets and paths, but it would require a config
format, target and path policy, provider-specific response semantics, aggregation behavior, and a
larger SSRF analysis. It could also become an unauthenticated arbitrary request primitive if a target
ever came from an API request or persisted Workflow Link.

Phase 2A instead proves one fixed provider boundary. Generic services require a separate approved
design.

### Browser-direct n8n checks — rejected

Direct browser requests would require n8n CORS behavior to match the Hub, expose the provider origin
to client request code, complicate local network failures, and bypass the backend's validated target,
timeout, proxy, redirect, and error-sanitization boundary.

The browser will call only the Hub's relative API path.

## Product Decisions

### One configured n8n instance

Phase 2A observes at most one n8n origin. It is configured through `N8N_BASE_URL`; there is no list,
name, provider registry, database row, or browser settings form.

### Opt-in configuration

Unset and exactly empty `N8N_BASE_URL` values mean not configured. This state is not an error and
causes zero provider requests. Implementation will add only `N8N_BASE_URL=` to `.env.example`, with
no working target. The application continues to avoid loading `.env` files itself.

Whitespace-only and whitespace-surrounded non-empty values are invalid rather than silently trimmed.
This preserves a visible distinction between an intentional blank placeholder and malformed process
configuration.

### Manual observation lifecycle

The Overview page does not check n8n. Entering Integrations starts one observation. The operator may
start another with Refresh n8n. There is no timer, interval, service worker, visibility listener,
background loop, retry, or server-side scheduler.

Re-entering Integrations performs a fresh observation. A pending browser request is aborted when the
operator leaves the view, starts a newer refresh, or unmounts the application.

### Liveness and readiness are distinct

n8n's `/healthz` endpoint represents process liveness, while `/healthz/readiness` adds readiness for
serving traffic. Phase 2A calls readiness only after liveness returns HTTP 200. The selected semantics
follow the official
[n8n Monitoring documentation](https://docs.n8n.io/hosting/logging-monitoring/monitoring/), which
defines reachability separately from database-connected, migrated readiness.

n8n can customize its health path through `N8N_ENDPOINT_HEALTH`. Phase 2A intentionally supports
only the default fixed paths. An instance configured with a custom health path therefore appears
offline until the operator restores the default or a future approved design adds fixed-path
configuration.

Phase 2A treats only exact HTTP 200 as a passing check. All other status codes fail that check. It
does not infer health from response content.

### Observation rather than authority

Online means the two fixed HTTP checks returned 200 at one moment. It does not prove that every n8n
feature, worker, credential, workflow, webhook, database query, or downstream dependency is healthy.
Degraded means the liveness check passed but readiness did not. Offline means the liveness request did
not return 200; it may represent connection failure, timeout, TLS failure, a disabled endpoint, an
HTTP error, or invalid Hub configuration.

The UI explains these boundaries and does not claim authoritative container state.

## Architecture

~~~text
Integrations React view
  |
  | GET /api/integrations/n8n/status
  v
FastAPI integrations route
  |
  | injected N8nHealthClient
  v
validated N8N_BASE_URL
  |
  +-- GET /healthz
  |
  '-- GET /healthz/readiness  (only after liveness passes)
          |
          v
normalized state only; response bodies are never consumed
~~~

The units remain provider-specific and independently testable:

1. Settings owns the optional raw process value.
2. `N8nHealthClient` owns origin validation, transport policy, fixed requests, and state mapping.
3. A dependency factory creates an injectable client from Settings.
4. A thin FastAPI route maps the immutable service result to a strict response schema and privacy
   headers.
5. A frontend API module validates the Hub response at runtime.
6. An abortable controller owns view-entry and manual-refresh request state.
7. A presentational view and card render only normalized values.

No persistence or repository unit participates in the flow.

## Backend Design

### Settings

`Settings` gains `n8n_base_url: str | None = None`.

`Settings.from_env()` reads only the process environment:

- missing `N8N_BASE_URL` becomes `None`;
- exact empty string becomes `None`;
- every non-empty string is preserved for client validation;
- no `.env`, file, database row, command, or secret manager is opened.

Phase 2A defines no credential field, and operators must not put credentials in the base URL. Because
the raw setting can still contain an operator mistake before validation, code must never log or expose
the Settings representation. Future keys must not be added to this dataclass without a separate
redaction and authorization design because dataclass representations can expose field values.

### Origin contract

A configured n8n value is valid only when all conditions hold:

- length is at most 2,048 characters;
- it is byte-for-byte equal to its trimmed form;
- scheme is `http` or `https`;
- a host is present;
- optional port is between 1 and 65,535;
- user information is absent;
- query and fragment are absent;
- path is empty or exactly `/`;
- parsing and canonical reconstruction complete without URL, Unicode, or port errors;
- the reconstructed canonical origin is also at most 2,048 characters.

The request origin is reconstructed from scheme, parsed host, and optional port. A single root slash
is removed from the canonical display. Raw invalid input is never placed in a response or log.

Localhost, loopback, private addresses, single-label homelab DNS names, canonical IPv4, and bracketed
IPv6 remain allowed because the value is trusted startup configuration for a local observability
tool. The API accepts no target parameter, so an unauthenticated caller cannot select another host.

### Transport policy

Each fixed check receives a fresh, isolated `httpx.AsyncClient` context with:

- the validated canonical origin as `base_url`;
- `httpx.Timeout(3.0)` so no individual network operation has a longer timeout;
- `trust_env=False`;
- normal TLS certificate verification;
- redirects disabled;
- an optional injected transport factory for tests.

Each request also runs inside a three-second `asyncio.timeout()` wall-clock deadline. A complete
online observation can therefore spend up to two sequential deadlines; it is not advertised as a
single three-second operation.

One client context performs exactly one request. Readiness receives a new empty cookie jar instead of
reusing the liveness client, so a liveness `Set-Cookie` can never become a readiness `Cookie` header.
Connection reuse is intentionally sacrificed for this isolation guarantee. Each request uses a
streaming response context, evaluates only the status code, and closes without reading response
bytes. No JSON, text, status text, response header, cookie value, or provider metadata is copied into
Hub state, output, or logs; the isolated client and any library-managed response metadata are
disposed after that one check.

The client sends no request body and no authorization, cookie, custom forwarding, or operator-supplied
header. Both outbound methods are GET, and both paths are code constants.

### Normalized types

The service layer uses closed literal or enum values:

- observation state: `unconfigured`, `online`, `degraded`, `offline`;
- check state: `passed`, `failed`, `not_checked`.

The immutable result contains exactly:

- `state`;
- `base_url` as canonical string, `Invalid configuration`, or `None`;
- `liveness`;
- `readiness`;
- `error` as a fixed safe string or `None`.

### State mapping

| Condition | State | Liveness | Readiness | Error |
| --- | --- | --- | --- | --- |
| Setting missing or empty | unconfigured | not_checked | not_checked | null |
| Setting invalid | offline | not_checked | not_checked | Invalid n8n base URL |
| Liveness transport/TLS/timeout failure | offline | failed | not_checked | Connection failed |
| Liveness returns non-200, including redirect | offline | failed | not_checked | n8n health check failed |
| Liveness 200; readiness transport or non-200 | degraded | passed | failed | n8n is reachable but not ready |
| Both return 200 | online | passed | passed | null |

Expected configuration, transport, timeout, TLS, and HTTP failures are converted to this table. Raw
exceptions and upstream content never escape the client. Unexpected programming errors are not
silently relabeled as provider state; they remain ordinary application defects handled through the
Hub's existing safe operational process.

### Dependency and route

`get_n8n_health_client` follows the current injectable Ollama client factory and receives Settings
through FastAPI dependencies. Tests can override the factory without modifying process configuration.

The route is:

`GET /api/integrations/n8n/status`

Every normalized provider state returns HTTP 200. The response uses:

- `Content-Type: application/json` through FastAPI's schema response;
- `Cache-Control: no-store`;
- `Pragma: no-cache`;
- `X-Content-Type-Options: nosniff`.

There is no Content-Disposition, redirect, CORS expansion, request body, query parameter, or path
parameter.

### API contract

Online example:

~~~json
{
  "state": "online",
  "base_url": "http://localhost:5678",
  "liveness": "passed",
  "readiness": "passed",
  "error": null
}
~~~

Unconfigured example:

~~~json
{
  "state": "unconfigured",
  "base_url": null,
  "liveness": "not_checked",
  "readiness": "not_checked",
  "error": null
}
~~~

Degraded example:

~~~json
{
  "state": "degraded",
  "base_url": "http://localhost:5678",
  "liveness": "passed",
  "readiness": "failed",
  "error": "n8n is reachable but not ready"
}
~~~

Invalid configuration example:

~~~json
{
  "state": "offline",
  "base_url": "Invalid configuration",
  "liveness": "not_checked",
  "readiness": "not_checked",
  "error": "Invalid n8n base URL"
}
~~~

The Pydantic response model constrains every enum, the canonical-origin maximum length, and `error`
to the four fixed messages in the state table or `None`. The browser independently validates exact
keys and accepts only cross-field combinations represented by that table. In particular:

- unconfigured requires a null origin, both checks not checked, and no error;
- invalid configuration requires the exact safe display and configuration error;
- every network-derived offline or degraded result requires a canonical non-empty origin of at most
  2,048 characters and its matching fixed error;
- online requires both checks passed and no error.

No arbitrary backend error string or inconsistent state/check combination is rendered.

## Frontend Design

### Navigation

`integrations` becomes the fifth `ActiveView`. The existing Prompt, Workflow, and Transfer exit
guards remain centralized and unchanged. Integrations has no dirty state and requires no confirmation
when leaving; its pending request is safely abortable.

Opening Integrations activates its controller and triggers one request. Initial application load on
Overview triggers no n8n request.

At widths above 600 px, all five navigation buttons remain in one equal-width row. The navigation
group may move below the brand/status group as a whole when the masthead needs room, but neither
group may force horizontal overflow. At 600 px and below, the five buttons use a six-track grid:

- Overview, Prompts, and Workflows each span two tracks on the first row;
- Transfer and Integrations each span three tracks on the second row;
- every target remains at least 44 px high;
- labels may wrap safely without forcing root width.

Exact-browser acceptance covers 320, 600, 601, 880, and 1,280 px widths, including the single
five-button row at every width above 600 px.

### API boundary

`web/src/api/integrations.ts` calls only the relative Hub path
`/api/integrations/n8n/status` through the shared JSON transport. It never calls `base_url`.

The runtime parser accepts only the exact response shape and rejects:

- missing or additional fields;
- unknown state/check values;
- non-string or unbounded string fields;
- invalid nullability;
- arrays or non-object roots;
- malformed or non-JSON responses.

A rejected contract becomes a fixed Hub-response error and never renders raw payload content.

### Controller

`useIntegrations(enabled)` owns:

- the latest valid observation or `null`;
- initial loading state;
- background refresh state;
- fixed request/contract error state;
- the local time of the latest valid observation;
- the active AbortController and request generation.

Behavior:

1. A false-to-true `enabled` transition starts one observation.
2. Every controller-level refresh start aborts and supersedes any earlier request.
3. Leaving or unmounting aborts the active request.
4. An aborted or stale completion cannot change state.
5. The first failure shows the page-level Hub error state.
6. A refresh failure preserves the last valid observation, keeps its previous checked time, and shows
   fixed copy that the snapshot may be stale.
7. A valid offline, degraded, online, or unconfigured response is a successful observation and updates
   the checked time.
8. There are no automatic retries or timers.

When Integrations is re-entered with a previous valid snapshot, that snapshot and its checked time
remain visible while the mandatory fresh observation is labeled as a background refresh. A valid
completion replaces it. A failed completion preserves it with the same stale warning used for a
manual refresh failure. When no valid snapshot exists, entry uses the initial-loading state instead.

The visible Refresh button is disabled while pending, so a second operator activation cannot occur.
The abort-and-supersede rule remains an internal controller guarantee for re-entry, programmatic
calls, and request-generation races.

### View and card

The Integrations view contains:

- an integration-safety header and Phase 2A label;
- one n8n observation card;
- an explicit Refresh n8n button;
- a local Last checked value;
- a footer that preserves the private/local message.

The card displays:

- state label and fixed explanation;
- canonical configured origin as inert text, never an anchor;
- liveness label;
- readiness label;
- fixed sanitized error copy when present.

Unconfigured copy instructs the operator to set `N8N_BASE_URL` in the API process environment and
restart the API. It does not offer a browser editor, clipboard action, link, or secret input.

Color is supplementary:

- online uses the existing success/green tone;
- degraded uses amber;
- offline uses the existing error/red tone;
- unconfigured uses neutral styling.

Each state is also written as text. A polite live region announces completed observations and refresh
failures. The Refresh button remains disabled and exposes pending text during a request. Focus stays
on the initiating control; no automatic focus jump is needed for a non-destructive refresh.

The view supports reduced motion and the established high-contrast industrial control-room language
without adding a component library.

## Configuration and Development Setup

`.env.example` adds:

~~~dotenv
N8N_BASE_URL=
~~~

This is an intentionally non-working placeholder, not a default target.

For a backend running directly on the host, an operator may later provide an origin such as
`http://localhost:5678`. For the API container to reach an n8n instance published on the host, the
documented example is `http://host.docker.internal:5678`. The project will not assume either value.

Compose forwards `${N8N_BASE_URL:-}` into only the API container. Missing configuration therefore
arrives as the exact empty placeholder and remains unconfigured. Compose adds no n8n container,
network exposure, secret, healthcheck, dependency, volume, or socket mount.

`--env-file /dev/null` prevents project env-file loading but does not override an exported shell
variable. Every Makefile, build, config, and acceptance command that renders, builds, or starts
Compose therefore sets an explicit safe `N8N_BASE_URL=`, or a task-owned sentinel origin when that
origin is the subject of the check. Existing ambient protected values are never consulted or
printed. A focused test may set its own harmless marker in the command environment and prove that
the explicit safe override excludes that marker from rendered Compose configuration; it never reads
or reports the operator's ambient configuration.

## Security Model

### Fixed-target SSRF boundary

The backend performs outbound requests, so Phase 2A creates a narrow SSRF-relevant capability. Its
scope is constrained by all of the following:

- target comes only from startup process configuration;
- route accepts no target, path, method, header, or body input;
- saved Workflow Links remain inert and are never reused;
- only two constant paths and GET are allowed;
- redirects are not followed;
- ambient proxy variables are ignored;
- invalid configuration fails before a request is created;
- there is no generic fetch, proxy, preview, or metadata route.

Private and loopback targets are deliberately allowed because homelab observation is the feature.
This is acceptable only while targets remain trusted operator configuration and the Hub remains on a
trusted localhost.

### Metadata exposure

Any client that can reach the unauthenticated Hub API can trigger a check and learn:

- whether n8n is configured;
- its canonical configured origin;
- liveness and readiness state at request time.

This is sensitive topology metadata. `no-store` headers reduce application-controlled caching but do
not provide authentication. Public or untrusted exposure remains prohibited.

### Provider response isolation

Application code does not read, parse, retain, return, or log provider response bodies. It does not
copy or forward provider headers, cookies, status text, redirects, exceptions, TLS details, DNS
results, or timing information. The one-request HTTP client may process response headers internally,
but it is disposed immediately; readiness receives a fresh client and no liveness cookie. Only
pass/fail status and fixed local messages reach the browser.

### Request amplification

One Hub request produces zero, one, or two sequential provider requests. There is no concurrency fan-
out, retry, polling, or caching layer. The UI disables duplicate refresh activation while pending;
this is a usability bound, not authorization or rate limiting. The localhost-only deployment posture
remains required.

### Credential boundary

Phase 2A has no credential. It does not add `N8N_API_KEY` to `.env.example`, Settings, Compose,
request headers, tests, logs, or UI. Credentialed n8n inventory remains Phase 2B and requires a new
design covering authorization, least privilege, redaction, API compatibility, and exposure through
the currently unauthenticated Hub.

### Docker boundary

HTTP health observation is not Docker container inventory. Phase 2A adds no socket, SDK, Engine API,
`DOCKER_HOST`, CLI invocation, socket proxy, privileged mode, mount, inspect data, or container action.
Container visibility remains a separately approved Phase 2C design.

## Failure Handling

| Failure | Backend behavior | Frontend behavior |
| --- | --- | --- |
| Missing/blank setting | Zero request; normalized unconfigured 200 | Neutral setup guidance |
| Invalid setting | Zero request; normalized offline 200 | Fixed configuration error; no raw value |
| DNS/connect/timeout/TLS error on liveness | Fixed offline 200 | Offline card |
| Redirect or non-200 on liveness | Fixed offline 200 | Offline card |
| Readiness transport or non-200 failure | Fixed degraded 200 | Degraded card |
| Provider sends huge/malformed/sensitive body | Body remains unread | No provider content rendered |
| Hub route unreachable | Browser transport error | Page-level Hub unavailable state |
| Hub returns malformed contract | Browser rejects response | Fixed invalid-response state |
| Refresh fails after a valid result | Earlier observation preserved | Stale warning and prior checked time |
| Navigation/unmount during request | Browser aborts request | No stale update or confirmation dialog |

The API does not conflate a Hub failure with n8n offline state. The browser displays provider state
only after receiving and validating a successful normalized contract.

## Testing Strategy

### Backend unit tests

Settings and client tests cover:

- missing and exact-empty configuration;
- whitespace-only and whitespace-surrounded invalid values;
- raw and reconstructed-canonical length bounds;
- allowed HTTP/HTTPS origins, ports, localhost, private hosts, IPv4, and bracketed IPv6;
- rejected schemes, user information, paths, queries, fragments, malformed ports, and URL errors;
- zero transport calls for unconfigured and invalid values;
- exact GET methods and `/healthz` then `/healthz/readiness` ordering;
- readiness skipped after liveness failure;
- exact-200 handling regardless of response content type, plus redirect rejection;
- transport, operation-timeout, hard wall-clock-timeout, TLS-like request, and HTTP failure mapping;
- online and degraded mapping;
- isolated clients where a sensitive liveness `Set-Cookie` never becomes a readiness `Cookie`;
- a custom response byte stream that raises if code attempts to consume the body;
- fixed safe errors without raw configuration, exception, header, or body values;
- injected transport factories backed by `httpx.MockTransport` only, with no real n8n request.

### Backend API tests

Dependency-overridden FastAPI tests cover:

- all four normalized response states;
- exact JSON shape and HTTP 200 behavior;
- privacy headers;
- canonical origin display and invalid-display sentinel;
- no reflected raw invalid value;
- factory override cleanup;
- no change to health, Ollama, Prompt, Workflow Link, or Transfer routes.

### Frontend API tests

Tests cover:

- the exact relative path and GET request;
- AbortSignal forwarding;
- all valid state/check combinations used by the backend contract;
- missing, extra, mistyped, unknown, oversized, malformed JSON, HTTP, network, and body-read failures;
- abort propagation during fetch and response parsing;
- proof that returned `base_url` is never fetched by browser code.

### Frontend controller tests

Tests cover:

- disabled state makes zero requests;
- entry makes exactly one request;
- explicit refresh and disabled pending control;
- no polling after advancing fake timers;
- leave, unmount, and superseding refresh abort behavior;
- stale completion ownership;
- initial and background loading;
- preserving a valid snapshot after refresh failure;
- checked-time updates only after valid responses;
- each normalized provider state;
- fixed safe error mapping.

### Frontend view and navigation tests

Tests cover:

- loading, unconfigured, online, degraded, offline, Hub-error, and stale-snapshot presentations;
- liveness/readiness text and inert origin rendering;
- setup guidance without input, anchor, or credential control;
- live-region announcements and pending button semantics;
- fifth-view navigation and `aria-current` ownership;
- no initial n8n request on Overview;
- existing Prompt/Workflow/Transfer navigation guards;
- 3 + 2 mobile navigation structure and root-width stylesheet regression.

### Acceptance without a home n8n server

Automated acceptance uses a disposable task-owned HTTP sentinel with fixed behavior for `/healthz`
and `/healthz/readiness`. It records methods, paths, and whether a `Cookie` header arrived. It returns
marker bodies and a sensitive liveness `Set-Cookie` value that must never appear in Hub responses,
logs, or browser text, and can simulate online, degraded, non-200, redirect, timeout, and connection-
failure states.

Acceptance verifies:

- blank configuration creates zero sentinel requests;
- invalid configuration creates zero sentinel requests;
- one online observation creates exactly two fixed GET requests in order;
- a liveness failure creates exactly one request;
- a degraded observation creates exactly two requests;
- the custom-stream unit test proves response bodies are not consumed, while the sentinel marker is
  never reflected, logged, stored, or rendered;
- readiness receives no `Cookie` header derived from the liveness response;
- direct and Vite-proxied Hub routes match;
- Compose rendering and build commands explicitly override a harmless ambient n8n marker;
- Compose can reach an explicit safe host sentinel without bundling n8n;
- Firefox covers view entry, manual refresh, navigation abort, all display states, live regions, and
  exact 320/600/601/880/1,280 px layouts;
- no browser storage, service worker, provider-origin browser request, or automatic retry appears;
- all task-owned processes, ports, files, containers, networks, and volumes are removed afterward.

A live home-server smoke test is optional follow-up evidence, not an implementation or acceptance
requirement.

## Regression and Scope Gates

Before each applicable implementation commit:

- run backend tests and Ruff for backend changes;
- run frontend lint, typecheck, build, and `make test-web` for Integrations UI behavior changes;
- update `history/BUILD_LOG.md` in the same milestone commit;
- update only failures actually observed in `docs/FAILURES.md`.

Final acceptance runs:

- `make install`;
- `make format`;
- `make test`;
- `make test-e2e`;
- `make test-web`;
- `make lint`;
- `make typecheck`;
- frontend production build and `make build`;
- migration preservation, `alembic check`, reversible lifecycle, and checksum audit;
- isolated Compose direct/proxied observation checks and teardown;
- real Firefox functional and viewport checks;
- dependency, lockfile, schema, artifact, secret, log, network, capability, remote, and clean-Git audits.

The scope audit must prove:

- no runtime dependency or schema revision;
- no API key, authorization header, credential control, or secret artifact;
- no Docker socket/SDK/Engine/CLI/privileged capability;
- no arbitrary/request-supplied/persisted target or path;
- no redirect following, TLS bypass, ambient proxy use, response-body rendering, or provider browser
  request;
- no polling, retry, persistence, provider mutation, public binding, or production configuration;
- no real `.env` read or tracked generated artifact;
- localhost-only host publishing remains unchanged;
- Git is clean and no remote push occurred.

## Documentation Changes During Implementation

- README: Phase 2A capability, optional configuration, local and Compose examples, API endpoint,
  states, limitations, security warning, checks, and roadmap status.
- `.env.example`: empty `N8N_BASE_URL=` placeholder only.
- `docs/DECISIONS.md`: provider-specific credential-free observation and manual-refresh decisions.
- `docs/SECURITY_NOTES.md`: fixed-target SSRF boundary, topology exposure, no-body rule, and continued
  key/Docker/public-deployment deferral.
- `docs/FAILURES.md`: only incidents actually observed.
- `history/BUILD_LOG.md`: every milestone and exact acceptance evidence.
- `AGENTS.md`: require `make test-web` before Integrations UI behavior commits and preserve approval
  gates for n8n keys, Docker access, schema, dependencies, auth, and deployment.

## Expected Implementation Shape

Expected backend additions or focused edits:

- `backend/src/local_ai_hub/config.py`;
- `backend/src/local_ai_hub/api/dependencies.py`;
- `backend/src/local_ai_hub/api/main.py`;
- `backend/src/local_ai_hub/api/integration_schemas.py`;
- `backend/src/local_ai_hub/api/routes/integrations.py`;
- `backend/src/local_ai_hub/services/n8n.py`;
- `backend/tests/unit/test_config.py`;
- `backend/tests/unit/test_n8n_client.py`;
- `backend/tests/e2e/test_integrations_api.py`.

Expected frontend additions or focused edits:

- `web/src/api/integrations.ts` and tests;
- `web/src/features/integrations/useIntegrations.ts` and tests;
- `web/src/features/integrations/IntegrationsView.tsx` and tests;
- `web/src/features/integrations/N8nStatusCard.tsx`;
- `web/src/App.tsx` and navigation tests;
- `web/src/styles.css` and responsive regression tests.

Expected infrastructure and documentation edits:

- `.env.example`;
- `Makefile` explicit safe Compose configuration;
- `docker-compose.yml` optional API environment forwarding only;
- `AGENTS.md`;
- README and required project records.

There is no expected migration, model, repository, transfer-schema, Dockerfile, dependency manifest,
or lockfile change.

## Milestone Shape

The implementation plan should keep independently verifiable conventional commits, approximately:

1. `feat: add n8n health observation client`
2. `feat: expose n8n integration status api`
3. `feat: add integrations dashboard view`
4. `test: add n8n health observation coverage`
5. `chore: finalize phase 2a integration`
6. `test: record phase 2a acceptance validation`

The detailed plan may split these further when tests and history entries need cleaner ownership. Each
milestone keeps its build-log entry in the same commit.

## Acceptance Criteria

Phase 2A is complete only when all statements are true:

1. Missing or empty configuration produces unconfigured state and zero provider requests.
2. Invalid configuration produces safe offline state and zero provider requests.
3. Valid configuration permits only a credential-free HTTP(S) root origin.
4. The backend calls only GET `/healthz` and, after success, GET `/healthz/readiness`.
5. Redirects are not followed, ambient proxies are ignored, TLS verification remains enabled, each
   request has a hard wall-clock deadline, no provider cookie crosses checks, and provider response
   bodies are not consumed.
6. Online, degraded, offline, and unconfigured states match the approved table.
7. `GET /api/integrations/n8n/status` returns only the strict normalized contract with privacy
   headers.
8. Overview and other views initiate no n8n request.
9. Integrations entry initiates one observation; Refresh is explicit; no timer, retry, or history
   exists.
10. Browser cancellation and generation ownership prevent stale updates.
11. The UI distinguishes provider state from Hub transport/contract failure.
12. The n8n origin is inert text and is never requested by browser code.
13. The five-view navigation and Integrations view remain accessible and overflow-free at the exact
    approved widths.
14. Application code, application containers, unit tests, frontend tests, and the n8n health matrix
    require no real n8n, API key, Docker access, or internet connection. Only the explicitly
    isolated operator-side Compose acceptance requires a local Docker Engine; the application
    receives no Docker socket, SDK, Engine API, or CLI access.
15. No schema, runtime dependency, provider mutation, generic target, public binding, auth, or
    production configuration is added.
16. Every Compose command supplies explicit safe n8n configuration; Compose forwards only the
    optional n8n origin and bundles no n8n service or extra capability.
17. Existing Phase 1 tests, migration lifecycle, Compose behavior, and security boundaries pass.
18. Documentation and history accurately describe capability, exposure, limits, and deferred work.
19. All disposable acceptance resources are removed and final Git status is clean.
20. All completed work is committed conventionally and nothing is pushed.

## Deferred Phase 2 Work

### Phase 2B — Credentialed n8n inventory

Workflow or execution metadata requires an API key and a new design for secret lifecycle,
least-privilege scope, authorization through the Hub, API compatibility, pagination, metadata
redaction, audit, and failure handling. Phase 2A provides no implied approval for that work.

### Phase 2C — Container visibility

Authoritative container inventory requires a separately approved least-privilege data source. A
read-only-looking Docker socket mount remains an effectively privileged boundary and is not approved.
Phase 2A health observation must not be described as container state.

### Generic service observation

Multiple targets, arbitrary provider types, saved configuration, custom health paths, and aggregate
polling need a separate config, SSRF, schema, UI, and request-amplification design.

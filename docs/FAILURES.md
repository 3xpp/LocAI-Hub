# Observed Failures and Resolutions

This is a factual engineering log, not a list of hypothetical risks. It records failures or
warnings actually observed while building and validating the project, their impact, and their
resolution or current action.

## 2026-07-10 — pnpm was not available on PATH

**Status:** Resolved

**Observed:** The backend portion of make install completed, then the frontend command stopped because the host did not expose a pnpm executable.

**Cause:** Node.js and Corepack were installed, but the pnpm Corepack shim had not been activated in a directory on the user PATH.

**Resolution:** Pinned pnpm 10.15.1 in web/package.json, activated the Corepack shim in the user-local executable directory, and regenerated/validated the frozen lock through the pinned project version. Literal make install, lint, typecheck, and build commands then passed.

**Prevention:** Keep the packageManager pin and list pnpm/Corepack as prerequisites. Do not replace pnpm with npm or commit node_modules.

## 2026-07-10 — Default SQLite parent directory did not exist

**Status:** Resolved

**Observed:** A fresh default Alembic upgrade failed with sqlite3.OperationalError: unable to open database file.

**Cause:** The original URL pointed to ./data/local-ai-hub.db, but the ignored data directory did not exist in a fresh checkout.

**Resolution:** Changed the local default to sqlite:///./local-ai-hub.db, which needs no pre-created directory. Compose uses its own /data named-volume URL.

**Prevention:** The migration suite exercises a disposable database, and final acceptance runs the documented default migration path.

## 2026-07-10 — SQLite stripped timezone metadata

**Status:** Resolved

**Observed:** Datetimes mapped with DateTime(timezone=True) returned from SQLite with tzinfo unset.

**Cause:** SQLite has no native timezone-aware datetime storage and SQLAlchemy's declaration alone cannot preserve the metadata.

**Resolution:** Added UTCDateTime to require aware values, normalize them to UTC, and restore UTC awareness on reads. Tests reload records from fresh sessions and verify updated_at advances.

**Prevention:** Keep timestamp behavior covered by persistence tests whenever database mappings change.

## 2026-07-10 — Alembic rejected percent-containing URLs

**Status:** Resolved

**Observed:** A temporary SQLite URL containing %20 raised ValueError: invalid interpolation syntax before migration execution.

**Cause:** Alembic configuration uses ConfigParser interpolation, and the raw percent sign was passed to set_main_option.

**Resolution:** Escape percent signs before setting the Alembic URL. The migration lifecycle test deliberately uses a filename containing %20.

**Prevention:** Retain the percent-containing migration test and avoid logging database URLs.

## 2026-07-10 — ORM and migration server defaults differed

**Status:** Resolved

**Observed:** The migration declared CURRENT_TIMESTAMP server defaults while the ORM metadata originally declared only Python defaults. Alembic drift checks did not compare server defaults.

**Cause:** Initial model and revision definitions were not fully aligned.

**Resolution:** Added matching server defaults to ORM metadata and enabled compare_server_default in both Alembic modes.

**Prevention:** Run alembic check after upgrade and keep the migration test's default inspection.

## 2026-07-10 — Starlette TestClient deprecation warning

**Status:** Open, non-blocking upstream compatibility warning

**Observed:** Pytest reports a Starlette warning that its current httpx TestClient integration is deprecated.

**Impact:** All backend and end-to-end tests pass; runtime FastAPI behavior is unaffected.

**Current action:** Do not add or swap test dependencies solely to suppress the warning without approval. Monitor compatible FastAPI/Starlette/httpx releases and update through the normal locked-dependency review.

## 2026-07-10 — Docker Compose Bake lacked Buildx

**Status:** Environment limitation with successful fallback

**Observed:** Docker Compose warned that it was configured to use Bake but Buildx was not installed.

**Impact:** Compose automatically used the default Docker builder. Both images built, started, passed smoke checks, and shut down normally.

**Current action:** No repository change is required for Phase 0. Install a compatible Buildx plugin in environments that require Bake-specific behavior.

## 2026-07-10 — Optional headless Firefox capture failed

**Status:** Open environment-only visual-capture limitation

**Observed:** Headless Firefox reported RenderCompositorSWGL failed mapping default framebuffer, no dt and did not create the requested screenshot file.

**Impact:** The optional screenshot artifact was unavailable. The live FastAPI and Vite servers worked, frontend lint/typecheck/production build passed, and independent code/accessibility reviews passed.

**Current action:** Do not treat this as an application failure. Revisit automated visual capture when a supported browser compositor or browser-test environment is available.

## 2026-07-11 — Compose frontend dependency sync waited for confirmation

**Status:** Resolved

**Observed:** The first attempt to synchronize the persistent frontend dependency volume at container
startup left `pnpm install` waiting while port 5173 reset connections instead of serving Vite. An
offline-only retry then failed with `ERR_PNPM_NO_OFFLINE_TARBALL`.

**Cause:** The existing named volume required its modules directory to be rebuilt against the image's
pnpm store, and pnpm requested confirmation before purging it. The built image's store did not retain
every registry tarball needed to reconstruct an emptied modules volume offline.

**Resolution:** Run the startup sync with the frozen lock, an append-only reporter, and `CI=true` so
the development container handles the required rebuild non-interactively before starting Vite. Keep
pnpm's store in a named volume mounted outside the bind-mounted source tree.

**Prevention:** Compose smoke waits for proxied health after startup. Allow package-registry access
after lockfile changes; do not delete the SQLite volume merely to refresh frontend dependencies.

## 2026-07-11 — Frontend Docker context included generated dependencies

**Status:** Resolved

**Observed:** A final web image rebuild transferred a 116.51 MB context and produced a 115 MB
`COPY . .` layer even though the source tree itself was small.

**Cause:** The root-name ignore entries did not exclude the generated dependency and build
directories with the active Docker builder as intended.

**Resolution:** Use explicit root-directory patterns for `/node_modules/`, `/dist/`, and
`/.pnpm-store/`, and exclude TypeScript build-info files. Mount the Compose pnpm store separately
from the source tree.

**Prevention:** Final acceptance compares Docker context and layer sizes after dependencies and the
production bundle have been generated locally.

## 2026-07-13 — Workspace patch sandbox could not configure loopback

**Status:** Environment limitation with verified patch-based fallback

**Observed:** While writing the approved Phase 1C design, the workspace patch helper repeatedly
failed before reading tracked files with `bwrap: loopback: Failed RTM_NEWADDR: Operation not
permitted`. Several approved patch commands were also delayed substantially before returning.

**Impact:** No repository content was lost or partially committed. The design work took longer than
expected, and every fallback edit required an explicit diff verification before staging.

**Current action:** Continue using patch-form edits, verify the exact Git diff after each fallback,
and do not treat this agent-environment limitation as an application runtime failure.

## 2026-07-18 — Root minimum width caused Firefox overflow at 320 px

**Status:** Resolved

**Observed:** The exact Firefox BiDi acceptance viewport reported a 320 px window with a 308 px
layout width after the vertical scrollbar was allocated. The document and body still measured 320
px wide, creating a 12 px horizontal scroll range even though the dashboard, navigation, Transfer
panels, and file control fit within the available 308 px content area.

**Cause:** Both `html` and `body` declared `min-width: 320px`, so the root boxes could not shrink to
the scrollbar-reduced layout width.

**Resolution:** Removed the two root minimum-width declarations and added a focused stylesheet
regression test. Firefox 152.0.5 then reported equal client, document-scroll, and body-scroll widths
at exact 320, 600, 601, and 1,280 px BiDi viewports.

**Prevention:** Keep the focused root-width guard and rerun the exact real-browser viewport matrix
whenever global or Transfer responsive styles change. Static CSS and DOM-bound checks do not replace
the scrollbar-aware browser assertion.

## 2026-07-19 — Root-invoked pnpm selected the wrong package-manager version

**Status:** Resolved in the implementation plan

**Observed:** Running `pnpm --dir web` from the repository root made Corepack select pnpm 11.9.0
under Node 20, which failed with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. Running
`env --chdir=web pnpm --version` returned the project-pinned pnpm 10.15.1.

**Impact:** Only draft implementation-plan commands were affected. No dependency, manifest, or
lockfile changed.

**Resolution:** The implementation plan runs pnpm with `web` as the working directory.

**Prevention:** Keep the `packageManager` pin and run pnpm with `web` as the current directory.

## 2026-07-19 — Snap geckodriver rejected a host-created profile root

**Status:** Environment constraint with verified plan workaround

**Observed:** Snap geckodriver exited with status 64 when `--profile-root` pointed at a host-created
task subdirectory. Using `/tmp` as the profile root succeeded.

**Impact:** This affected only the planned browser-acceptance harness and had no product impact.

**Current action:** Use `/tmp` for one task-owned WebDriver session, capture the returned profile,
then delete the session and process and verify task-owned cleanup.

## 2026-07-19 — Firefox outer-window sizing could not produce a 320 px viewport

**Status:** Environment constraint with verified plan workaround

**Observed:** Firefox 152 did not honor a requested 320 by 900 px outer window; the observed minimum
window and viewport were 500 by 814 px.

**Impact:** This affected only the exact-size browser-acceptance method, not product behavior.

**Current action:** Use a borderless exact-size iframe and assert its real `innerWidth` and
`innerHeight`, covering widths from 320 through 1,280 px and the 1,080/1,081 px responsive edges.

## 2026-07-24 — n8n origin normalization disagreed with browser URL semantics

**Status:** Resolved

**Observed:** During the Phase 2A frontend contract review, the backend preserved an expanded IPv6
literal while the browser compressed it, and the backend accepted scoped IPv6 plus legacy numeric
IPv4 spellings that the browser rejected or reinterpreted. The frontend parser also accepted an
explicit port `0`, even though the backend rejects that port. A follow-up parity check found that
Python 3.13 also serialized IPv4-embedded IPv6 with dotted decimal while the browser serialized the
same 128-bit address with hexadecimal hextets.
The final offline parity audit also found that a trailing dot let numeric hosts bypass the backend's
last-label check: browsers either rewrote those origins as IPv4 or rejected them, while the backend
preserved the supplied host. That sweep also found percent-encoded and raw special host characters
that HTTPX preserved or escaped while the browser decoded, reinterpreted, or rejected them.

**Impact:** A backend-produced origin could fail the strict browser contract, and ambiguous numeric
host spellings could describe a different browser origin than their backend display suggested. The
issue was confined to uncommitted Phase 2A implementation work; no release or persisted data was
affected.

**Resolution:** Convert IPv6 literals to a pure-hexadecimal 128-bit representation before applying
browser-compatible zero-run compression with the Python standard library, reject scoped IPv6 and
WHATWG-style numeric-host candidates, retain canonical dotted IPv4 and ordinary domains, and reject
port `0` explicitly at the browser boundary. Trailing-dot hosts and the exact special-character
mismatch families now fail closed at the backend; the browser contract independently rejects them.

**Prevention:** Keep paired backend/frontend parity regressions for compressed IPv6, scoped IPv6,
IPv4-embedded IPv6 in dotted and pure-hex forms, canonical and ambiguous numeric IPv4 forms,
numeric final labels, nonnumeric domains, port boundaries, trailing-dot hosts, percent-encoded host
labels, and raw special host characters.

## 2026-07-24 — Phase 2A Compose verifier used nonportable host assumptions

**Status:** Resolved

**Observed:** Three disposable Task 7 verifier runs stopped before the online n8n contract check.
The first missed correct lowercase privacy headers, the second stopped after Docker created a
sentinel container but before the startup step completed, and the third sentinel exited with
status 2 because its bind-mounted script was unreadable. Every failed run completed its trap,
preserved all preexisting Docker object IDs, removed its exact task resources, freed its ports, and
left Git unchanged.

**Cause:** The temporary verifier relied on GNU awk's `IGNORECASE`, treated Bash `read` at the
newline-less end of a Docker cidfile as success under `errexit`, and created the synthetic sentinel
script with mode `0600` under `umask 077`, which this Docker user namespace could not read through
the bind mount.

**Resolution:** Normalize header names with awk `tolower()`, load the whole cidfile with command
substitution and assert that the ID is nonempty, and set only the generated sentinel script to mode
`0444` while retaining the private `0700` task root and read-only container mount. A fresh run then
passed the complete unconfigured and online direct/proxied contract, privacy, route-smoke, and
cleanup checks.

**Prevention:** Keep acceptance helpers portable across POSIX awk implementations, treat Docker
cidfiles as newline-agnostic, and set explicit least-privilege modes for task files consumed through
user-namespaced bind mounts. Never reuse partial evidence from a failed disposable run.

## 2026-07-26 — Phase 2A acceptance verifier invalidated disposable runs

**Status:** Resolved

**Observed:** Task 8 stopped in several operator-side verifier paths without identifying a product
defect. Early runs used a corrupted inline SQLite query, an unsupported Compose `ps` format, an
incorrect baseline hash, a shortened Alembic revision expectation, and the wrong Ollama response
shape. Firefox preflights then exposed assumptions about Snap-visible fixture paths, CSS-transformed
accessible names, scrollbar-adjusted client width, opaque WebDriver element IDs, and keyboard focus
order. Removing a stopped API container to isolate hub-down access logs also made a later sentinel
image lookup empty. The first otherwise passing nine-width run ended on a misspelled final evidence
field, and the next printed a passing result but remained alive because a Node stream worker was
blocked reading the acknowledgement FIFO.

**Impact:** No application, migration, schema, dependency, or frozen-candidate defect was found.
Partial evidence from every affected run was discarded. One early interactive job-control
experiment left an exactly identified task-owned host process after its cleanup check; it was
explicitly terminated before work continued. Every later failed run reported `cleanup_status=0`,
and the final uninterrupted run preserved all preexisting resources and left Git unchanged.

**Cause:** The temporary harness mixed fragile inline commands and incidental tool output with
acceptance assertions, assumed Compose could rediscover an image after its only service container
was removed, treated remote element handles as stable DOM identity, and used a blocking stream
abstraction for FIFO acknowledgements.

**Resolution:** Moved reusable checks into syntax-checked task-owned files, used exact committed
revision IDs and response contracts, kept nonessential diagnostics outside the fatal supervisor
path, copied Firefox fixtures into the Snap-visible task directory, measured layout with
`documentElement.clientWidth`, asserted focus by current role/name/DOM ownership, cached the already
verified API image ID, reconciled all 59 browser epochs to raw API and sentinel logs, and replaced
the FIFO stream with bounded nonblocking reads. The fresh exact-candidate run then passed every
gate and exited with `original_status=0 cleanup_status=0`.

**Prevention:** Preflight verifier syntax and lifecycle behavior, keep task ownership fail-closed,
compare browser semantics rather than opaque handles, link derived counts to raw task-owned logs,
and restart all acceptance steps from the frozen candidate after any verifier failure instead of
reusing partial evidence.

## 2026-07-26 — Eager HTTPX mock bodies did not exercise raw inventory streaming

**Status:** Resolved

**Observed:** The first Phase 2B inventory-client slice passed 13 tests and failed three because
`response.aiter_raw()` raised `httpx.StreamConsumed` for successful mock responses. Two later
harness cases exposed the same eager-body mismatch as a decoding error for an intentionally invalid
gzip representation and a Unicode encoding error while constructing a lone-surrogate fixture.

**Cause:** Under HTTPX 0.28.1, mock responses created with eager `json=` or `content=` bodies are
already marked consumed, and HTTPX's eager JSON serializer does not escape lone surrogates. Those
fixtures did not model the streamed provider responses that the production byte limit must inspect.

**Resolution:** The test harness now wraps generated response bytes in an explicit
`httpx.AsyncByteStream` and serializes JSON fixtures to escaped UTF-8 bytes before streaming them.
The client retains `aiter_raw()`, so its cumulative eight-MiB limit measures the approved identity
representation without a decoding layer. The focused 187-test inventory/configuration/health
matrix passes with the corrected streaming fixtures.

**Prevention:** Construct inventory success-body fixtures as asynchronous streams and retain the
raw-byte boundary tests for exact-budget, over-budget, cumulative-page, encoding, and timeout
behavior.

## 2026-07-26 — Inventory timeout awaited response cleanup past its deadline

**Status:** Resolved

**Observed:** An independent Task 1 review reproduced a 10-millisecond inventory timeout returning
after approximately 212 milliseconds when the response stream's asynchronous close took 200
milliseconds. A close operation that never returned could therefore hold the request after the
eligibility deadline. The follow-up review also cancelled an in-flight inventory task and observed
the cleanup timeout replace the caller's `CancelledError` with a normalized inventory timeout.

**Cause:** The request and response context managers lived directly inside `asyncio.timeout()`.
When the timeout cancelled body reading, Python unwound both context managers before converting the
cancellation to `TimeoutError`, so their awaited cleanup was no longer bounded by the expired
timeout.

**Resolution:** The page operation now owns the HTTPX client and streamed response explicitly.
Sending and raw-body consumption run under the remaining deadline; response and client close are
then attempted in order, each under a fresh remaining-time timeout, and client close is attempted
even when response close expires. Cleanup expiry maps to the fixed timeout state. A non-returning
but cancellation-cooperative close regression proves the result returns before the cleanup delay
and leaves no child task behind. Operation-side external cancellation is retained ahead of cleanup
errors, with a separate regression proving `CancelledError` still reaches the caller.

**Prevention:** Retain the non-returning response-close, cancellation-propagation, and
no-remaining-task regressions, keep timeout ownership outside provider-facing context-manager
cleanup, and do not detach provider I/O or cleanup into background tasks.

## 2026-07-26 — Inventory transport-factory failures escaped normalization

**Status:** Resolved

**Observed:** Final Task 1 review injected an `httpx.ConnectError` with a private marker from the
inventory transport factory. The exception escaped directly instead of producing the fixed
`unavailable` result.

**Cause:** Transport creation and HTTPX client construction occurred before the page operation's
error-normalization boundary.

**Resolution:** Transport and client construction now execute inside the owned page operation.
Request errors raised there map to `unavailable`, the private marker is absent from the normalized
result, and client cleanup still runs whenever ownership was acquired.

**Prevention:** Retain the transport-factory exception/privacy regression and keep all transport
creation, request I/O, response processing, and owned cleanup inside one normalization boundary.

## 2026-07-26 — Inventory API edge responses bypassed the fixed privacy boundary

**Status:** Resolved

**Observed:** Independent Task 2 review requested trailing-slash inventory paths with redirect
following disabled and received HTTP 307 with a `Location` header and none of the inventory privacy
headers. The first exact-slash correction still allowed a repeated-slash descendant to redirect.
A separate unexpected-client-error probe received a plain-text HTTP 500 without those headers.
Repeating the failure through a real local Uvicorn server showed the synthetic exception marker in
`uvicorn.error`, even though the response and access log did not contain it.

**Cause:** The thin FastAPI route applied privacy headers only to successful exact-path responses.
Starlette's application router therefore supplied its default slash redirect, and its outer server
error boundary generated and logged unexpected failures after the route-owned `Response` was
discarded.

**Resolution:** A pure-ASGI boundary now handles only the decoded fixed inventory path and every
descendant spelling beneath its slash boundary. It returns a fixed private JSON 404 without
redirecting or reflecting slash/detail variants, replaces the four required headers exactly once
on every fixed-path response, and sends a fixed private JSON 500 for an unexpected pre-response
exception. It then raises a fixed `RuntimeError` with the original traceback but no original
exception context, preserving defect visibility without forwarding arbitrary exception text to
Uvicorn. Cancellation and every unrelated sibling path remain outside the boundary.

**Prevention:** Retain the no-redirect, header-uniqueness, non-GET, default-TestClient,
unrelated-path, and dual Uvicorn access/error-log regressions. Synthetic key, provider-body, cursor,
workflow-name, query, and programming-error markers must remain absent from both log streams and
all fixed error bodies.

## 2026-07-26 — Frontend inventory accepted non-200 success and reclassified abort collisions

**Status:** Resolved

**Observed:** Independent Task 3 review returned a valid inventory payload with HTTP 201 and observed
the browser contract accept it after reading the body, even though the route requires exact HTTP
200. The same review used an abort whose error copy matched `Backend returned an invalid response`;
the inventory wrapper replaced the signal-owned error with `N8nWorkflowInventoryContractError`.

**Cause:** The shared JSON helper rejected only responses outside the broad `Response.ok` range, and
the inventory wrapper matched the generic error copy before checking signal or DOM abort identity.

**Resolution:** The shared helper now supports an optional exact expected status and checks it before
body parsing. Inventory alone requests exact 200, while existing callers omit the option and keep
their prior behavior. The inventory wrapper now preserves signal-owned errors and DOM
`AbortError` identity before message-based contract conversion.

**Prevention:** Retain regressions proving HTTP 201 becomes `BackendHttpError` without invoking
`response.json()`, and proving both DOM and signal-owned abort errors survive even when their message
collides with the fixed contract-error copy.

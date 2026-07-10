# Observed Failures and Resolutions

This is a factual engineering log, not a list of hypothetical risks. It records failures or warnings actually observed while building and validating Phase 0, their impact, and their current status. Sensitive values and full environment output do not belong here.

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

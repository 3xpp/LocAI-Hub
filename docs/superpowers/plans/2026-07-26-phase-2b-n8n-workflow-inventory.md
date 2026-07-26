# Phase 2B n8n Workflow Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicitly loaded, read-only n8n workflow summary that keeps the API key backend-only, projects only name/active/updated time, and preserves the accepted localhost-only and no-mutation boundaries.

**Architecture:** A new backend-only inventory client reuses canonical n8n-origin validation but owns a stricter credential transport rule, one fixed paginated provider operation, bounded strict JSON ingestion, and safe result normalization. A parameter-free FastAPI route exposes only the projection, while a separate React contract, manual controller, and Integrations panel keep credentialed inventory independent from Phase 2A health.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic, httpx, pytest, Ruff, strict mypy, React 19, TypeScript 5.8, Vite, Vitest, Testing Library, jsdom, pnpm, Docker Compose, Firefox WebDriver.

---

## Starting Point and Non-Negotiable Boundaries

- Work in the dedicated `phase2b-n8n-inventory` worktree and branch created from design commit
  `cefc4f5a2068cfaa78f39b53fb6ae08e58e2897d`.
- Treat
  `docs/superpowers/specs/2026-07-26-phase-2b-n8n-workflow-inventory-design.md`
  as authoritative.
- The operator approved the narrow Phase 2B credential boundary and explicitly authorized pushing
  verified commits to GitHub. Push only clean, tested commits; never force-push.
- Do not read, print, edit, stage, or traverse `.env` or any real secret file. Tests and acceptance
  use generated synthetic values only and never print them.
- Use `uv` for backend work and `pnpm` for frontend work. Do not use pip, Poetry, npm, or yarn.
- Do not modify backend or frontend dependency manifests or lockfiles. Add no runtime dependency.
- Do not modify database models, repositories, transfer contracts, Alembic revisions, Dockerfiles,
  Vite/Vitest configuration, authentication, authorization, public bindings, or production
  configuration.
- Do not add workflow details, executions, IDs, provider URLs, mutations, request-controlled
  targets, filters, paths, headers, cursors, bodies, timeouts, retries, polling, persistence,
  background work, browser storage, or application Docker access.
- Phase 2A health remains credential-free. `N8N_API_KEY` must never be passed to
  `N8nHealthClient`, `/healthz`, or `/healthz/readiness`.
- Inventory may use HTTPS for any canonical configured origin. Plain HTTP is accepted only for
  exact `localhost` or a canonical loopback IP. No DNS lookup may expand that exception.
- Provider requests are fixed to `GET /api/v1/workflows`, `limit=50`,
  `excludePinnedData=true`, and a backend-owned encoded cursor.
- One attempt is bounded to four pages, 200 items, 8 MiB cumulative identity-representation bytes,
  JSON depth 64, cursor length 2,048, and one five-second eligibility deadline.
- A response media type is accepted only as `application/json` with no parameter or one
  case-insensitive `charset=utf-8` parameter, using either the exact token or one correctly paired
  quoted value. Other charsets, malformed quoting, and additional parameters fail closed; bytes
  are always decoded as strict UTF-8.
- Every implementation milestone updates `history/BUILD_LOG.md` in the same commit.
  `docs/FAILURES.md` changes only for a failure actually observed during execution.
- Run backend tests before backend commits, frontend typecheck before frontend commits, relevant
  lint for every changed domain, and `make test-web` before each Integrations UI behavior commit.
- Preserve `env --chdir=web pnpm ...` from the repository root when running frontend commands.
- Every tracked Compose command must pass explicit safe `N8N_API_KEY`, `N8N_BASE_URL`, and
  `OLLAMA_BASE_URL` values and must select `--env-file /dev/null`.

## File Responsibility Map

### Backend files to create

- `backend/src/local_ai_hub/services/n8n_inventory.py` — key/origin validation, fixed request
  policy, strict bounded response ingestion, pagination, projection, and normalized failures.
- `backend/tests/unit/test_n8n_inventory_client.py` — all configuration, request, response,
  pagination, deadline, privacy, and projection invariants.

### Backend files to modify

- `backend/src/local_ai_hub/config.py` — optional repr-suppressed `N8N_API_KEY`.
- `backend/src/local_ai_hub/services/n8n.py` — expose the existing origin normalizer without
  changing Phase 2A behavior.
- `backend/src/local_ai_hub/api/dependencies.py` — inventory-client factory from trusted Settings.
- `backend/src/local_ai_hub/api/integration_schemas.py` — strict summary and seven-state response.
- `backend/src/local_ai_hub/api/routes/integrations.py` — parameter-free inventory route.
- `backend/tests/unit/test_config.py` — missing, empty, exact preservation, and repr secrecy.
- `backend/tests/unit/test_n8n_client.py` — explicit proof health requests contain no key.
- `backend/tests/unit/test_integration_schemas.py` — item and cross-state validation.
- `backend/tests/e2e/test_integrations_api.py` — dependency, route, OpenAPI, privacy, and failure
  boundary.
- `backend/tests/e2e/test_access_logs.py` — fixed inventory path and marker-free real access log.

### Frontend files to create

- `web/src/api/n8nWorkflowInventory.ts` — exact runtime contract and relative Hub request.
- `web/src/api/n8nWorkflowInventory.test.ts` — all valid states, malformed contracts, bounds,
  aborts, and no-provider-fetch proof.
- `web/src/features/integrations/useN8nWorkflowInventory.ts` — manual-only request ownership,
  abort restoration, generation control, and stale snapshot.
- `web/src/features/integrations/useN8nWorkflowInventory.test.tsx` — lifecycle, coalescing, abort,
  stale, no-polling, and no-storage tests.
- `web/src/features/integrations/N8nWorkflowInventory.tsx` — accessible summary panel and dedicated
  settlement announcements.
- `web/src/features/integrations/N8nWorkflowInventory.test.tsx` — all panel states, semantics,
  inert hostile data, focus, and announcement tests.

### Frontend files to modify

- `web/src/features/integrations/IntegrationsView.tsx` — compose independent health and inventory
  panels and update boundary copy.
- `web/src/features/integrations/IntegrationsView.test.tsx` — independent controls/live regions and
  revised Phase 2B copy.
- `web/src/features/integrations/N8nStatusCard.tsx` — narrow its boundary language to health.
- `web/src/App.tsx` — mount the manual inventory controller at application scope and pass it to the
  existing fifth view.
- `web/src/App.navigation.test.tsx` — entry-zero-load, explicit load, abort, memory, and guard
  regressions.
- `web/src/styles.css` — inventory panel/rows and responsive wrapping.
- `web/src/styles.test.ts` — row geometry, target size, overflow, and unchanged five-view layout.

### Infrastructure and records to modify

- `.env.example` — append only the empty `N8N_API_KEY=` placeholder.
- `docker-compose.yml` — forward the optional key to API runtime only.
- `Makefile` — explicitly clear the key in the Compose build gate.
- `AGENTS.md` — record the approved narrow Phase 2B maintenance exception without widening gates.
- `README.md` — configuration, capability, risk, limits, lifecycle, testing, and roadmap.
- `docs/SECURITY_NOTES.md` — implemented key, confused-deputy, projection, transport, and exposure
  boundary while retaining Phase 2A health wording.
- `docs/superpowers/specs/2026-07-26-phase-2b-n8n-workflow-inventory-design.md` — implementation and
  final acceptance status.
- `history/BUILD_LOG.md` — same-commit evidence for every milestone.
- `docs/FAILURES.md` — only when a real incident is observed.

### Files intentionally unchanged

- `backend/src/local_ai_hub/api/main.py` and
  `backend/src/local_ai_hub/api/access_logs.py`; the router and generic query filter already cover
  the new fixed route.
- All manifests, lockfiles, database files, migrations, repositories, transfer files, Dockerfiles,
  Vite/Vitest configuration, authentication files, and production/deployment configuration.
- Existing Prompt, Workflow Link, Transfer, Ollama, and Phase 2A health behavior except the
  health-specific wording inside Integrations.
- The five-value `ActiveView`, all five navigation controls, and existing navigation guard model.

## Planned Commit Sequence

0. `docs: add phase 2b implementation plan`
1. `feat: add n8n workflow inventory client`
2. `feat: expose n8n workflow inventory api`
3. `feat: add n8n inventory frontend contract`
4. `feat: add manual n8n inventory controller`
5. `feat: add n8n workflow inventory panel`
6. `chore: configure phase 2b secret boundary`
7. `chore: finalize phase 2b integration`
8. `test: record phase 2b acceptance validation`

### Task 1: Configuration, Shared Origin Contract, and Inventory Client

**Files:**

- Modify: `backend/src/local_ai_hub/config.py`
- Modify: `backend/src/local_ai_hub/services/n8n.py`
- Create: `backend/src/local_ai_hub/services/n8n_inventory.py`
- Modify: `backend/tests/unit/test_config.py`
- Modify: `backend/tests/unit/test_n8n_client.py`
- Create: `backend/tests/unit/test_n8n_inventory_client.py`
- Modify: `history/BUILD_LOG.md`

- [ ] **Step 1: Add failing Settings secrecy tests**

Append these tests to `backend/tests/unit/test_config.py`:

```python
def test_settings_treats_missing_n8n_api_key_as_unconfigured(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.delenv("N8N_API_KEY", raising=False)
    assert Settings.from_env().n8n_api_key is None


def test_settings_treats_exact_empty_n8n_api_key_as_unconfigured(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.setenv("N8N_API_KEY", "")
    assert Settings.from_env().n8n_api_key is None


def test_settings_preserves_non_empty_n8n_key_without_repr_disclosure(
    monkeypatch: MonkeyPatch,
) -> None:
    marker = "phase2b-Key_MARKER-7xQ"
    monkeypatch.setenv("N8N_API_KEY", marker)

    settings = Settings.from_env()

    assert settings.n8n_api_key == marker
    assert marker not in repr(settings)
```

Also add `monkeypatch.setenv("N8N_API_KEY", "synthetic-key")` and
`assert settings.n8n_api_key == "synthetic-key"` to
`test_settings_read_process_environment`.

- [ ] **Step 2: Run the Settings test and observe the red state**

Run:

```bash
uv --directory backend run pytest tests/unit/test_config.py -q
```

Expected: the new tests fail because `Settings` has no `n8n_api_key` field.

- [ ] **Step 3: Add the repr-suppressed process setting**

Make these exact changes in `backend/src/local_ai_hub/config.py`:

```python
@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime settings used by backend services."""

    database_url: str = DEFAULT_DATABASE_URL
    ollama_base_url: str = DEFAULT_OLLAMA_BASE_URL
    n8n_base_url: str | None = field(default=None, repr=False)
    n8n_api_key: str | None = field(default=None, repr=False)

    @classmethod
    def from_env(cls) -> "Settings":
        """Build settings from the process environment without loading secret files."""

        raw_n8n_base_url = os.environ.get("N8N_BASE_URL")
        raw_n8n_api_key = os.environ.get("N8N_API_KEY")
        return cls(
            database_url=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
            ollama_base_url=os.environ.get(
                "OLLAMA_BASE_URL",
                DEFAULT_OLLAMA_BASE_URL,
            ).rstrip("/"),
            n8n_base_url=(
                None if raw_n8n_base_url is None or raw_n8n_base_url == "" else raw_n8n_base_url
            ),
            n8n_api_key=(
                None if raw_n8n_api_key is None or raw_n8n_api_key == "" else raw_n8n_api_key
            ),
        )
```

- [ ] **Step 4: Expose the existing canonical origin helper without changing health**

In `backend/src/local_ai_hub/services/n8n.py`, rename `_normalize_base_url` to
`normalize_n8n_origin`, then change both call sites exactly:

```python
def normalize_n8n_origin(base_url: str) -> str | None:
    """Return a canonical credential-free HTTP(S) root origin."""

    if (
        not _origin_within_limit(base_url)
        or base_url != base_url.strip()
        or any(marker in base_url for marker in ("@", "?", "#"))
    ):
        return None

    try:
        parsed = httpx.URL(base_url)
        port = parsed.port
        host = _normalize_host(parsed.host)
    except (httpx.InvalidURL, UnicodeError, ValueError):
        return None

    if (
        parsed.scheme not in {"http", "https"}
        or not host
        or parsed.userinfo
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
        or (port is not None and not 1 <= port <= 65_535)
    ):
        return None

    try:
        canonical = str(
            httpx.URL(
                scheme=parsed.scheme,
                host=host,
                port=port,
            )
        ).removesuffix("/")
    except (httpx.InvalidURL, UnicodeError, ValueError):
        return None
    return canonical if _origin_within_limit(canonical) else None


def is_canonical_n8n_origin(value: str) -> bool:
    """Return whether a display value is already the canonical safe origin."""

    return normalize_n8n_origin(value) == value
```

Inside `N8nHealthClient.__init__` use:

```python
request_base_url = normalize_n8n_origin(base_url)
```

Do not leave an alias or a second implementation. Add this assertion to the request handler in
`backend/tests/unit/test_n8n_client.py` where fresh-client/cookie isolation is already tested:

```python
assert "X-N8N-API-KEY" not in request.headers
```

- [ ] **Step 5: Run the configuration and Phase 2A regression tests**

Run:

```bash
uv --directory backend run pytest \
  tests/unit/test_config.py \
  tests/unit/test_n8n_client.py \
  -q
```

Expected: all tests pass and every Phase 2A request remains key-free.

- [ ] **Step 6: Create the inventory-client test harness and red configuration matrix**

Create `backend/tests/unit/test_n8n_inventory_client.py` with these imports, helpers, and first
tests:

```python
import asyncio
import json
from collections.abc import Callable

import httpx
import pytest

from local_ai_hub.services.n8n_inventory import (
    MAX_N8N_WORKFLOW_BYTES,
    N8nWorkflowInventoryClient,
)

Handler = Callable[[httpx.Request], httpx.Response]

KEY = "phase2b-SYNTHETIC-Key_7xQ"
VALID_ITEM = {
    "name": "Daily local backup",
    "active": True,
    "updatedAt": "2026-07-26T08:30:00+00:00",
}


def transport_factory(handler: Handler) -> Callable[[], httpx.AsyncBaseTransport]:
    return lambda: httpx.MockTransport(handler)


def unexpected_transport() -> httpx.AsyncBaseTransport:
    raise AssertionError("invalid or unconfigured input created a transport")


def json_response(
    request: httpx.Request,
    payload: object,
    *,
    status: int = 200,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    return httpx.Response(
        status,
        json=payload,
        headers={"Content-Type": "application/json", **(headers or {})},
        request=request,
    )


@pytest.mark.parametrize(
    ("base_url", "api_key", "state"),
    [
        (None, None, "unconfigured"),
        ("", KEY, "unconfigured"),
        ("https://n8n.test", None, "unconfigured"),
        ("https://n8n.test", "", "unconfigured"),
        (" https://n8n.test", KEY, "invalid_configuration"),
        ("http://homelab:5678", KEY, "invalid_configuration"),
        ("https://n8n.test", " key", "invalid_configuration"),
        ("https://n8n.test", "key\nvalue", "invalid_configuration"),
        ("https://n8n.test", "key\tvalue", "invalid_configuration"),
        ("https://n8n.test", "key\rvalue", "invalid_configuration"),
        ("https://n8n.test", "key\x00value", "invalid_configuration"),
        ("https://n8n.test", "κλειδί", "invalid_configuration"),
        ("https://n8n.test", "x" * 8_193, "invalid_configuration"),
    ],
)
def test_inventory_configuration_makes_zero_transport_calls(
    base_url: str | None,
    api_key: str | None,
    state: str,
) -> None:
    result = asyncio.run(
        N8nWorkflowInventoryClient(
            base_url,
            api_key,
            transport_factory=unexpected_transport,
        ).get_inventory()
    )

    assert result.state == state
    assert result.items == ()
    assert result.truncated is False
    assert result.error in {
        None,
        "Invalid n8n inventory configuration",
    }


@pytest.mark.parametrize("api_key", ["!", "~", "x" * 8_192])
def test_inventory_key_validation_boundaries(api_key: str) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return json_response(request, {"data": [], "nextCursor": None})

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            api_key,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "available"
    assert len(requests) == 1
```

- [ ] **Step 7: Run the new client tests and observe the import failure**

Run:

```bash
uv --directory backend run pytest \
  tests/unit/test_n8n_inventory_client.py \
  -q
```

Expected: collection fails because `local_ai_hub.services.n8n_inventory` does not exist.

- [ ] **Step 8: Create the closed service types and constants**

Create `backend/src/local_ai_hub/services/n8n_inventory.py` beginning with this exact public
contract:

```python
"""Credentialed, bounded, read-only n8n workflow summary inventory."""

import asyncio
import json
import math
import time
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from ipaddress import ip_address
from typing import Final, Literal, cast

import httpx

from local_ai_hub.services.n8n import normalize_n8n_origin

MAX_N8N_API_KEY_LENGTH: Final = 8_192
MAX_N8N_WORKFLOW_NAME_LENGTH: Final = 256
MAX_N8N_WORKFLOW_TIMESTAMP_LENGTH: Final = 64
MAX_N8N_WORKFLOW_CURSOR_LENGTH: Final = 2_048
MAX_N8N_WORKFLOW_PAGE_ITEMS: Final = 50
MAX_N8N_WORKFLOW_PAGES: Final = 4
MAX_N8N_WORKFLOW_ITEMS: Final = 200
MAX_N8N_WORKFLOW_BYTES: Final = 8 * 1024 * 1024
MAX_N8N_WORKFLOW_JSON_DEPTH: Final = 64
N8N_WORKFLOW_INVENTORY_TIMEOUT_SECONDS: Final = 5.0

_N8N_WORKFLOWS_PATH: Final = "/api/v1/workflows"

type N8nWorkflowInventoryState = Literal[
    "unconfigured",
    "available",
    "invalid_configuration",
    "access_denied",
    "unavailable",
    "timeout",
    "invalid_response",
]
type N8nWorkflowInventoryError = Literal[
    "Invalid n8n inventory configuration",
    "n8n denied workflow inventory access",
    "n8n workflow inventory is unavailable",
    "n8n workflow inventory timed out",
    "n8n returned an invalid workflow inventory",
]
type N8nInventoryTransportFactory = Callable[[], httpx.AsyncBaseTransport]
type JsonValue = (
    None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]
)


@dataclass(frozen=True, slots=True)
class N8nWorkflowSummary:
    """One browser-safe projection of a provider workflow."""

    name: str
    active: bool
    updated_at: str


@dataclass(frozen=True, slots=True)
class N8nWorkflowInventoryResult:
    """One normalized inventory attempt safe to expose through the Hub."""

    state: N8nWorkflowInventoryState
    items: tuple[N8nWorkflowSummary, ...]
    truncated: bool
    error: N8nWorkflowInventoryError | None
```

- [ ] **Step 9: Add fixed internal failure, validation, JSON, and projection helpers**

Continue the same file with these complete helpers:

```python
_ERRORS: Final[dict[N8nWorkflowInventoryState, N8nWorkflowInventoryError]] = {
    "invalid_configuration": "Invalid n8n inventory configuration",
    "access_denied": "n8n denied workflow inventory access",
    "unavailable": "n8n workflow inventory is unavailable",
    "timeout": "n8n workflow inventory timed out",
    "invalid_response": "n8n returned an invalid workflow inventory",
}


class _InventoryFailure(Exception):
    def __init__(self, state: N8nWorkflowInventoryState) -> None:
        super().__init__()
        self.state = state


def _empty_result(state: N8nWorkflowInventoryState) -> N8nWorkflowInventoryResult:
    return N8nWorkflowInventoryResult(state, (), False, _ERRORS.get(state))


def _is_visible_ascii(value: str, maximum: int) -> bool:
    return 1 <= len(value) <= maximum and all(
        0x21 <= ord(character) <= 0x7E for character in value
    )


def _credential_transport_allowed(origin: str) -> bool:
    parsed = httpx.URL(origin)
    if parsed.scheme == "https":
        return True
    if parsed.scheme != "http":
        return False
    if parsed.host == "localhost":
        return True
    try:
        return ip_address(parsed.host).is_loopback
    except ValueError:
        return False


def _check_deadline(clock: Callable[[], float], deadline: float) -> float:
    remaining = deadline - clock()
    if remaining <= 0:
        raise _InventoryFailure("timeout")
    return remaining


def _run_bounded_phase[T](
    operation: Callable[[], T],
    *,
    clock: Callable[[], float],
    deadline: float,
) -> T:
    try:
        return operation()
    finally:
        _check_deadline(clock, deadline)


def _validate_media_headers(response: httpx.Response, remaining_bytes: int) -> None:
    content_types = response.headers.get_list("content-type")
    if len(content_types) != 1:
        raise _InventoryFailure("invalid_response")
    parts = [part.strip() for part in content_types[0].split(";")]
    if not parts or parts[0].lower() != "application/json" or len(parts) > 2:
        raise _InventoryFailure("invalid_response")
    if len(parts) == 2:
        name, separator, value = parts[1].partition("=")
        charset = value.strip().lower()
        if (
            separator != "="
            or name.strip().lower() != "charset"
            or charset not in {"utf-8", '"utf-8"'}
        ):
            raise _InventoryFailure("invalid_response")

    encodings = response.headers.get_list("content-encoding")
    if encodings and (
        len(encodings) != 1 or encodings[0].strip().lower() != "identity"
    ):
        raise _InventoryFailure("invalid_response")

    content_lengths = response.headers.get_list("content-length")
    if content_lengths:
        if len(content_lengths) != 1:
            raise _InventoryFailure("invalid_response")
        content_length = content_lengths[0]
        if not content_length.isascii() or not content_length.isdigit():
            raise _InventoryFailure("invalid_response")
        normalized_length = content_length.lstrip("0") or "0"
        remaining_text = str(remaining_bytes)
        if len(normalized_length) > len(remaining_text) or (
            len(normalized_length) == len(remaining_text)
            and normalized_length > remaining_text
        ):
            raise _InventoryFailure("invalid_response")


def _scan_json_depth(text: str) -> None:
    depth = 0
    in_string = False
    escaped = False
    for character in text:
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue
        if character == '"':
            in_string = True
        elif character in "[{":
            depth += 1
            if depth > MAX_N8N_WORKFLOW_JSON_DEPTH:
                raise _InventoryFailure("invalid_response")
        elif character in "]}":
            depth -= 1
            if depth < 0:
                raise _InventoryFailure("invalid_response")


def _reject_constant(_: str) -> JsonValue:
    raise _InventoryFailure("invalid_response")


def _unique_object(pairs: list[tuple[str, JsonValue]]) -> dict[str, JsonValue]:
    result: dict[str, JsonValue] = {}
    for key, value in pairs:
        if key in result:
            raise _InventoryFailure("invalid_response")
        result[key] = value
    return result


def _reject_non_finite(value: JsonValue) -> None:
    pending = [value]
    while pending:
        current = pending.pop()
        if isinstance(current, float) and not math.isfinite(current):
            raise _InventoryFailure("invalid_response")
        if isinstance(current, list):
            pending.extend(current)
        elif isinstance(current, dict):
            pending.extend(current.values())


def _contains_projected_unsafe_character(value: str) -> bool:
    return any(
        unicodedata.category(character) == "Cc"
        or 0xD800 <= ord(character) <= 0xDFFF
        for character in value
    )


def _normalize_timestamp(value: object) -> str:
    if (
        not isinstance(value, str)
        or not 1 <= len(value) <= MAX_N8N_WORKFLOW_TIMESTAMP_LENGTH
        or _contains_projected_unsafe_character(value)
    ):
        raise _InventoryFailure("invalid_response")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        offset = parsed.utcoffset()
        if parsed.tzinfo is None or offset is None:
            raise ValueError("timezone is required")
        normalized = parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")
    except (ValueError, OverflowError) as error:
        raise _InventoryFailure("invalid_response") from error
    if len(normalized) > MAX_N8N_WORKFLOW_TIMESTAMP_LENGTH:
        raise _InventoryFailure("invalid_response")
    return normalized


def is_normalized_n8n_workflow_timestamp(value: str) -> bool:
    """Return whether a timestamp is the exact UTC form emitted by this service."""

    try:
        return _normalize_timestamp(value) == value
    except _InventoryFailure:
        return False


def _project_item(value: JsonValue) -> N8nWorkflowSummary:
    if not isinstance(value, dict):
        raise _InventoryFailure("invalid_response")
    name = value.get("name")
    active = value.get("active")
    if (
        not isinstance(name, str)
        or not 1 <= len(name) <= MAX_N8N_WORKFLOW_NAME_LENGTH
        or _contains_projected_unsafe_character(name)
        or type(active) is not bool
        or "updatedAt" not in value
    ):
        raise _InventoryFailure("invalid_response")
    return N8nWorkflowSummary(
        name=name,
        active=active,
        updated_at=_normalize_timestamp(value["updatedAt"]),
    )


def _decode_utf8(body: bytes) -> str:
    try:
        text = body.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise _InventoryFailure("invalid_response") from error
    if text.startswith("\ufeff"):
        raise _InventoryFailure("invalid_response")
    return text


def _decode_json(text: str) -> JsonValue:
    try:
        return cast(
            JsonValue,
            json.loads(
                text,
                object_pairs_hook=_unique_object,
                parse_constant=_reject_constant,
            ),
        )
    except (ValueError, RecursionError) as error:
        raise _InventoryFailure("invalid_response") from error


def _project_page(
    decoded: JsonValue,
) -> tuple[tuple[N8nWorkflowSummary, ...], str | None]:
    if not isinstance(decoded, dict) or "data" not in decoded:
        raise _InventoryFailure("invalid_response")
    data = decoded["data"]
    if not isinstance(data, list) or len(data) > MAX_N8N_WORKFLOW_PAGE_ITEMS:
        raise _InventoryFailure("invalid_response")
    items = tuple(_project_item(item) for item in data)

    cursor_value = decoded.get("nextCursor")
    if cursor_value is None:
        return items, None
    if not isinstance(cursor_value, str) or not _is_visible_ascii(
        cursor_value,
        MAX_N8N_WORKFLOW_CURSOR_LENGTH,
    ):
        raise _InventoryFailure("invalid_response")
    return items, cursor_value


def _decode_page(
    body: bytes,
    *,
    clock: Callable[[], float],
    deadline: float,
) -> tuple[tuple[N8nWorkflowSummary, ...], str | None]:
    _check_deadline(clock, deadline)
    text = _run_bounded_phase(
        lambda: _decode_utf8(body),
        clock=clock,
        deadline=deadline,
    )
    _run_bounded_phase(
        lambda: _scan_json_depth(text),
        clock=clock,
        deadline=deadline,
    )
    decoded = _run_bounded_phase(
        lambda: _decode_json(text),
        clock=clock,
        deadline=deadline,
    )
    _run_bounded_phase(
        lambda: _reject_non_finite(decoded),
        clock=clock,
        deadline=deadline,
    )
    return _run_bounded_phase(
        lambda: _project_page(decoded),
        clock=clock,
        deadline=deadline,
    )
```

- [ ] **Step 10: Add the fixed request and complete-attempt client**

Finish `backend/src/local_ai_hub/services/n8n_inventory.py` with:

```python
class N8nWorkflowInventoryClient:
    """Read one bounded summary through the one approved n8n API operation."""

    def __init__(
        self,
        base_url: str | None,
        api_key: str | None,
        *,
        transport_factory: N8nInventoryTransportFactory | None = None,
        timeout: float = N8N_WORKFLOW_INVENTORY_TIMEOUT_SECONDS,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        self._transport_factory = transport_factory
        self._timeout = timeout
        self._monotonic = monotonic

        if base_url is None or base_url == "" or api_key is None or api_key == "":
            self._configuration_state: Literal[
                "unconfigured", "invalid_configuration", "configured"
            ] = "unconfigured"
            self._base_url = None
            self._api_key = None
            return

        canonical = normalize_n8n_origin(base_url)
        if (
            canonical is None
            or not _credential_transport_allowed(canonical)
            or not _is_visible_ascii(api_key, MAX_N8N_API_KEY_LENGTH)
        ):
            self._configuration_state = "invalid_configuration"
            self._base_url = None
            self._api_key = None
            return

        self._configuration_state = "configured"
        self._base_url = canonical
        self._api_key = api_key

    async def _read_page(
        self,
        cursor: str | None,
        *,
        deadline: float,
        remaining_bytes: int,
    ) -> bytes:
        base_url = self._base_url
        api_key = self._api_key
        if base_url is None or api_key is None:
            raise RuntimeError("validated inventory configuration is required")

        params = {
            "limit": str(MAX_N8N_WORKFLOW_PAGE_ITEMS),
            "excludePinnedData": "true",
        }
        if cursor is not None:
            params["cursor"] = cursor
        headers = {
            "Accept": "application/json",
            "Accept-Encoding": "identity",
            "X-N8N-API-KEY": api_key,
        }
        _check_deadline(self._monotonic, deadline)

        try:
            transport = (
                self._transport_factory()
                if self._transport_factory is not None
                else None
            )
            remaining = _check_deadline(self._monotonic, deadline)
            async with asyncio.timeout(remaining):
                async with httpx.AsyncClient(
                    base_url=base_url,
                    timeout=httpx.Timeout(remaining),
                    transport=transport,
                    trust_env=False,
                    verify=True,
                    follow_redirects=False,
                ) as client:
                    async with client.stream(
                        "GET",
                        _N8N_WORKFLOWS_PATH,
                        params=params,
                        headers=headers,
                    ) as response:
                        if response.status_code in {401, 403}:
                            raise _InventoryFailure("access_denied")
                        if response.status_code != 200:
                            raise _InventoryFailure("unavailable")
                        _validate_media_headers(response, remaining_bytes)
                        body = bytearray()
                        async for chunk in response.aiter_raw():
                            if len(body) + len(chunk) > remaining_bytes:
                                raise _InventoryFailure("invalid_response")
                            body.extend(chunk)
                        return bytes(body)
        except _InventoryFailure:
            _check_deadline(self._monotonic, deadline)
            raise
        except (TimeoutError, httpx.TimeoutException) as error:
            raise _InventoryFailure("timeout") from error
        except httpx.RequestError as error:
            _check_deadline(self._monotonic, deadline)
            raise _InventoryFailure("unavailable") from error

    async def get_inventory(self) -> N8nWorkflowInventoryResult:
        """Return a complete bounded attempt or one fixed safe failure."""

        if self._configuration_state == "unconfigured":
            return _empty_result("unconfigured")
        if self._configuration_state == "invalid_configuration":
            return _empty_result("invalid_configuration")

        deadline = self._monotonic() + self._timeout
        items: list[N8nWorkflowSummary] = []
        cursor: str | None = None
        seen_cursors: set[str] = set()
        consumed_bytes = 0

        try:
            for page_number in range(1, MAX_N8N_WORKFLOW_PAGES + 1):
                _check_deadline(self._monotonic, deadline)
                body = await self._read_page(
                    cursor,
                    deadline=deadline,
                    remaining_bytes=MAX_N8N_WORKFLOW_BYTES - consumed_bytes,
                )
                consumed_bytes += len(body)
                _check_deadline(self._monotonic, deadline)
                page_items, next_cursor = _decode_page(
                    body,
                    clock=self._monotonic,
                    deadline=deadline,
                )
                del body
                _check_deadline(self._monotonic, deadline)

                if len(items) + len(page_items) > MAX_N8N_WORKFLOW_ITEMS:
                    raise _InventoryFailure("invalid_response")
                items.extend(page_items)
                if next_cursor is None:
                    _check_deadline(self._monotonic, deadline)
                    return N8nWorkflowInventoryResult(
                        "available",
                        tuple(items),
                        False,
                        None,
                    )
                if next_cursor in seen_cursors:
                    raise _InventoryFailure("invalid_response")
                seen_cursors.add(next_cursor)

                if (
                    page_number == MAX_N8N_WORKFLOW_PAGES
                    or len(items) == MAX_N8N_WORKFLOW_ITEMS
                ):
                    _check_deadline(self._monotonic, deadline)
                    return N8nWorkflowInventoryResult(
                        "available",
                        tuple(items),
                        True,
                        None,
                    )
                if consumed_bytes >= MAX_N8N_WORKFLOW_BYTES:
                    raise _InventoryFailure("invalid_response")
                cursor = next_cursor
        except _InventoryFailure as failure:
            return _empty_result(failure.state)

        raise RuntimeError("inventory pagination exited without a result")
```

- [ ] **Step 11: Add the fixed-request and transport-policy tests**

Append these tests:

```python
@pytest.mark.parametrize(
    "base_url",
    [
        "https://n8n.test",
        "http://localhost:5678",
        "http://127.0.0.1:5678",
        "http://[::1]:5678",
    ],
)
def test_inventory_origin_transport_policy_accepts_safe_origins(
    base_url: str,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return json_response(request, {"data": [], "nextCursor": None})

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            base_url,
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "available"


@pytest.mark.parametrize(
    "base_url",
    [
        "http://homelab:5678",
        "http://host.docker.internal:5678",
        "http://172.17.0.1:5678",
        "http://192.168.1.10:5678",
        "http://n8n:5678",
    ],
)
def test_inventory_origin_transport_policy_rejects_non_loopback_http(
    base_url: str,
) -> None:
    result = asyncio.run(
        N8nWorkflowInventoryClient(
            base_url,
            KEY,
            transport_factory=unexpected_transport,
        ).get_inventory()
    )

    assert result.state == "invalid_configuration"


def test_inventory_request_is_fixed_and_private() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return json_response(request, {"data": [VALID_ITEM], "nextCursor": None})

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "available"
    assert result.items[0].name == "Daily local backup"
    assert len(requests) == 1
    request = requests[0]
    assert request.method == "GET"
    assert request.url.path == "/api/v1/workflows"
    assert dict(request.url.params) == {
        "limit": "50",
        "excludePinnedData": "true",
    }
    assert request.headers["accept"] == "application/json"
    assert request.headers["accept-encoding"] == "identity"
    assert request.headers["x-n8n-api-key"] == KEY
    assert "authorization" not in request.headers
    assert "cookie" not in request.headers
    assert "referer" not in request.headers
    assert "forwarded" not in request.headers
    assert "x-forwarded-for" not in request.headers
    assert "x-forwarded-host" not in request.headers
    assert "x-forwarded-proto" not in request.headers
    assert request.content == b""


def test_inventory_disables_redirects_and_ambient_transport_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    real_client = httpx.AsyncClient
    client_options: list[dict[str, object]] = []

    def recording_client(
        *args: object,
        **kwargs: object,
    ) -> httpx.AsyncClient:
        client_options.append(kwargs)
        return real_client(*args, **kwargs)

    def handler(request: httpx.Request) -> httpx.Response:
        return json_response(request, {"data": [], "nextCursor": None})

    monkeypatch.setattr(httpx, "AsyncClient", recording_client)
    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "available"
    assert len(client_options) == 1
    assert client_options[0]["trust_env"] is False
    assert client_options[0]["verify"] is True
    assert client_options[0]["follow_redirects"] is False
```

Append the closed HTTP and representation-header matrices:

```python
STATUS_CASES = [
    (401, "access_denied"),
    (403, "access_denied"),
    (301, "unavailable"),
    (404, "unavailable"),
    (429, "unavailable"),
    (500, "unavailable"),
]

CONTENT_TYPE_CASES = [
    ("application/json", True),
    ("Application/JSON; Charset=UTF-8", True),
    ('application/json; charset="UTF-8"', True),
    ("application/json; charset=iso-8859-1", False),
    ('application/json; charset="utf-8', False),
    ('application/json; charset=utf-8"', False),
    ('application/json; charset="""utf-8"""', False),
    ("application/json; charset=utf-8; profile=x", False),
    ("text/json", False),
    ("text/plain", False),
    ("", False),
]

CONTENT_ENCODING_CASES = [
    (None, True),
    ("identity", True),
    ("gzip", False),
    ("br", False),
]


@pytest.mark.parametrize(("status", "state"), STATUS_CASES)
def test_inventory_maps_provider_status_without_reading_error_body(
    status: int,
    state: str,
) -> None:
    marker = "private-provider-error-marker"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status,
            content=marker.encode(),
            headers={"Content-Type": "text/plain"},
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == state
    assert result.items == ()
    assert marker not in repr(result)


class ExplodingErrorStream(httpx.AsyncByteStream):
    async def __aiter__(self):
        raise AssertionError("provider error body was consumed")
        yield b"unreachable"


def test_inventory_never_consumes_non_200_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            500,
            stream=ExplodingErrorStream(),
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "unavailable"


def test_inventory_rejects_duplicate_content_type_without_reading_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            stream=ExplodingErrorStream(),
            headers=[
                ("Content-Type", "application/json"),
                ("Content-Type", "application/json"),
            ],
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "invalid_response"


@pytest.mark.parametrize(
    "content_length",
    [str(MAX_N8N_WORKFLOW_BYTES + 1), "9" * 5_000, "-1", "1e3"],
)
def test_inventory_rejects_invalid_or_oversized_content_length_without_parsing(
    content_length: str,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            stream=ExplodingErrorStream(),
            headers={
                "Content-Type": "application/json",
                "Content-Length": content_length,
            },
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "invalid_response"


@pytest.mark.parametrize(("content_type", "accepted"), CONTENT_TYPE_CASES)
def test_inventory_accepts_only_utf8_json_media_type(
    content_type: str,
    accepted: bool,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        headers = {"Content-Type": content_type} if content_type else {}
        return httpx.Response(
            200,
            content=b'{"data":[],"nextCursor":null}',
            headers=headers,
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == ("available" if accepted else "invalid_response")


@pytest.mark.parametrize(("encoding", "accepted"), CONTENT_ENCODING_CASES)
def test_inventory_accepts_only_identity_content_encoding(
    encoding: str | None,
    accepted: bool,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        headers = {"Content-Type": "application/json"}
        if encoding is not None:
            headers["Content-Encoding"] = encoding
        return httpx.Response(
            200,
            content=b'{"data":[],"nextCursor":null}',
            headers=headers,
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == ("available" if accepted else "invalid_response")
```

- [ ] **Step 12: Add strict JSON, pagination, deadline, and privacy tests**

Add tests with these exact assertions:

```python
def test_inventory_paginates_with_one_encoded_backend_cursor() -> None:
    urls: list[httpx.URL] = []
    cursor = "page&admin=true?next=#fragment%"

    def handler(request: httpx.Request) -> httpx.Response:
        urls.append(request.url)
        if len(urls) == 1:
            return json_response(
                request,
                {"data": [VALID_ITEM], "nextCursor": cursor},
            )
        return json_response(request, {"data": [], "nextCursor": None})

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "available"
    assert len(urls) == 2
    assert urls[1].params.get("cursor") == cursor
    assert urls[1].params.get_list("admin") == []
    assert urls[1].path == "/api/v1/workflows"


def test_inventory_discards_partial_later_pages() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return json_response(
                request,
                {"data": [VALID_ITEM], "nextCursor": "page-2"},
            )
        return httpx.Response(
            200,
            content=b"{",
            headers={"Content-Type": "application/json"},
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert calls == 2
    assert result.state == "invalid_response"
    assert result.items == ()
    assert result.truncated is False


def test_inventory_projects_only_approved_fields() -> None:
    marker = "sensitive-provider-marker-9zQ"
    payload = {
        "data": [
            {
                **VALID_ITEM,
                "id": marker,
                "nodes": [{"credentials": marker}],
                "connections": {marker: {}},
                "pinData": {marker: marker},
                "settings": {"private": marker},
            }
        ],
        "nextCursor": None,
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return json_response(request, payload)

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.items[0].name == VALID_ITEM["name"]
    assert marker not in repr(result)
    assert KEY not in repr(result)
```

Append these remaining bounded-ingestion tests:

```python
def test_inventory_uses_fresh_clients_without_cookie_reuse() -> None:
    cookies: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        cookies.append(request.headers.get("cookie"))
        if len(cookies) == 1:
            return json_response(
                request,
                {"data": [], "nextCursor": "page-2"},
                headers={"Set-Cookie": "provider=private"},
            )
        return json_response(request, {"data": [], "nextCursor": None})

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "available"
    assert cookies == [None, None]


def test_inventory_maps_transport_error_without_reflection() -> None:
    marker = "private-connect-marker"

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(marker, request=request)

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "unavailable"
    assert marker not in repr(result)


class SlowStream(httpx.AsyncByteStream):
    async def __aiter__(self):
        await asyncio.sleep(0.05)
        yield b'{"data":[],"nextCursor":null}'


class ChunkedBodyStream(httpx.AsyncByteStream):
    def __init__(self, body: bytes) -> None:
        self._body = body

    async def __aiter__(self):
        chunk_size = 1024 * 1024
        for offset in range(0, len(self._body), chunk_size):
            yield self._body[offset : offset + chunk_size]


@pytest.mark.parametrize("mode", ["httpx", "body"])
def test_inventory_maps_request_and_body_timeouts(mode: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if mode == "httpx":
            raise httpx.ReadTimeout("private-timeout-marker", request=request)
        return httpx.Response(
            200,
            stream=SlowStream(),
            headers={"Content-Type": "application/json"},
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
            timeout=0.01,
        ).get_inventory()
    )

    assert result.state == "timeout"
    assert result.items == ()


def test_inventory_discards_first_page_when_later_page_times_out() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return json_response(
                request,
                {"data": [VALID_ITEM], "nextCursor": "page-2"},
            )
        return httpx.Response(
            200,
            stream=SlowStream(),
            headers={"Content-Type": "application/json"},
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
            timeout=0.01,
        ).get_inventory()
    )

    assert calls == 2
    assert result.state == "timeout"
    assert result.items == ()


@pytest.mark.parametrize(
    ("extra", "state"),
    [(0, "available"), (1, "invalid_response")],
)
def test_inventory_enforces_chunked_byte_limit_without_content_length(
    extra: int,
    state: str,
) -> None:
    prefix = b'{"data":[],"padding":"'
    suffix = b'","nextCursor":null}'
    body = prefix + b"x" * (
        MAX_N8N_WORKFLOW_BYTES + extra - len(prefix) - len(suffix)
    ) + suffix

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            stream=ChunkedBodyStream(body),
            headers={"Content-Type": "application/json"},
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert len(body) == MAX_N8N_WORKFLOW_BYTES + extra
    assert result.state == state


def test_inventory_counts_bytes_across_pages() -> None:
    calls = 0
    first = b'{"data":[],"nextCursor":"page-2"}'
    prefix = b'{"data":[],"padding":"'
    suffix = b'","nextCursor":null}'
    second = prefix + b"x" * (
        MAX_N8N_WORKFLOW_BYTES - len(prefix) - len(suffix)
    ) + suffix

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            content=first if calls == 1 else second,
            headers={"Content-Type": "application/json"},
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert calls == 2
    assert len(first) + len(second) > MAX_N8N_WORKFLOW_BYTES
    assert result.state == "invalid_response"
    assert result.items == ()


def test_inventory_does_not_request_again_after_exact_byte_budget() -> None:
    calls = 0
    prefix = b'{"data":[],"padding":"'
    suffix = b'","nextCursor":"page-2"}'
    body = prefix + b"x" * (
        MAX_N8N_WORKFLOW_BYTES - len(prefix) - len(suffix)
    ) + suffix

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            stream=ChunkedBodyStream(body),
            headers={"Content-Type": "application/json"},
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert len(body) == MAX_N8N_WORKFLOW_BYTES
    assert calls == 1
    assert result.state == "invalid_response"
    assert result.items == ()


@pytest.mark.parametrize(
    ("nested_depth", "state"),
    [(63, "available"), (64, "invalid_response")],
)
def test_inventory_enforces_total_json_depth(
    nested_depth: int,
    state: str,
) -> None:
    nested = "[" * nested_depth + '"braces {[ in a string"' + "]" * nested_depth
    body = (
        '{"data":[],"ignored":'
        + nested
        + ',"nextCursor":null}'
    ).encode()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=body,
            headers={"Content-Type": "application/json"},
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == state


@pytest.mark.parametrize(
    "body",
    [
        b"{",
        b'{"data":[],"bad":"\xff"}',
        b'\xef\xbb\xbf{"data":[]}',
        b'{"data":[],"bad":NaN}',
        b'{"data":[],"bad":Infinity}',
        b'{"data":[],"bad":-Infinity}',
        b'{"data":[],"bad":1e999}',
        b'{"data":[],"bad":' + b"9" * 5_000 + b"}",
        b'{"data":[],"data":[]}',
        b'{"data":[],"bad":{"same":1,"same":2}}',
    ],
)
def test_inventory_rejects_strict_json_failures(body: bytes) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=body,
            headers={"Content-Type": "application/json"},
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "invalid_response"
    assert result.items == ()


@pytest.mark.parametrize(
    ("payload", "state"),
    [
        (
            {
                "data": [VALID_ITEM],
                "ignored": "\ud800",
                "nextCursor": None,
            },
            "available",
        ),
        (
            {
                "data": [{**VALID_ITEM, "name": "\ud800"}],
                "nextCursor": None,
            },
            "invalid_response",
        ),
        (
            {
                "data": [],
                "nextCursor": "\ud800",
            },
            "invalid_response",
        ),
    ],
)
def test_inventory_tolerates_surrogate_only_in_ignored_field(
    payload: object,
    state: str,
) -> None:
    body = json.dumps(payload).encode()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=body,
            headers={"Content-Type": "application/json"},
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == state


INVALID_PAGE_PAYLOADS = [
    [],
    {},
    {"data": {}},
    {"data": [None]},
    {"data": [VALID_ITEM] * 51},
    {"data": [], "nextCursor": ""},
    {"data": [], "nextCursor": "x" * 2_049},
    {"data": [], "nextCursor": "line\nbreak"},
    {"data": [], "nextCursor": "café"},
]


@pytest.mark.parametrize("payload", INVALID_PAGE_PAYLOADS)
def test_inventory_validates_page_shape(payload: object) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return json_response(request, payload)

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "invalid_response"


INVALID_ITEMS = [
    {},
    {**VALID_ITEM, "name": ""},
    {**VALID_ITEM, "name": "x" * 257},
    {**VALID_ITEM, "name": "line\nbreak"},
    {**VALID_ITEM, "name": "\ud800"},
    {**VALID_ITEM, "active": 1},
    {"name": "Missing active", "updatedAt": VALID_ITEM["updatedAt"]},
    {"name": "Missing time", "active": True},
    {**VALID_ITEM, "updatedAt": "2026-07-26T08:30:00"},
    {**VALID_ITEM, "updatedAt": "not-a-time"},
    {**VALID_ITEM, "updatedAt": "0001-01-01T00:00:00+23:59"},
    {**VALID_ITEM, "updatedAt": "x" * 65},
]


@pytest.mark.parametrize("item", INVALID_ITEMS)
def test_inventory_validates_workflow_fields(item: object) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return json_response(request, {"data": [item], "nextCursor": None})

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "invalid_response"


def test_inventory_accepts_maximum_name_and_normalizes_aware_time() -> None:
    item = {
        "name": "🧠" * 256,
        "active": False,
        "updatedAt": "2026-07-26T10:30:00+02:00",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return json_response(request, {"data": [item], "nextCursor": None})

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert result.state == "available"
    assert len(result.items[0].name) == 256
    assert result.items[0].updated_at == "2026-07-26T08:30:00Z"


@pytest.mark.parametrize(("final_cursor", "truncated"), [("more", True), (None, False)])
def test_inventory_four_page_cap(
    final_cursor: str | None,
    truncated: bool,
) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        cursor = final_cursor if calls == 4 else f"page-{calls + 1}"
        return json_response(
            request,
            {"data": [VALID_ITEM] * 50, "nextCursor": cursor},
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert calls == 4
    assert result.state == "available"
    assert len(result.items) == 200
    assert result.truncated is truncated


def test_inventory_rejects_repeated_cursor_without_third_request() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return json_response(
            request,
            {"data": [], "nextCursor": "same-cursor"},
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
        ).get_inventory()
    )

    assert calls == 2
    assert result.state == "invalid_response"


class SequenceClock:
    def __init__(self, expires_on_call: int) -> None:
        self.calls = 0
        self.expires_on_call = expires_on_call

    def __call__(self) -> float:
        self.calls += 1
        return 5.0 if self.calls >= self.expires_on_call else 0.0


@pytest.mark.parametrize(
    ("body", "expires_on_call"),
    [
        (
            (
                '{"data":[],"ignored":'
                + "[" * 64
                + "0"
                + "]" * 64
                + "}"
            ).encode(),
            8,
        ),
        (b"{", 9),
        (b'{"data":[{}],"nextCursor":null}', 11),
    ],
)
def test_inventory_timeout_wins_when_invalid_sync_phase_crosses_deadline(
    body: bytes,
    expires_on_call: int,
) -> None:
    clock = SequenceClock(expires_on_call)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=body,
            headers={"Content-Type": "application/json"},
            request=request,
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
            monotonic=clock,
        ).get_inventory()
    )

    assert result.state == "timeout"
    assert result.items == ()


@pytest.mark.parametrize(
    ("next_cursor", "expires_on_call"),
    [(None, 10), ("page-2", 10)],
)
def test_inventory_deadline_blocks_success_and_next_page(
    next_cursor: str | None,
    expires_on_call: int,
) -> None:
    calls = 0
    clock = SequenceClock(expires_on_call)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return json_response(
            request,
            {"data": [VALID_ITEM], "nextCursor": next_cursor},
        )

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
            monotonic=clock,
        ).get_inventory()
    )

    assert result.state == "timeout"
    assert result.items == ()
    assert calls == 1
```

Use only generated values in these tests. Never log or print the synthetic key, cursor, raw body,
or response headers.

- [ ] **Step 13: Run focused and complete backend gates**

Run:

```bash
uv --directory backend run pytest \
  tests/unit/test_config.py \
  tests/unit/test_n8n_client.py \
  tests/unit/test_n8n_inventory_client.py \
  -q
uv --directory backend run pytest
uv --directory backend run ruff format src tests
uv --directory backend run ruff check src tests
uv --directory backend run ruff format --check src tests
uv --directory backend run mypy src
git diff --check
```

Expected: all commands pass. If a real failure is diagnosed and corrected, record only that
observed incident in `docs/FAILURES.md`.

- [ ] **Step 14: Record and commit the inventory-client milestone**

Append one dated entry to `history/BUILD_LOG.md` containing the exact commands and observed counts,
the accepted/rejected origin/key matrix, request/path/query/header proof, strict parsing bounds,
pagination counts, no-partial-result proof, key-free health regression, and absence of sensitive
markers.

Stage and commit:

```bash
git add \
  backend/src/local_ai_hub/config.py \
  backend/src/local_ai_hub/services/n8n.py \
  backend/src/local_ai_hub/services/n8n_inventory.py \
  backend/tests/unit/test_config.py \
  backend/tests/unit/test_n8n_client.py \
  backend/tests/unit/test_n8n_inventory_client.py \
  history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add n8n workflow inventory client"
```

Push the clean commit without force:

```bash
git push -u origin phase2b-n8n-inventory
```

Expected: the remote branch points to the new commit and `git status --short` is empty.

### Task 2: Strict Parameter-Free Inventory API

**Files:**

- Modify: `backend/src/local_ai_hub/api/dependencies.py`
- Modify: `backend/src/local_ai_hub/api/integration_schemas.py`
- Modify: `backend/src/local_ai_hub/api/routes/integrations.py`
- Modify: `backend/tests/unit/test_integration_schemas.py`
- Modify: `backend/tests/e2e/test_integrations_api.py`
- Modify: `backend/tests/e2e/test_access_logs.py`
- Modify: `history/BUILD_LOG.md`

- [ ] **Step 1: Add failing strict-schema tests**

Append these fixtures and tests to `backend/tests/unit/test_integration_schemas.py`:

```python
from local_ai_hub.api.integration_schemas import (
    N8nWorkflowInventoryResponse,
)

AVAILABLE_INVENTORY = {
    "state": "available",
    "items": [
        {
            "name": "Daily local backup",
            "active": True,
            "updated_at": "2026-07-26T08:30:00Z",
        }
    ],
    "truncated": False,
    "error": None,
}

INVENTORY_FAILURES = [
    (
        "invalid_configuration",
        "Invalid n8n inventory configuration",
    ),
    (
        "access_denied",
        "n8n denied workflow inventory access",
    ),
    (
        "unavailable",
        "n8n workflow inventory is unavailable",
    ),
    (
        "timeout",
        "n8n workflow inventory timed out",
    ),
    (
        "invalid_response",
        "n8n returned an invalid workflow inventory",
    ),
]


def test_inventory_response_accepts_available_and_unconfigured() -> None:
    assert (
        N8nWorkflowInventoryResponse.model_validate(
            AVAILABLE_INVENTORY
        ).model_dump()
        == AVAILABLE_INVENTORY
    )
    unconfigured = {
        "state": "unconfigured",
        "items": [],
        "truncated": False,
        "error": None,
    }
    assert (
        N8nWorkflowInventoryResponse.model_validate(
            unconfigured
        ).model_dump()
        == unconfigured
    )
    empty_truncated = {
        "state": "available",
        "items": [],
        "truncated": True,
        "error": None,
    }
    assert (
        N8nWorkflowInventoryResponse.model_validate(
            empty_truncated
        ).model_dump()
        == empty_truncated
    )


@pytest.mark.parametrize(("state", "error"), INVENTORY_FAILURES)
def test_inventory_response_accepts_fixed_failure(
    state: str,
    error: str,
) -> None:
    payload = {
        "state": state,
        "items": [],
        "truncated": False,
        "error": error,
    }
    assert N8nWorkflowInventoryResponse.model_validate(payload).model_dump() == payload


@pytest.mark.parametrize(
    "payload",
    [
        {**AVAILABLE_INVENTORY, "private": "no"},
        {**AVAILABLE_INVENTORY, "state": "unconfigured"},
        {**AVAILABLE_INVENTORY, "error": "private provider detail"},
        {
            "state": "access_denied",
            "items": AVAILABLE_INVENTORY["items"],
            "truncated": False,
            "error": "n8n denied workflow inventory access",
        },
        {
            "state": "unconfigured",
            "items": [],
            "truncated": False,
            "error": "Invalid n8n inventory configuration",
        },
    ],
)
def test_inventory_response_rejects_impossible_combinations(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        N8nWorkflowInventoryResponse.model_validate(payload)


@pytest.mark.parametrize(
    "item",
    [
        {
            "name": "",
            "active": True,
            "updated_at": "2026-07-26T08:30:00Z",
        },
        {
            "name": "x" * 257,
            "active": True,
            "updated_at": "2026-07-26T08:30:00Z",
        },
        {
            "name": "line\nbreak",
            "active": True,
            "updated_at": "2026-07-26T08:30:00Z",
        },
        {
            "name": "\ud800",
            "active": True,
            "updated_at": "2026-07-26T08:30:00Z",
        },
        {
            "name": "Wrong boolean",
            "active": 1,
            "updated_at": "2026-07-26T08:30:00Z",
        },
        {
            "name": "Naive",
            "active": True,
            "updated_at": "2026-07-26T08:30:00",
        },
        {
            "name": "Offset",
            "active": True,
            "updated_at": "2026-07-26T10:30:00+02:00",
        },
        {
            "name": "Invalid",
            "active": True,
            "updated_at": "not-a-time",
        },
        {
            "name": "Overlong",
            "active": True,
            "updated_at": "x" * 65,
        },
        {
            "name": "Extra",
            "active": True,
            "updated_at": "2026-07-26T08:30:00Z",
            "id": "private-id",
        },
        {
            "name": "Missing time",
            "active": True,
        },
    ],
)
def test_inventory_item_rejects_invalid_fields(
    item: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        N8nWorkflowInventoryResponse.model_validate(
            {
                "state": "available",
                "items": [item],
                "truncated": False,
                "error": None,
            }
        )


def test_inventory_response_rejects_more_than_200_items() -> None:
    with pytest.raises(ValidationError):
        N8nWorkflowInventoryResponse.model_validate(
            {
                **AVAILABLE_INVENTORY,
                "items": AVAILABLE_INVENTORY["items"] * 201,
            }
        )
```

- [ ] **Step 2: Run the schema tests and observe the missing model**

Run:

```bash
uv --directory backend run pytest tests/unit/test_integration_schemas.py -q
```

Expected: collection fails because `N8nWorkflowInventoryResponse` is not defined.

- [ ] **Step 3: Add the strict inventory schemas**

Add imports from `local_ai_hub.services.n8n_inventory`, then append these models to
`backend/src/local_ai_hub/api/integration_schemas.py`:

```python
class N8nWorkflowSummaryResponse(BaseModel):
    """One strict browser-visible workflow projection."""

    model_config = ConfigDict(extra="forbid", strict=True)

    name: Annotated[
        str,
        Field(min_length=1, max_length=MAX_N8N_WORKFLOW_NAME_LENGTH),
    ]
    active: bool
    updated_at: Annotated[
        str,
        Field(max_length=MAX_N8N_WORKFLOW_TIMESTAMP_LENGTH),
    ]

    @model_validator(mode="after")
    def validate_projected_fields(self) -> "N8nWorkflowSummaryResponse":
        if any(
            unicodedata.category(character) == "Cc"
            or 0xD800 <= ord(character) <= 0xDFFF
            for character in self.name
        ):
            raise ValueError("invalid workflow name")
        if not is_normalized_n8n_workflow_timestamp(self.updated_at):
            raise ValueError("invalid workflow timestamp")
        return self


class N8nWorkflowInventoryResponse(BaseModel):
    """One closed and internally consistent inventory response."""

    model_config = ConfigDict(extra="forbid", strict=True)

    state: N8nWorkflowInventoryState
    items: Annotated[
        list[N8nWorkflowSummaryResponse],
        Field(max_length=MAX_N8N_WORKFLOW_ITEMS),
    ]
    truncated: bool
    error: N8nWorkflowInventoryError | None

    @model_validator(mode="after")
    def validate_combination(self) -> "N8nWorkflowInventoryResponse":
        expected_errors: dict[
            N8nWorkflowInventoryState,
            N8nWorkflowInventoryError,
        ] = {
            "invalid_configuration": "Invalid n8n inventory configuration",
            "access_denied": "n8n denied workflow inventory access",
            "unavailable": "n8n workflow inventory is unavailable",
            "timeout": "n8n workflow inventory timed out",
            "invalid_response": "n8n returned an invalid workflow inventory",
        }
        if self.state == "available":
            valid = self.error is None
        elif self.state == "unconfigured":
            valid = not self.items and not self.truncated and self.error is None
        else:
            valid = (
                not self.items
                and not self.truncated
                and self.error == expected_errors[self.state]
            )
        if not valid:
            raise ValueError("invalid n8n workflow inventory combination")
        return self
```

Add `import unicodedata` and import these exact service names:

```python
from local_ai_hub.services.n8n_inventory import (
    MAX_N8N_WORKFLOW_ITEMS,
    MAX_N8N_WORKFLOW_NAME_LENGTH,
    MAX_N8N_WORKFLOW_TIMESTAMP_LENGTH,
    N8nWorkflowInventoryError,
    N8nWorkflowInventoryState,
    is_normalized_n8n_workflow_timestamp,
)
```

- [ ] **Step 4: Add failing dependency and route tests**

In `backend/tests/e2e/test_integrations_api.py`, import the new dependency and types, add a separate
inventory protocol/stub/context manager, and add:

```python
class N8nInventoryClient(Protocol):
    async def get_inventory(self) -> N8nWorkflowInventoryResult: ...


class StubN8nInventoryClient:
    def __init__(
        self,
        result: N8nWorkflowInventoryResult | None = None,
        error: Exception | None = None,
    ) -> None:
        self.result = result
        self.error = error
        self.calls = 0

    async def get_inventory(self) -> N8nWorkflowInventoryResult:
        self.calls += 1
        if self.error is not None:
            raise self.error
        if self.result is None:
            raise AssertionError("inventory stub result is required")
        return self.result


@contextmanager
def client_with_n8n_inventory(
    stub: N8nInventoryClient,
) -> Iterator[TestClient]:
    previous = app.dependency_overrides.get(
        get_n8n_workflow_inventory_client
    )
    app.dependency_overrides[
        get_n8n_workflow_inventory_client
    ] = lambda: stub
    try:
        with TestClient(app) as client:
            yield client
    finally:
        if previous is None:
            app.dependency_overrides.pop(
                get_n8n_workflow_inventory_client,
                None,
            )
        else:
            app.dependency_overrides[
                get_n8n_workflow_inventory_client
            ] = previous


def test_n8n_workflows_returns_projection_with_privacy_headers() -> None:
    result = N8nWorkflowInventoryResult(
        "available",
        (
            N8nWorkflowSummary(
                "Daily local backup",
                True,
                "2026-07-26T08:30:00Z",
            ),
        ),
        False,
        None,
    )
    with client_with_n8n_inventory(StubN8nInventoryClient(result)) as client:
        response = client.get("/api/integrations/n8n/workflows")

    assert response.status_code == 200
    assert response.json() == {
        "state": "available",
        "items": [
            {
                "name": "Daily local backup",
                "active": True,
                "updated_at": "2026-07-26T08:30:00Z",
            }
        ],
        "truncated": False,
        "error": None,
    }
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-type"] == "application/json"


def test_n8n_workflows_openapi_has_no_input_or_mutation_surface() -> None:
    with TestClient(app) as client:
        document = client.get("/openapi.json").json()

    operation = document["paths"]["/api/integrations/n8n/workflows"]
    assert set(operation) == {"get"}
    assert operation["get"].get("parameters", []) == []
    assert "requestBody" not in operation["get"]
    assert all(
        "/api/integrations/n8n/workflows/" not in path
        for path in document["paths"]
    )
    assert not any(
        "execution" in path.lower()
        for path in document["paths"]
    )
```

- [ ] **Step 5: Run the API tests and observe the missing dependency/route**

Run:

```bash
uv --directory backend run pytest \
  tests/e2e/test_integrations_api.py \
  -q
```

Expected: collection or request assertions fail because the inventory dependency and route do not
exist.

- [ ] **Step 6: Add the inventory dependency**

In `backend/src/local_ai_hub/api/dependencies.py`, import
`N8nWorkflowInventoryClient` and append:

```python
def get_n8n_workflow_inventory_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> N8nWorkflowInventoryClient:
    """Build the fixed inventory client from trusted process configuration."""

    return N8nWorkflowInventoryClient(
        settings.n8n_base_url,
        settings.n8n_api_key,
    )
```

Add this direct dependency construction test to
`backend/tests/e2e/test_integrations_api.py`:

```python
def test_inventory_dependency_uses_only_trusted_settings_without_repr_leak() -> None:
    key_marker = "phase2b-dependency-Key-9zQ"
    origin_marker = "https://n8n-dependency-marker.test"
    settings = Settings(
        n8n_base_url=origin_marker,
        n8n_api_key=key_marker,
    )

    inventory_client = get_n8n_workflow_inventory_client(settings)
    health_client = get_n8n_health_client(settings)

    assert key_marker not in repr(settings)
    assert key_marker not in repr(inventory_client)
    assert key_marker not in repr(health_client)
    assert origin_marker not in repr(inventory_client)
    assert origin_marker not in repr(health_client)
```

Do not inspect private client fields. The existing and Task 1 health transport tests are the
behavioral proof that the health dependency never sends the key.

- [ ] **Step 7: Add the thin route**

Update imports in `backend/src/local_ai_hub/api/routes/integrations.py` and append:

```python
@router.get(
    "/n8n/workflows",
    response_model=N8nWorkflowInventoryResponse,
)
async def n8n_workflows(
    response: Response,
    client: Annotated[
        N8nWorkflowInventoryClient,
        Depends(get_n8n_workflow_inventory_client),
    ],
) -> N8nWorkflowInventoryResponse:
    """Return one normalized, summary-only n8n workflow inventory."""

    for name, value in _PRIVACY_HEADERS.items():
        response.headers[name] = value

    result = await client.get_inventory()
    return N8nWorkflowInventoryResponse(
        state=result.state,
        items=[
            N8nWorkflowSummaryResponse(
                name=item.name,
                active=item.active,
                updated_at=item.updated_at,
            )
            for item in result.items
        ],
        truncated=result.truncated,
        error=result.error,
    )
```

Import the dependency, both schemas, and `N8nWorkflowInventoryClient`. Do not alter the router
mounting in `api/main.py`.

- [ ] **Step 8: Complete all seven API-state and unexpected-error tests**

Parameterize the route test over:

```python
INVENTORY_RESULTS = [
    N8nWorkflowInventoryResult("unconfigured", (), False, None),
    N8nWorkflowInventoryResult("available", (), False, None),
    N8nWorkflowInventoryResult(
        "invalid_configuration",
        (),
        False,
        "Invalid n8n inventory configuration",
    ),
    N8nWorkflowInventoryResult(
        "access_denied",
        (),
        False,
        "n8n denied workflow inventory access",
    ),
    N8nWorkflowInventoryResult(
        "unavailable",
        (),
        False,
        "n8n workflow inventory is unavailable",
    ),
    N8nWorkflowInventoryResult(
        "timeout",
        (),
        False,
        "n8n workflow inventory timed out",
    ),
    N8nWorkflowInventoryResult(
        "invalid_response",
        (),
        False,
        "n8n returned an invalid workflow inventory",
    ),
]



@pytest.mark.parametrize("result", INVENTORY_RESULTS)
def test_n8n_workflows_maps_every_normalized_state(
    result: N8nWorkflowInventoryResult,
) -> None:
    stub = StubN8nInventoryClient(result)
    with client_with_n8n_inventory(stub) as client:
        response = client.get("/api/integrations/n8n/workflows")

    assert response.status_code == 200
    assert response.json() == {
        "state": result.state,
        "items": [],
        "truncated": result.truncated,
        "error": result.error,
    }
    assert stub.calls == 1


def test_n8n_workflows_ignores_unowned_input_without_reflection() -> None:
    marker = "request-controlled-private-marker"
    result = N8nWorkflowInventoryResult("available", (), False, None)
    stub = StubN8nInventoryClient(result)
    with client_with_n8n_inventory(stub) as client:
        response = client.request(
            "GET",
            "/api/integrations/n8n/workflows",
            params={"target": marker, "cursor": marker, "filter": marker},
            json={"key": marker, "path": marker},
            headers={"X-Provider-Target": marker},
        )

    assert response.status_code == 200
    assert response.json() == {
        "state": "available",
        "items": [],
        "truncated": False,
        "error": None,
    }
    assert marker not in response.text
    assert stub.calls == 1


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_n8n_workflows_rejects_mutation_methods(method: str) -> None:
    stub = StubN8nInventoryClient(
        N8nWorkflowInventoryResult("available", (), False, None)
    )
    with client_with_n8n_inventory(stub) as client:
        response = client.request(
            method,
            "/api/integrations/n8n/workflows",
        )

    assert response.status_code == 405
    assert stub.calls == 0


def test_n8n_workflows_unexpected_error_remains_hub_failure() -> None:
    marker = "private-programming-marker"
    previous = app.dependency_overrides.get(
        get_n8n_workflow_inventory_client
    )
    app.dependency_overrides[
        get_n8n_workflow_inventory_client
    ] = lambda: StubN8nInventoryClient(error=RuntimeError(marker))
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/api/integrations/n8n/workflows")
    finally:
        if previous is None:
            app.dependency_overrides.pop(
                get_n8n_workflow_inventory_client,
                None,
            )
        else:
            app.dependency_overrides[
                get_n8n_workflow_inventory_client
            ] = previous

    assert response.status_code == 500
    assert marker not in response.text
    assert "available" not in response.text
    assert "Daily local backup" not in response.text
```

- [ ] **Step 9: Extend real access-log coverage without changing the filter**

Add the fixed path case to the existing filter parameterization in
`backend/tests/e2e/test_access_logs.py`:

```python
(
    "/api/integrations/n8n/workflows",
    "/api/integrations/n8n/workflows",
),
```

Add these imports and the complete real-Uvicorn test:

```python
from local_ai_hub.api.dependencies import (
    get_n8n_workflow_inventory_client,
)
from local_ai_hub.services.n8n_inventory import (
    N8nWorkflowInventoryResult,
    N8nWorkflowSummary,
)


class AccessLogInventoryClient:
    def __init__(self, secret_marker: str, body_marker: str) -> None:
        self.secret_marker = secret_marker
        self.body_marker = body_marker

    async def get_inventory(self) -> N8nWorkflowInventoryResult:
        return N8nWorkflowInventoryResult(
            "available",
            (
                N8nWorkflowSummary(
                    "workflow-name-private-marker",
                    True,
                    "2026-07-26T08:30:00Z",
                ),
            ),
            False,
            None,
        )


def test_real_uvicorn_inventory_log_contains_only_fixed_path() -> None:
    synthetic_key_marker = "phase2b-access-key-marker"
    provider_body_marker = "phase2b-provider-body-marker"
    cursor_marker = "phase2b-cursor-marker"
    workflow_name_marker = "workflow-name-private-marker"
    logger = logging.getLogger(UVICORN_ACCESS_LOGGER)
    original_handlers = list(logger.handlers)
    original_filters = list(logger.filters)
    original_level = logger.level
    original_propagate = logger.propagate
    original_disabled = logger.disabled
    previous_override = app.dependency_overrides.get(
        get_n8n_workflow_inventory_client
    )
    app.dependency_overrides[
        get_n8n_workflow_inventory_client
    ] = lambda: AccessLogInventoryClient(
        synthetic_key_marker,
        provider_body_marker,
    )

    output = io.StringIO()
    capture = logging.StreamHandler(output)
    capture.setFormatter(logging.Formatter("%(message)s"))
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen(5)
    host, port = listener.getsockname()
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        access_log=True,
        log_config=None,
        log_level="info",
        lifespan="on",
    )
    server = uvicorn.Server(config)
    thread = Thread(
        target=server.run,
        kwargs={"sockets": [listener]},
        daemon=True,
    )

    try:
        logger.handlers = [capture]
        logger.filters = []
        logger.setLevel(logging.INFO)
        logger.propagate = False
        logger.disabled = False
        thread.start()
        deadline = time.monotonic() + 5
        while (
            not server.started
            and thread.is_alive()
            and time.monotonic() < deadline
        ):
            time.sleep(0.01)
        assert server.started
        with httpx.Client(trust_env=False, timeout=5) as client:
            response = client.get(
                f"http://{host}:{port}/api/integrations/n8n/workflows"
            )
        assert response.status_code == 200
        assert workflow_name_marker in response.text
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        if thread.is_alive():
            server.force_exit = True
            thread.join(timeout=5)
        listener.close()
        capture.flush()
        logger.handlers = original_handlers
        logger.filters = original_filters
        logger.setLevel(original_level)
        logger.propagate = original_propagate
        logger.disabled = original_disabled
        if previous_override is None:
            app.dependency_overrides.pop(
                get_n8n_workflow_inventory_client,
                None,
            )
        else:
            app.dependency_overrides[
                get_n8n_workflow_inventory_client
            ] = previous_override

    assert not thread.is_alive()
    formatted = output.getvalue()
    assert "/api/integrations/n8n/workflows" in formatted
    assert synthetic_key_marker not in formatted
    assert provider_body_marker not in formatted
    assert cursor_marker not in formatted
    assert workflow_name_marker not in formatted
```

- [ ] **Step 10: Run focused and complete backend gates**

Run:

```bash
uv --directory backend run pytest \
  tests/unit/test_integration_schemas.py \
  tests/e2e/test_integrations_api.py \
  tests/e2e/test_access_logs.py \
  -q
uv --directory backend run pytest
uv --directory backend run ruff format src tests
uv --directory backend run ruff check src tests
uv --directory backend run ruff format --check src tests
uv --directory backend run mypy src
git diff --check
```

Expected: all commands pass; the OpenAPI contains only the parameter-free GET operation and the
captured logs contain only the fixed Hub path.

- [ ] **Step 11: Record, commit, and push the API milestone**

Append the exact observed schema/API/log counts and privacy evidence to `history/BUILD_LOG.md`, then:

```bash
git add \
  backend/src/local_ai_hub/api/dependencies.py \
  backend/src/local_ai_hub/api/integration_schemas.py \
  backend/src/local_ai_hub/api/routes/integrations.py \
  backend/tests/unit/test_integration_schemas.py \
  backend/tests/e2e/test_integrations_api.py \
  backend/tests/e2e/test_access_logs.py \
  history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: expose n8n workflow inventory api"
git push origin phase2b-n8n-inventory
```

Expected: the push is a fast-forward and the worktree is clean.

### Task 3: Strict Frontend Inventory Contract

**Files:**

- Create: `web/src/api/n8nWorkflowInventory.ts`
- Create: `web/src/api/n8nWorkflowInventory.test.ts`
- Modify: `history/BUILD_LOG.md`

- [ ] **Step 1: Write the failing relative-request and valid-state tests**

Create `web/src/api/n8nWorkflowInventory.test.ts` with:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BackendHttpError } from './client'
import {
  N8nWorkflowInventoryContractError,
  getN8nWorkflowInventory,
  type N8nWorkflowInventoryResponse,
} from './n8nWorkflowInventory'

const available: N8nWorkflowInventoryResponse = {
  state: 'available',
  items: [
    {
      name: 'Daily local backup',
      active: true,
      updated_at: '2026-07-26T08:30:00Z',
    },
  ],
  truncated: false,
  error: null,
}

const validStates: N8nWorkflowInventoryResponse[] = [
  available,
  {
    state: 'unconfigured',
    items: [],
    truncated: false,
    error: null,
  },
  {
    state: 'invalid_configuration',
    items: [],
    truncated: false,
    error: 'Invalid n8n inventory configuration',
  },
  {
    state: 'access_denied',
    items: [],
    truncated: false,
    error: 'n8n denied workflow inventory access',
  },
  {
    state: 'unavailable',
    items: [],
    truncated: false,
    error: 'n8n workflow inventory is unavailable',
  },
  {
    state: 'timeout',
    items: [],
    truncated: false,
    error: 'n8n workflow inventory timed out',
  },
  {
    state: 'invalid_response',
    items: [],
    truncated: false,
    error: 'n8n returned an invalid workflow inventory',
  },
]

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('n8n workflow inventory API', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests only the fixed relative Hub path and forwards AbortSignal', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValueOnce(jsonResponse(validStates[1]))

    await expect(
      getN8nWorkflowInventory(controller.signal),
    ).resolves.toEqual(validStates[1])

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integrations/n8n/workflows',
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    )
  })

  it.each(validStates)('accepts normalized state $state', async (payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))
    await expect(getN8nWorkflowInventory()).resolves.toEqual(payload)
  })
})
```

- [ ] **Step 2: Run the API test and observe the missing module**

Run:

```bash
env --chdir=web pnpm exec vitest run src/api/n8nWorkflowInventory.test.ts
```

Expected: collection fails because `./n8nWorkflowInventory` does not exist.

- [ ] **Step 3: Create the exact response types and validators**

Create `web/src/api/n8nWorkflowInventory.ts` with this complete implementation:

```typescript
import { requestJson } from './client'

const INVALID_RESPONSE_MESSAGE = 'Backend returned an invalid response'
const MAX_ITEMS = 200
const MAX_NAME_LENGTH = 256
const MAX_TIMESTAMP_LENGTH = 64
const ROOT_KEYS = ['state', 'items', 'truncated', 'error'] as const
const ITEM_KEYS = ['name', 'active', 'updated_at'] as const

export interface N8nWorkflowSummary {
  name: string
  active: boolean
  updated_at: string
}

export type N8nWorkflowInventorySnapshot =
  | {
      state: 'available'
      items: N8nWorkflowSummary[]
      truncated: boolean
      error: null
    }
  | {
      state: 'unconfigured'
      items: []
      truncated: false
      error: null
    }

export type N8nWorkflowInventoryFailure =
  | {
      state: 'invalid_configuration'
      items: []
      truncated: false
      error: 'Invalid n8n inventory configuration'
    }
  | {
      state: 'access_denied'
      items: []
      truncated: false
      error: 'n8n denied workflow inventory access'
    }
  | {
      state: 'unavailable'
      items: []
      truncated: false
      error: 'n8n workflow inventory is unavailable'
    }
  | {
      state: 'timeout'
      items: []
      truncated: false
      error: 'n8n workflow inventory timed out'
    }
  | {
      state: 'invalid_response'
      items: []
      truncated: false
      error: 'n8n returned an invalid workflow inventory'
    }

export type N8nWorkflowInventoryResponse =
  | N8nWorkflowInventorySnapshot
  | N8nWorkflowInventoryFailure

const FAILURE_ERRORS = {
  invalid_configuration: 'Invalid n8n inventory configuration',
  access_denied: 'n8n denied workflow inventory access',
  unavailable: 'n8n workflow inventory is unavailable',
  timeout: 'n8n workflow inventory timed out',
  invalid_response: 'n8n returned an invalid workflow inventory',
} as const

export class N8nWorkflowInventoryContractError extends Error {
  constructor(cause?: unknown) {
    super(INVALID_RESPONSE_MESSAGE, { cause })
    this.name = 'N8nWorkflowInventoryContractError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value)
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  )
}

function isSafeProjectedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  if (typeof value !== 'string') return false
  const characters = Array.from(value)
  if (characters.length < minimum || characters.length > maximum) return false
  return characters.every((character) => {
    const point = character.codePointAt(0)
    return (
      point !== undefined &&
      !(point <= 0x1f || (point >= 0x7f && point <= 0x9f)) &&
      !(point >= 0xd800 && point <= 0xdfff)
    )
  })
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (
    !isSafeProjectedString(value, 1, MAX_TIMESTAMP_LENGTH) ||
    !value.endsWith('Z')
  ) {
    return false
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/u.exec(
      value,
    )
  if (match === null) return false
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (year < 1) return false
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, 0)
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  )
}

function isWorkflowSummary(value: unknown): value is N8nWorkflowSummary {
  return (
    isRecord(value) &&
    hasExactKeys(value, ITEM_KEYS) &&
    isSafeProjectedString(value.name, 1, MAX_NAME_LENGTH) &&
    typeof value.active === 'boolean' &&
    isCanonicalUtcTimestamp(value.updated_at)
  )
}

function isInventoryResponse(
  payload: unknown,
): payload is N8nWorkflowInventoryResponse {
  if (!isRecord(payload) || !hasExactKeys(payload, ROOT_KEYS)) return false
  if (!Array.isArray(payload.items) || payload.items.length > MAX_ITEMS) {
    return false
  }
  if (payload.state === 'available') {
    return (
      typeof payload.truncated === 'boolean' &&
      payload.error === null &&
      payload.items.every(isWorkflowSummary)
    )
  }
  if (payload.state === 'unconfigured') {
    return (
      payload.items.length === 0 &&
      payload.truncated === false &&
      payload.error === null
    )
  }
  if (typeof payload.state !== 'string') return false
  const expected =
    FAILURE_ERRORS[payload.state as keyof typeof FAILURE_ERRORS]
  return (
    expected !== undefined &&
    payload.items.length === 0 &&
    payload.truncated === false &&
    payload.error === expected
  )
}

function parseInventoryResponse(
  payload: unknown,
): N8nWorkflowInventoryResponse {
  if (!isInventoryResponse(payload)) {
    throw new N8nWorkflowInventoryContractError()
  }
  return payload
}

export async function getN8nWorkflowInventory(
  signal?: AbortSignal,
): Promise<N8nWorkflowInventoryResponse> {
  try {
    return await requestJson(
      '/api/integrations/n8n/workflows',
      parseInventoryResponse,
      { signal },
    )
  } catch (error) {
    if (error instanceof N8nWorkflowInventoryContractError) throw error
    if (
      error instanceof Error &&
      error.message === INVALID_RESPONSE_MESSAGE
    ) {
      throw new N8nWorkflowInventoryContractError(error)
    }
    throw error
  }
}
```

- [ ] **Step 4: Add exact-boundary and malformed-contract tests**

Append these table-driven tests inside the existing `describe` block:

```typescript
it('accepts bounds, duplicates, astral text, and inert hostile names', async () => {
  const maximumName = '🧠'.repeat(256)
  const items = Array.from({ length: 200 }, (_, index) => ({
    name: index === 0 ? maximumName : '<script>& $(url) \u202E',
    active: index % 2 === 0,
    updated_at: '2026-07-26T08:30:00.123456Z',
  }))
  items[199] = { ...items[0] }
  const payload = {
    state: 'available',
    items,
    truncated: true,
    error: null,
  }
  fetchMock.mockResolvedValueOnce(jsonResponse(payload))

  await expect(getN8nWorkflowInventory()).resolves.toEqual(payload)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it.each([
  { ...available, private: 'no' },
  { state: 'available', items: [], truncated: false },
  { ...available, state: 'unknown' },
  { ...available, items: [{ ...available.items[0], id: 'private-id' }] },
  { ...available, items: [{ ...available.items[0], name: '' }] },
  {
    ...available,
    items: [{ ...available.items[0], name: 'x'.repeat(257) }],
  },
  {
    ...available,
    items: [{ ...available.items[0], name: 'control\u0000name' }],
  },
  {
    ...available,
    items: [{ ...available.items[0], name: '\ud800' }],
  },
  {
    ...available,
    items: [{ ...available.items[0], active: 1 }],
  },
  {
    ...available,
    items: [{ ...available.items[0], updated_at: '2026-07-26T08:30:00' }],
  },
  {
    ...available,
    items: [
      { ...available.items[0], updated_at: '2026-07-26T10:30:00+02:00' },
    ],
  },
  {
    ...available,
    items: [{ ...available.items[0], updated_at: '2026-02-30T00:00:00Z' }],
  },
  {
    ...available,
    items: Array.from({ length: 201 }, () => available.items[0]),
  },
  {
    state: 'unconfigured',
    items: available.items,
    truncated: false,
    error: null,
  },
  {
    state: 'access_denied',
    items: [],
    truncated: false,
    error: 'private provider detail',
  },
  {
    state: 'timeout',
    items: [],
    truncated: true,
    error: 'n8n workflow inventory timed out',
  },
  [],
  null,
  'not an object',
])('rejects malformed inventory contract %#', async (payload) => {
  fetchMock.mockResolvedValueOnce(jsonResponse(payload))
  await expect(getN8nWorkflowInventory()).rejects.toBeInstanceOf(
    N8nWorkflowInventoryContractError,
  )
})
```

- [ ] **Step 5: Add transport, abort, and no-provider-fetch tests**

Append:

```typescript
it('preserves HTTP, network, contract, and abort distinctions', async () => {
  const abortError = new DOMException('aborted', 'AbortError')
  fetchMock
    .mockResolvedValueOnce(jsonResponse({}, 503))
    .mockRejectedValueOnce(new TypeError('private network detail'))
    .mockResolvedValueOnce(new Response('{', { status: 200 }))
    .mockRejectedValueOnce(abortError)

  const httpError = await getN8nWorkflowInventory().catch(
    (error: unknown) => error,
  )
  expect(httpError).toBeInstanceOf(BackendHttpError)
  expect(httpError).toMatchObject({ status: 503 })
  await expect(getN8nWorkflowInventory()).rejects.toThrow(
    'Unable to reach the backend',
  )
  await expect(getN8nWorkflowInventory()).rejects.toBeInstanceOf(
    N8nWorkflowInventoryContractError,
  )
  await expect(getN8nWorkflowInventory()).rejects.toBe(abortError)
})

it('propagates body-read AbortError', async () => {
  const abortError = new DOMException('aborted while decoding', 'AbortError')
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: vi.fn().mockRejectedValue(abortError),
  } as unknown as Response)

  await expect(getN8nWorkflowInventory()).rejects.toBe(abortError)
})

it('never treats a workflow name as a URL or makes a second request', async () => {
  const providerLookingName = 'https://n8n.test/api/v1/workflows/private'
  fetchMock.mockResolvedValueOnce(
    jsonResponse({
      ...available,
      items: [{ ...available.items[0], name: providerLookingName }],
    }),
  )

  const result = await getN8nWorkflowInventory()

  expect(result.items[0]?.name).toBe(providerLookingName)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    '/api/integrations/n8n/workflows',
  )
})
```

- [ ] **Step 6: Run frontend contract gates**

Run:

```bash
env --chdir=web pnpm exec vitest run src/api/n8nWorkflowInventory.test.ts
env --chdir=web pnpm typecheck
env --chdir=web pnpm lint
env --chdir=web pnpm test
env --chdir=web pnpm build
git diff --check
```

Expected: all commands pass and the focused suite proves one relative request only.

- [ ] **Step 7: Record, commit, and push the frontend contract**

Append the exact observed counts and contract-boundary evidence to `history/BUILD_LOG.md`, then:

```bash
git add \
  web/src/api/n8nWorkflowInventory.ts \
  web/src/api/n8nWorkflowInventory.test.ts \
  history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add n8n inventory frontend contract"
git push origin phase2b-n8n-inventory
```

Expected: the push fast-forwards the Phase 2B branch and status is clean.

### Task 4: Manual Inventory Controller

**Files:**

- Create: `web/src/features/integrations/useN8nWorkflowInventory.ts`
- Create: `web/src/features/integrations/useN8nWorkflowInventory.test.tsx`
- Modify: `history/BUILD_LOG.md`

- [ ] **Step 1: Write the failing manual-lifecycle tests**

Create `web/src/features/integrations/useN8nWorkflowInventory.test.tsx` with:

```typescript
import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  N8nWorkflowInventoryContractError,
  getN8nWorkflowInventory,
  type N8nWorkflowInventoryResponse,
  type N8nWorkflowInventorySnapshot,
} from '../../api/n8nWorkflowInventory'
import { useN8nWorkflowInventory } from './useN8nWorkflowInventory'

vi.mock('../../api/n8nWorkflowInventory', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../api/n8nWorkflowInventory')>()
  return { ...actual, getN8nWorkflowInventory: vi.fn() }
})

const getInventoryMock = vi.mocked(getN8nWorkflowInventory)

const available: Extract<
  N8nWorkflowInventorySnapshot,
  { state: 'available' }
> = {
  state: 'available',
  items: [
    {
      name: 'Daily local backup',
      active: true,
      updated_at: '2026-07-26T08:30:00Z',
    },
  ],
  truncated: false,
  error: null,
}

const unconfigured: Extract<
  N8nWorkflowInventorySnapshot,
  { state: 'unconfigured' }
> = {
  state: 'unconfigured',
  items: [],
  truncated: false,
  error: null,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('useN8nWorkflowInventory', () => {
  beforeEach(() => {
    getInventoryMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('makes no request on mount, enable, re-entry, or StrictMode replay', () => {
    const { rerender } = renderHook(
      ({ enabled }) => useN8nWorkflowInventory(enabled),
      {
        initialProps: { enabled: false },
        wrapper: StrictMode,
      },
    )

    rerender({ enabled: true })
    rerender({ enabled: false })
    rerender({ enabled: true })

    expect(getInventoryMock).not.toHaveBeenCalled()
  })

  it('starts exactly one explicit load and ignores pending actions', async () => {
    const request = deferred<N8nWorkflowInventoryResponse>()
    getInventoryMock.mockReturnValueOnce(request.promise)
    const { result } = renderHook(() => useN8nWorkflowInventory(true))

    act(() => {
      result.current.load()
      result.current.load()
      result.current.refresh()
    })

    expect(getInventoryMock).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(true)
    expect(result.current.requestStatus).toBe('loading')
    await act(async () => request.resolve(available))
    expect(result.current.snapshot).toEqual(available)
    expect(result.current.requestStatus).toBe('ready')
    expect(result.current.lastLoaded).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run the hook test and observe the missing module**

Run:

```bash
env --chdir=web pnpm exec vitest run \
  src/features/integrations/useN8nWorkflowInventory.test.tsx
```

Expected: collection fails because `useN8nWorkflowInventory` does not exist.

- [ ] **Step 3: Create the controller with atomic settled-state restoration**

Create `web/src/features/integrations/useN8nWorkflowInventory.ts` with:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  N8nWorkflowInventoryContractError,
  getN8nWorkflowInventory,
  type N8nWorkflowInventoryFailure,
  type N8nWorkflowInventorySnapshot,
} from '../../api/n8nWorkflowInventory'

export type N8nWorkflowInventoryRequestStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'

export interface N8nWorkflowInventoryController {
  snapshot: N8nWorkflowInventorySnapshot | null
  requestStatus: N8nWorkflowInventoryRequestStatus
  pending: boolean
  error: string | null
  stale: boolean
  lastLoaded: Date | null
  settlementSequence: number
  load: () => void
  refresh: () => void
}

interface ControllerState {
  snapshot: N8nWorkflowInventorySnapshot | null
  requestStatus: N8nWorkflowInventoryRequestStatus
  pending: boolean
  error: string | null
  stale: boolean
  lastLoaded: Date | null
  settlementSequence: number
}

interface ActiveRequest {
  controller: AbortController
  previous: ControllerState
}

const INITIAL_STATE: ControllerState = {
  snapshot: null,
  requestStatus: 'idle',
  pending: false,
  error: null,
  stale: false,
  lastLoaded: null,
  settlementSequence: 0,
}

const HUB_UNAVAILABLE_ERROR =
  'Unable to load workflow inventory through the Hub.'
const HUB_INVALID_RESPONSE_ERROR =
  'The Hub returned an invalid workflow inventory response.'
export const N8N_INVENTORY_STALE_WARNING =
  'Refresh failed. Showing the last workflow inventory.'

const wasAborted = (error: unknown, signal: AbortSignal) =>
  signal.aborted ||
  (error instanceof DOMException && error.name === 'AbortError')

function firstFailureMessage(
  failure: N8nWorkflowInventoryFailure,
): string {
  return failure.error
}

export function useN8nWorkflowInventory(
  enabled: boolean,
): N8nWorkflowInventoryController {
  const [state, setState] = useState<ControllerState>(INITIAL_STATE)
  const stateRef = useRef(state)
  const mounted = useRef(false)
  const enabledRef = useRef(enabled)
  const generation = useRef(0)
  const activeRequest = useRef<ActiveRequest | null>(null)
  enabledRef.current = enabled

  const publish = useCallback((next: ControllerState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const start = useCallback(() => {
    if (
      !mounted.current ||
      !enabledRef.current ||
      stateRef.current.pending
    ) {
      return
    }

    const previous = { ...stateRef.current, pending: false }
    const controller = new AbortController()
    const requestGeneration = ++generation.current
    const request: ActiveRequest = {
      controller,
      previous,
    }
    activeRequest.current = request
    publish({
      ...previous,
      requestStatus: 'loading',
      pending: true,
      error: null,
      stale: false,
    })

    const ownsRequest = () =>
      mounted.current &&
      enabledRef.current &&
      generation.current === requestGeneration &&
      activeRequest.current === request
    const releaseRequest = () => {
      if (activeRequest.current === request) {
        activeRequest.current = null
      }
    }

    const publishFailure = (message: string) => {
      const availableSnapshot =
        previous.snapshot?.state === 'available'
          ? previous.snapshot
          : null
      const nextSequence = previous.settlementSequence + 1
      if (availableSnapshot !== null) {
        publish({
          snapshot: availableSnapshot,
          requestStatus: 'error',
          pending: false,
          error: N8N_INVENTORY_STALE_WARNING,
          stale: true,
          lastLoaded: previous.lastLoaded,
          settlementSequence: nextSequence,
        })
        return
      }
      publish({
        snapshot: null,
        requestStatus: 'error',
        pending: false,
        error: message,
        stale: false,
        lastLoaded: null,
        settlementSequence: nextSequence,
      })
    }

    void getN8nWorkflowInventory(controller.signal)
      .then((result) => {
        if (!ownsRequest()) return
        releaseRequest()
        if (
          result.state !== 'available' &&
          result.state !== 'unconfigured'
        ) {
          publishFailure(firstFailureMessage(result))
          return
        }
        publish({
          snapshot: result,
          requestStatus: 'ready',
          pending: false,
          error: null,
          stale: false,
          lastLoaded: new Date(),
          settlementSequence: previous.settlementSequence + 1,
        })
      })
      .catch((error: unknown) => {
        if (wasAborted(error, controller.signal)) {
          if (ownsRequest()) {
            releaseRequest()
            publish(previous)
          }
          return
        }
        if (!ownsRequest()) return
        releaseRequest()
        publishFailure(
          error instanceof N8nWorkflowInventoryContractError
            ? HUB_INVALID_RESPONSE_ERROR
            : HUB_UNAVAILABLE_ERROR,
        )
      })
  }, [publish])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
      activeRequest.current?.controller.abort()
      activeRequest.current = null
    }
  }, [])

  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled && activeRequest.current !== null) {
      const request = activeRequest.current
      generation.current += 1
      activeRequest.current = null
      request.controller.abort()
      publish(request.previous)
    }
  }, [enabled, publish])

  return {
    ...state,
    load: start,
    refresh: start,
  }
}
```

- [ ] **Step 4: Add the complete success, failure, and stale matrix**

Append tests that parameterize all five normalized failures and use these concrete assertions:

```typescript
it.each([
  [
    'invalid_configuration',
    'Invalid n8n inventory configuration',
  ],
  [
    'access_denied',
    'n8n denied workflow inventory access',
  ],
  [
    'unavailable',
    'n8n workflow inventory is unavailable',
  ],
  [
    'timeout',
    'n8n workflow inventory timed out',
  ],
  [
    'invalid_response',
    'n8n returned an invalid workflow inventory',
  ],
] as const)(
  'maps normalized %s without exposing another error',
  async (state, error) => {
    getInventoryMock.mockResolvedValueOnce({
      state,
      items: [],
      truncated: false,
      error,
    })
    const { result } = renderHook(() => useN8nWorkflowInventory(true))

    act(() => result.current.load())
    await waitFor(() => expect(result.current.requestStatus).toBe('error'))

    expect(result.current.snapshot).toBeNull()
    expect(result.current.error).toBe(error)
    expect(result.current.stale).toBe(false)
    expect(result.current.lastLoaded).toBeNull()
  },
)

it('retains an available snapshot and time after any failed refresh', async () => {
  getInventoryMock
    .mockResolvedValueOnce(available)
    .mockRejectedValueOnce(new Error('private backend detail'))
  const { result } = renderHook(() => useN8nWorkflowInventory(true))

  act(() => result.current.load())
  await waitFor(() => expect(result.current.snapshot).toEqual(available))
  const snapshot = result.current.snapshot
  const loaded = result.current.lastLoaded
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.stale).toBe(true))

  expect(result.current.snapshot).toBe(snapshot)
  expect(result.current.lastLoaded).toBe(loaded)
  expect(result.current.error).toBe(
    'Refresh failed. Showing the last workflow inventory.',
  )
  expect(JSON.stringify(result.current)).not.toContain(
    'private backend detail',
  )
})


it.each([
  {
    state: 'available',
    items: [],
    truncated: false,
    error: null,
  },
  available,
  {
    ...available,
    truncated: true,
  },
] satisfies N8nWorkflowInventoryResponse[])(
  'publishes a successful available snapshot',
  async (response) => {
    getInventoryMock.mockResolvedValueOnce(response)
    const { result } = renderHook(() => useN8nWorkflowInventory(true))

    act(() => result.current.load())
    await waitFor(() => expect(result.current.snapshot).toEqual(response))

    expect(result.current.requestStatus).toBe('ready')
    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.stale).toBe(false)
    expect(result.current.lastLoaded).toBeInstanceOf(Date)
    expect(result.current.settlementSequence).toBe(1)
  },
)

it('unconfigured success clears an earlier available snapshot', async () => {
  getInventoryMock
    .mockResolvedValueOnce(available)
    .mockResolvedValueOnce(unconfigured)
  const { result } = renderHook(() => useN8nWorkflowInventory(true))

  act(() => result.current.load())
  await waitFor(() => expect(result.current.snapshot).toEqual(available))
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.snapshot).toEqual(unconfigured))

  expect(result.current.requestStatus).toBe('ready')
  expect(result.current.snapshot?.items).toEqual([])
  expect(result.current.stale).toBe(false)
  expect(result.current.error).toBeNull()
  expect(result.current.settlementSequence).toBe(2)
})

it.each([
  [
    new N8nWorkflowInventoryContractError(),
    'The Hub returned an invalid workflow inventory response.',
  ],
  [
    new Error('private transport detail'),
    'Unable to load workflow inventory through the Hub.',
  ],
] as const)(
  'maps a first Hub failure to fixed copy',
  async (failure, message) => {
    getInventoryMock.mockRejectedValueOnce(failure)
    const { result } = renderHook(() => useN8nWorkflowInventory(true))

    act(() => result.current.load())
    await waitFor(() => expect(result.current.requestStatus).toBe('error'))

    expect(result.current.error).toBe(message)
    expect(result.current.snapshot).toBeNull()
    expect(result.current.lastLoaded).toBeNull()
    expect(JSON.stringify(result.current)).not.toContain(
      'private transport detail',
    )
  },
)

it('successful refresh replaces stale state and advances settlement', async () => {
  const replacement: N8nWorkflowInventoryResponse = {
    state: 'available',
    items: [
      {
        name: 'Replacement',
        active: false,
        updated_at: '2026-07-26T09:30:00Z',
      },
    ],
    truncated: false,
    error: null,
  }
  getInventoryMock
    .mockResolvedValueOnce(available)
    .mockRejectedValueOnce(new Error('private failure'))
    .mockResolvedValueOnce(replacement)
  const { result } = renderHook(() => useN8nWorkflowInventory(true))

  act(() => result.current.load())
  await waitFor(() => expect(result.current.snapshot).toEqual(available))
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.stale).toBe(true))
  const staleLoaded = result.current.lastLoaded
  expect(result.current.settlementSequence).toBe(2)
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.snapshot).toEqual(replacement))

  expect(result.current.error).toBeNull()
  expect(result.current.stale).toBe(false)
  expect(result.current.lastLoaded).not.toBe(staleLoaded)
  expect(result.current.settlementSequence).toBe(3)
})
```

- [ ] **Step 5: Add abort, generation, timer, and no-storage tests**

Use deferred promises to prove:

```typescript
it('restores the exact settled state when a refresh is aborted on leave', async () => {
  const refresh = deferred<N8nWorkflowInventoryResponse>()
  getInventoryMock
    .mockResolvedValueOnce(available)
    .mockReturnValueOnce(refresh.promise)
  const { result, rerender } = renderHook(
    ({ enabled }) => useN8nWorkflowInventory(enabled),
    { initialProps: { enabled: true } },
  )

  act(() => result.current.load())
  await waitFor(() => expect(result.current.snapshot).toEqual(available))
  const settled = {
    snapshot: result.current.snapshot,
    requestStatus: result.current.requestStatus,
    error: result.current.error,
    stale: result.current.stale,
    lastLoaded: result.current.lastLoaded,
    settlementSequence: result.current.settlementSequence,
  }
  act(() => result.current.refresh())
  const signal = getInventoryMock.mock.calls[1]?.[0]
  rerender({ enabled: false })

  expect(signal?.aborted).toBe(true)
  expect(result.current).toMatchObject(settled)
  expect(result.current.pending).toBe(false)
  await act(async () => refresh.resolve(unconfigured))
  expect(result.current.snapshot).toBe(settled.snapshot)
})
```

Append the following tests:

```typescript
it('restores idle after a first-load navigation abort', async () => {
  const request = deferred<N8nWorkflowInventoryResponse>()
  getInventoryMock.mockReturnValueOnce(request.promise)
  const { result, rerender } = renderHook(
    ({ enabled }) => useN8nWorkflowInventory(enabled),
    { initialProps: { enabled: true } },
  )

  act(() => result.current.load())
  const signal = getInventoryMock.mock.calls[0]?.[0]
  rerender({ enabled: false })

  expect(signal?.aborted).toBe(true)
  expect(result.current).toMatchObject({
    snapshot: null,
    requestStatus: 'idle',
    pending: false,
    error: null,
    stale: false,
    lastLoaded: null,
    settlementSequence: 0,
  })
})

it('restores a prior error when its retry aborts', async () => {
  const retry = deferred<N8nWorkflowInventoryResponse>()
  getInventoryMock
    .mockRejectedValueOnce(new Error('first failure'))
    .mockReturnValueOnce(retry.promise)
  const { result, rerender } = renderHook(
    ({ enabled }) => useN8nWorkflowInventory(enabled),
    { initialProps: { enabled: true } },
  )

  act(() => result.current.load())
  await waitFor(() => expect(result.current.requestStatus).toBe('error'))
  const priorError = result.current.error
  const priorSequence = result.current.settlementSequence
  act(() => result.current.load())
  rerender({ enabled: false })

  expect(result.current.requestStatus).toBe('error')
  expect(result.current.error).toBe(priorError)
  expect(result.current.settlementSequence).toBe(priorSequence)
})

it('aborts on unmount and ignores late completion', async () => {
  const request = deferred<N8nWorkflowInventoryResponse>()
  getInventoryMock.mockReturnValueOnce(request.promise)
  const { result, unmount } = renderHook(() =>
    useN8nWorkflowInventory(true),
  )

  act(() => result.current.load())
  const signal = getInventoryMock.mock.calls[0]?.[0]
  unmount()
  expect(signal?.aborted).toBe(true)
  await act(async () => request.resolve(available))
})

it('preserves memory on re-entry and lets only a new manual generation win', async () => {
  const oldRequest = deferred<N8nWorkflowInventoryResponse>()
  const newRequest = deferred<N8nWorkflowInventoryResponse>()
  getInventoryMock
    .mockResolvedValueOnce(available)
    .mockReturnValueOnce(oldRequest.promise)
    .mockReturnValueOnce(newRequest.promise)
  const { result, rerender } = renderHook(
    ({ enabled }) => useN8nWorkflowInventory(enabled),
    { initialProps: { enabled: true } },
  )

  act(() => result.current.load())
  await waitFor(() => expect(result.current.snapshot).toEqual(available))
  act(() => result.current.refresh())
  rerender({ enabled: false })
  rerender({ enabled: true })
  expect(getInventoryMock).toHaveBeenCalledTimes(2)
  expect(result.current.snapshot).toEqual(available)
  act(() => result.current.refresh())
  const replacement = {
    ...available,
    items: [{ ...available.items[0], name: 'Newest manual result' }],
  }
  await act(async () => newRequest.resolve(replacement))
  await act(async () => oldRequest.resolve(unconfigured))

  expect(result.current.snapshot).toEqual(replacement)
  expect(getInventoryMock).toHaveBeenCalledTimes(3)
})

it('never polls or retries when time advances', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useN8nWorkflowInventory(true))

  act(() => vi.advanceTimersByTime(300_000))

  expect(result.current.requestStatus).toBe('idle')
  expect(getInventoryMock).not.toHaveBeenCalled()
})

it('writes no browser persistence, worker, or clipboard state', async () => {
  const localSet = vi.spyOn(Storage.prototype, 'setItem')
  const cacheOpen = vi.fn()
  const indexedOpen = vi.fn()
  const workerRegister = vi.fn()
  const clipboardWrite = vi.fn()
  const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    'serviceWorker',
  )
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    'clipboard',
  )
  vi.stubGlobal('caches', { open: cacheOpen })
  vi.stubGlobal('indexedDB', { open: indexedOpen })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: workerRegister },
  })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWrite },
  })
  getInventoryMock.mockResolvedValueOnce(available)
  const { result } = renderHook(() => useN8nWorkflowInventory(true))

  act(() => result.current.load())
  await waitFor(() => expect(result.current.snapshot).toEqual(available))

  expect(localSet).not.toHaveBeenCalled()
  expect(cacheOpen).not.toHaveBeenCalled()
  expect(indexedOpen).not.toHaveBeenCalled()
  expect(workerRegister).not.toHaveBeenCalled()
  expect(clipboardWrite).not.toHaveBeenCalled()
  if (serviceWorkerDescriptor === undefined) {
    Reflect.deleteProperty(navigator, 'serviceWorker')
  } else {
    Object.defineProperty(
      navigator,
      'serviceWorker',
      serviceWorkerDescriptor,
    )
  }
  if (clipboardDescriptor === undefined) {
    Reflect.deleteProperty(navigator, 'clipboard')
  } else {
    Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  }
})
```

- [ ] **Step 6: Run mandatory controller gates**

Run:

```bash
env --chdir=web pnpm exec vitest run \
  src/features/integrations/useN8nWorkflowInventory.test.tsx
env --chdir=web pnpm typecheck
env --chdir=web pnpm lint
make test-web
env --chdir=web pnpm build
git diff --check
```

Expected: all commands pass, including the complete frontend suite required for Integrations
behavior.

- [ ] **Step 7: Record, commit, and push the controller**

Append the observed lifecycle/request/storage evidence to `history/BUILD_LOG.md`, then:

```bash
git add \
  web/src/features/integrations/useN8nWorkflowInventory.ts \
  web/src/features/integrations/useN8nWorkflowInventory.test.tsx \
  history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add manual n8n inventory controller"
git push origin phase2b-n8n-inventory
```

Expected: a clean fast-forward push.

### Task 5: Accessible Inventory Panel and Integrations Wiring

**Files:**

- Create: `web/src/features/integrations/N8nWorkflowInventory.tsx`
- Create: `web/src/features/integrations/N8nWorkflowInventory.test.tsx`
- Modify: `web/src/features/integrations/IntegrationsView.tsx`
- Modify: `web/src/features/integrations/IntegrationsView.test.tsx`
- Modify: `web/src/features/integrations/N8nStatusCard.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.navigation.test.tsx`
- Modify: `web/src/styles.css`
- Modify: `web/src/styles.test.ts`
- Modify: `history/BUILD_LOG.md`

- [ ] **Step 1: Write the failing panel-state and semantics tests**

Create `web/src/features/integrations/N8nWorkflowInventory.test.tsx` with controller fixture:

```typescript
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { N8nWorkflowInventorySnapshot } from '../../api/n8nWorkflowInventory'
import { N8nWorkflowInventory } from './N8nWorkflowInventory'
import type { N8nWorkflowInventoryController } from './useN8nWorkflowInventory'

const makeController = (
  overrides: Partial<N8nWorkflowInventoryController> = {},
): N8nWorkflowInventoryController => ({
  snapshot: null,
  requestStatus: 'idle',
  pending: false,
  error: null,
  stale: false,
  lastLoaded: null,
  settlementSequence: 0,
  load: vi.fn(),
  refresh: vi.fn(),
  ...overrides,
})

const available: Extract<
  N8nWorkflowInventorySnapshot,
  { state: 'available' }
> = {
  state: 'available',
  items: [
    {
      name: 'Daily local backup',
      active: true,
      updated_at: '2026-07-26T08:30:00Z',
    },
    {
      name: 'Draft document pipeline',
      active: false,
      updated_at: '2026-07-25T18:15:00Z',
    },
  ],
  truncated: false,
  error: null,
}

describe('N8nWorkflowInventory', () => {
  it('renders idle state and makes one explicit load', async () => {
    const user = userEvent.setup()
    const load = vi.fn()
    render(
      <N8nWorkflowInventory controller={makeController({ load })} />,
    )

    const section = screen.getByRole('region', {
      name: 'n8n workflow inventory',
    })
    expect(section).toHaveAttribute('aria-busy', 'false')
    expect(
      within(section).getByText('Workflow inventory not loaded'),
    ).toBeInTheDocument()
    await user.click(
      within(section).getByRole('button', { name: 'Load workflows' }),
    )
    expect(load).toHaveBeenCalledOnce()
  })

  it('renders semantic inert rows and approved fields only', () => {
    const loaded = new Date('2026-07-26T09:00:00Z')
    render(
      <N8nWorkflowInventory
        controller={makeController({
          snapshot: available,
          requestStatus: 'ready',
          lastLoaded: loaded,
          settlementSequence: 1,
        })}
      />,
    )

    const list = screen.getByRole('list', { name: 'n8n workflows' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('Daily local backup')).toBeInTheDocument()
    expect(within(list).getByText('Active')).toBeInTheDocument()
    expect(within(list).getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText('2 loaded')).toBeInTheDocument()
    expect(document.querySelector('[href]')).toBeNull()
    expect(document.querySelector('input')).toBeNull()
    expect(screen.queryByText(/cursor|workflow id|total/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the panel test and observe the missing component**

Run:

```bash
env --chdir=web pnpm exec vitest run \
  src/features/integrations/N8nWorkflowInventory.test.tsx
```

Expected: collection fails because `N8nWorkflowInventory` does not exist.

- [ ] **Step 3: Create the inventory panel**

Create `web/src/features/integrations/N8nWorkflowInventory.tsx` with:

```typescript
import { useEffect, useRef, useState } from 'react'

import type { N8nWorkflowInventoryController } from './useN8nWorkflowInventory'

interface N8nWorkflowInventoryProps {
  controller: N8nWorkflowInventoryController
}

interface Announcement {
  message: string
  sequence: number
}

const loadedLabel = (value: Date) =>
  value.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

const workflowTimeLabel = (value: string) =>
  new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

export function N8nWorkflowInventory({
  controller,
}: N8nWorkflowInventoryProps) {
  const [announcement, setAnnouncement] = useState<Announcement>({
    message: '',
    sequence: 0,
  })
  const previousSettlement = useRef(controller.settlementSequence)

  useEffect(() => {
    if (
      controller.settlementSequence === previousSettlement.current ||
      controller.pending
    ) {
      return
    }
    previousSettlement.current = controller.settlementSequence

    let message = ''
    if (controller.stale && controller.error !== null) {
      message = controller.error
    } else if (controller.snapshot?.state === 'available') {
      const count = controller.snapshot.items.length
      message = `${count} n8n workflow${count === 1 ? '' : 's'} loaded${
        controller.snapshot.truncated
          ? '; the bounded result is truncated.'
          : '.'
      }`
    } else if (controller.snapshot?.state === 'unconfigured') {
      message = 'n8n workflow inventory is not configured.'
    }

    setAnnouncement((current) => ({
      message,
      sequence: current.sequence + 1,
    }))
  }, [
    controller.error,
    controller.pending,
    controller.settlementSequence,
    controller.snapshot,
    controller.stale,
  ])

  const settled = controller.snapshot !== null
  const actionLabel = settled ? 'Refresh inventory' : 'Load workflows'
  const action = settled ? controller.refresh : controller.load
  const available =
    controller.snapshot?.state === 'available'
      ? controller.snapshot
      : null

  return (
    <section
      className="n8n-inventory"
      aria-labelledby="n8n-inventory-title"
      aria-busy={controller.pending}
    >
      <header className="n8n-inventory__header">
        <div>
          <p className="kicker">Explicit provider summary</p>
          <h2 id="n8n-inventory-title">n8n workflow inventory</h2>
        </div>
        <button
          type="button"
          className="n8n-inventory__action"
          aria-disabled={controller.pending}
          onClick={() => {
            if (!controller.pending) action()
          }}
        >
          {controller.pending
            ? settled
              ? 'Refreshing inventory'
              : 'Loading workflows'
            : actionLabel}
        </button>
      </header>

      {controller.error !== null ? (
        <p
          className={`n8n-inventory__alert${
            controller.stale ? ' n8n-inventory__alert--stale' : ''
          }`}
          role={controller.stale ? undefined : 'alert'}
        >
          {controller.error}
        </p>
      ) : null}

      {controller.snapshot?.state === 'unconfigured' ? (
        <div className="n8n-inventory__empty">
          <strong>Inventory not configured</strong>
          <p>
            Configure the n8n origin and API key in the API process, then
            restart the API.
          </p>
        </div>
      ) : available !== null ? (
        <div className="n8n-inventory__results">
          <div className="n8n-inventory__summary">
            <strong>{available.items.length} loaded</strong>
            {controller.lastLoaded !== null ? (
              <p>
                Last loaded{' '}
                <time dateTime={controller.lastLoaded.toISOString()}>
                  {loadedLabel(controller.lastLoaded)}
                </time>
              </p>
            ) : null}
          </div>
          {available.truncated ? (
            <p className="n8n-inventory__notice">
              Showing a bounded workflow summary. More workflows may exist in
              n8n.
            </p>
          ) : null}
          {available.items.length === 0 ? (
            <p className="n8n-inventory__empty">No workflows returned</p>
          ) : (
            <ul className="n8n-inventory__list" aria-label="n8n workflows">
              {available.items.map((workflow, index) => (
                <li className="n8n-inventory__row" key={index}>
                  <strong className="n8n-inventory__name">
                    {workflow.name}
                  </strong>
                  <span className="n8n-inventory__state">
                    {workflow.active ? 'Active' : 'Inactive'}
                  </span>
                  <time dateTime={workflow.updated_at}>
                    {workflowTimeLabel(workflow.updated_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : controller.pending ? (
        <p className="n8n-inventory__empty">Loading workflow inventory</p>
      ) : controller.error === null ? (
        <div className="n8n-inventory__empty">
          <strong>Workflow inventory not loaded</strong>
          <p>Use Load workflows to request one bounded local summary.</p>
        </div>
      ) : null}

      <p
        className="sr-only"
        aria-label="n8n workflow inventory announcements"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement.message === '' ? null : (
          <span key={announcement.sequence}>{announcement.message}</span>
        )}
      </p>
    </section>
  )
}
```

- [ ] **Step 4: Complete panel behavior, focus, and announcement tests**

Append these behavior tests:

```typescript
it('keeps the pending action focusable and ignores all pending activation', async () => {
  const user = userEvent.setup()
  const load = vi.fn()
  const refresh = vi.fn()
  const initial = makeController({ load, refresh })
  const { rerender } = render(
    <N8nWorkflowInventory controller={initial} />,
  )
  const button = screen.getByRole('button', { name: 'Load workflows' })
  await user.click(button)
  expect(load).toHaveBeenCalledOnce()
  expect(button).toHaveFocus()

  rerender(
    <N8nWorkflowInventory
      controller={{
        ...initial,
        requestStatus: 'loading',
        pending: true,
      }}
    />,
  )
  const pendingButton = screen.getByRole('button', {
    name: 'Loading workflows',
  })
  const section = screen.getByRole('region', {
    name: 'n8n workflow inventory',
  })
  expect(section).toHaveAttribute('aria-busy', 'true')
  expect(pendingButton).toHaveAttribute('aria-disabled', 'true')
  expect(pendingButton).not.toBeDisabled()
  expect(pendingButton).toHaveFocus()
  await user.click(pendingButton)
  await user.keyboard('{Enter}{Space}')
  expect(load).toHaveBeenCalledTimes(1)
  expect(refresh).not.toHaveBeenCalled()
})

it('renders neutral unconfigured guidance without credential controls', () => {
  const { container } = render(
    <N8nWorkflowInventory
      controller={makeController({
        snapshot: {
          state: 'unconfigured',
          items: [],
          truncated: false,
          error: null,
        },
        requestStatus: 'ready',
        lastLoaded: new Date('2026-07-26T09:00:00Z'),
        settlementSequence: 1,
      })}
    />,
  )

  expect(screen.getByText('Inventory not configured')).toBeInTheDocument()
  expect(
    screen.getByText(/Configure the n8n origin and API key in the API process/),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Refresh inventory' }),
  ).toBeInTheDocument()
  expect(container.querySelector('input')).toBeNull()
  expect(container.querySelector('[href]')).toBeNull()
  expect(
    screen.queryByRole('button', { name: /copy|clipboard/i }),
  ).not.toBeInTheDocument()
  expect(screen.queryByText(/key present|key missing/i)).not.toBeInTheDocument()
})

it('renders empty and truncated available results without a provider total', () => {
  const { rerender } = render(
    <N8nWorkflowInventory
      controller={makeController({
        snapshot: {
          state: 'available',
          items: [],
          truncated: false,
          error: null,
        },
        requestStatus: 'ready',
        lastLoaded: new Date('2026-07-26T09:00:00Z'),
        settlementSequence: 1,
      })}
    />,
  )
  expect(screen.getByText('0 loaded')).toBeInTheDocument()
  expect(screen.getByText('No workflows returned')).toBeInTheDocument()

  rerender(
    <N8nWorkflowInventory
      controller={makeController({
        snapshot: { ...available, truncated: true },
        requestStatus: 'ready',
        lastLoaded: new Date('2026-07-26T09:01:00Z'),
        settlementSequence: 2,
      })}
    />,
  )
  expect(
    screen.getByText(
      'Showing a bounded workflow summary. More workflows may exist in n8n.',
    ),
  ).toBeInTheDocument()
  expect(screen.queryByText(/provider total/i)).not.toBeInTheDocument()
})

it('uses one assertive first error and no polite duplicate', () => {
  render(
    <N8nWorkflowInventory
      controller={makeController({
        requestStatus: 'error',
        error: 'n8n denied workflow inventory access',
        settlementSequence: 1,
      })}
    />,
  )

  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByRole('alert')).toHaveTextContent(
    'n8n denied workflow inventory access',
  )
  expect(
    screen.getByLabelText('n8n workflow inventory announcements'),
  ).toHaveTextContent('')
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})

it('clears an earlier polite result when a later first error is assertive', () => {
  const initial = makeController()
  const { rerender } = render(
    <N8nWorkflowInventory controller={initial} />,
  )
  rerender(
    <N8nWorkflowInventory
      controller={{
        ...initial,
        snapshot: {
          state: 'unconfigured',
          items: [],
          truncated: false,
          error: null,
        },
        requestStatus: 'ready',
        settlementSequence: 1,
      }}
    />,
  )
  const region = screen.getByLabelText(
    'n8n workflow inventory announcements',
  )
  expect(region).toHaveTextContent(
    'n8n workflow inventory is not configured.',
  )

  rerender(
    <N8nWorkflowInventory
      controller={{
        ...initial,
        requestStatus: 'error',
        error: 'n8n denied workflow inventory access',
        settlementSequence: 2,
      }}
    />,
  )

  expect(screen.getByRole('alert')).toHaveTextContent(
    'n8n denied workflow inventory access',
  )
  expect(region).toHaveTextContent('')
  expect(region.childElementCount).toBe(0)
})

it('retains stale rows and announces one warning politely', () => {
  const initial = makeController({
    snapshot: available,
    requestStatus: 'ready',
    lastLoaded: new Date('2026-07-26T09:00:00Z'),
    settlementSequence: 1,
  })
  const { rerender } = render(
    <N8nWorkflowInventory controller={initial} />,
  )
  rerender(
    <N8nWorkflowInventory
      controller={{
        ...initial,
        requestStatus: 'error',
        error: 'Refresh failed. Showing the last workflow inventory.',
        stale: true,
        settlementSequence: 2,
      }}
    />,
  )

  expect(screen.getByRole('list', { name: 'n8n workflows' })).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(
    screen.getByLabelText('n8n workflow inventory announcements'),
  ).toHaveTextContent(
    'Refresh failed. Showing the last workflow inventory.',
  )
})

it('emits one replaceable combined success announcement per settlement', () => {
  const initial = makeController()
  const { rerender } = render(
    <N8nWorkflowInventory controller={initial} />,
  )
  rerender(
    <N8nWorkflowInventory
      controller={makeController({
        snapshot: { ...available, truncated: true },
        requestStatus: 'ready',
        lastLoaded: new Date('2026-07-26T09:00:00Z'),
        settlementSequence: 1,
      })}
    />,
  )
  const region = screen.getByLabelText(
    'n8n workflow inventory announcements',
  )
  const firstMessage = region.firstElementChild
  expect(region).toHaveTextContent(
    '2 n8n workflows loaded; the bounded result is truncated.',
  )

  rerender(
    <N8nWorkflowInventory
      controller={makeController({
        snapshot: { ...available, truncated: true },
        requestStatus: 'ready',
        lastLoaded: new Date('2026-07-26T09:01:00Z'),
        settlementSequence: 2,
      })}
    />,
  )
  expect(region.firstElementChild).not.toBe(firstMessage)
  expect(region.childElementCount).toBe(1)
})

it('renders duplicate and hostile maximum names as inert text', () => {
  const suffix = '<script>$(rm) https://private \u202E'
  const hostile = `${'🧠'.repeat(
    256 - Array.from(suffix).length,
  )}${suffix}`
  expect(Array.from(hostile)).toHaveLength(256)
  const hostileAvailable = {
    ...available,
    items: [
      { ...available.items[0], name: hostile },
      { ...available.items[0], name: hostile },
    ],
  }
  const { container } = render(
    <N8nWorkflowInventory
      controller={makeController({
        snapshot: hostileAvailable,
        requestStatus: 'ready',
        lastLoaded: new Date('2026-07-26T09:00:00Z'),
        settlementSequence: 1,
      })}
    />,
  )

  expect(screen.getAllByText(hostile)).toHaveLength(2)
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('[href]')).toBeNull()
  expect(container.querySelector('[data-workflow-id]')).toBeNull()
  expect(container.querySelector('input')).toBeNull()
  expect(
    screen.queryByRole('button', {
      name: /copy|open|search|filter|detail|execute|activate|archive|delete/i,
    }),
  ).not.toBeInTheDocument()
  expect(container.textContent).not.toMatch(/\bcursor\b|\bworkflow id\b/i)
})
```

- [ ] **Step 5: Wire independent controllers into Integrations**

In `web/src/features/integrations/IntegrationsView.tsx`, add:

```typescript
import { N8nWorkflowInventory } from './N8nWorkflowInventory'
import type { N8nWorkflowInventoryController } from './useN8nWorkflowInventory'

interface IntegrationsViewProps {
  controller: IntegrationsController
  inventoryController: N8nWorkflowInventoryController
}
```

Change the function signature:

```typescript
export function IntegrationsView({
  controller,
  inventoryController,
}: IntegrationsViewProps) {
```

Use these exact revised strings:

```tsx
<p>
  Observe fixed credential-free n8n health endpoints and explicitly load one
  bounded workflow summary through the backend-only inventory boundary.
</p>
```

```tsx
<div
  className="integration-boundary"
  aria-label="Integration safety boundary"
>
  <span aria-hidden="true">READ ONLY</span>
  <p>
    Health uses fixed credential-free liveness and readiness endpoints.
    Workflow inventory uses a backend-only key with one fixed list endpoint
    only after explicit operator action.
  </p>
  <span aria-hidden="true">FIXED PATHS</span>
</div>
```

Rename health action/pending text:

```tsx
<span>
  {controller.pending ? 'Checking health' : 'Refresh health'}
</span>
```

Also change the health loading-state `<strong>` from `Checking n8n` to
`Checking health`. The pending button and loading status therefore retain the existing
two-occurrence contract under the health-specific wording.

Change the health empty instruction to:

```tsx
<p>Use Refresh health to request one credential-free observation.</p>
```

Give the existing health live region:

```tsx
aria-label="n8n health announcements"
```

Insert after the health card/loading/error presentation and before the health live region:

```tsx
<N8nWorkflowInventory controller={inventoryController} />
```

Change the footer phase text to:

```tsx
<span>Phase 02B</span>
```

In `N8nStatusCard.tsx`, replace the complete boundary paragraph with:

```tsx
<p className="integration-card__boundary">
  Credential-free health only · No provider data or container access
</p>
```

Make no state or schema change.

- [ ] **Step 6: Mount the manual controller at App scope**

In `web/src/App.tsx`, import:

```typescript
import { useN8nWorkflowInventory } from './features/integrations/useN8nWorkflowInventory'
```

Immediately after the health integration hook, add:

```typescript
const n8nWorkflowInventory = useN8nWorkflowInventory(
  activeView === 'integrations',
)
```

Replace the Integrations render with:

```tsx
<IntegrationsView
  controller={integrations}
  inventoryController={n8nWorkflowInventory}
/>
```

Do not modify `ActiveView`, the five navigation buttons, `navigateTo`, or guard conditions.

- [ ] **Step 7: Extend view and navigation tests**

In `IntegrationsView.test.tsx`, add a default inventory-controller fixture to every render through
one local helper:

```typescript
const makeInventoryController = (
  overrides: Partial<N8nWorkflowInventoryController> = {},
): N8nWorkflowInventoryController => ({
  snapshot: null,
  requestStatus: 'idle',
  pending: false,
  error: null,
  stale: false,
  lastLoaded: null,
  settlementSequence: 0,
  load: vi.fn(),
  refresh: vi.fn(),
  ...overrides,
})
```

Replace the existing unlabelled health live-region helper with:

```typescript
const politeRegion = (container: HTMLElement) => {
  const region = container.querySelector<HTMLElement>(
    '[aria-label="n8n health announcements"][aria-live="polite"][aria-atomic="true"]',
  )
  if (region === null) throw new Error('Health polite live region is missing')
  return region
}
```

Add this composition test:

```typescript
it('keeps health and inventory as independent ordered boundaries', () => {
  const { container } = render(
    <IntegrationsView
      controller={makeController()}
      inventoryController={makeInventoryController()}
    />,
  )

  const healthHeading = screen.getByRole('heading', { name: 'Integrations' })
  const inventoryHeading = screen.getByRole('heading', {
    name: 'n8n workflow inventory',
  })
  expect(
    healthHeading.compareDocumentPosition(inventoryHeading) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(
    screen.getByRole('button', { name: 'Refresh health' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Load workflows' }),
  ).toBeInTheDocument()
  expect(
    screen.getByText(/Health uses fixed credential-free/),
  ).toBeInTheDocument()
  expect(
    screen.getByText(/Workflow inventory uses a backend-only key/),
  ).toBeInTheDocument()
  expect(
    screen.getByLabelText('n8n health announcements'),
  ).toBeInTheDocument()
  expect(
    screen.getByLabelText('n8n workflow inventory announcements'),
  ).toBeInTheDocument()
  expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(2)
  expect(screen.getByText('Phase 02B')).toBeInTheDocument()
})
```

Update every existing `IntegrationsView` render to pass
`inventoryController={makeInventoryController()}`. Replace existing health button assertions
exactly:

```typescript
screen.getByRole('button', { name: 'Refresh health' })
screen.getByRole('button', { name: 'Checking health' })
```

Change the initial loading assertion to expect exactly two `Checking health` occurrences. In both
existing health re-announcement tests, change the page-wide polite-region count from one to two,
then keep the message and replacement-child assertions scoped to `politeRegion(container)`, the
labelled health region; assert that region itself still contains exactly one child. Keep every
other preexisting health state, stale, focus, inert-origin, and announcement assertion.

In `App.navigation.test.tsx`, mock `./api/n8nWorkflowInventory` independently:

```typescript
vi.mock('./api/n8nWorkflowInventory', () => {
  class N8nWorkflowInventoryContractError extends Error {}

  return {
    N8nWorkflowInventoryContractError,
    getN8nWorkflowInventory: vi.fn(),
  }
})
```

This intentionally avoids evaluating the real inventory module because the existing navigation test
fully mocks `./api/client` without its `requestJson` export.

Import the function/type and add:

```typescript
import {
  getN8nWorkflowInventory,
  type N8nWorkflowInventoryResponse,
} from './api/n8nWorkflowInventory'

const getInventoryMock = vi.mocked(getN8nWorkflowInventory)
const inventoryUnconfigured: N8nWorkflowInventoryResponse = {
  state: 'unconfigured',
  items: [],
  truncated: false,
  error: null,
}
const inventoryAvailable: N8nWorkflowInventoryResponse = {
  state: 'available',
  items: [
    {
      name: 'App-owned inventory snapshot',
      active: true,
      updated_at: '2026-07-26T08:30:00Z',
    },
  ],
  truncated: false,
  error: null,
}
```

Reset it in `beforeEach`:

```typescript
getInventoryMock.mockReset().mockResolvedValue(inventoryUnconfigured)
```

Append:

```typescript
it('loads inventory only after explicit Integrations action', async () => {
  const user = userEvent.setup()
  render(<App />)

  expect(getInventoryMock).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Prompts' }))
  await user.click(screen.getByRole('button', { name: 'Workflows' }))
  await user.click(screen.getByRole('button', { name: 'Transfer' }))
  expect(getInventoryMock).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Integrations' }))
  expect(await screen.findByRole('heading', {
    name: 'n8n workflow inventory',
  })).toBeInTheDocument()
  expect(getInventoryMock).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Load workflows' }))
  await screen.findByText('Inventory not configured')
  expect(getInventoryMock).toHaveBeenCalledTimes(1)
})

it('coalesces pending inventory activation and aborts on leave', async () => {
  const user = userEvent.setup()
  let resolve!: (value: N8nWorkflowInventoryResponse) => void
  getInventoryMock.mockReturnValueOnce(
    new Promise((resolvePromise) => {
      resolve = resolvePromise
    }),
  )
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Integrations' }))
  const load = screen.getByRole('button', { name: 'Load workflows' })
  await user.click(load)
  const signal = getInventoryMock.mock.calls[0]?.[0]
  const pending = screen.getByRole('button', {
    name: 'Loading workflows',
  })
  await user.click(pending)
  await user.keyboard('{Enter}{Space}')
  expect(getInventoryMock).toHaveBeenCalledTimes(1)

  await user.click(screen.getByRole('button', { name: 'Overview' }))
  expect(signal?.aborted).toBe(true)
  await act(async () => resolve(inventoryAvailable))
  await user.click(screen.getByRole('button', { name: 'Integrations' }))
  expect(getInventoryMock).toHaveBeenCalledTimes(1)
  expect(
    screen.getByText('Workflow inventory not loaded'),
  ).toBeInTheDocument()
})

it('preserves a successful in-memory snapshot across navigation', async () => {
  const user = userEvent.setup()
  getInventoryMock.mockResolvedValueOnce(inventoryAvailable)
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Integrations' }))
  await user.click(screen.getByRole('button', { name: 'Load workflows' }))
  expect(
    await screen.findByText('App-owned inventory snapshot'),
  ).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Overview' }))
  await user.click(screen.getByRole('button', { name: 'Integrations' }))

  expect(screen.getByText('App-owned inventory snapshot')).toBeInTheDocument()
  expect(getInventoryMock).toHaveBeenCalledTimes(1)
  expect(
    screen.getAllByRole('navigation', { name: 'Dashboard views' })[0]
      ?.querySelectorAll('button'),
  ).toHaveLength(5)
})
```

Add this exact assertion to every existing Prompt, Workflow Link, and Transfer guard test after the
blocked navigation assertion:

```typescript
expect(getInventoryMock).not.toHaveBeenCalled()
```

The hook-level generation test in Task 4 remains the direct late-settlement ownership test; App
tests prove mounting, navigation, and guard composition without duplicating controller internals.

- [ ] **Step 8: Add responsive inventory styles**

Insert this exact block beside existing Integrations styles in `web/src/styles.css`:

```css
.n8n-inventory {
  min-width: 0;
  padding: clamp(1rem, 2.4vw, 1.6rem);
  border: 1px solid var(--line);
  background: var(--surface);
}

.n8n-inventory__header,
.n8n-inventory__summary {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.n8n-inventory__header h2 {
  margin: 0.2rem 0 0;
}

.n8n-inventory__action {
  min-height: 44px;
  flex: 0 0 auto;
}

.n8n-inventory__action:focus-visible {
  outline: 3px solid var(--pending);
  outline-offset: 3px;
}

.n8n-inventory__action[aria-disabled='true'] {
  cursor: wait;
  opacity: 0.7;
}

.n8n-inventory__alert,
.n8n-inventory__notice,
.n8n-inventory__empty {
  margin: 1rem 0 0;
  overflow-wrap: anywhere;
}

.n8n-inventory__alert--stale {
  border-left: 3px solid var(--pending);
  padding-left: 0.75rem;
}

.n8n-inventory__results,
.n8n-inventory__list,
.n8n-inventory__row,
.n8n-inventory__name {
  min-width: 0;
}

.n8n-inventory__list {
  display: grid;
  gap: 0;
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}

.n8n-inventory__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, auto);
  min-width: 0;
  gap: 0.75rem 1rem;
  align-items: baseline;
  padding: 0.85rem 0;
  border-top: 1px solid var(--line);
}

.n8n-inventory__name {
  overflow-wrap: anywhere;
}

.n8n-inventory__state {
  font-weight: 700;
  text-transform: uppercase;
}
```

Add these declarations inside the existing `@media (max-width: 600px)` block:

```css
.n8n-inventory__header,
.n8n-inventory__summary {
  align-items: stretch;
  flex-direction: column;
}

.n8n-inventory__action {
  width: 100%;
}

.n8n-inventory__row {
  grid-template-columns: minmax(0, 1fr);
}
```

Do not add `overflow-x`, `white-space: nowrap`, text ellipsis, clipping, or a horizontal scroller.

Append these exact assertions to `styles.test.ts`:

```typescript
it('keeps workflow inventory rows shrinkable and wrap-safe', () => {
  expect(declarationBlock('.n8n-inventory')).toMatch(/min-width:\s*0/)
  expect(declarationBlock('.n8n-inventory__row')).toMatch(
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*auto\)/,
  )
  expect(declarationBlock('.n8n-inventory__row')).toMatch(/min-width:\s*0/)
  expect(declarationBlock('.n8n-inventory__name')).toMatch(
    /overflow-wrap:\s*anywhere/,
  )
  expect(declarationBlock('.n8n-inventory__action')).toMatch(
    /min-height:\s*44px/,
  )
  expect(declarationBlock('.n8n-inventory__action:focus-visible')).toMatch(
    /outline:\s*3px\s+solid/,
  )
})

it('stacks inventory controls and rows at the exact mobile boundary', () => {
  const mobile = mediaSlice(600)
  expect(
    declarationBlockFrom(mobile, '.n8n-inventory__action'),
  ).toMatch(/width:\s*100%/)
  expect(declarationBlockFrom(mobile, '.n8n-inventory__row')).toMatch(
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  )
})

it('adds no clipping or horizontal inventory scroller', () => {
  const start = stylesheet.indexOf('.n8n-inventory {')
  const end = stylesheet.indexOf('@media (max-width: 1080px)', start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  const inventoryRules = stylesheet.slice(start, end)

  expect(inventoryRules).not.toMatch(
    /overflow-x|overflow:\s*hidden|white-space:\s*nowrap|text-overflow:\s*ellipsis/,
  )
})
```

Keep the existing exact five-column, tablet, and mobile 3+2 navigation tests unchanged.

- [ ] **Step 9: Run focused UI tests, then all mandatory UI gates**

Run:

```bash
env --chdir=web pnpm exec vitest run \
  src/features/integrations/N8nWorkflowInventory.test.tsx \
  src/features/integrations/IntegrationsView.test.tsx \
  src/App.navigation.test.tsx \
  src/styles.test.ts
env --chdir=web pnpm typecheck
env --chdir=web pnpm lint
make test-web
env --chdir=web pnpm build
git diff --check
```

Expected: all focused and complete frontend gates pass. The existing five-view layout assertions
remain unchanged.

- [ ] **Step 10: Record, commit, and push the panel milestone**

Append exact test counts, lifecycle/accessibility evidence, and responsive assertions to
`history/BUILD_LOG.md`, then:

```bash
git add \
  web/src/features/integrations/N8nWorkflowInventory.tsx \
  web/src/features/integrations/N8nWorkflowInventory.test.tsx \
  web/src/features/integrations/IntegrationsView.tsx \
  web/src/features/integrations/IntegrationsView.test.tsx \
  web/src/features/integrations/N8nStatusCard.tsx \
  web/src/App.tsx \
  web/src/App.navigation.test.tsx \
  web/src/styles.css \
  web/src/styles.test.ts \
  history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add n8n workflow inventory panel"
git push origin phase2b-n8n-inventory
```

Expected: the branch fast-forwards and the worktree is clean.

### Task 6: API-Only Secret Forwarding and Operator Documentation

**Files:**

- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `Makefile`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/SECURITY_NOTES.md`
- Modify: `docs/superpowers/specs/2026-07-26-phase-2b-n8n-workflow-inventory-design.md`
- Modify: `history/BUILD_LOG.md`
- Modify only after a real observed incident: `docs/FAILURES.md`

- [ ] **Step 1: Add the intentionally empty example value**

Append exactly one line to `.env.example`:

```dotenv
N8N_API_KEY=
```

The complete file must contain only the four documented process settings and no working
credential. Do not inspect any other environment file.

- [ ] **Step 2: Forward the key to API runtime only**

In `docker-compose.yml`, make the API environment block exactly:

```yaml
    environment:
      DATABASE_URL: sqlite:////data/local-ai-hub.db
      N8N_API_KEY: ${N8N_API_KEY:-}
      N8N_BASE_URL: ${N8N_BASE_URL:-}
      OLLAMA_BASE_URL: ${OLLAMA_BASE_URL:-http://host.docker.internal:11434}
      PYTHONPATH: /app/src
```

Do not add the key to the web service, build arguments, commands, labels, healthchecks, volumes,
URLs, or any new service.

- [ ] **Step 3: Make the tracked build recipe immune to ambient n8n values**

Change the root `Makefile` build recipe to:

```make
build:
	N8N_API_KEY= N8N_BASE_URL= OLLAMA_BASE_URL=http://127.0.0.1:9 docker compose --env-file /dev/null build
	cd web && pnpm build
```

Search every project-controlled Compose command outside historical evidence:

```bash
rg -n 'docker compose' \
  --glob '!docs/superpowers/plans/**' \
  --glob '!history/BUILD_LOG.md'
```

For every active command, add an explicit `N8N_API_KEY=` or an explicit documented synthetic
placeholder, an explicit safe `N8N_BASE_URL`, an explicit safe `OLLAMA_BASE_URL`, and
`--env-file /dev/null`.

- [ ] **Step 4: Record the narrow approved maintenance exception**

In `AGENTS.md`, keep the existing approval list and Phase 2A exception, then insert this paragraph:

```markdown
Maintenance strictly inside the approved Phase 2B design may use the optional API-process-only
`N8N_API_KEY` for the existing fixed `GET /api/v1/workflows` summary inventory. This exception
does not approve workflow details, executions, additional provider resources, mutations,
request-controlled targets or filters, new paths, polling, persistence, authentication changes,
network exposure, production configuration, or Docker capability.
```

Keep the final Docker acceptance sentence unchanged.

- [ ] **Step 5: Update README capability, architecture, configuration, API, and lifecycle**

Make these concrete documentation changes:

1. Change the opening capability label from `Phase 2A provides:` to `Phase 2B provides:` and add:

   ```markdown
   - an explicitly loaded n8n workflow inventory that exposes only name, Active/Inactive state,
     and UTC update time through a backend-only key;
   - bounded backend pagination of at most four 50-item pages, 200 summaries, 8 MiB of identity
     JSON, depth 64, and one five-second eligibility deadline;
   ```

2. Replace the sentence claiming no n8n credentials or inventory with:

   ```markdown
   It remains read-only around Ollama and n8n. The optional n8n key is held only by the API process
   for one fixed workflow-list operation; the Hub still exposes no executions, workflow details,
   IDs, cursors, provider mutations, Docker capability, shell, model-management,
   prompt-execution, provider synchronization, or cloud-AI controls.
   ```

3. Add this architecture branch under the n8n status route:

   ```text
   |-- GET /api/integrations/n8n/workflows
   |       '-- backend-only key --> fixed n8n /api/v1/workflows
   |                              '-- name + active + updated time only
   ```

4. Add `N8N_API_KEY` to the configuration table:

   ```markdown
   | N8N_API_KEY | no default | Optional API-process-only n8n key for the fixed workflow inventory. Missing or exact empty means unconfigured. The value is never returned, persisted, or sent to the web service. |
   ```

5. Immediately below the n8n origin description, add:

   ```markdown
   Credentialed inventory accepts canonical HTTPS origins. Plain HTTP is allowed only for exact
   `localhost` or a canonical loopback IP; homelab names, private addresses,
   `host.docker.internal`, Docker gateways, and container names require HTTPS even though
   credential-free health may observe them over HTTP. Enterprise operators should use a dedicated
   `workflow:list`-scoped key with an expiration. Non-Enterprise n8n keys have full account
   capability, so isolate and rotate them accordingly.
   ```

6. Add the API row:

   ```markdown
   | GET | /api/integrations/n8n/workflows | Parameter-free manual inventory normalized to seven safe states; returns only name, active, updated_at, and a local truncation flag. |
   ```

7. Replace the Integrations lifecycle paragraph with:

   ```markdown
   Opening **Integrations** performs only the credential-free health observation. **Refresh
   health** repeats it. Workflow inventory starts only after **Load workflows**; **Refresh
   inventory** repeats that separate request. Inventory has no entry load, polling, retry,
   persistence, provider-origin browser request, or background refresh. A failed refresh retains
   only the earlier in-memory successful summary and marks it stale.
   ```

8. Add one available and one access-denied response example using the exact Hub contract from the
   design. State explicitly that all seven normalized states return HTTP 200 and that Hub
   transport/contract failures remain browser errors.

9. Update Security posture to state that the API process may hold the optional key for the one
   fixed list route, health remains key-free, provider objects are transiently bounded/projected,
   and every client able to reach the unauthenticated Hub route can trigger the operation and read
   up to 200 sensitive summaries.

10. Mark Phase 2B implemented with final-candidate acceptance pending; keep Phase 2C container
    visibility and Phase 3 administration deferred. Add this plan to Project records:

    ```markdown
    - [Phase 2B n8n Workflow Inventory implementation plan](docs/superpowers/plans/2026-07-26-phase-2b-n8n-workflow-inventory.md)
    ```

Every README Compose command must begin with an explicit `N8N_API_KEY=` for health-only examples or
an obviously synthetic non-secret value for a credentialed HTTPS example. A native loopback example
may use:

```bash
N8N_API_KEY=replace-with-operator-managed-key N8N_BASE_URL=http://localhost:5678 make dev-api
```

The Compose inventory example must use HTTPS:

```bash
N8N_API_KEY=replace-with-operator-managed-key N8N_BASE_URL=https://n8n.internal.example OLLAMA_BASE_URL=http://host.docker.internal:11434 docker compose --env-file /dev/null up --build
```

Explain that those placeholders are non-working examples and that the real value must be supplied
outside tracked files.

- [ ] **Step 6: Activate the security record without rewriting Phase 2A history**

In `docs/SECURITY_NOTES.md`:

- keep the Phase 2A health section's credential-free statements;
- change `## Approved Phase 2B n8n inventory boundary — implementation pending` to
  `## Phase 2B n8n inventory boundary`;
- replace its pending introductory paragraph with:

  ```markdown
  Phase 2B adds one optional `N8N_API_KEY` to the API process and uses it only for fixed
  `GET /api/v1/workflows` requests against the existing validated `N8N_BASE_URL`. Phase 2A health
  remains a separate credential-free client and never receives the key.
  ```

- describe the implemented fixed route as an unauthenticated trusted-localhost confused deputy;
- retain all approved HTTPS/loopback, key-scope, projection, limit, logging, no-mutation,
  no-persistence, no-public-exposure, and no-Docker-capability warnings;
- state explicitly that process/container environment inspection by a sufficiently privileged local
  operator can reveal the key and Compose is not a secret manager.

Do not edit the already approved append-only architecture decision unless implementation introduced
a genuinely new decision. Do not claim that Phase 2A itself uses a key.

- [ ] **Step 7: Mark implementation pending final acceptance**

At the top of the Phase 2B design, set:

```markdown
**Status:** Implemented; final exact-candidate acceptance pending
```

Do not mark it accepted yet.

- [ ] **Step 8: Run secret-safe Compose interpolation checks**

First prove ambient values cannot reach the build recipe without printing them:

```bash
BUILD_DRY_RUN="$(
  env \
    N8N_API_KEY=phase2b-dry-run-key-marker \
    N8N_BASE_URL=phase2b-dry-run-origin-marker \
    make -n build
)"
case "$BUILD_DRY_RUN" in
  *phase2b-dry-run-key-marker*|*phase2b-dry-run-origin-marker*) exit 1 ;;
esac
unset BUILD_DRY_RUN
```

Render the blank configuration quietly:

```bash
env \
  N8N_API_KEY= \
  N8N_BASE_URL= \
  OLLAMA_BASE_URL=http://127.0.0.1:9 \
  docker compose --env-file /dev/null config --quiet
```

Create a private task-owned standard-library verifier with `umask 077`. Pipe, but never print or
save, this command's JSON into it:

```bash
env \
  N8N_API_KEY=phase2b-compose-synthetic-key-7xQ \
  N8N_BASE_URL=https://n8n.synthetic.invalid \
  OLLAMA_BASE_URL=http://127.0.0.1:9 \
  docker compose --env-file /dev/null config --format json
```

The verifier must emit only booleans/counts and assert:

- exactly `api` and `web` services;
- the exact generated key exists only at `services.api.environment.N8N_API_KEY`;
- the key is recursively absent from web, both builds, commands, labels, healthchecks, ports,
  volumes, and service names;
- `N8N_BASE_URL` is API-only;
- both published host ports remain `127.0.0.1`;
- no n8n service, privileged flag, added capability, Docker socket, or Docker Engine setting.

Remove only the private verifier root after it exits successfully.

- [ ] **Step 9: Run full cross-domain gates**

Run:

```bash
env N8N_API_KEY= N8N_BASE_URL= make format
git diff --check
env N8N_API_KEY= N8N_BASE_URL= make test
env N8N_API_KEY= N8N_BASE_URL= make test-e2e
env N8N_API_KEY= N8N_BASE_URL= make test-web
env N8N_API_KEY= N8N_BASE_URL= make lint
env N8N_API_KEY= N8N_BASE_URL= make typecheck
uv --directory backend run ruff format --check .
env --chdir=web pnpm build
env N8N_API_KEY= N8N_BASE_URL= make build
git diff --check
```

Expected: all tests, lint, typechecks, format checks, frontend build, and two-image Compose build
pass with explicit blank n8n values.

- [ ] **Step 10: Record, commit, and push configuration/documentation**

Append exact observed Compose booleans, counts, gate results, and documentation changes to
`history/BUILD_LOG.md`. Add `docs/FAILURES.md` only if a real incident was observed.

Stage:

```bash
git add \
  .env.example \
  docker-compose.yml \
  Makefile \
  AGENTS.md \
  README.md \
  docs/SECURITY_NOTES.md \
  docs/superpowers/specs/2026-07-26-phase-2b-n8n-workflow-inventory-design.md \
  history/BUILD_LOG.md
git diff --cached --check
git commit -m "chore: configure phase 2b secret boundary"
git push origin phase2b-n8n-inventory
```

Include `docs/FAILURES.md` only if it contains a newly observed, accurately described incident.
Expected: clean worktree and fast-forward branch push.

### Task 7: Full Regression Gate, Scope Audit, Candidate Freeze, and Main Push

**Files:**

- Modify: `history/BUILD_LOG.md`
- Modify only for defects found by the gates: the smallest in-scope product/test/doc files
- Modify only after a real observed incident: `docs/FAILURES.md`

- [ ] **Step 1: Verify the intended branch and clean starting state**

Run in the Phase 2B worktree:

```bash
git status --short --branch
git branch --show-current
git log --oneline --decorate -12
```

Expected: branch `phase2b-n8n-inventory`, empty short status, and all Tasks 1–6 commits present.

- [ ] **Step 2: Run the separately visible focused suites**

Run:

```bash
env N8N_API_KEY= N8N_BASE_URL= \
  uv --directory backend run pytest -q \
  tests/unit/test_config.py \
  tests/unit/test_n8n_client.py \
  tests/unit/test_n8n_inventory_client.py \
  tests/unit/test_integration_schemas.py
env N8N_API_KEY= N8N_BASE_URL= \
  uv --directory backend run pytest -q \
  tests/e2e/test_integrations_api.py \
  tests/e2e/test_access_logs.py
env --chdir=web pnpm test -- \
  src/api/n8nWorkflowInventory.test.ts \
  src/features/integrations/useN8nWorkflowInventory.test.tsx \
  src/features/integrations/N8nWorkflowInventory.test.tsx \
  src/features/integrations/IntegrationsView.test.tsx \
  src/App.navigation.test.tsx \
  src/styles.test.ts
```

Expected: all focused suites pass. Record exact test counts from output.

- [ ] **Step 3: Run all repository gates from one candidate**

Run in order:

```bash
env N8N_API_KEY= N8N_BASE_URL= make install
env N8N_API_KEY= N8N_BASE_URL= make format
git diff --exit-code
env N8N_API_KEY= N8N_BASE_URL= make test
env N8N_API_KEY= N8N_BASE_URL= make test-e2e
env N8N_API_KEY= N8N_BASE_URL= make test-web
env N8N_API_KEY= N8N_BASE_URL= make lint
env N8N_API_KEY= N8N_BASE_URL= make typecheck
uv --directory backend run ruff format --check .
env --chdir=web pnpm build
env N8N_API_KEY= N8N_BASE_URL= make build
git diff --exit-code
```

Expected: every command passes and formatting/builds leave no tracked change. If a product fix is
needed, make the smallest in-scope change, add a same-commit build-log entry, rerun the affected
milestone and all commands above, commit conventionally, and push the Phase 2B branch before
continuing.

- [ ] **Step 4: Run focused Phase 0–2A regression suites**

Run the exact current Prompt, Workflow Link, Transfer, Ollama, health, Integrations-health,
navigation, and styles suites:

```bash
env N8N_API_KEY= N8N_BASE_URL= \
  uv --directory backend run pytest -q \
  tests/unit/test_ollama_client.py \
  tests/unit/test_prompt_model.py \
  tests/unit/test_prompt_repository.py \
  tests/unit/test_prompt_service.py \
  tests/unit/test_n8n_client.py \
  tests/unit/test_workflow_link_repository.py \
  tests/unit/test_workflow_link_service.py \
  tests/unit/test_transfer_http.py \
  tests/unit/test_transfer_repository.py \
  tests/unit/test_transfer_schemas.py \
  tests/unit/test_transfer_service.py \
  tests/e2e/test_health_api.py \
  tests/e2e/test_ollama_api.py \
  tests/e2e/test_prompts_api.py \
  tests/e2e/test_workflow_links_api.py \
  tests/e2e/test_transfer_api.py \
  tests/e2e/test_migrations.py
env --chdir=web pnpm test -- \
  src/api/prompts.test.ts \
  src/api/workflowLinkUrl.test.ts \
  src/api/workflowLinks.test.ts \
  src/api/transfer.test.ts \
  src/api/integrations.test.ts \
  src/features/prompts/PromptEditor.test.tsx \
  src/features/prompts/PromptRegistry.editor.test.tsx \
  src/features/prompts/PromptRegistry.test.tsx \
  src/features/prompts/promptState.test.ts \
  src/features/workflows/WorkflowEditor.test.tsx \
  src/features/workflows/WorkflowRegistry.editor.test.tsx \
  src/features/workflows/WorkflowRegistry.test.tsx \
  src/features/workflows/workflowState.test.ts \
  src/features/transfer/TransferView.test.tsx \
  src/features/transfer/transferState.test.ts \
  src/features/integrations/useIntegrations.test.tsx \
  src/features/integrations/IntegrationsView.test.tsx \
  src/App.navigation.test.tsx \
  src/styles.test.ts
```

Expected: all existing capabilities pass unchanged and health requests remain key-free.

- [ ] **Step 5: Run the reversible migration lifecycle despite no schema change**

Create one private task root:

```bash
PHASE2B_MIGRATION_ROOT="$(mktemp -d)"
chmod 700 "$PHASE2B_MIGRATION_ROOT"
PHASE2B_DATABASE_URL="sqlite:///$PHASE2B_MIGRATION_ROOT/phase2b.db"
```

Run:

```bash
env DATABASE_URL="$PHASE2B_DATABASE_URL" \
  uv --directory backend run alembic upgrade head
env DATABASE_URL="$PHASE2B_DATABASE_URL" \
  uv --directory backend run alembic check
env DATABASE_URL="$PHASE2B_DATABASE_URL" \
  uv --directory backend run alembic downgrade 0001
env DATABASE_URL="$PHASE2B_DATABASE_URL" \
  uv --directory backend run alembic upgrade head
env DATABASE_URL="$PHASE2B_DATABASE_URL" \
  uv --directory backend run alembic downgrade base
```

Expected: the lifecycle succeeds and exactly revisions 0001 and 0002 exist. Remove the task-owned
database and directory only after confirming `PHASE2B_MIGRATION_ROOT` is the exact directory returned
by `mktemp -d`; then unset both variables.

- [ ] **Step 6: Run the dependency, schema, capability, and artifact audit**

Compare against `cefc4f5a2068cfaa78f39b53fb6ae08e58e2897d`:

```bash
git diff --name-status \
  cefc4f5a2068cfaa78f39b53fb6ae08e58e2897d...HEAD
git diff --exit-code \
  cefc4f5a2068cfaa78f39b53fb6ae08e58e2897d...HEAD -- \
  backend/pyproject.toml \
  backend/uv.lock \
  web/package.json \
  web/pnpm-lock.yaml \
  backend/src/local_ai_hub/db \
  backend/migrations \
  backend/Dockerfile \
  web/Dockerfile \
  web/vite.config.ts \
  web/vitest.config.ts
```

Use path-aware `rg` searches and manual review to prove product code contains:

- no workflow detail/execution route or POST/PUT/PATCH/DELETE n8n operation;
- no request-controlled target, path, query, cursor, key, header, body, timeout, or filter;
- no provider-origin browser fetch or `VITE_` key/origin exposure;
- no timer, retry, polling, scheduler, background worker, service worker, or persistence;
- no local/session/Cache/IndexedDB/clipboard inventory write;
- no Docker socket, SDK, Engine API, CLI, `DOCKER_HOST`, privileged mode, or n8n service;
- no authentication, public bind, reverse proxy, TLS bypass, custom CA, or production profile;
- no tracked secret, database, profile, log, cache, build output, dependency directory, or
  acceptance artifact.

Confirm only `.env.example` is tracked among environment files without opening another environment
file. Documentation/non-goal mentions are not capabilities; inspect every match.

- [ ] **Step 7: Record the frozen implementation candidate**

Append one dated entry to `history/BUILD_LOG.md` with exact focused/full/regression counts, tool
versions, migration evidence, Compose build results, scope-audit conclusions, and cleanup state.
Do not call it final acceptance.

Commit:

```bash
git add history/BUILD_LOG.md
git diff --cached --check
git commit -m "chore: finalize phase 2b integration"
git push origin phase2b-n8n-inventory
```

If a real incident changed `docs/FAILURES.md`, stage that file too.

- [ ] **Step 8: Fast-forward main and verify the authorized GitHub push**

Fetch without merging:

```bash
git fetch origin
```

Verify the main worktree at
`/home/r3x0r/Desktop/Projects/github_AL_workflow_Hub` is clean and local `main` equals
`origin/main`. If either check fails, stop; do not overwrite, reset, rebase, or force-push.

From that main worktree run:

```bash
git merge --ff-only phase2b-n8n-inventory
git push origin main
```

Back in the Phase 2B worktree verify:

```bash
LOCAL_CANDIDATE="$(git rev-parse HEAD)"
REMOTE_CANDIDATE="$(
  git ls-remote --heads origin main |
    awk 'NR == 1 { print $1 }'
)"
test "$LOCAL_CANDIDATE" = "$REMOTE_CANDIDATE"
git status --short
```

Expected: hashes match, status is empty, and this clean pushed hash is the exact acceptance
candidate. Keep the hash in transient notes without inventing it in documentation before the
command runs.

### Task 8: Fresh Exact-Candidate Acceptance and Phase 2B Completion

**Files:**

- Modify after all acceptance gates pass:
  `docs/superpowers/specs/2026-07-26-phase-2b-n8n-workflow-inventory-design.md`
- Modify after all acceptance gates pass: `README.md`
- Modify after all acceptance gates pass: `history/BUILD_LOG.md`
- Modify only after a real observed incident: `docs/FAILURES.md`

- [ ] **Step 1: Freeze candidate identity and install one outer cleanup supervisor**

Start from the exact pushed candidate with empty Git status. Create one collision-resistant private
task root under `/tmp` using `mktemp -d`, set `umask 077`, choose a unique Compose project name, and
allocate all required loopback ports by binding probe sockets before releasing them immediately
before each owned listener starts.

The outer Bash supervisor must:

- record the frozen local/remote hash and reject any mismatch;
- record preexisting safe Docker container/network/volume IDs and the existence state of ignored
  dependency directories without inspecting unrelated container content;
- install `EXIT`, `INT`, and `TERM` traps before starting a process, listener, browser, container,
  network, volume, database, log, FIFO, certificate, or profile;
- track exact child PIDs plus process start tokens and kill/wait only those validated children;
- own only its exact task root, Compose project, owner-labelled sentinel, selected ports, database,
  logs, FIFOs, browser session/profile, containers, network, and volumes;
- stop the sentinel before recreating or stopping the API container;
- run Compose down with explicit blank key/origin values, safe Ollama value, and
  `--env-file /dev/null`;
- remove only the validated task root and prove all preexisting safe IDs and ignored directories
  remain.

Run an intentional nonzero cleanup self-test before the real acceptance. Expected: the trap removes
only the self-test resources, preserves preexisting state, frees every selected port, and returns
the original nonzero status.

- [ ] **Step 2: Run fresh repository gates inside the supervisor**

From the unchanged candidate, run:

```bash
env N8N_API_KEY= N8N_BASE_URL= make install
env N8N_API_KEY= N8N_BASE_URL= make format
git diff --exit-code
env N8N_API_KEY= N8N_BASE_URL= make test
env N8N_API_KEY= N8N_BASE_URL= make test-e2e
env N8N_API_KEY= N8N_BASE_URL= make test-web
env N8N_API_KEY= N8N_BASE_URL= make lint
env N8N_API_KEY= N8N_BASE_URL= make typecheck
uv --directory backend run ruff format --check .
env --chdir=web pnpm build
env N8N_API_KEY= N8N_BASE_URL= make build
git diff --exit-code
```

Expected: all pass without changing the candidate. Record actual counts and versions for uv,
Python, Node, pnpm, Docker client/server, Compose, Firefox, and geckodriver.

- [ ] **Step 3: Build the task-owned host sentinel without exposing synthetic values**

Create a Python-standard-library HTTP sentinel inside the private task root. It binds only
`127.0.0.1`, has no external dependency, and receives one generated visible-ASCII synthetic key
through its process environment.

Its control channel accepts safe mode labels only. Its request record contains only:

```json
{
  "method": "GET",
  "path": "/api/v1/workflows",
  "page": 1,
  "key_ok": true,
  "key_header_count": 1,
  "health_key_absent": true,
  "cookie_absent": true,
  "accept_identity": true,
  "fixed_query_ok": true,
  "cursor_ok": true
}
```

It must never write the raw key, cursor, request headers, response headers, response body, workflow
name, provider error, or marker. Modes generate responses for:

- empty and populated one-page inventories;
- multipage completion and four-page truncation;
- 401, 403, redirect, 429, and 5xx;
- delayed headers/body for deadline behavior;
- wrong/missing content type, gzip encoding, malformed/deep/oversized JSON;
- repeated, reserved-character, empty, control, non-ASCII, and oversized cursors;
- later-page failure after a valid first page;
- sensitive ignored fields, cookies, status text, header values, definitions, credentials, nodes,
  connections, settings, pin data, IDs, and cursors.

The sentinel health modes also serve `/healthz` and `/healthz/readiness` and record only
`health_key_absent`.

- [ ] **Step 4: Run the host-sentinel backend matrix**

Start API processes with task-owned database/log paths and explicit test configuration. Exercise:

1. missing and exact-empty origin/key — unconfigured, zero provider requests;
2. invalid origin/key and non-loopback HTTP origins — invalid configuration, zero requests;
3. HTTPS and HTTP exact localhost/canonical loopback acceptance;
4. exact fixed method/path/query/header/body and identity encoding;
5. health requests under the same Settings — no key;
6. all status/transport/TLS-like/deadline/media/encoding/byte/depth/JSON/item/cursor cases;
7. fresh cookie jars, no redirect, no retry, no ambient proxy, normal TLS verification;
8. complete pagination, cap truncation, encoded reserved cursor, repeated-cursor rejection;
9. later-page failure returning no current partial rows;
10. projection-only responses and marker-free API/application/access logs.

For each Hub call assert HTTP 200 for normalized provider states, exact JSON, and
`Cache-Control: no-store`, `Pragma: no-cache`, and `X-Content-Type-Options: nosniff`. Reconcile
sentinel safe counts with API access counts. No real n8n or internet access is allowed.

- [ ] **Step 5: Run isolated Compose with a genuine loopback-only provider**

Do not use a Phase 2A-style `http://n8n-sentinel` hostname: that must be rejected for credentialed
inventory.

Start the two committed Compose services with the synthetic key and:

```text
N8N_BASE_URL=http://127.0.0.1:<task-provider-port>
```

Obtain the exact API container ID, then launch the task-owned sentinel container with:

```text
--network container:<exact-api-container-id>
```

This makes the sentinel's `127.0.0.1` listener share the API container's network namespace. The
sentinel must have no published port, repository mount, socket, Engine capability, or privilege.
Use a read-only root filesystem, read-only task-script bind, `/tmp` tmpfs, `--cap-drop ALL`,
`--security-opt no-new-privileges`, and an owner label. The application containers receive no
Docker access.

Exercise direct API and Vite-proxied responses for blank, populated, multipage, truncated, access
denied, unavailable, timeout, malformed/deep/oversized, repeated/reserved cursor, later-page
failure, and sensitive-marker modes. Smoke the existing health, Ollama, Prompt, Workflow Link, and
Transfer routes directly and through Vite.

Pipe runtime environment and image-history inspections into private verifiers; never print them.
Assert the synthetic key exists only in API runtime and the provider request header, and is absent
from web runtime, build arguments, image history, labels, commands, browser resources, Hub
responses, health requests, and logs. Confirm exactly two committed services, loopback host
publishing, no n8n service, no public bind, and no Docker capability.

- [ ] **Step 6: Run the real Firefox manual lifecycle**

Use one real Firefox session through the W3C WebDriver HTTP protocol and the existing
Firefox/geckodriver binaries. Do not add Selenium, Playwright, a browser extension, a proxy, or a
dependency. Set `acceptInsecureCerts: false`; keep the profile private and task-owned.

The browser/control protocol uses safe state labels only. Verify:

1. Overview makes zero inventory requests.
2. Entering Integrations makes health requests only and zero inventory requests.
3. `Load workflows` creates exactly one inventory request.
4. Duplicate pointer/keyboard activation while pending coalesces, retains focus, and keeps
   `aria-busy=true`.
5. Unconfigured, empty, populated, duplicate, hostile-name, maximum-name, and truncated results
   render their exact approved summaries.
6. Names are inert; rows show textual Active/Inactive and valid `<time>` values.
7. No ID, cursor, origin, provider total, key state, link, copy, search, filter, JSON, detail,
   execution, activation, archive, delete, or mutation control appears.
8. Successful refresh atomically replaces rows and time.
9. Failed refresh retains the exact previous available snapshot/time as visibly stale and emits one
   polite warning.
10. Delayed first load and refresh abort on navigation; first load returns idle and refresh restores
    the exact settled presentation.
11. Re-entry preserves memory and creates zero automatic request.
12. No timer window creates polling/retry; no provider-origin browser request occurs.
13. local/session/Cache/IndexedDB/service-worker/clipboard state gains no inventory data.
14. Existing Prompt, Workflow Link, and Transfer dirty/pending guards block Integrations and make
    zero inventory requests.
15. Health and inventory have separate headings, actions, busy state, and labelled live regions;
    the boundary copy accurately distinguishes the key-free and keyed paths.

Reconcile Resource Timing records, API access logs, and sentinel safe counters without recording
private names or raw responses.

- [ ] **Step 7: Run the exact Firefox viewport matrix**

Firefox enforces an outer-window minimum, so do not treat requested outer size as viewport evidence.
For each width, open a top-level `data:text/html` document containing only a borderless,
cross-origin iframe with exact CSS/attribute width and 900 px height, set its source to the Vite Hub,
switch into it, and assert `window.innerWidth` equals the target before measuring.

Test exact widths:

```text
320, 600, 601, 880, 881, 1024, 1080, 1081, 1280
```

At each width assert:

- document and body scroll width do not exceed client width;
- masthead, five-button navigation, Integrations view, safety boundary, health panel, inventory
  panel, action, summary, every maximum-name row, state, and time stay inside the viewport;
- every navigation/action control is visible, keyboard reachable, non-overlapping, at least 44 CSS
  px high, and has an unclipped visible focus outline;
- inventory names wrap anywhere, rows have no horizontal scroller/clipping, list semantics remain;
- 320/600 use the accepted mobile five-button 3+2 navigation and stacked inventory rows;
- 601 through 1080 use the accepted one-row navigation below metadata;
- 1081/1280 use the accepted inline one-row navigation;
- no sixth view or layout drift exists.

Record only derived dimensions, overflows, and booleans. Screenshots, if used for diagnosis, remain
task-owned and are deleted by the supervisor.

- [ ] **Step 8: Run the 25-point scope and cleanup audit**

Map evidence one-to-one to all 25 acceptance criteria in the design. Re-run frozen-file comparisons
and path-aware scans. Prove:

- no dependency, lockfile, schema, model, repository, transfer, Dockerfile, Vite, auth, public,
  production, or provider-mutation drift;
- the key is absent from source output, browser, logs, health, responses, web runtime, build
  metadata, image history, persistence, and tracked files;
- there is no arbitrary target/path/filter/cursor/header/body, redirect following, proxy
  inheritance, TLS bypass, cookie reuse, error/body reflection, retry, polling, scheduler, generic
  client, execution/detail path, or Docker capability;
- the five-view navigation and loopback-only host publishing remain unchanged;
- only task-owned synthetic processes/resources were used and no real key, real `.env`, home n8n,
  or internet dependency was required.

Stop the sentinel first. Delete the WebDriver session and its returned task-owned profile, wait for
exact browser/geckodriver/API/sentinel process groups, and run Compose down with explicit blank
`N8N_API_KEY`, blank `N8N_BASE_URL`, safe Ollama URL, `/dev/null`, `--volumes`, and
`--remove-orphans`. Remove only the validated task root.

From a fresh ordinary shell prove:

- the task root is absent and all selected ports are free;
- no exact Compose-project or owner-labelled object remains;
- every preexisting safe Docker ID and ignored dependency path is preserved;
- no task-owned process, listener, database, log, profile, container, network, or volume remains;
- `git status --short` is empty and local candidate still equals pushed `origin/main`.

Any product change invalidates the run. Clean up, make the smallest fixed/tested/build-logged commit,
push a new exact candidate, and restart acceptance at Step 1.

- [ ] **Step 9: Mark acceptance and record only observed evidence**

After every preceding step passes from the same candidate:

- set the design status to:

  ```markdown
  **Status:** Implemented and accepted
  ```

- update README with actual candidate hash, test counts, tool versions, host/Compose/Firefox
  matrices, key-isolation proof, exact viewport results, cleanup, current status, and Phase 2C/3
  deferral;
- append the exact derived evidence and both frozen-candidate/final-record commit roles to
  `history/BUILD_LOG.md`;
- add `docs/FAILURES.md` only for a real acceptance incident.

Run:

```bash
git diff --check
rg -n 'implementation pending|has not started|No n8n API-key|no n8n API-key' \
  README.md docs/SECURITY_NOTES.md \
  docs/superpowers/specs/2026-07-26-phase-2b-n8n-workflow-inventory-design.md
```

Expected: whitespace passes and every remaining historical/pending phrase is accurate in context.

- [ ] **Step 10: Commit, fast-forward main, push, and verify final state**

Commit the acceptance records on the Phase 2B branch:

```bash
git add \
  README.md \
  docs/superpowers/specs/2026-07-26-phase-2b-n8n-workflow-inventory-design.md \
  history/BUILD_LOG.md
git diff --cached --check
git commit -m "test: record phase 2b acceptance validation"
git push origin phase2b-n8n-inventory
```

Add `docs/FAILURES.md` only if it changed for an observed incident.

Verify the main worktree is still clean and `main == origin/main`, then from the main worktree:

```bash
git merge --ff-only phase2b-n8n-inventory
git push origin main
```

Finally verify:

```bash
LOCAL_FINAL="$(git rev-parse HEAD)"
REMOTE_FINAL="$(
  git ls-remote --heads origin main |
    awk 'NR == 1 { print $1 }'
)"
test "$LOCAL_FINAL" = "$REMOTE_FINAL"
git status --short
git log --oneline --decorate -12
```

Expected: local and remote main hashes match, both worktrees are clean, every Phase 2B conventional
commit is present, no generated/secret artifact is tracked, and no task-owned resource remains.

## Coverage Confirmation

Plan self-review mapped every Goals, Non-goals, Product Decisions, Backend Design, Frontend Design,
Configuration, Security, Failure Handling, Testing, Regression Gate, Documentation, and Acceptance
requirement to Tasks 1–8. The review also confirmed the same end-to-end names for
`N8nWorkflowInventoryClient.get_inventory`, `N8nWorkflowInventoryResponse`,
`N8nWorkflowInventorySnapshot`, `snapshot`, `requestStatus`, `pending`, `error`, `stale`,
`lastLoaded`, `settlementSequence`, `load`, and `refresh`.

The unresolved-placeholder scan is empty, fenced blocks are balanced, and no task adds a dependency,
migration, authentication change, provider mutation, generic target, browser key, polling,
persistence, public deployment, or application Docker capability. Every implementation commit has
a same-commit build-log step and the applicable backend/frontend/UI gates. Secret-bearing
validation uses generated values, emits only derived evidence, never reads a real environment file,
and scopes cleanup to validated task-owned resources. Final local/remote hashes and cleanup are
verified rather than assumed.

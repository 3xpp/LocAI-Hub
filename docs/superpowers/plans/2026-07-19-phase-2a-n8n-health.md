# Phase 2A n8n Health Observation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a credential-free, manual n8n liveness/readiness observation to the local dashboard without persistence, provider response disclosure, polling, application Docker access, or a real n8n dependency.

**Architecture:** FastAPI reads one optional process-environment origin, validates it as a credential-free HTTP(S) root, and runs isolated streaming GET checks against the two fixed n8n health paths. A strict same-origin Hub response drives an abortable React controller and a fifth Integrations view; all four provider states remain distinct from Hub transport or contract failure.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic, httpx, pytest, Ruff, strict mypy, React 19, TypeScript, Vite, Vitest, Testing Library, jsdom, pnpm, Docker Compose, Firefox WebDriver.

---

## Starting Point and Non-Negotiable Boundaries

- Start implementation from the clean implementation-plan commit immediately after design commit
  210f14330eda1c97f30640422ee58977b210fed2.
- Treat docs/superpowers/specs/2026-07-19-phase-2a-n8n-health-design.md as authoritative.
- Use 210f143 as the comparison baseline for dependency manifests, lockfiles, ORM models, migrations,
  Dockerfiles, Vite configuration, and prohibited-capability audits.
- The approved scope is one credential-free Phase 2A n8n health observation. It does not approve an
  n8n API key, workflow/execution inventory, provider mutation, generic fetch target, or Docker data.
- Do not read, print, edit, stage, or traverse .env or any real secret file.
- Do not change backend/pyproject.toml, backend/uv.lock, web/package.json, web/pnpm-lock.yaml,
  backend/src/local_ai_hub/db/models.py, either migration, either Dockerfile, or Vite/Vitest config.
- Do not create migration 0003 or add persistence, polling, retries, authentication, public binding,
  production configuration, a provider browser request, a Docker socket/SDK/CLI code path, or a
  runtime dependency.
- Current Settings are resolved from trusted process environment during dependency resolution rather
  than cached at lifespan startup. Preserve that established behavior; do not add caching merely for
  this feature.
- Every project-controlled Compose render/build/start/exec/down command must use /dev/null and an
  explicit safe N8N_BASE_URL value. Never rely on the ambient shell value.
- Application source and containers must not access the Docker Engine, socket, SDK, or CLI. Local
  Docker Engine use is allowed only by the operator-side Compose acceptance commands in Tasks 7 and
  8; unit/frontend acceptance requires neither Docker, n8n, an API key, nor internet access.
- From the repository root, preserve `env --chdir=web pnpm ...` for frontend commands; do not
  rewrite them as `pnpm --dir web ...`, because Corepack must resolve the committed package-manager
  pin with `web` as the process working directory.
- Every implementation milestone updates history/BUILD_LOG.md in the same commit.
- Run backend tests before backend commits. Run frontend typecheck, lint, production build, and
  make test-web before Integrations UI behavior commits.
- Record docs/FAILURES.md only when a failure or warning was actually observed.
- Use conventional commits and never push.

## File Responsibility Map

### Backend files to create

- backend/src/local_ai_hub/services/n8n.py — origin validation, closed result types, isolated
  streaming checks, transport policy, hard deadlines, and state mapping.
- backend/src/local_ai_hub/api/integration_schemas.py — strict n8n HTTP response contract and
  cross-field validation.
- backend/src/local_ai_hub/api/routes/integrations.py — thin GET route and fixed privacy headers.
- backend/tests/unit/test_n8n_client.py — origin, state, timeout, redirect, cookie, and unread-body
  behavior.
- backend/tests/unit/test_integration_schemas.py — closed response and impossible-combination tests.
- backend/tests/e2e/test_integrations_api.py — dependency-overridden HTTP contracts and privacy
  boundaries.

### Backend files to modify

- backend/src/local_ai_hub/config.py — optional raw N8N_BASE_URL semantics with redacted repr.
- backend/src/local_ai_hub/api/dependencies.py — N8nHealthClient dependency factory.
- backend/src/local_ai_hub/api/main.py — mount the Integrations router.
- backend/tests/unit/test_config.py — missing, empty, and byte-preserving n8n configuration tests.

### Frontend files to create

- web/src/api/integrations.ts — discriminated response union, exact runtime parser, and relative GET.
- web/src/api/integrations.test.ts — path, abort, state, malformed-contract, and no-provider-fetch
  coverage.
- web/src/features/integrations/useIntegrations.ts — entry/manual refresh lifecycle, cancellation,
  generations, stale snapshot, and checked time.
- web/src/features/integrations/useIntegrations.test.tsx — lifecycle and race coverage.
- web/src/features/integrations/N8nStatusCard.tsx — four normalized textual state presentations.
- web/src/features/integrations/IntegrationsView.tsx — loading, Hub error, refresh, stale warning,
  live region, last checked, and footer.
- web/src/features/integrations/IntegrationsView.test.tsx — accessibility, inert origin, focus, and
  normalized-state presentation.

### Frontend files to modify

- web/src/App.tsx — fifth ActiveView, controller activation, navigation, and view composition.
- web/src/App.navigation.test.tsx — five-view navigation and existing guard regressions.
- web/src/styles.css — Integrations visual language and exact five-button responsive layout.
- web/src/styles.test.ts — five/six-track layout, target size, and root-width regression.

### Infrastructure and records to modify

- .env.example — append only an empty N8N_BASE_URL placeholder.
- Makefile — explicitly clear n8n during Compose build validation.
- docker-compose.yml — forward only the optional n8n origin to the API service.
- AGENTS.md — include Integrations UI tests and clarify the already approved Phase 2A boundary.
- README.md — capability, configuration, states, API, security, limitations, and roadmap.
- docs/DECISIONS.md — provider-specific manual observation and transport-isolation decisions.
- docs/SECURITY_NOTES.md — fixed-target SSRF, topology, cookie/body, and exposure boundaries.
- docs/FAILURES.md — only newly observed incidents.
- docs/superpowers/specs/2026-07-19-phase-2a-n8n-health-design.md — pending and final completion
  status; clarify the safer isolated-network acceptance sentinel.
- history/BUILD_LOG.md — same-commit evidence for every milestone.

### Files intentionally unchanged

- backend/src/local_ai_hub/api/schemas.py and both package __init__.py files.
- Every database model, repository, session, engine, transfer schema, and migration.
- Backend/frontend manifests and locks, Dockerfiles, Vite/Vitest config, and test setup.
- Existing Ollama, Prompt, Workflow Link, and Transfer behavior except App navigation composition.

## Planned Commit Sequence

0. docs: add phase 2a implementation plan
1. feat: add n8n health observation client
2. feat: expose n8n integration status api
3. feat: add n8n frontend observation contract
4. feat: add integrations observation controller
5. feat: add n8n integrations status view
6. feat: integrate fifth dashboard view
7. chore: finalize phase 2a integration
8. test: record phase 2a acceptance validation

### Task 1: Process Configuration and n8n Health Client

**Files:**
- Modify: backend/src/local_ai_hub/config.py
- Create: backend/src/local_ai_hub/services/n8n.py
- Modify: backend/tests/unit/test_config.py
- Create: backend/tests/unit/test_n8n_client.py
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write the failing configuration tests**

Replace backend/tests/unit/test_config.py with the existing Ollama assertion plus these exact n8n
contracts:

~~~python
from pytest import MonkeyPatch

from local_ai_hub.config import Settings


def test_settings_read_process_environment(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./custom.db")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama.test/")
    monkeypatch.setenv("N8N_BASE_URL", "http://n8n.test/")

    settings = Settings.from_env()

    assert settings.database_url == "sqlite:///./custom.db"
    assert settings.ollama_base_url == "http://ollama.test"
    assert settings.n8n_base_url == "http://n8n.test/"


def test_settings_treats_missing_n8n_base_url_as_unconfigured(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.delenv("N8N_BASE_URL", raising=False)
    assert Settings.from_env().n8n_base_url is None


def test_settings_treats_exact_empty_n8n_base_url_as_unconfigured(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.setenv("N8N_BASE_URL", "")
    assert Settings.from_env().n8n_base_url is None


def test_settings_preserves_non_empty_n8n_value_for_client_validation(
    monkeypatch: MonkeyPatch,
) -> None:
    marker = "  http://n8n.test/  "
    monkeypatch.setenv("N8N_BASE_URL", marker)
    settings = Settings.from_env()
    assert settings.n8n_base_url == marker
    assert marker not in repr(settings)
~~~

- [ ] **Step 2: Write the failing client tests**

Create backend/tests/unit/test_n8n_client.py with helpers that always return a fresh MockTransport:

~~~python
import asyncio
from collections.abc import Callable
from typing import cast

import httpx
import pytest
from pytest import MonkeyPatch

from local_ai_hub.services.n8n import (
    INVALID_N8N_BASE_URL_DISPLAY,
    N8nHealthClient,
    _origin_within_limit,
)

Handler = Callable[[httpx.Request], httpx.Response]


def factory(handler: Handler):
    return lambda: httpx.MockTransport(handler)


def unexpected_transport() -> httpx.AsyncBaseTransport:
    raise AssertionError("unconfigured or invalid input created a transport")


@pytest.mark.parametrize("base_url", [None, ""])
def test_unconfigured_status_makes_zero_transport_calls(base_url: str | None) -> None:
    result = asyncio.run(
        N8nHealthClient(base_url, transport_factory=unexpected_transport).get_status()
    )
    assert result.state == "unconfigured"
    assert result.base_url is None
    assert result.liveness == "not_checked"
    assert result.readiness == "not_checked"
    assert result.error is None


@pytest.mark.parametrize(
    ("base_url", "canonical"),
    [
        ("HTTP://N8N.TEST:80/", "http://n8n.test"),
        ("https://n8n.test:443", "https://n8n.test"),
        ("http://localhost:5678", "http://localhost:5678"),
        ("http://homelab:5678", "http://homelab:5678"),
        ("http://192.168.1.12:5678", "http://192.168.1.12:5678"),
        ("http://[::1]:5678", "http://[::1]:5678"),
    ],
)
def test_allowed_origins_are_canonicalized_and_checked(
    base_url: str,
    canonical: str,
) -> None:
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(200, request=request)

    result = asyncio.run(
        N8nHealthClient(base_url, transport_factory=factory(handler)).get_status()
    )
    assert result.state == "online"
    assert result.base_url == canonical
    assert paths == ["/healthz", "/healthz/readiness"]


@pytest.mark.parametrize(
    "base_url",
    [
        "   ",
        " http://n8n.test",
        "ftp://n8n.test",
        "http:///missing-host",
        "http://admin:private@n8n.test",
        "http://n8n.test/private",
        "http://n8n.test?private=query",
        "http://n8n.test#private-fragment",
        "http://n8n.test:0",
        "http://n8n.test:65536",
        "http://[::1",
    ],
)
def test_invalid_origins_fail_closed_without_transport_or_reflection(
    base_url: str,
) -> None:
    result = asyncio.run(
        N8nHealthClient(base_url, transport_factory=unexpected_transport).get_status()
    )
    assert result.state == "offline"
    assert result.base_url == INVALID_N8N_BASE_URL_DISPLAY
    assert result.liveness == "not_checked"
    assert result.readiness == "not_checked"
    assert result.error == "Invalid n8n base URL"
    assert base_url not in repr(result)


def test_raw_origin_over_limit_fails_closed() -> None:
    value = "http://" + ("a" * 2_050)
    result = asyncio.run(
        N8nHealthClient(value, transport_factory=unexpected_transport).get_status()
    )
    assert result.error == "Invalid n8n base URL"


def test_reconstructed_origin_length_guard_has_exact_boundary() -> None:
    assert _origin_within_limit("x" * 2_048) is True
    assert _origin_within_limit("x" * 2_049) is False


def test_online_uses_fresh_clients_and_never_forwards_liveness_cookie() -> None:
    transport_count = 0
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        assert request.method == "GET"
        assert "cookie" not in request.headers
        if request.url.path == "/healthz":
            return httpx.Response(
                200,
                headers={"Set-Cookie": "phase2a=private-cookie; HttpOnly"},
                content=b"private-liveness-body",
                request=request,
            )
        return httpx.Response(200, content=b"private-readiness-body", request=request)

    def transport_factory() -> httpx.AsyncBaseTransport:
        nonlocal transport_count
        transport_count += 1
        return httpx.MockTransport(handler)

    result = asyncio.run(
        N8nHealthClient(
            "http://n8n.test",
            transport_factory=transport_factory,
        ).get_status()
    )
    assert result.state == "online"
    assert transport_count == 2
    assert paths == ["/healthz", "/healthz/readiness"]
    assert "private" not in repr(result)


@pytest.mark.parametrize("status_code", [201, 204, 301, 302, 307, 404, 500])
def test_liveness_non_200_is_offline_and_skips_readiness(status_code: int) -> None:
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(
            status_code,
            headers={"Location": "http://private-redirect.test/"},
            request=request,
        )

    result = asyncio.run(
        N8nHealthClient(
            "http://n8n.test",
            transport_factory=factory(handler),
        ).get_status()
    )
    assert result.state == "offline"
    assert result.liveness == "failed"
    assert result.readiness == "not_checked"
    assert result.error == "n8n health check failed"
    assert paths == ["/healthz"]


def test_liveness_transport_failure_is_sanitized() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("private connection detail", request=request)

    result = asyncio.run(
        N8nHealthClient(
            "http://n8n.test",
            transport_factory=factory(handler),
        ).get_status()
    )
    assert result.state == "offline"
    assert result.error == "Connection failed"
    assert "private" not in repr(result)


def test_readiness_failure_is_degraded() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/healthz":
            return httpx.Response(200, request=request)
        return httpx.Response(503, content=b"private readiness detail", request=request)

    result = asyncio.run(
        N8nHealthClient(
            "http://n8n.test",
            transport_factory=factory(handler),
        ).get_status()
    )
    assert result.state == "degraded"
    assert result.liveness == "passed"
    assert result.readiness == "failed"
    assert result.error == "n8n is reachable but not ready"
    assert "private" not in repr(result)


def test_hard_wall_clock_timeout_is_sanitized() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(0.05)
        return httpx.Response(200, request=request)

    result = asyncio.run(
        N8nHealthClient(
            "http://n8n.test",
            transport_factory=lambda: httpx.MockTransport(handler),
            timeout=0.001,
        ).get_status()
    )
    assert result.state == "offline"
    assert result.error == "Connection failed"


class ExplodingBody(httpx.AsyncByteStream):
    def __init__(self) -> None:
        self.closed = False

    async def __aiter__(self):
        raise AssertionError("provider response body was consumed")
        yield b"unreachable"

    async def aclose(self) -> None:
        self.closed = True


def test_provider_response_body_is_never_consumed() -> None:
    streams: list[ExplodingBody] = []

    def handler(request: httpx.Request) -> httpx.Response:
        stream = ExplodingBody()
        streams.append(stream)
        return httpx.Response(
            200,
            headers={"Content-Type": "application/x-private"},
            stream=stream,
            request=request,
        )

    result = asyncio.run(
        N8nHealthClient(
            "http://n8n.test",
            transport_factory=factory(handler),
        ).get_status()
    )
    assert result.state == "online"
    assert len(streams) == 2
    assert all(stream.closed for stream in streams)
~~~

Complete the same file with these exact transport/content/policy tests before the red run:

~~~python
@pytest.mark.parametrize("failing_path", ["/healthz", "/healthz/readiness"])
@pytest.mark.parametrize("error_type", [httpx.ReadTimeout, httpx.ConnectError])
def test_request_failures_are_sanitized_for_each_check(
    failing_path: str,
    error_type: type[httpx.RequestError],
) -> None:
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path == failing_path:
            raise error_type("private TLS or timeout detail", request=request)
        return httpx.Response(200, request=request)

    result = asyncio.run(
        N8nHealthClient(
            "https://n8n.test",
            transport_factory=factory(handler),
        ).get_status()
    )
    if failing_path == "/healthz":
        assert result.state == "offline"
        assert result.error == "Connection failed"
        assert paths == ["/healthz"]
    else:
        assert result.state == "degraded"
        assert result.error == "n8n is reachable but not ready"
        assert paths == ["/healthz", "/healthz/readiness"]
    assert "private" not in repr(result)


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Content-Type": "text/private"},
        {"Content-Type": "application/octet-stream"},
    ],
)
def test_exact_200_ignores_content_type_and_body(headers: dict[str, str]) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers=headers,
            content=b"private response marker",
            request=request,
        )

    result = asyncio.run(
        N8nHealthClient(
            "http://n8n.test",
            transport_factory=factory(handler),
        ).get_status()
    )
    assert result.state == "online"
    assert "private" not in repr(result)


def test_client_constructor_enforces_transport_policy(
    monkeypatch: MonkeyPatch,
) -> None:
    original_async_client = httpx.AsyncClient
    constructor_options: list[dict[str, object]] = []

    def spy_async_client(*args: object, **kwargs: object) -> httpx.AsyncClient:
        constructor_options.append(dict(kwargs))
        return original_async_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", spy_async_client)
    result = asyncio.run(
        N8nHealthClient(
            "https://n8n.test",
            transport_factory=factory(
                lambda request: httpx.Response(200, request=request)
            ),
            timeout=0.25,
        ).get_status()
    )

    assert result.state == "online"
    assert len(constructor_options) == 2
    for options in constructor_options:
        timeout = cast(httpx.Timeout, options["timeout"])
        assert (timeout.connect, timeout.read, timeout.write, timeout.pool) == (
            0.25,
            0.25,
            0.25,
            0.25,
        )
        assert options["trust_env"] is False
        assert options["verify"] is True
        assert options["follow_redirects"] is False
        assert isinstance(options["transport"], httpx.MockTransport)
~~~

Every assertion uses fixed safe strings and never prints a raw marker.

- [ ] **Step 3: Run the focused tests and verify the red state**

Run:

~~~bash
uv --directory backend run pytest tests/unit/test_config.py tests/unit/test_n8n_client.py -q
~~~

Expected: collection fails because local_ai_hub.services.n8n and Settings.n8n_base_url do not exist.

- [ ] **Step 4: Implement the configuration field**

Change backend/src/local_ai_hub/config.py to import field and capture the n8n variable once:

~~~python
"""Process-environment configuration with local-only defaults."""

import os
from dataclasses import dataclass, field

DEFAULT_DATABASE_URL = "sqlite:///./local-ai-hub.db"
DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"


@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime settings used by backend services."""

    database_url: str = DEFAULT_DATABASE_URL
    ollama_base_url: str = DEFAULT_OLLAMA_BASE_URL
    n8n_base_url: str | None = field(default=None, repr=False)

    @classmethod
    def from_env(cls) -> "Settings":
        """Build settings from the process environment without loading secret files."""

        raw_n8n_base_url = os.environ.get("N8N_BASE_URL")
        return cls(
            database_url=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
            ollama_base_url=os.environ.get(
                "OLLAMA_BASE_URL",
                DEFAULT_OLLAMA_BASE_URL,
            ).rstrip("/"),
            n8n_base_url=(
                None if raw_n8n_base_url is None or raw_n8n_base_url == "" else raw_n8n_base_url
            ),
        )


def get_settings() -> Settings:
    """Return settings for the current process environment."""

    return Settings.from_env()
~~~

- [ ] **Step 5: Implement the isolated health client**

Create backend/src/local_ai_hub/services/n8n.py:

~~~python
"""Credential-free, read-only n8n liveness and readiness observation."""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from typing import Final, Literal

import httpx

MAX_N8N_BASE_URL_LENGTH: Final = 2_048
INVALID_N8N_BASE_URL_DISPLAY: Final = "Invalid configuration"
_LIVENESS_PATH: Final = "/healthz"
_READINESS_PATH: Final = "/healthz/readiness"

type N8nObservationState = Literal["unconfigured", "online", "degraded", "offline"]
type N8nCheckState = Literal["passed", "failed", "not_checked"]
type N8nHealthError = Literal[
    "Invalid n8n base URL",
    "Connection failed",
    "n8n health check failed",
    "n8n is reachable but not ready",
]
type N8nTransportFactory = Callable[[], httpx.AsyncBaseTransport]
type _RequestOutcome = Literal["passed", "http_failed", "connection_failed"]


def _origin_within_limit(value: str) -> bool:
    """Apply the same defensive bound before and after URL canonicalization."""

    return len(value) <= MAX_N8N_BASE_URL_LENGTH


def _normalize_base_url(base_url: str) -> str | None:
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
    except (httpx.InvalidURL, UnicodeError, ValueError):
        return None

    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.host
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
                host=parsed.host,
                port=port,
            )
        ).removesuffix("/")
    except (httpx.InvalidURL, UnicodeError, ValueError):
        return None
    return canonical if _origin_within_limit(canonical) else None


def is_canonical_n8n_origin(value: str) -> bool:
    """Return whether a display value is already the canonical safe origin."""

    return _normalize_base_url(value) == value


@dataclass(frozen=True, slots=True)
class N8nHealthResult:
    """One normalized n8n observation safe to expose through the Hub."""

    state: N8nObservationState
    base_url: str | None
    liveness: N8nCheckState
    readiness: N8nCheckState
    error: N8nHealthError | None


class N8nHealthClient:
    """Observe two fixed n8n health paths without retaining provider data."""

    def __init__(
        self,
        base_url: str | None,
        *,
        transport_factory: N8nTransportFactory | None = None,
        timeout: float = 3.0,
    ) -> None:
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        configured = base_url is not None and base_url != ""
        request_base_url = _normalize_base_url(base_url) if configured else None
        self._configured = configured
        self._request_base_url = request_base_url
        self._transport_factory = transport_factory
        self._timeout = timeout

    async def get_status(self) -> N8nHealthResult:
        """Return the approved four-state observation contract."""

        if not self._configured:
            return N8nHealthResult(
                "unconfigured",
                None,
                "not_checked",
                "not_checked",
                None,
            )
        if self._request_base_url is None:
            return N8nHealthResult(
                "offline",
                INVALID_N8N_BASE_URL_DISPLAY,
                "not_checked",
                "not_checked",
                "Invalid n8n base URL",
            )

        liveness = await self._check(_LIVENESS_PATH)
        if liveness == "connection_failed":
            return N8nHealthResult(
                "offline",
                self._request_base_url,
                "failed",
                "not_checked",
                "Connection failed",
            )
        if liveness == "http_failed":
            return N8nHealthResult(
                "offline",
                self._request_base_url,
                "failed",
                "not_checked",
                "n8n health check failed",
            )

        readiness = await self._check(_READINESS_PATH)
        if readiness != "passed":
            return N8nHealthResult(
                "degraded",
                self._request_base_url,
                "passed",
                "failed",
                "n8n is reachable but not ready",
            )
        return N8nHealthResult(
            "online",
            self._request_base_url,
            "passed",
            "passed",
            None,
        )

    async def _check(self, path: str) -> _RequestOutcome:
        request_base_url = self._request_base_url
        if request_base_url is None:
            raise RuntimeError("validated n8n origin is required")

        transport = (
            self._transport_factory()
            if self._transport_factory is not None
            else None
        )
        try:
            async with asyncio.timeout(self._timeout):
                async with httpx.AsyncClient(
                    base_url=request_base_url,
                    timeout=httpx.Timeout(self._timeout),
                    transport=transport,
                    trust_env=False,
                    verify=True,
                    follow_redirects=False,
                ) as client:
                    async with client.stream("GET", path) as response:
                        return "passed" if response.status_code == 200 else "http_failed"
        except (TimeoutError, httpx.RequestError):
            return "connection_failed"
~~~

Do not store the raw invalid setting, reuse a client, access response headers in application code,
read the stream, call raise_for_status, accept a path argument from the API, or catch programming
errors.

- [ ] **Step 6: Run focused and backend regression gates**

Run:

~~~bash
uv --directory backend run pytest tests/unit/test_config.py tests/unit/test_n8n_client.py -q
uv --directory backend run ruff check src/local_ai_hub/config.py src/local_ai_hub/services/n8n.py tests/unit/test_config.py tests/unit/test_n8n_client.py
uv --directory backend run mypy src
uv --directory backend run ruff format --check .
make test
git diff --check
~~~

Expected: focused tests and the complete backend suite pass; Ruff, strict mypy, format check, and
whitespace check pass. No real n8n request occurs.

- [ ] **Step 7: Record and commit Task 1**

Append the exact focused/full test counts and origin/timeout/cookie/body evidence to
history/BUILD_LOG.md. Stage only the five Task 1 paths, inspect the staged diff, then:

~~~bash
git add backend/src/local_ai_hub/config.py backend/src/local_ai_hub/services/n8n.py backend/tests/unit/test_config.py backend/tests/unit/test_n8n_client.py history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add n8n health observation client"
~~~



### Task 2: Strict Integration Status API

**Files:**
- Modify: backend/src/local_ai_hub/api/dependencies.py
- Create: backend/src/local_ai_hub/api/integration_schemas.py
- Create: backend/src/local_ai_hub/api/routes/integrations.py
- Modify: backend/src/local_ai_hub/api/main.py
- Create: backend/tests/unit/test_integration_schemas.py
- Create: backend/tests/e2e/test_integrations_api.py
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing strict-schema tests**

Create backend/tests/unit/test_integration_schemas.py:

~~~python
import pytest
from pydantic import ValidationError

from local_ai_hub.api.integration_schemas import N8nStatusResponse


VALID_PAYLOADS = [
    {
        "state": "unconfigured",
        "base_url": None,
        "liveness": "not_checked",
        "readiness": "not_checked",
        "error": None,
    },
    {
        "state": "online",
        "base_url": "http://n8n.test",
        "liveness": "passed",
        "readiness": "passed",
        "error": None,
    },
    {
        "state": "degraded",
        "base_url": "http://n8n.test",
        "liveness": "passed",
        "readiness": "failed",
        "error": "n8n is reachable but not ready",
    },
    {
        "state": "offline",
        "base_url": "http://n8n.test",
        "liveness": "failed",
        "readiness": "not_checked",
        "error": "Connection failed",
    },
    {
        "state": "offline",
        "base_url": "Invalid configuration",
        "liveness": "not_checked",
        "readiness": "not_checked",
        "error": "Invalid n8n base URL",
    },
    {
        "state": "offline",
        "base_url": "http://n8n.test",
        "liveness": "failed",
        "readiness": "not_checked",
        "error": "n8n health check failed",
    },
]


@pytest.mark.parametrize("payload", VALID_PAYLOADS)
def test_status_response_accepts_only_approved_combinations(
    payload: dict[str, object],
) -> None:
    assert N8nStatusResponse.model_validate(payload).model_dump() == payload


@pytest.mark.parametrize(
    "payload",
    [
        {**VALID_PAYLOADS[0], "private": "no"},
        {**VALID_PAYLOADS[0], "state": "online"},
        {**VALID_PAYLOADS[1], "readiness": "failed"},
        {**VALID_PAYLOADS[2], "error": "private upstream detail"},
        {**VALID_PAYLOADS[3], "liveness": "passed"},
        {**VALID_PAYLOADS[4], "base_url": "http://n8n.test"},
        {**VALID_PAYLOADS[1], "base_url": ""},
        {**VALID_PAYLOADS[1], "base_url": "x" * 2_049},
        {**VALID_PAYLOADS[1], "base_url": "not-an-origin"},
        {**VALID_PAYLOADS[1], "base_url": "HTTP://N8N.TEST:80/"},
        {**VALID_PAYLOADS[1], "base_url": "http://n8n.test/"},
        {**VALID_PAYLOADS[1], "base_url": "http://user@n8n.test"},
        {**VALID_PAYLOADS[1], "base_url": "http://n8n.test/path"},
        {**VALID_PAYLOADS[1], "base_url": "http://n8n.test?private=1"},
        {**VALID_PAYLOADS[1], "base_url": "http://n8n.test#private"},
    ],
)
def test_status_response_rejects_extra_fields_and_impossible_combinations(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        N8nStatusResponse.model_validate(payload)
~~~

- [ ] **Step 2: Write failing route tests**

Create backend/tests/e2e/test_integrations_api.py with an exact dependency-override lifecycle:

~~~python
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Protocol

import httpx
import pytest
from fastapi.testclient import TestClient

from local_ai_hub.api.dependencies import get_n8n_health_client
from local_ai_hub.api.main import app
from local_ai_hub.services.n8n import N8nHealthClient, N8nHealthResult


class N8nStatusClient(Protocol):
    async def get_status(self) -> N8nHealthResult: ...


class StubN8nClient:
    def __init__(
        self,
        result: N8nHealthResult | None = None,
        error: Exception | None = None,
    ) -> None:
        self.result = result
        self.error = error

    async def get_status(self) -> N8nHealthResult:
        if self.error is not None:
            raise self.error
        if self.result is None:
            raise AssertionError("stub result is required")
        return self.result


@contextmanager
def client_with_n8n(stub: N8nStatusClient) -> Iterator[TestClient]:
    previous = app.dependency_overrides.get(get_n8n_health_client)
    app.dependency_overrides[get_n8n_health_client] = lambda: stub
    try:
        with TestClient(app) as client:
            yield client
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_n8n_health_client, None)
        else:
            app.dependency_overrides[get_n8n_health_client] = previous


@pytest.mark.parametrize(
    ("result", "expected"),
    [
        (
            N8nHealthResult(
                "unconfigured",
                None,
                "not_checked",
                "not_checked",
                None,
            ),
            {
                "state": "unconfigured",
                "base_url": None,
                "liveness": "not_checked",
                "readiness": "not_checked",
                "error": None,
            },
        ),
        (
            N8nHealthResult(
                "online",
                "http://n8n.test",
                "passed",
                "passed",
                None,
            ),
            {
                "state": "online",
                "base_url": "http://n8n.test",
                "liveness": "passed",
                "readiness": "passed",
                "error": None,
            },
        ),
        (
            N8nHealthResult(
                "degraded",
                "http://n8n.test",
                "passed",
                "failed",
                "n8n is reachable but not ready",
            ),
            {
                "state": "degraded",
                "base_url": "http://n8n.test",
                "liveness": "passed",
                "readiness": "failed",
                "error": "n8n is reachable but not ready",
            },
        ),
        (
            N8nHealthResult(
                "offline",
                "http://n8n.test",
                "failed",
                "not_checked",
                "Connection failed",
            ),
            {
                "state": "offline",
                "base_url": "http://n8n.test",
                "liveness": "failed",
                "readiness": "not_checked",
                "error": "Connection failed",
            },
        ),
        (
            N8nHealthResult(
                "offline",
                "http://n8n.test",
                "failed",
                "not_checked",
                "n8n health check failed",
            ),
            {
                "state": "offline",
                "base_url": "http://n8n.test",
                "liveness": "failed",
                "readiness": "not_checked",
                "error": "n8n health check failed",
            },
        ),
        (
            N8nHealthResult(
                "offline",
                "Invalid configuration",
                "not_checked",
                "not_checked",
                "Invalid n8n base URL",
            ),
            {
                "state": "offline",
                "base_url": "Invalid configuration",
                "liveness": "not_checked",
                "readiness": "not_checked",
                "error": "Invalid n8n base URL",
            },
        ),
    ],
)
def test_n8n_status_returns_normalized_contract_with_privacy_headers(
    result: N8nHealthResult,
    expected: dict[str, object],
) -> None:
    with client_with_n8n(StubN8nClient(result)) as client:
        response = client.get("/api/integrations/n8n/status")

    assert response.status_code == 200
    assert response.json() == expected
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-type"] == "application/json"
    assert "content-disposition" not in response.headers


def test_n8n_status_does_not_reflect_invalid_configuration() -> None:
    marker = " http://private-config-marker.test/path "

    def unexpected_transport() -> httpx.AsyncBaseTransport:
        raise AssertionError("invalid configuration created a transport")

    health_client = N8nHealthClient(
        marker,
        transport_factory=unexpected_transport,
    )
    with client_with_n8n(health_client) as client:
        response = client.get("/api/integrations/n8n/status")

    assert response.status_code == 200
    assert response.json()["base_url"] == "Invalid configuration"
    assert marker not in response.text


def test_unexpected_client_error_remains_a_hub_failure() -> None:
    marker = "private-programming-error"
    previous = app.dependency_overrides.get(get_n8n_health_client)
    app.dependency_overrides[get_n8n_health_client] = lambda: StubN8nClient(
        error=RuntimeError(marker)
    )
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/api/integrations/n8n/status")
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_n8n_health_client, None)
        else:
            app.dependency_overrides[get_n8n_health_client] = previous

    assert response.status_code == 500
    assert marker not in response.text
    assert "offline" not in response.text


def test_client_override_restores_previous_identity() -> None:
    previous_client = StubN8nClient(
        N8nHealthResult("unconfigured", None, "not_checked", "not_checked", None)
    )

    def previous_override() -> StubN8nClient:
        return previous_client

    app.dependency_overrides[get_n8n_health_client] = previous_override
    replacement = StubN8nClient(
        N8nHealthResult("online", "http://n8n.test", "passed", "passed", None)
    )
    try:
        with client_with_n8n(replacement):
            assert app.dependency_overrides[get_n8n_health_client] is not previous_override
        assert app.dependency_overrides[get_n8n_health_client] is previous_override
    finally:
        app.dependency_overrides.pop(get_n8n_health_client, None)
~~~

Do not use a real transport or process environment in this file.

- [ ] **Step 3: Run the new tests and verify the red state**

Run:

~~~bash
uv --directory backend run pytest tests/unit/test_integration_schemas.py tests/e2e/test_integrations_api.py -q
~~~

Expected: collection fails because integration_schemas, integrations route, and dependency do not
exist.

- [ ] **Step 4: Implement the strict response schema**

Create backend/src/local_ai_hub/api/integration_schemas.py:

~~~python
"""Strict response contracts for provider integrations."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from local_ai_hub.services.n8n import (
    INVALID_N8N_BASE_URL_DISPLAY,
    MAX_N8N_BASE_URL_LENGTH,
    N8nCheckState,
    N8nHealthError,
    N8nObservationState,
    is_canonical_n8n_origin,
)


class N8nStatusResponse(BaseModel):
    """One closed and internally consistent n8n observation."""

    model_config = ConfigDict(extra="forbid", strict=True)

    state: N8nObservationState
    base_url: Annotated[str, Field(max_length=MAX_N8N_BASE_URL_LENGTH)] | None
    liveness: N8nCheckState
    readiness: N8nCheckState
    error: N8nHealthError | None

    @model_validator(mode="after")
    def validate_combination(self) -> "N8nStatusResponse":
        if self.state == "unconfigured":
            valid = (
                self.base_url is None
                and self.liveness == "not_checked"
                and self.readiness == "not_checked"
                and self.error is None
            )
        elif self.base_url == INVALID_N8N_BASE_URL_DISPLAY:
            valid = (
                self.state == "offline"
                and self.liveness == "not_checked"
                and self.readiness == "not_checked"
                and self.error == "Invalid n8n base URL"
            )
        elif (
            not self.base_url
            or not is_canonical_n8n_origin(self.base_url)
        ):
            valid = False
        elif self.state == "online":
            valid = (
                self.liveness == "passed"
                and self.readiness == "passed"
                and self.error is None
            )
        elif self.state == "degraded":
            valid = (
                self.liveness == "passed"
                and self.readiness == "failed"
                and self.error == "n8n is reachable but not ready"
            )
        else:
            valid = (
                self.liveness == "failed"
                and self.readiness == "not_checked"
                and self.error in {"Connection failed", "n8n health check failed"}
            )
        if not valid:
            raise ValueError("invalid n8n status combination")
        return self
~~~

- [ ] **Step 5: Implement the dependency, route, and router registration**

Add this factory to backend/src/local_ai_hub/api/dependencies.py:

~~~python
from local_ai_hub.services.n8n import N8nHealthClient


def get_n8n_health_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> N8nHealthClient:
    """Build an n8n health client from trusted process configuration."""

    return N8nHealthClient(settings.n8n_base_url)
~~~

Create backend/src/local_ai_hub/api/routes/integrations.py:

~~~python
"""Credential-free, read-only provider integration routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from local_ai_hub.api.dependencies import get_n8n_health_client
from local_ai_hub.api.integration_schemas import N8nStatusResponse
from local_ai_hub.services.n8n import N8nHealthClient

router = APIRouter(tags=["integrations"])

_PRIVACY_HEADERS = {
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
}


@router.get("/n8n/status", response_model=N8nStatusResponse)
async def n8n_status(
    response: Response,
    client: Annotated[N8nHealthClient, Depends(get_n8n_health_client)],
) -> N8nStatusResponse:
    """Return one normalized n8n health observation."""

    for name, value in _PRIVACY_HEADERS.items():
        response.headers[name] = value

    result = await client.get_status()
    return N8nStatusResponse(
        state=result.state,
        base_url=result.base_url,
        liveness=result.liveness,
        readiness=result.readiness,
        error=result.error,
    )
~~~

In backend/src/local_ai_hub/api/main.py, add integrations to the existing routes import and register:

~~~python
from local_ai_hub.api.routes import (
    health,
    integrations,
    ollama,
    prompts,
    transfer,
    workflow_links,
)

app.include_router(integrations.router, prefix="/api/integrations")
~~~

Keep the existing router registrations and exception handler unchanged.

- [ ] **Step 6: Run focused and complete backend gates**

Run:

~~~bash
uv --directory backend run pytest tests/unit/test_integration_schemas.py tests/e2e/test_integrations_api.py -q
uv --directory backend run ruff check src/local_ai_hub/api/dependencies.py src/local_ai_hub/api/integration_schemas.py src/local_ai_hub/api/routes/integrations.py src/local_ai_hub/api/main.py tests/unit/test_integration_schemas.py tests/e2e/test_integrations_api.py
uv --directory backend run mypy src
uv --directory backend run ruff format --check .
make test
make test-e2e
git diff --check
~~~

Expected: focused, full backend, and e2e suites pass with only already documented warnings; lint,
strict types, formatting, and whitespace pass.

- [ ] **Step 7: Record and commit Task 2**

Append exact schema/API/privacy/error evidence to history/BUILD_LOG.md, stage only Task 2 paths, and
commit:

~~~bash
git add backend/src/local_ai_hub/api/dependencies.py backend/src/local_ai_hub/api/integration_schemas.py backend/src/local_ai_hub/api/routes/integrations.py backend/src/local_ai_hub/api/main.py backend/tests/unit/test_integration_schemas.py backend/tests/e2e/test_integrations_api.py history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: expose n8n integration status api"
~~~

### Task 3: Strict Frontend n8n Observation Contract

**Files:**
- Create: web/src/api/integrations.ts
- Create: web/src/api/integrations.test.ts
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing browser-boundary tests**

Create web/src/api/integrations.test.ts using the established fetch stub:

~~~typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BackendHttpError } from './client'
import {
  getN8nStatus,
  type N8nStatusResponse,
} from './integrations'

const maxCanonicalOrigin = `http://${'a'.repeat(2_041)}`
const overlongCanonicalOrigin = `http://${'a'.repeat(2_042)}`

const validStates: N8nStatusResponse[] = [
  {
    state: 'unconfigured',
    base_url: null,
    liveness: 'not_checked',
    readiness: 'not_checked',
    error: null,
  },
  {
    state: 'online',
    base_url: 'http://n8n.test',
    liveness: 'passed',
    readiness: 'passed',
    error: null,
  },
  {
    state: 'degraded',
    base_url: 'http://n8n.test',
    liveness: 'passed',
    readiness: 'failed',
    error: 'n8n is reachable but not ready',
  },
  {
    state: 'offline',
    base_url: 'http://n8n.test',
    liveness: 'failed',
    readiness: 'not_checked',
    error: 'Connection failed',
  },
  {
    state: 'offline',
    base_url: 'Invalid configuration',
    liveness: 'not_checked',
    readiness: 'not_checked',
    error: 'Invalid n8n base URL',
  },
  {
    state: 'offline',
    base_url: 'http://n8n.test',
    liveness: 'failed',
    readiness: 'not_checked',
    error: 'n8n health check failed',
  },
  {
    state: 'online',
    base_url: maxCanonicalOrigin,
    liveness: 'passed',
    readiness: 'passed',
    error: null,
  },
]

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('Integrations API', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests only the relative Hub path and forwards AbortSignal', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValueOnce(jsonResponse(validStates[0]))

    await expect(getN8nStatus(controller.signal)).resolves.toEqual(validStates[0])

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/n8n/status', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
  })

  it.each(validStates)('accepts normalized state $state', async (payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))
    await expect(getN8nStatus()).resolves.toEqual(payload)
  })

  it.each([
    { ...validStates[0], private: 'no' },
    {
      state: 'unconfigured',
      base_url: null,
      liveness: 'not_checked',
      readiness: 'not_checked',
    },
    { ...validStates[0], state: 'warming' },
    { ...validStates[0], liveness: 'unknown' },
    { ...validStates[0], base_url: 'http://n8n.test' },
    { ...validStates[1], readiness: 'failed' },
    { ...validStates[1], base_url: null },
    { ...validStates[1], base_url: 12 },
    { ...validStates[1], liveness: null },
    { ...validStates[1], error: false },
    { ...validStates[1], base_url: 'http://n8n.test/' },
    { ...validStates[1], base_url: 'HTTP://N8N.TEST:80/' },
    { ...validStates[1], base_url: 'http://admin:private@n8n.test' },
    { ...validStates[1], base_url: 'http://n8n.test/private' },
    { ...validStates[1], base_url: overlongCanonicalOrigin },
    { ...validStates[2], error: 'private detail' },
    { ...validStates[3], liveness: 'passed' },
    { ...validStates[3], error: 'unknown error' },
    { ...validStates[4], base_url: 'http://n8n.test' },
    [],
    null,
    'not an object',
  ])('rejects malformed or impossible payload %#', async (payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))
    await expect(getN8nStatus()).rejects.toThrow(
      'Backend returned an invalid response',
    )
  })

  it('preserves fixed HTTP, network, invalid JSON, and abort behavior', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('aborted', 'AbortError')
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ private: 'no' }, 503))
      .mockRejectedValueOnce(new TypeError('private network detail'))
      .mockResolvedValueOnce(new Response('{', { status: 200 }))
      .mockRejectedValueOnce(abortError)

    const httpError = await getN8nStatus().catch((error: unknown) => error)
    expect(httpError).toBeInstanceOf(BackendHttpError)
    expect(httpError).toMatchObject({
      status: 503,
      message: 'Backend returned HTTP 503',
    })
    await expect(getN8nStatus()).rejects.toThrow('Unable to reach the backend')
    await expect(getN8nStatus()).rejects.toThrow(
      'Backend returned an invalid response',
    )
    await expect(getN8nStatus(controller.signal)).rejects.toBe(abortError)
  })

  it('propagates an abort raised during body decoding', async () => {
    const abortError = new DOMException('aborted while decoding', 'AbortError')
    const json = vi.fn().mockRejectedValue(abortError)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json,
    } as unknown as Response)

    await expect(getN8nStatus()).rejects.toBe(abortError)
  })

  it('never fetches the returned provider origin', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(validStates[1]))
    await getN8nStatus()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).not.toBe('http://n8n.test')
  })
})
~~~

- [ ] **Step 2: Run the API test and verify the red state**

Run:

~~~bash
env --chdir=web pnpm exec vitest run src/api/integrations.test.ts
~~~

Expected: collection fails because api/integrations.ts does not exist.

- [ ] **Step 3: Implement the discriminated contract and exact parser**

Create web/src/api/integrations.ts:

~~~typescript
import { requestJson } from './client'

const INVALID_RESPONSE_MESSAGE = 'Backend returned an invalid response'
const MAX_ORIGIN_LENGTH = 2_048
const EXACT_KEYS = ['state', 'base_url', 'liveness', 'readiness', 'error'] as const

export type N8nObservationState =
  | 'unconfigured'
  | 'online'
  | 'degraded'
  | 'offline'
export type N8nCheckState = 'passed' | 'failed' | 'not_checked'
export type N8nStatusResponse =
  | {
      state: 'unconfigured'
      base_url: null
      liveness: 'not_checked'
      readiness: 'not_checked'
      error: null
    }
  | {
      state: 'online'
      base_url: string
      liveness: 'passed'
      readiness: 'passed'
      error: null
    }
  | {
      state: 'degraded'
      base_url: string
      liveness: 'passed'
      readiness: 'failed'
      error: 'n8n is reachable but not ready'
    }
  | {
      state: 'offline'
      base_url: 'Invalid configuration'
      liveness: 'not_checked'
      readiness: 'not_checked'
      error: 'Invalid n8n base URL'
    }
  | {
      state: 'offline'
      base_url: string
      liveness: 'failed'
      readiness: 'not_checked'
      error: 'Connection failed' | 'n8n health check failed'
    }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function hasExactKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value)
  return (
    keys.length === EXACT_KEYS.length &&
    EXACT_KEYS.every((key) => Object.hasOwn(value, key))
  )
}

function isCanonicalOrigin(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Array.from(value).length > MAX_ORIGIN_LENGTH ||
    value.trim() !== value ||
    value === 'Invalid configuration'
  ) {
    return false
  }
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '' &&
      url.origin === value
    )
  } catch {
    return false
  }
}

function isN8nStatusResponse(payload: unknown): payload is N8nStatusResponse {
  if (!isRecord(payload) || !hasExactKeys(payload)) return false

  if (payload.state === 'unconfigured') {
    return (
      payload.base_url === null &&
      payload.liveness === 'not_checked' &&
      payload.readiness === 'not_checked' &&
      payload.error === null
    )
  }
  if (
    payload.state === 'offline' &&
    payload.base_url === 'Invalid configuration'
  ) {
    return (
      payload.liveness === 'not_checked' &&
      payload.readiness === 'not_checked' &&
      payload.error === 'Invalid n8n base URL'
    )
  }
  if (!isCanonicalOrigin(payload.base_url)) return false
  if (payload.state === 'online') {
    return (
      payload.liveness === 'passed' &&
      payload.readiness === 'passed' &&
      payload.error === null
    )
  }
  if (payload.state === 'degraded') {
    return (
      payload.liveness === 'passed' &&
      payload.readiness === 'failed' &&
      payload.error === 'n8n is reachable but not ready'
    )
  }
  return (
    payload.state === 'offline' &&
    payload.liveness === 'failed' &&
    payload.readiness === 'not_checked' &&
    (payload.error === 'Connection failed' ||
      payload.error === 'n8n health check failed')
  )
}

function parseN8nStatusResponse(payload: unknown): N8nStatusResponse {
  if (!isN8nStatusResponse(payload)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return payload
}

export const getN8nStatus = (signal?: AbortSignal) =>
  requestJson(
    '/api/integrations/n8n/status',
    parseN8nStatusResponse,
    { signal },
  )
~~~

The URL object is validation-only. Do not call fetch with base_url, export the parser, relax exact
keys, or accept a backend-provided free-form error.

- [ ] **Step 4: Run focused and complete frontend foundation gates**

Run:

~~~bash
env --chdir=web pnpm exec vitest run src/api/integrations.test.ts
make test-web
env --chdir=web pnpm lint
env --chdir=web pnpm typecheck
env --chdir=web pnpm build
git diff --check
~~~

Expected: focused and complete frontend suites, ESLint, TypeScript, production build, and whitespace
check pass. The fetch mock records only the relative Hub path.

- [ ] **Step 5: Record and commit Task 3**

Append exact parser/path/abort/no-provider-fetch evidence to history/BUILD_LOG.md, then:

~~~bash
git add web/src/api/integrations.ts web/src/api/integrations.test.ts history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add n8n frontend observation contract"
~~~

### Task 4: Abortable Integrations Observation Controller

**Files:**
- Create: web/src/features/integrations/useIntegrations.ts
- Create: web/src/features/integrations/useIntegrations.test.tsx
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing lifecycle and race tests**

Create web/src/features/integrations/useIntegrations.test.tsx:

~~~typescript
import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getN8nStatus, type N8nStatusResponse } from '../../api/integrations'
import { useIntegrations } from './useIntegrations'

vi.mock('../../api/integrations', () => ({
  getN8nStatus: vi.fn(),
}))

const getN8nStatusMock = vi.mocked(getN8nStatus)

const unconfigured: N8nStatusResponse = {
  state: 'unconfigured',
  base_url: null,
  liveness: 'not_checked',
  readiness: 'not_checked',
  error: null,
}

const online: N8nStatusResponse = {
  state: 'online',
  base_url: 'http://n8n.test',
  liveness: 'passed',
  readiness: 'passed',
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

describe('useIntegrations', () => {
  beforeEach(() => {
    getN8nStatusMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('makes zero requests while disabled and exactly one on entry', async () => {
    getN8nStatusMock.mockResolvedValueOnce(unconfigured)
    const { result, rerender } = renderHook(
      ({ enabled }) => useIntegrations(enabled),
      { initialProps: { enabled: false } },
    )

    expect(getN8nStatusMock).not.toHaveBeenCalled()
    expect(result.current.requestStatus).toBe('idle')

    rerender({ enabled: true })
    await waitFor(() => expect(result.current.observation).toEqual(unconfigured))
    expect(getN8nStatusMock).toHaveBeenCalledTimes(1)
    expect(result.current.lastChecked).toBeInstanceOf(Date)
  })

  it('does not poll or retry when timers advance', async () => {
    vi.useFakeTimers()
    getN8nStatusMock.mockResolvedValueOnce(unconfigured)
    const { result } = renderHook(() => useIntegrations(true))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.observation).toEqual(unconfigured)

    act(() => vi.advanceTimersByTime(300_000))
    expect(getN8nStatusMock).toHaveBeenCalledTimes(1)
  })

  it('uses loading without a snapshot and refreshing with one', async () => {
    const first = deferred<N8nStatusResponse>()
    const second = deferred<N8nStatusResponse>()
    getN8nStatusMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useIntegrations(true))

    await waitFor(() =>
      expect(result.current.requestStatus).toBe('loading'),
    )
    expect(result.current.pending).toBe(true)

    await act(async () => first.resolve(online))
    const checked = result.current.lastChecked
    expect(checked).toBeInstanceOf(Date)

    act(() => result.current.refreshN8n())
    expect(result.current.requestStatus).toBe('refreshing')
    expect(result.current.observation).toEqual(online)
    expect(result.current.lastChecked).toBe(checked)

    await act(async () => second.resolve(unconfigured))
    expect(result.current.requestStatus).toBe('idle')
    expect(result.current.observation).toEqual(unconfigured)
    expect(result.current.lastChecked).not.toBe(checked)
  })

  it('aborts and supersedes a programmatic refresh and ignores stale settlement', async () => {
    const first = deferred<N8nStatusResponse>()
    const second = deferred<N8nStatusResponse>()
    getN8nStatusMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useIntegrations(true))

    await waitFor(() => expect(getN8nStatusMock).toHaveBeenCalledTimes(1))
    const firstSignal = getN8nStatusMock.mock.calls[0]?.[0]
    act(() => result.current.refreshN8n())
    expect(firstSignal?.aborted).toBe(true)

    await act(async () => second.resolve(online))
    await act(async () => first.resolve(unconfigured))
    expect(result.current.observation).toEqual(online)
    expect(getN8nStatusMock).toHaveBeenCalledTimes(2)
  })

  it('aborts on leave and unmount without publishing a late result', async () => {
    const first = deferred<N8nStatusResponse>()
    const second = deferred<N8nStatusResponse>()
    getN8nStatusMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useIntegrations(enabled),
      { initialProps: { enabled: true } },
    )

    await waitFor(() => expect(getN8nStatusMock).toHaveBeenCalledTimes(1))
    const firstSignal = getN8nStatusMock.mock.calls[0]?.[0]
    rerender({ enabled: false })
    expect(firstSignal?.aborted).toBe(true)
    await act(async () => first.resolve(online))
    expect(result.current.observation).toBeNull()

    rerender({ enabled: true })
    await waitFor(() => expect(getN8nStatusMock).toHaveBeenCalledTimes(2))
    const secondSignal = getN8nStatusMock.mock.calls[1]?.[0]
    unmount()
    expect(secondSignal?.aborted).toBe(true)
  })

  it('preserves snapshot and checked time after re-entry refresh failure', async () => {
    const refresh = deferred<N8nStatusResponse>()
    getN8nStatusMock
      .mockResolvedValueOnce(online)
      .mockReturnValueOnce(refresh.promise)
    const { result, rerender } = renderHook(
      ({ enabled }) => useIntegrations(enabled),
      { initialProps: { enabled: true } },
    )

    await waitFor(() => expect(result.current.observation).toEqual(online))
    const checked = result.current.lastChecked
    rerender({ enabled: false })
    rerender({ enabled: true })

    expect(result.current.observation).toEqual(online)
    await waitFor(() =>
      expect(result.current.requestStatus).toBe('refreshing'),
    )
    await act(async () => refresh.reject(new Error('private backend detail')))

    expect(result.current.observation).toEqual(online)
    expect(result.current.lastChecked).toBe(checked)
    expect(result.current.stale).toBe(true)
    expect(result.current.error).toBe(
      'Refresh failed. Showing the last n8n observation.',
    )
  })

  it('maps a first Hub failure to fixed copy without provider state', async () => {
    getN8nStatusMock.mockRejectedValueOnce(new Error('private backend detail'))
    const { result } = renderHook(() => useIntegrations(true))

    await waitFor(() => expect(result.current.requestStatus).toBe('idle'))
    expect(result.current.observation).toBeNull()
    expect(result.current.lastChecked).toBeNull()
    expect(result.current.stale).toBe(false)
    expect(result.current.error).toBe(
      'Unable to check n8n through the Hub.',
    )
    expect(JSON.stringify(result.current)).not.toContain('private backend detail')
  })

  it.each([
    unconfigured,
    online,
    {
      state: 'degraded',
      base_url: 'http://n8n.test',
      liveness: 'passed',
      readiness: 'failed',
      error: 'n8n is reachable but not ready',
    },
    {
      state: 'offline',
      base_url: 'http://n8n.test',
      liveness: 'failed',
      readiness: 'not_checked',
      error: 'n8n health check failed',
    },
  ] satisfies N8nStatusResponse[])(
    'accepts $state as a valid observation and updates checked time',
    async (observation) => {
      getN8nStatusMock.mockResolvedValueOnce(observation)
      const { result } = renderHook(() => useIntegrations(true))

      await waitFor(() =>
        expect(result.current.observation).toEqual(observation),
      )
      expect(result.current.lastChecked).toBeInstanceOf(Date)
      expect(result.current.error).toBeNull()
      expect(result.current.stale).toBe(false)
    },
  )

  it('coalesces StrictMode effect replay into one entry request', async () => {
    getN8nStatusMock.mockResolvedValueOnce(online)
    const { result } = renderHook(() => useIntegrations(true), {
      wrapper: StrictMode,
    })

    await waitFor(() => expect(result.current.observation).toEqual(online))
    expect(getN8nStatusMock).toHaveBeenCalledTimes(1)
  })

  it('ignores a body-decoding AbortError without publishing failure state', async () => {
    getN8nStatusMock.mockRejectedValueOnce(
      new DOMException('private abort detail', 'AbortError'),
    )
    const { result } = renderHook(() => useIntegrations(true))

    await waitFor(() => expect(result.current.requestStatus).toBe('idle'))
    expect(result.current.observation).toBeNull()
    expect(result.current.lastChecked).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.stale).toBe(false)
  })
})
~~~

- [ ] **Step 2: Run the controller tests and verify the red state**

Run:

~~~bash
env --chdir=web pnpm exec vitest run src/features/integrations/useIntegrations.test.tsx
~~~

Expected: collection fails because useIntegrations.ts does not exist.

- [ ] **Step 3: Implement the controller**

Create web/src/features/integrations/useIntegrations.ts:

~~~typescript
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getN8nStatus,
  type N8nStatusResponse,
} from '../../api/integrations'

export type IntegrationsRequestStatus = 'idle' | 'loading' | 'refreshing'

export interface IntegrationsController {
  observation: N8nStatusResponse | null
  requestStatus: IntegrationsRequestStatus
  pending: boolean
  error: string | null
  stale: boolean
  lastChecked: Date | null
  refreshN8n: () => void
}

const HUB_ERROR = 'Unable to check n8n through the Hub.'
const STALE_ERROR = 'Refresh failed. Showing the last n8n observation.'

const wasAborted = (error: unknown, signal: AbortSignal) =>
  signal.aborted ||
  (error instanceof DOMException && error.name === 'AbortError')

export function useIntegrations(enabled: boolean): IntegrationsController {
  const [observation, setObservation] = useState<N8nStatusResponse | null>(null)
  const [requestStatus, setRequestStatus] =
    useState<IntegrationsRequestStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const mounted = useRef(false)
  const enabledRef = useRef(enabled)
  const observationRef = useRef<N8nStatusResponse | null>(null)
  const generation = useRef(0)
  const activeRequest = useRef<AbortController | null>(null)
  enabledRef.current = enabled

  const startObservation = useCallback(() => {
    if (!mounted.current || !enabledRef.current) return

    activeRequest.current?.abort()
    const controller = new AbortController()
    const requestGeneration = ++generation.current
    const hasSnapshot = observationRef.current !== null
    activeRequest.current = controller

    setRequestStatus(hasSnapshot ? 'refreshing' : 'loading')
    setError(null)
    setStale(false)

    void getN8nStatus(controller.signal)
      .then((result) => {
        if (
          controller.signal.aborted ||
          !mounted.current ||
          !enabledRef.current ||
          generation.current !== requestGeneration
        ) {
          return
        }
        observationRef.current = result
        setObservation(result)
        setLastChecked(new Date())
        setError(null)
        setStale(false)
      })
      .catch((requestError: unknown) => {
        if (
          wasAborted(requestError, controller.signal) ||
          !mounted.current ||
          !enabledRef.current ||
          generation.current !== requestGeneration
        ) {
          return
        }
        if (hasSnapshot) {
          setError(STALE_ERROR)
          setStale(true)
        } else {
          setError(HUB_ERROR)
          setStale(false)
        }
      })
      .finally(() => {
        if (
          mounted.current &&
          enabledRef.current &&
          generation.current === requestGeneration
        ) {
          setRequestStatus('idle')
        }
        if (activeRequest.current === controller) {
          activeRequest.current = null
        }
      })
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
      activeRequest.current?.abort()
      activeRequest.current = null
    }
  }, [])

  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled) {
      generation.current += 1
      activeRequest.current?.abort()
      activeRequest.current = null
      setRequestStatus('idle')
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) startObservation()
    })
    return () => {
      cancelled = true
      generation.current += 1
      activeRequest.current?.abort()
      activeRequest.current = null
    }
  }, [enabled, startObservation])

  return {
    observation,
    requestStatus,
    pending: requestStatus !== 'idle',
    error,
    stale,
    lastChecked,
    refreshN8n: startObservation,
  }
}
~~~

Do not add timers, visibility listeners, storage, automatic retries, provider URLs, or raw error
mapping. Preserve observation and lastChecked on disable so re-entry can perform a background
refresh.

- [ ] **Step 4: Run focused and complete controller gates**

Run:

~~~bash
env --chdir=web pnpm exec vitest run src/features/integrations/useIntegrations.test.tsx
make test-web
env --chdir=web pnpm lint
env --chdir=web pnpm typecheck
env --chdir=web pnpm build
git diff --check
~~~

Expected: every lifecycle/race test and the complete frontend suite passes; lint, strict TypeScript,
build, and whitespace pass.

- [ ] **Step 5: Record and commit Task 4**

Append exact entry/refresh/abort/generation/stale/time/no-poll evidence to history/BUILD_LOG.md:

~~~bash
git add web/src/features/integrations/useIntegrations.ts web/src/features/integrations/useIntegrations.test.tsx history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add integrations observation controller"
~~~

### Task 5: Accessible n8n Integrations Status View

**Files:**
- Create: `web/src/features/integrations/N8nStatusCard.tsx`
- Create: `web/src/features/integrations/IntegrationsView.tsx`
- Create: `web/src/features/integrations/IntegrationsView.test.tsx`
- Modify: `web/src/styles.css`
- Modify: `history/BUILD_LOG.md`

- [ ] **Step 1: Load the required frontend design guidance before UI work**

The implementation worker must announce that the `frontend-design` skill is being used because this
task creates and styles a dashboard view, then read its `SKILL.md` completely before editing these
files. Preserve the approved industrial control-room visual language and add no UI library, font,
image, or runtime dependency.

- [ ] **Step 2: Write failing status-card and view tests**

Create `web/src/features/integrations/IntegrationsView.test.tsx`. Build controllers through a helper
whose defaults are `observation: null`, `requestStatus: 'idle'`, `pending: false`, `error: null`,
`stale: false`, `lastChecked: null`, and `refreshN8n: vi.fn()`.

Use `render`, `screen`, and `userEvent` to cover these exact cases:

1. Initial loading renders `Checking n8n`, a focusable button with `aria-disabled="true"`, no
   provider card assertion based on invented state, and no automatic focus movement.
2. Unconfigured renders `Not configured`, `Not checked` for both checks, the exact guidance
   `Set N8N_BASE_URL in the API process environment, then restart the API.`, and no textbox, link,
   clipboard button, password field, or credential copy.
3. A table of online, degraded, and offline observations renders each textual state, canonical inert
   origin, liveness/readiness values, its fixed state explanation, and its separate sanitized error
   when non-null. Assert the origin with `getByText`; assert
   `queryByRole('link', { name: origin })` is absent.
4. Invalid configuration renders the safe `Invalid configuration` sentinel and never a supplied raw
   invalid value.
5. A first Hub failure renders a page-level alert saying `Unable to check n8n through the Hub.` and
   does not call it an n8n offline result or duplicate that assertive announcement in the polite
   live region.
6. A stale refresh failure keeps the prior card and previous checked time, renders
   `Refresh failed. Showing the last n8n observation.`, has no assertive alert role, and announces
   the failure exactly once through the polite live region.
7. A completed observation announces `n8n observation updated: <state>.` through one polite live
   region after rerendering from no observation, without focusing the region.
8. Clicking `Refresh n8n` calls `refreshN8n` once and focus remains on the button. A pending
   controller uses `aria-disabled="true"` rather than native `disabled`, changes its visible label
   to `Checking n8n`, and ignores repeated mouse and keyboard activation without moving focus.
9. A 2,048-character valid origin remains inert text and is assigned a wrapping class. The DOM
   contains no `href`, input, `data-*` destination, or clipboard action derived from it.

Representative fixture and assertions:

~~~typescript
const online: N8nStatusResponse = {
  state: 'online',
  base_url: 'http://n8n.test:5678',
  liveness: 'passed',
  readiness: 'passed',
  error: null,
}

it.each([
  ['Online', online, 'Both fixed health checks passed.', null],
  [
    'Degraded',
    {
      state: 'degraded',
      base_url: 'http://n8n.test:5678',
      liveness: 'passed',
      readiness: 'failed',
      error: 'n8n is reachable but not ready',
    },
    'Liveness passed, but readiness did not.',
    'n8n is reachable but not ready',
  ],
  [
    'Offline',
    {
      state: 'offline',
      base_url: 'http://n8n.test:5678',
      liveness: 'failed',
      readiness: 'not_checked',
      error: 'Connection failed',
    },
    'The fixed liveness check did not pass.',
    'Connection failed',
  ],
] as const)(
  'renders the %s observation as normalized inert data',
  (label, observation, explanation, error) => {
    render(<IntegrationsView controller={makeController({ observation })} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText(explanation)).toBeInTheDocument()
    if (error !== null) expect(screen.getByText(error)).toBeInTheDocument()
    expect(screen.getByText('http://n8n.test:5678')).not.toHaveAttribute('href')
  },
)
~~~

- [ ] **Step 3: Run the view test and verify the red state**

Run:

~~~bash
env --chdir=web pnpm exec vitest run src/features/integrations/IntegrationsView.test.tsx
~~~

Expected: collection fails because the view and card modules do not exist.

- [ ] **Step 4: Implement the normalized n8n status card**

Create `web/src/features/integrations/N8nStatusCard.tsx`:

~~~typescript
import type { N8nStatusResponse } from '../../api/integrations'

const presentation = {
  unconfigured: {
    label: 'Not configured',
    tone: 'unconfigured',
    detail:
      'Set N8N_BASE_URL in the API process environment, then restart the API.',
  },
  online: {
    label: 'Online',
    tone: 'online',
    detail: 'Both fixed health checks passed.',
  },
  degraded: {
    label: 'Degraded',
    tone: 'degraded',
    detail: 'Liveness passed, but readiness did not.',
  },
  offline: {
    label: 'Offline',
    tone: 'offline',
    detail: 'The fixed liveness check did not pass.',
  },
} as const

const checkLabel = {
  passed: 'Passed',
  failed: 'Failed',
  not_checked: 'Not checked',
} as const

interface N8nStatusCardProps {
  observation: N8nStatusResponse
}

export function N8nStatusCard({ observation }: N8nStatusCardProps) {
  const state = presentation[observation.state]
  return (
    <article
      className={`integration-card integration-card--${state.tone}`}
      aria-labelledby="n8n-integration-title"
    >
      <span className="integration-card__index" aria-hidden="true">01</span>
      <div className="integration-card__heading">
        <div>
          <p className="eyebrow">Automation runtime</p>
          <h2 id="n8n-integration-title">n8n</h2>
        </div>
        <span className={`status status--${state.tone}`}>
          <span className="status__dot" aria-hidden="true" />
          {state.label}
        </span>
      </div>
      <p className="integration-card__copy">{state.detail}</p>
      {observation.error !== null ? (
        <p className="integration-card__error">{observation.error}</p>
      ) : null}
      <dl className="integration-telemetry">
        <div className="integration-telemetry__origin">
          <dt>Configured origin</dt>
          <dd>{observation.base_url ?? 'Not configured'}</dd>
        </div>
        <div>
          <dt>Liveness</dt>
          <dd>{checkLabel[observation.liveness]}</dd>
        </div>
        <div>
          <dt>Readiness</dt>
          <dd>{checkLabel[observation.readiness]}</dd>
        </div>
      </dl>
      <p className="integration-card__boundary">
        Observation only · No workflow, execution, credential, or container access
      </p>
    </article>
  )
}
~~~

Do not give the origin an anchor, click handler, copy handler, title containing another value, or
provider-derived ARIA label. The state remains understandable without color.

- [ ] **Step 5: Implement the view without focus stealing**

Create `web/src/features/integrations/IntegrationsView.tsx`:

~~~typescript
import { useEffect, useRef, useState } from 'react'

import { N8nStatusCard } from './N8nStatusCard'
import type { IntegrationsController } from './useIntegrations'

interface IntegrationsViewProps {
  controller: IntegrationsController
}

const checkedLabel = (value: Date | null) =>
  value?.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) ?? 'Not yet'

export function IntegrationsView({ controller }: IntegrationsViewProps) {
  const [announcement, setAnnouncement] = useState('')
  const previousObservation = useRef(controller.observation)
  const previousError = useRef(controller.error)

  useEffect(() => {
    if (
      controller.observation !== null &&
      controller.observation !== previousObservation.current
    ) {
      setAnnouncement(
        `n8n observation updated: ${controller.observation.state}.`,
      )
    } else if (
      controller.stale &&
      controller.error !== null &&
      controller.error !== previousError.current
    ) {
      setAnnouncement(controller.error)
    }
    previousObservation.current = controller.observation
    previousError.current = controller.error
  }, [controller.error, controller.observation, controller.stale])

  return (
    <section
      className="registry-view integrations-view"
      aria-labelledby="integrations-title"
    >
      <header className="registry-header integrations-header">
        <div>
          <p className="kicker">Service observation · Integration control 04</p>
          <h1 id="integrations-title">Integrations</h1>
        </div>
        <p>
          Observe one configured local n8n origin through the Hub's fixed,
          credential-free health boundary.
        </p>
      </header>

      <div className="integration-boundary" aria-label="Integration safety boundary">
        <span aria-hidden="true">READ ONLY</span>
        <p>
          The Hub calls only fixed n8n liveness and readiness paths. It does not
          inspect workflows, executions, credentials, or Docker.
        </p>
        <span aria-hidden="true">NO KEY</span>
      </div>

      <div className="integrations-toolbar">
        <button
          type="button"
          className="integration-refresh"
          onClick={() => {
            if (!controller.pending) controller.refreshN8n()
          }}
          aria-disabled={controller.pending}
        >
          <span>{controller.pending ? 'Checking n8n' : 'Refresh n8n'}</span>
          <span aria-hidden="true">{controller.pending ? '···' : '↻'}</span>
        </button>
        <p>
          Last checked
          <time dateTime={controller.lastChecked?.toISOString()}>
            {checkedLabel(controller.lastChecked)}
          </time>
        </p>
      </div>

      {controller.error !== null ? (
        <p
          className={`integration-alert${controller.stale ? ' integration-alert--stale' : ''}`}
          role={controller.stale ? undefined : 'alert'}
        >
          {controller.error}
        </p>
      ) : null}

      {controller.observation !== null ? (
        <N8nStatusCard observation={controller.observation} />
      ) : controller.requestStatus === 'loading' ? (
        <div className="integration-loading" role="status">
          <span aria-hidden="true" />
          <strong>Checking n8n</strong>
          <p>Requesting one observation through the local Hub.</p>
        </div>
      ) : controller.error === null ? (
        <div className="integration-loading">
          <strong>No observation yet</strong>
          <p>Use Refresh n8n to request one local observation.</p>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <footer className="footer registry-footer">
        <span>Private by default</span>
        <span aria-hidden="true">//</span>
        <span>Running on your machine · Observation only</span>
        <span className="footer__rule" aria-hidden="true" />
        <span>Phase 02A</span>
      </footer>
    </section>
  )
}
~~~

Add this exact visually-hidden utility because the repository does not yet define it:

~~~css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  clip-path: inset(50%);
}
~~~

Do not replace `aria-disabled` with native `disabled`: Firefox moves focus to the body when a focused
native button becomes disabled. The guarded handler provides disabled activation semantics while the
button remains focusable. Do not add a timeout, provider-origin action, setup form, retry loop,
auto-focus effect, or browser storage.

- [ ] **Step 6: Add scoped industrial status styling**

Modify `web/src/styles.css` before the existing keyframes/media-query section. Add scoped
`.integrations-*`, `.integration-*`, `.status--degraded`, and `.status--unconfigured` rules with:

- `--integration-accent: #7ed8c1` for the view's framing while state colors remain green, amber, red,
  and neutral;
- `min-width: 0` on every grid item that can contain the origin;
- `overflow-wrap: anywhere` on the origin, alerts, boundary copy, and headings;
- a single-column bounded card, three-cell telemetry at desktop, and no horizontal scrolling;
- `min-height: 44px` on Refresh n8n;
- `cursor: wait` and reduced opacity under `[aria-disabled="true"]`;
- visible keyboard focus using the established pending/accent color;
- degraded state colored `var(--pending)` and unconfigured state colored `var(--muted-high)`;
- reduced-motion compatibility inherited from the existing global media query.

Use these structural declarations as the anchor for later responsive edits:

~~~css
.integrations-view {
  --integration-accent: #7ed8c1;
  min-width: 0;
}

.integration-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  padding: clamp(26px, 4vw, 42px);
  background: color-mix(in srgb, var(--surface) 96%, transparent);
}

.integration-telemetry {
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr));
  gap: 1px;
  min-width: 0;
  margin: 26px 0 0;
  border: 1px solid var(--line-soft);
  background: var(--line-soft);
}

.integration-telemetry dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.integration-refresh {
  min-height: 44px;
}

.integration-refresh[aria-disabled="true"] {
  cursor: wait;
  opacity: 0.62;
}

.integration-card__error {
  color: var(--offline);
  overflow-wrap: anywhere;
}

.status--degraded {
  color: var(--pending);
}

.status--unconfigured {
  color: var(--muted-high);
}
~~~

- [ ] **Step 7: Run focused and complete UI gates**

Run:

~~~bash
env --chdir=web pnpm exec vitest run src/features/integrations/IntegrationsView.test.tsx
make test-web
env --chdir=web pnpm lint
env --chdir=web pnpm typecheck
env --chdir=web pnpm build
git diff --check
~~~

Expected: every presentation, interaction, inert-origin, accessible-name, and announcement test
passes with the complete frontend suite, lint, strict TypeScript, build, and whitespace checks.

- [ ] **Step 8: Record and commit Task 5**

Append the exact state/UI/accessibility/inert-origin checks and command results to
`history/BUILD_LOG.md`, then:

~~~bash
git add web/src/features/integrations/N8nStatusCard.tsx web/src/features/integrations/IntegrationsView.tsx web/src/features/integrations/IntegrationsView.test.tsx web/src/styles.css history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add n8n integrations status view"
~~~

### Task 6: Fifth-View Navigation and Exact Responsive Layout

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.navigation.test.tsx`
- Modify: `web/src/styles.css`
- Modify: `web/src/styles.test.ts`
- Modify: `history/BUILD_LOG.md`

- [ ] **Step 1: Extend navigation tests before wiring the view**

Modify `web/src/App.navigation.test.tsx`:

1. Import React `StrictMode`, plus `getN8nStatus` and `N8nStatusResponse` from
   `./api/integrations`.
2. Mock `./api/integrations` with `getN8nStatus: vi.fn()`.
3. Reset it in `beforeEach()` to resolve the normalized unconfigured fixture.
4. Rename the top-level navigation case to include Integrations and assert the fifth button enters a
   heading named `Integrations`.
5. Assert initial Overview render makes zero n8n calls.
6. Render the lifecycle case inside `StrictMode`; assert entering Integrations calls the API exactly
   once despite effect replay, assigns only Integrations `aria-current="page"`, and leaving/re-entering
   calls it exactly once per entry.
7. Hold a request pending, leave for Overview, and assert its supplied `AbortSignal` is aborted,
   Overview becomes current, and no confirmation dialog opens.
8. Resolve an earlier request after re-entry and prove the newer observation owns the visible card.

9. Add `Integrations` to every existing Prompt, Workflow, and Transfer exit-guard target matrix. A
   cancelled dirty guard or pending mutation/import must keep the source view current and make zero
   n8n requests.
10. Assert leaving Integrations itself never calls `confirm`.

Use these fixtures in the new cases:

~~~typescript
import { StrictMode } from 'react'

import {
  getN8nStatus,
  type N8nStatusResponse,
} from './api/integrations'

vi.mock('./api/integrations', () => ({
  getN8nStatus: vi.fn(),
}))

const getN8nStatusMock = vi.mocked(getN8nStatus)

const n8nUnconfigured: N8nStatusResponse = {
  state: 'unconfigured',
  base_url: null,
  liveness: 'not_checked',
  readiness: 'not_checked',
  error: null,
}

const n8nOnline: N8nStatusResponse = {
  state: 'online',
  base_url: 'http://n8n.test:5678',
  liveness: 'passed',
  readiness: 'passed',
  error: null,
}
~~~

Representative lifecycle test:

~~~typescript
it('starts one observation per Integrations entry and aborts on leave', async () => {
  const pending = deferred<N8nStatusResponse>()
  getN8nStatusMock.mockReturnValueOnce(pending.promise)
  const confirm = vi.fn()
  vi.stubGlobal('confirm', confirm)
  const user = userEvent.setup()
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  expect(getN8nStatusMock).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Integrations' }))
  expect(getN8nStatusMock).toHaveBeenCalledTimes(1)
  const signal = getN8nStatusMock.mock.calls[0]?.[0]
  expect(signal?.aborted).toBe(false)

  await user.click(screen.getByRole('button', { name: 'Overview' }))
  expect(signal?.aborted).toBe(true)
  expect(confirm).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Overview' }))
    .toHaveAttribute('aria-current', 'page')
})
~~~

- [ ] **Step 2: Run navigation tests and verify the red state**

Run:

~~~bash
env --chdir=web pnpm exec vitest run src/App.navigation.test.tsx
~~~

Expected: assertions fail because App has no Integrations view or button.

- [ ] **Step 3: Wire the controller and view through the existing guarded navigator**

Modify `web/src/App.tsx` with these focused changes:

~~~typescript
import { IntegrationsView } from './features/integrations/IntegrationsView'
import { useIntegrations } from './features/integrations/useIntegrations'

// ...
type ActiveView =
  | 'overview'
  | 'prompts'
  | 'workflows'
  | 'transfer'
  | 'integrations'

// inside App, alongside the other controllers
const integrations = useIntegrations(activeView === 'integrations')
~~~

Add the fifth button immediately after Transfer:

~~~tsx
<button
  type="button"
  aria-current={activeView === 'integrations' ? 'page' : undefined}
  onClick={() => navigateTo('integrations')}
>
  Integrations
</button>
~~~

Keep `navigateTo` as the single navigation boundary. Do not add an Integrations dirty-state branch.
Replace the final rendering tail with an explicit Transfer branch and Integrations fallback:

~~~tsx
) : activeView === 'workflows' ? (
  <WorkflowRegistry controller={workflowRegistry} />
) : activeView === 'transfer' ? (
  <TransferView controller={transfer} />
) : (
  <IntegrationsView controller={integrations} />
)}
~~~

Do not mount a second integrations controller inside the view and do not call `getN8nStatus` from
App, Overview, or a click handler.

- [ ] **Step 4: Write responsive CSS regression tests before changing the grid**

Modify `web/src/styles.test.ts` with a helper that extracts a named selector block from a specific
media-query slice rather than matching the first global block:

~~~typescript
function mediaSlice(maxWidth: number, nextMaxWidth?: number): string {
  const start = stylesheet.indexOf(`@media (max-width: ${maxWidth}px)`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = nextMaxWidth
    ? stylesheet.indexOf(`@media (max-width: ${nextMaxWidth}px)`, start + 1)
    : stylesheet.indexOf('@media (prefers-reduced-motion', start + 1)
  expect(end).toBeGreaterThan(start)
  return stylesheet.slice(start, end)
}
~~~

Call `mediaSlice(1080, 880)`, `mediaSlice(880, 600)`, and `mediaSlice(600)` so each assertion
is scoped to the intended ordered media block.

Add exact structural assertions:

- the base `.view-switcher` declares `display: grid` and
  `grid-template-columns: repeat(5, minmax(0, 1fr))`;
- base `.view-switcher button` declares both `min-width: 0` and `min-height: 44px`;
- the 1080 px slice moves `.view-switcher` to `grid-column: 1 / -1`, retains five columns, and places
  it on row 2 while `.masthead__controls` uses `display: contents`;
- the 600 px slice declares six columns;
- buttons 1–3 span two tracks and buttons 4–5 span three tracks in the 600 px slice;
- neither root element nor `.dashboard`, `.masthead`, `.masthead__controls`, or `.view-switcher`
  introduces a fixed `min-width`;
- no mobile rule hides, truncates, or absolutely positions a navigation button.

The test is structural; real Firefox geometry remains the final acceptance authority.

- [ ] **Step 5: Run stylesheet tests and verify the red state**

Run:

~~~bash
env --chdir=web pnpm exec vitest run src/styles.test.ts
~~~

Expected: the five-column and six-track assertions fail against the four-button layout.

- [ ] **Step 6: Implement the five-button desktop/tablet/mobile grids**

Modify the base `.masthead__controls`, `.view-switcher`, and button declarations in
`web/src/styles.css`:

~~~css
.masthead__controls {
  display: flex;
  min-width: 0;
  gap: 22px;
  align-items: center;
}

.view-switcher {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  min-width: 0;
  border: 1px solid var(--line-soft);
  padding: 3px;
}

.view-switcher button {
  min-width: 0;
  min-height: 44px;
  border: 0;
  padding: 7px 10px 6px;
}
~~~

Retain the established color, type, hover, and current-page declarations around this structural
change.

Add `@media (max-width: 1080px)` immediately before the existing 880 px block. Move the masthead to
a two-row grid at this safer tablet breakpoint so five full labels cannot create an overflow band
just above 880 px:

~~~css
.masthead {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px 18px;
  align-items: center;
}

.masthead__controls {
  display: contents;
}

.view-switcher {
  grid-column: 1 / -1;
  grid-row: 2;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  width: 100%;
}

.node-label {
  grid-column: 2;
  grid-row: 1;
  justify-content: flex-end;
  text-align: right;
}
~~~

In `@media (max-width: 600px)`, retain the two-row masthead but replace the existing four-column
navigation rule:

~~~css
.view-switcher {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.view-switcher button:nth-child(-n + 3) {
  grid-column: span 2;
}

.view-switcher button:nth-child(n + 4) {
  grid-column: span 3;
}
~~~

Keep the existing 880 px block for its dashboard/registry layout rules, but do not duplicate the
masthead placement there. Retain `min-height: 44px`, safe label wrapping, and `min-width: 0`. Do not
add JavaScript viewport logic, label abbreviations, horizontal scrolling, hidden overflow on the
root, or another breakpoint between 600 and 601 px.

Also add a mobile Integrations adjustment in the 600 px block:

~~~css
.integration-boundary {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

.integrations-toolbar,
.integration-telemetry {
  grid-template-columns: minmax(0, 1fr);
}

.integration-refresh {
  width: 100%;
}
~~~

- [ ] **Step 7: Run navigation, style, and full frontend gates**

Run:

~~~bash
env --chdir=web pnpm exec vitest run src/App.navigation.test.tsx src/styles.test.ts
make test-web
env --chdir=web pnpm lint
env --chdir=web pnpm typecheck
env --chdir=web pnpm build
git diff --check
~~~

Expected: navigation ownership, guard preservation, entry/abort behavior, responsive structure, the
complete frontend suite, lint, TypeScript, production build, and whitespace checks all pass.

- [ ] **Step 8: Record and commit Task 6**

Append the exact fifth-view, zero-initial-request, abort/re-entry, guard, 5-column, and 3+2 grid
evidence to `history/BUILD_LOG.md`, then:

~~~bash
git add web/src/App.tsx web/src/App.navigation.test.tsx web/src/styles.css web/src/styles.test.ts history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: integrate fifth dashboard view"
~~~

### Task 7: Safe Configuration Forwarding, Documentation, and Integration Gate

**Files:**
- Modify: `.env.example`
- Modify: `Makefile`
- Modify: `docker-compose.yml`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/SECURITY_NOTES.md`
- Modify: `docs/superpowers/specs/2026-07-19-phase-2a-n8n-health-design.md`
- Modify only if a new incident is actually observed: `docs/FAILURES.md`
- Modify: `history/BUILD_LOG.md`

**Explicit non-files:** Do not modify `backend/pyproject.toml`, `backend/uv.lock`, `web/package.json`,
`web/pnpm-lock.yaml`, ORM models, migrations, repositories, transfer format, either Dockerfile, or
Vite configuration.

- [ ] **Step 1: Add only the intentionally blank example value**

Append exactly this safe placeholder to `.env.example`:

~~~dotenv
N8N_BASE_URL=
~~~

Do not assign localhost, the home server, a token, a key, user information, or a working destination.
Do not open, read, print, copy, or modify `.env`.

- [ ] **Step 2: Forward the optional value only to the API container**

Modify only the API service's `environment` map in `docker-compose.yml`:

~~~yaml
      N8N_BASE_URL: ${N8N_BASE_URL:-}
~~~

Do not add the variable to the web service. Do not add an n8n service, `depends_on`, healthcheck,
published port, network, volume, secret, config, privileged capability, socket, SDK, or host binding.
Keep the existing API and web host ports bound to `127.0.0.1`.

- [ ] **Step 3: Make every repository-controlled Compose build explicit**

Modify the Makefile `build` recipe to:

~~~make
build:
	N8N_BASE_URL= OLLAMA_BASE_URL=http://127.0.0.1:9 docker compose --env-file /dev/null build
	cd web && pnpm build
~~~

Search every tracked Makefile, script, and documentation page for `docker compose`. For each
project-controlled command that renders, builds, starts, stops, or removes the stack, use
`--env-file /dev/null` and an explicit `N8N_BASE_URL=`. A documented configured example may instead
use one explicit, credential-free sample such as
`N8N_BASE_URL=http://host.docker.internal:5678`; it must still use `/dev/null`.

Do not claim `/dev/null` overrides exported variables. The explicit command assignment is the
override.

- [ ] **Step 4: Update future-agent rules without reopening approval boundaries**

Modify `AGENTS.md`:

- extend the UI rule to require `make test-web` before Integrations behavior changes;
- state that maintenance strictly inside the approved Phase 2A design may use the credential-free,
  fixed-path health client;
- continue requiring approval before adding `N8N_API_KEY`, authentication, credentialed n8n API
  calls, workflow/execution/inventory access, provider mutations, generic/request-controlled targets,
  custom health paths, background polling, deployment changes, Docker access, schema changes, or new
  runtime dependencies;
- retain every existing secret, localhost, build-log, conventional-commit, and no-push rule.

- [ ] **Step 5: Update operator documentation and security records**

Update `README.md` so it is accurate for Phase 2A:

1. Change the current phase summary from Phase 1C to Phase 2A and add credential-free n8n health
   observation plus the fifth Integrations view.
2. Extend the architecture diagram with
   `GET /api/integrations/n8n/status -> fixed n8n /healthz and /healthz/readiness`.
3. Add optional n8n to prerequisites without making a live server required.
4. Replace every Compose quickstart/down/build example with explicit safe `N8N_BASE_URL` plus
   `--env-file /dev/null`.
5. Document direct-host configuration:
   `N8N_BASE_URL=http://localhost:5678 make dev-api`.
6. Document Compose configuration:
   `N8N_BASE_URL=http://host.docker.internal:5678 docker compose --env-file /dev/null up --build`.
   Explain that the origin must be reachable from the API container and that changing n8n's network
   bind can increase exposure.
7. Add the environment table row: no default; exact empty means unconfigured; root HTTP(S) origin
   only; no credentials, query, fragment, or custom path.
8. Add `GET /api/integrations/n8n/status` and the four normalized states to the API section.
9. Explain that entering Integrations or explicitly refreshing performs an observation, while
   Overview does not; no polling or retries exist.
10. Add the fixed-path/custom-path limitation, topology disclosure warning, and distinction between
    HTTP observation and authoritative container health.
11. Update Security posture: the backend now has one configuration-selected outbound surface; it
    rejects redirects, ignores proxies, sends no key/cookie/custom header, isolates checks, and does
    not consume provider bodies.
12. Keep no-auth/public-exposure warnings prominent and state that local prompt content, workflow
    links, n8n topology, and exported bundles can all be sensitive.
13. Mark Phase 2A as implemented but final-candidate acceptance pending until Task 8; keep credentialed
    n8n inventory and container visibility explicitly deferred as Phase 2B and Phase 2C.
14. Correct the authoritative design's acceptance criterion 14: application code, application
    containers, unit tests, frontend tests, and the n8n health matrix require no Docker access; only
    the explicitly isolated operator-side Compose acceptance requires a local Docker Engine. Preserve
    the prohibition on Docker socket, SDK, Engine, or CLI access from the application.

Append one dated decision to `docs/DECISIONS.md` covering:

- one provider-specific, process-configured, credential-free n8n origin;
- strict root-origin validation, fixed GET paths, isolated clients, no body consumption, no redirects,
  no ambient proxy, and normalized safe state;
- manual entry/refresh lifecycle with browser abort ownership;
- no schema, persistence, key, generic probing, Docker, mutation, or production exposure.

Append a Phase 2A section to `docs/SECURITY_NOTES.md` covering:

- the narrow SSRF-relevant boundary and why API callers cannot select a target or path;
- accepted local/private topology and the risk of exposing it through the unauthenticated Hub;
- no authorization, cookie propagation, redirects, proxy inheritance, body decoding, TLS bypass,
  browser provider fetch, persistence, or background request;
- unconfigured as safest default;
- requirement for authentication/authorization/TLS and a new security review before network exposure;
- explicit deferral of keys, workflow/execution inventory, and Docker capabilities.

Change the design status to `Implemented; final acceptance pending` and leave every approved behavioral
decision intact. Do not mark it complete yet.

Keep `docs/FAILURES.md` unchanged unless this implementation actually encounters a new product,
dependency, validation, or environment failure not already recorded. If it does, record only the
observed command, symptom, bounded impact, and resolution; never manufacture an incident for symmetry.

- [ ] **Step 6: Verify explicit interpolation with synthetic values only**

Run a tracked-command audit:

~~~bash
rg -n "docker compose" --glob '!docs/superpowers/plans/**' --glob '!history/BUILD_LOG.md'
~~~

Expected: every executable/documented Compose path explicitly supplies `N8N_BASE_URL` and
`--env-file /dev/null`.

Use only a task-created harmless marker to prove Make overrides its command environment:

~~~bash
env N8N_BASE_URL=phase2a-synthetic-marker make -n build
~~~

Expected: the printed build recipe begins with `N8N_BASE_URL=` and does not substitute the marker
into the Compose command. Do not inspect the operator's shell environment.

Render the Compose model with explicit safe values:

~~~bash
N8N_BASE_URL= OLLAMA_BASE_URL=http://127.0.0.1:9 docker compose --env-file /dev/null config
~~~

Expected:

- API environment contains `N8N_BASE_URL: ""`;
- web environment has no `N8N_BASE_URL`;
- there are exactly two services and no n8n service;
- host publishing remains `127.0.0.1`;
- there is no socket, privileged capability, extra secret, or added volume.

Repeat with `N8N_BASE_URL=http://n8n-sentinel:5678` and inspect only the task-owned rendered API
environment. Confirm that exact sample appears only in API configuration. Do not print any ambient or
real protected value.

- [ ] **Step 7: Run every host gate after the cross-domain edits**

Run:

~~~bash
make install
make format
make test
make test-e2e
make test-web
make lint
make typecheck
env --chdir=web pnpm build
N8N_BASE_URL= OLLAMA_BASE_URL=http://127.0.0.1:9 docker compose --env-file /dev/null build
git diff --check
~~~

Expected:

- uv and pnpm use their committed lockfiles;
- formatting is stable;
- backend, e2e, and frontend tests pass without real Ollama or n8n;
- Ruff, ESLint, mypy, TypeScript, Vite, and both images pass;
- manifests and lockfiles remain unchanged.

If any formatting command changes an implementation file, inspect it and rerun that file's focused
tests plus the complete domain gates before proceeding.

- [ ] **Step 8: Prove migration and persistence preservation**

Run the existing migration-preservation test, then use a disposable SQLite file under a
collision-resistant task root. Register cleanup before creating the root so the database, WAL, and
SHM sidecars cannot survive success, failure, or interruption:

~~~bash
set -Eeuo pipefail
IFS= read -r MIGRATION_RUN_ID </proc/sys/kernel/random/uuid
MIGRATION_ROOT="/tmp/local-ai-hub-phase2a-migration-$MIGRATION_RUN_ID"
MIGRATION_DATABASE_URL="sqlite:///$MIGRATION_ROOT/integration.db"
test ! -e "$MIGRATION_ROOT"
cleanup_migration() {
  status=$?
  trap - EXIT HUP INT TERM
  set +e
  case "$MIGRATION_ROOT" in
    "/tmp/local-ai-hub-phase2a-migration-$MIGRATION_RUN_ID")
      test ! -L "$MIGRATION_ROOT" || status=1
      rm -rf "$MIGRATION_ROOT" || status=1
      ;;
    *)
      status=1
      ;;
  esac
  exit "$status"
}
trap cleanup_migration EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$MIGRATION_ROOT"
env --chdir=backend N8N_BASE_URL= uv run pytest tests/e2e/test_migrations.py
env --chdir=backend N8N_BASE_URL= DATABASE_URL="$MIGRATION_DATABASE_URL" uv run alembic upgrade head
env --chdir=backend N8N_BASE_URL= DATABASE_URL="$MIGRATION_DATABASE_URL" uv run alembic check
env --chdir=backend N8N_BASE_URL= DATABASE_URL="$MIGRATION_DATABASE_URL" uv run alembic downgrade 0001
env --chdir=backend N8N_BASE_URL= DATABASE_URL="$MIGRATION_DATABASE_URL" uv run alembic upgrade head
env --chdir=backend N8N_BASE_URL= DATABASE_URL="$MIGRATION_DATABASE_URL" uv run alembic downgrade base
~~~

Exit this migration supervisor normally and prove its exact root is absent. Verify exactly revisions
0001 and 0002 remain and their SHA-256 values are unchanged:

- 0001:
  `4f1e37711a7d7311a6d138023bc014bd7c755e20ca860082c494bd34ba50f8b5`
- 0002:
  `03b30ecf269a7fb716058c477f33acfde1ba4be3a2bca2c0b21072675f3a7407`

Expected: upgrade/check/downgrade/re-upgrade passes with no third revision and no model/table drift.

- [ ] **Step 9: Run one isolated, fail-safe Compose integration observation**

Use one high-entropy Compose project, task-owned free loopback ports, and one reserved temporary
directory. The Docker Engine is used only by this external acceptance procedure; application code
and containers receive no Docker access.

Before creating a temporary file, listener, task process, container, network, or volume, open one
long-lived Bash supervisor. Read a kernel-generated UUID without spawning a helper, refuse every
root/project/ownership-label collision, then register the cleanup trap before creating the root:

~~~bash
set -Eeuo pipefail
umask 077
REPO_ROOT=/home/r3x0r/Desktop/Projects/github_AL_workflow_Hub
IFS= read -r RUN_ID </proc/sys/kernel/random/uuid
ACCEPTANCE_ROOT="/tmp/local-ai-hub-phase2a-acceptance-$RUN_ID"
PROJECT="local-ai-hub-phase2a-$RUN_ID"
OWNER_LABEL="local-ai-hub.phase2a-owner=$RUN_ID"
API_PORT=18080
WEB_PORT=15173
COMPOSE_STARTED=false
ACTIVE_SENTINEL_ID=
ACTIVE_SENTINEL_LOG=
SENTINEL_SEQUENCE=0
declare -A ACTIVE_CHILD_STARTS=()

test ! -e "$ACCEPTANCE_ROOT"
test -z "$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")"
test -z "$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT")"
test -z "$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")"
test -z "$(docker ps -aq --filter "label=$OWNER_LABEL")"

child_start_token() {
  local pid=$1 stat rest
  IFS= read -r stat <"/proc/$pid/stat"
  rest=${stat##*) }
  set -- $rest
  printf '%s\n' "${20}"
}

register_child() {
  local pid=$1 token
  token=$(child_start_token "$pid")
  test -n "$token"
  ACTIVE_CHILD_STARTS["$pid"]=$token
}

stop_child() {
  local pid=$1 expected current attempt
  expected=${ACTIVE_CHILD_STARTS["$pid"]-}
  test -n "$expected" || return 0
  current=
  if test -r "/proc/$pid/stat"; then
    current=$(child_start_token "$pid")
  fi
  if test "$current" = "$expected"; then
    kill -TERM -- "-$pid" >/dev/null 2>&1 || true
    for attempt in {1..50}; do
      kill -0 "$pid" >/dev/null 2>&1 || break
      sleep 0.1
    done
    if kill -0 "$pid" >/dev/null 2>&1; then
      current=$(child_start_token "$pid")
      if test "$current" = "$expected"; then
        kill -KILL -- "-$pid" >/dev/null 2>&1 || true
      fi
    fi
  fi
  wait "$pid" >/dev/null 2>&1 || true
  unset 'ACTIVE_CHILD_STARTS[$pid]'
}

wait_child() {
  local pid=$1 status=0
  wait "$pid" || status=$?
  unset 'ACTIVE_CHILD_STARTS[$pid]'
  return "$status"
}

snapshot_safe_docker_ids() {
  local suffix=$1
  docker ps -aq >"$ACCEPTANCE_ROOT/docker-containers.$suffix"
  docker network ls -q >"$ACCEPTANCE_ROOT/docker-networks.$suffix"
  docker volume ls -q >"$ACCEPTANCE_ROOT/docker-volumes.$suffix"
  LC_ALL=C sort -u -o "$ACCEPTANCE_ROOT/docker-containers.$suffix" "$ACCEPTANCE_ROOT/docker-containers.$suffix"
  LC_ALL=C sort -u -o "$ACCEPTANCE_ROOT/docker-networks.$suffix" "$ACCEPTANCE_ROOT/docker-networks.$suffix"
  LC_ALL=C sort -u -o "$ACCEPTANCE_ROOT/docker-volumes.$suffix" "$ACCEPTANCE_ROOT/docker-volumes.$suffix"
}

cleanup_phase2a() {
  status=$?
  trap - EXIT HUP INT TERM
  set +e
  for pid in "${!ACTIVE_CHILD_STARTS[@]}"; do
    stop_child "$pid"
  done
  if test -n "$ACTIVE_SENTINEL_ID"; then
    if test -n "$ACTIVE_SENTINEL_LOG"; then
      docker logs "$ACTIVE_SENTINEL_ID" >"$ACTIVE_SENTINEL_LOG" 2>&1 || true
    fi
    docker rm -f "$ACTIVE_SENTINEL_ID" >/dev/null 2>&1 || status=1
    ACTIVE_SENTINEL_ID=
    ACTIVE_SENTINEL_LOG=
  fi
  if test "$COMPOSE_STARTED" = true && test -f "$ACCEPTANCE_ROOT/compose.override.yml"; then
    env N8N_BASE_URL= OLLAMA_BASE_URL=http://127.0.0.1:9 PHASE2A_API_PORT="$API_PORT" PHASE2A_WEB_PORT="$WEB_PORT" docker compose --env-file /dev/null -p "$PROJECT" -f "$REPO_ROOT/docker-compose.yml" -f "$ACCEPTANCE_ROOT/compose.override.yml" down --volumes --remove-orphans >/dev/null 2>&1 || status=1
    COMPOSE_STARTED=false
  fi
  test -z "$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")" || status=1
  test -z "$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT")" || status=1
  test -z "$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")" || status=1
  test -z "$(docker ps -aq --filter "label=$OWNER_LABEL")" || status=1
  if test -d "$ACCEPTANCE_ROOT" && test ! -L "$ACCEPTANCE_ROOT"; then
    snapshot_safe_docker_ids after
    comm -23 "$ACCEPTANCE_ROOT/docker-containers.before" "$ACCEPTANCE_ROOT/docker-containers.after" >"$ACCEPTANCE_ROOT/docker-containers.missing"
    comm -23 "$ACCEPTANCE_ROOT/docker-networks.before" "$ACCEPTANCE_ROOT/docker-networks.after" >"$ACCEPTANCE_ROOT/docker-networks.missing"
    comm -23 "$ACCEPTANCE_ROOT/docker-volumes.before" "$ACCEPTANCE_ROOT/docker-volumes.after" >"$ACCEPTANCE_ROOT/docker-volumes.missing"
    test ! -s "$ACCEPTANCE_ROOT/docker-containers.missing" || status=1
    test ! -s "$ACCEPTANCE_ROOT/docker-networks.missing" || status=1
    test ! -s "$ACCEPTANCE_ROOT/docker-volumes.missing" || status=1
  fi
  case "$ACCEPTANCE_ROOT" in
    "/tmp/local-ai-hub-phase2a-acceptance-$RUN_ID")
      rm -rf "$ACCEPTANCE_ROOT"
      ;;
    *)
      status=1
      ;;
  esac
  exit "$status"
}

trap cleanup_phase2a EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$ACCEPTANCE_ROOT"
test -d "$ACCEPTANCE_ROOT"
test ! -L "$ACCEPTANCE_ROOT"
snapshot_safe_docker_ids before
~~~

Every background child must start with `setsid`, then call `register_child "$!"` immediately.
Every normal stop must call `stop_child "$pid"`, which waits and unregisters it; never retain a
historical PID. A sentinel start records the exact returned container ID in
`ACTIVE_SENTINEL_ID`; its normal removal clears that variable. Cleanup touches only the verified
active process groups, exact container ID, exact high-entropy Compose project, and exact
prefix-checked root. It compares only safe Docker ID lists and never inspects unrelated container,
network, or volume configuration.

Choose actually free `API_PORT` and `WEB_PORT` values, replace the illustrative values once, and
prove no listener owns either port before Compose starts. Verify the installed Compose release
supports `!override`; if it does not, record an environment blocker and stop without modifying the
committed Compose file. Do not discover ports by reading ambient protected variables.

After the trap is live, create these two files with `apply_patch`, never in the repository. The
override must replace—not append to—the committed port lists:

~~~yaml
# $ACCEPTANCE_ROOT/compose.override.yml
services:
  api:
    ports: !override
      - "127.0.0.1:${PHASE2A_API_PORT}:8000"
  web:
    ports: !override
      - "127.0.0.1:${PHASE2A_WEB_PORT}:5173"
~~~

Create `sentinel.py` with only Python standard-library imports and this closed behavior:

~~~python
import json
import os
import socket
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODE = os.environ["SENTINEL_MODE"]
HOST = os.environ.get("SENTINEL_HOST", "0.0.0.0")
PORT = int(os.environ.get("SENTINEL_PORT", "5678"))
LIVENESS = "/healthz"
READINESS = "/healthz/readiness"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def _record_request(self) -> None:
        print(
            json.dumps(
                {
                    "method": self.command,
                    "path": self.path,
                    "cookie_present": self.headers.get("Cookie") is not None,
                },
                separators=(",", ":"),
            ),
            flush=True,
        )

    def _reject_method(self) -> None:
        self._record_request()
        self._send(405, {"Allow": "GET"})

    do_HEAD = _reject_method
    do_POST = _reject_method
    do_PUT = _reject_method
    do_PATCH = _reject_method
    do_DELETE = _reject_method

    def do_GET(self) -> None:
        self._record_request()
        if self.path not in {LIVENESS, READINESS}:
            self._send(404)
            return
        if MODE == "delay" and self.path == LIVENESS:
            time.sleep(8)
        if MODE == "readiness_delay" and self.path == READINESS:
            time.sleep(8)
        if MODE == "readiness_close" and self.path == READINESS:
            self.connection.shutdown(socket.SHUT_RDWR)
            self.connection.close()
            return
        if MODE == "redirect" and self.path == LIVENESS:
            self._send(302, {"Location": "/unexpected"})
            return
        if MODE == "liveness_fail" and self.path == LIVENESS:
            self._send(503)
            return
        if MODE == "degraded" and self.path == READINESS:
            self._send(503)
            return
        headers = (
            {"Set-Cookie": "phase2a_cookie=synthetic-sensitive-marker; HttpOnly"}
            if self.path == LIVENESS
            else {}
        )
        self._send(200, headers, b"synthetic-non-json-body-marker")

    def _send(
        self,
        status: int,
        headers: dict[str, str] | None = None,
        body: bytes = b"",
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if body:
            self.wfile.write(body)


ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
~~~

The sentinel's `0.0.0.0` is container-internal only: publish no sentinel port. Add these exact
supervisor functions after creating the override and sentinel:

~~~bash
compose_phase2a() {
  local n8n_value=$1
  shift
  env N8N_BASE_URL="$n8n_value" OLLAMA_BASE_URL=http://127.0.0.1:9 PHASE2A_API_PORT="$API_PORT" PHASE2A_WEB_PORT="$WEB_PORT" docker compose --env-file /dev/null -p "$PROJECT" -f "$REPO_ROOT/docker-compose.yml" -f "$ACCEPTANCE_ROOT/compose.override.yml" "$@"
}

stop_sentinel() {
  test -n "$ACTIVE_SENTINEL_ID" || return 0
  if test -n "$ACTIVE_SENTINEL_LOG"; then
    docker logs "$ACTIVE_SENTINEL_ID" >"$ACTIVE_SENTINEL_LOG" 2>&1 || true
  fi
  docker rm -f "$ACTIVE_SENTINEL_ID" >/dev/null
  ACTIVE_SENTINEL_ID=
  ACTIVE_SENTINEL_LOG=
  rm -f "$ACCEPTANCE_ROOT/sentinel.cid"
}

start_sentinel() {
  local mode=$1 name image_id cid_file log_file failed_id
  test -z "$ACTIVE_SENTINEL_ID"
  ((SENTINEL_SEQUENCE += 1))
  name="$PROJECT-sentinel-$mode"
  cid_file="$ACCEPTANCE_ROOT/sentinel.cid"
  printf -v log_file '%s/sentinel-%03d-%s.log' "$ACCEPTANCE_ROOT" "$SENTINEL_SEQUENCE" "$mode"
  ACTIVE_SENTINEL_LOG=$log_file
  test -z "$(docker ps -aq --filter "name=^/${name}$")"
  test -z "$(docker ps -aq --filter "label=$OWNER_LABEL")"
  image_id=$(compose_phase2a "" images -q api)
  test -n "$image_id"
  rm -f "$cid_file"
  if ! docker run --detach --cidfile "$cid_file" --name "$name" --label "$OWNER_LABEL" --network "${PROJECT}_default" --network-alias n8n-sentinel --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --mount "type=bind,source=$ACCEPTANCE_ROOT/sentinel.py,target=/acceptance/sentinel.py,readonly" --env "SENTINEL_MODE=$mode" "$image_id" python /acceptance/sentinel.py >/dev/null; then
    if test -s "$cid_file"; then
      IFS= read -r ACTIVE_SENTINEL_ID <"$cid_file"
    else
      failed_id=$(docker ps -aq --filter "name=^/${name}$" --filter "label=$OWNER_LABEL")
      if test -n "$failed_id"; then
        ACTIVE_SENTINEL_ID=$failed_id
      fi
    fi
    return 1
  fi
  IFS= read -r ACTIVE_SENTINEL_ID <"$cid_file"
  test -n "$ACTIVE_SENTINEL_ID"
}
~~~

The start function gives each immutable mode a fresh exact name and task-owned log path, then records
the returned container ID before any later assertion. Normal stop and trap cleanup capture only that
container log before removal. Those logs remain only below `$ACCEPTANCE_ROOT` until the same cleanup
deletes the root. The container attaches only to `$PROJECT_default`, uses alias `n8n-sentinel`, binds
only the task-owned sentinel read-only, and has no repository mount, secret, published port, extra
network, or Docker capability. Call `stop_sentinel` before every mode change so no stale name or ID
remains registered.

Then perform and assert this exact Task 7 sequence:

1. Snapshot Docker inventory and prove both selected ports are free.
2. Set `COMPOSE_STARTED=true` immediately before
   `compose_phase2a "" up --build -d`; verify direct and Vite-proxied n8n status return the exact
   unconfigured contract and no sentinel/provider request exists.
3. Call `start_sentinel online`, then run
   `compose_phase2a "http://n8n-sentinel:5678" up -d --force-recreate api web`.
4. Verify direct and proxied Hub routes return the exact online contract. Compare parsed JSON, not
   incidental header ordering.
5. Capture only task-owned container logs. After the direct request, assert exactly one ordered GET
   `/healthz` then GET `/healthz/readiness` pair. After the proxied request, assert exactly one
   additional ordered pair—for four provider requests total. Both readiness rows have
   `cookie_present:false`; no other path or method occurs.
6. Assert the body marker and cookie marker are absent from Hub JSON and API/web logs. Assert the Hub
   emits only its fixed response fields/errors and `Cache-Control: no-store`,
   `Pragma: no-cache`, plus `X-Content-Type-Options: nosniff`.
7. Smoke direct and proxied health, Ollama, Prompt, Workflow Link, and Transfer routes.
8. Exit the supervisor normally so the same trap removes the sentinel first, performs explicit-safe
   Compose down, stops only registered active process groups, and deletes the task root.
9. Outside the supervisor, prove the exact project has no container/network/volume, every
   preexisting Docker object is still present, neither selected port has a listener, the task root
   is absent, and Git is unchanged.

Also exercise an intentional verifier failure immediately after resource creation once: force a
nonzero assertion, allow the trap to run, prove the same cleanup invariants, then start the real run
from a fresh project/root. This validates cleanup on failure instead of only documenting it.

Do not add n8n to Compose, require the home n8n server, connect the sentinel to a non-task-owned
network, run a host sentinel on `0.0.0.0`, or keep any verifier/log file after evidence is recorded.

- [ ] **Step 10: Audit scope, record evidence, and commit Task 7**

Compare manifests, lockfiles, migrations, models, Dockerfiles, Vite config, and the transfer schema
against Task 7's parent. Search changed source and generated logs for authorization headers,
`N8N_API_KEY`, Docker socket/SDK/Engine/CLI access, request-controlled provider targets, provider
links, polling, storage, retries, and response-body reads. Verify no prohibited capability appeared.

Append all exact command counts, versions, migration hashes, safe Compose shape, sentinel request
sequence, cleanup evidence, and the phrase `final-candidate acceptance pending` to
`history/BUILD_LOG.md`. Do not record pass evidence that was not observed.

Stage only the expected files:

~~~bash
git add .env.example Makefile docker-compose.yml AGENTS.md README.md docs/DECISIONS.md docs/SECURITY_NOTES.md docs/superpowers/specs/2026-07-19-phase-2a-n8n-health-design.md history/BUILD_LOG.md
git diff --cached --check
git diff --cached --stat
git commit -m "chore: finalize phase 2a integration"
~~~

If a genuinely new failure was recorded, include `docs/FAILURES.md` in this commit; otherwise leave it
untouched.

### Task 8: Fresh Exact-Candidate Acceptance and Phase 2A Completion

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-19-phase-2a-n8n-health-design.md`
- Modify only for a newly observed incident: `docs/FAILURES.md`
- Modify: `history/BUILD_LOG.md`
- No product-code change unless acceptance exposes a defect

- [ ] **Step 1: Freeze the candidate and create the acceptance matrix**

Record the full hash of `chore: finalize phase 2a integration` as the exact candidate. Require a clean
worktree before testing. Snapshot:

- `git status --short`;
- `git log --oneline` for the Phase 2A range;
- tracked manifest, lockfile, migration, Dockerfile, and Vite-config hashes;
- the list of preexisting Docker containers, networks, and volumes;
- listeners on the task-owned ports selected for acceptance.

Recreate the Task 7 supervisor under a fresh root/project, register its trap before every subordinate
artifact, and repeat the intentional nonzero cleanup self-test. Do not continue until the selected
ports are free, the root is absent, the exact project has no Docker objects, every preexisting object
still exists, and Git is unchanged after that forced failure. Create the real acceptance supervisor
only after this proof. It owns each verified active host process group, the one active sentinel ID,
the Compose project, temporary databases, geckodriver session profile, logs, and checklist. Every
success, assertion failure, signal, or interruption must pass through the same cleanup function.

Extend the recreated supervisor before starting a listener:

~~~bash
CANDIDATE="<full chore-finalize commit hash recorded above>"
HOST_API_PORT=18081
SENTINEL_PORT=15678
GECKO_PORT=14444
printf -v MAX_ORIGIN_HOST 'a%.0s' {1..2041}
MAX_ORIGIN="http://$MAX_ORIGIN_HOST"
test "${#MAX_ORIGIN}" -eq 2048
~~~

Choose five distinct actually free loopback ports for `API_PORT`, `WEB_PORT`, `HOST_API_PORT`,
`SENTINEL_PORT`, and `GECKO_PORT`; replace the illustrative values once and prove all five are
free. The candidate variable must equal `git rev-parse HEAD` and the recorded frozen hash. Use the
closed 2,048-character synthetic origin only for the wrapping checkpoint; never derive it from
ambient configuration. Keep this one real supervisor/root alive through Steps 2–8. Phase-level
teardown stops and unregisters only current children/sentinel resources; it does not invoke the
outer cleanup or delete the root.

Snapshot relevant preexisting ignored directories such as `backend/.venv`, `web/node_modules`,
and `web/dist` by path/existence only. Never enumerate their contents merely for acceptance.

Create a private acceptance checklist mapped one-to-one to all 20 approved design acceptance criteria.
The evidence row for each item must name its command/test/browser assertion and cleanup result. Do not
add an acceptance helper, captured provider body, browser profile, screenshot, log, or generated
artifact to Git.

Store the private checklist and machine-readable evidence only below the task root. The supervisor
must remove them on both success and failure after their observed counts and conclusions—not raw
provider content—have been copied into the same-commit build-log record.

If any product or test defect appears, stop the run, record only an actual new incident when
appropriate, fix it in the smallest conventional commit with its own build-log entry and required
domain checks, then restart every acceptance step from the new exact candidate. Do not reuse passes
from a superseded candidate.
Exit the current supervisor first and prove its complete cleanup before creating the replacement
candidate's fresh supervisor.

- [ ] **Step 2: Repeat dependency, format, test, lint, type, and build gates fresh**

From the clean exact candidate, run:

~~~bash
make install
make format
git diff --exit-code
make test
make test-e2e
make test-web
make lint
make typecheck
uv --directory backend run ruff format --check .
env --chdir=web pnpm build
make build
git status --short
~~~

Expected:

- dependency installation uses uv and pnpm lockfiles without modification;
- formatting leaves the exact candidate unchanged;
- all backend, e2e, and frontend tests pass; record actual counts and file counts;
- Ruff, mypy, ESLint, TypeScript, Vite, and Compose image builds pass;
- `make build` visibly uses explicit blank `N8N_BASE_URL` and `/dev/null`;
- no dependency, cache, build, or generated path becomes tracked or Git-visible as untracked;
- preexisting ignored dependency directories may be reused by installation and must not be deleted;
- only task-created acceptance artifacts are removed;
- the tracked candidate and lockfiles remain byte-identical.

- [ ] **Step 3: Repeat the complete backend observation matrix without a real n8n server**

Run the focused Settings, client, and API suites separately so their evidence is visible:

~~~bash
uv --directory backend run pytest -q tests/unit/test_config.py
uv --directory backend run pytest -q tests/unit/test_n8n_client.py
uv --directory backend run pytest -q tests/e2e/test_integrations_api.py
~~~

Then exercise the committed API through a disposable task-owned HTTP sentinel. Bind any host-side
sentinel only to `127.0.0.1`; never `0.0.0.0`. Its handler records only method, fixed path, request
count, and Cookie-header presence, while response body/cookie markers stay synthetic and private to
the verifier.

Restart the API with an explicit process value for each configuration case and verify:

| Case | Expected provider calls | Expected normalized result |
| --- | ---: | --- |
| missing / exact empty | 0 | unconfigured / not_checked / not_checked |
| whitespace / invalid URL | 0 | offline / invalid sentinel / not_checked |
| both exact 200 | 2 in order | online / passed / passed |
| liveness non-200 | 1 | offline / failed / not_checked |
| liveness redirect | 1 and no follow | offline / failed / not_checked |
| liveness connection failure | 1 attempt | offline / Connection failed |
| liveness hard timeout | 1 attempt | offline / Connection failed |
| readiness non-200 | 2 in order | degraded / passed / failed |
| readiness connection/timeout | 2 in order | degraded / passed / failed |

For exact 200, return deliberately non-JSON marker bytes. For liveness, return a synthetic sensitive
`Set-Cookie`; assert readiness receives no Cookie. Assert no response body, cookie value, raw invalid
configuration, exception, header, or reason phrase appears in Hub JSON or API logs. Confirm every
request is GET and no path other than `/healthz` then `/healthz/readiness` occurs.

Run every host case under the outer supervisor and its exact `sentinel.py`. Add these phase helpers;
all output paths and the SQLite database stay below the reserved root:

~~~bash
HOST_DATABASE_URL="sqlite:///$ACCEPTANCE_ROOT/host-matrix.db"
ACTIVE_HOST_SENTINEL_PID=
ACTIVE_HOST_API_PID=

start_host_sentinel() {
  local mode=$1
  test -z "$ACTIVE_HOST_SENTINEL_PID"
  setsid env --chdir=backend SENTINEL_MODE="$mode" SENTINEL_HOST=127.0.0.1 SENTINEL_PORT="$SENTINEL_PORT" uv run python "$ACCEPTANCE_ROOT/sentinel.py" >"$ACCEPTANCE_ROOT/host-sentinel-$mode.log" 2>&1 &
  ACTIVE_HOST_SENTINEL_PID=$!
  register_child "$ACTIVE_HOST_SENTINEL_PID"
}

start_host_api() {
  local case_name=$1 case_value=$2
  test -z "$ACTIVE_HOST_API_PID"
  setsid env --chdir=backend N8N_BASE_URL="$case_value" OLLAMA_BASE_URL=http://127.0.0.1:9 DATABASE_URL="$HOST_DATABASE_URL" uv run fastapi run src/local_ai_hub/api/main.py --host 127.0.0.1 --port "$HOST_API_PORT" >"$ACCEPTANCE_ROOT/host-api-$case_name.log" 2>&1 &
  ACTIVE_HOST_API_PID=$!
  register_child "$ACTIVE_HOST_API_PID"
}

start_host_api_missing() {
  test -z "$ACTIVE_HOST_API_PID"
  setsid env --chdir=backend --unset=N8N_BASE_URL OLLAMA_BASE_URL=http://127.0.0.1:9 DATABASE_URL="$HOST_DATABASE_URL" uv run fastapi run src/local_ai_hub/api/main.py --host 127.0.0.1 --port "$HOST_API_PORT" >"$ACCEPTANCE_ROOT/host-api-missing.log" 2>&1 &
  ACTIVE_HOST_API_PID=$!
  register_child "$ACTIVE_HOST_API_PID"
}

stop_host_processes() {
  if test -n "$ACTIVE_HOST_API_PID"; then
    stop_child "$ACTIVE_HOST_API_PID"
    ACTIVE_HOST_API_PID=
  fi
  if test -n "$ACTIVE_HOST_SENTINEL_PID"; then
    stop_child "$ACTIVE_HOST_SENTINEL_PID"
    ACTIVE_HOST_SENTINEL_PID=
  fi
}
~~~

For exact empty call `start_host_api empty ""`; for invalid call
`start_host_api invalid " invalid synthetic URL "` without printing ambient configuration. Use
`online`, `liveness_fail`, `redirect`, `delay`, `degraded`, `readiness_close`, and
`readiness_delay` as fresh sentinel modes. The connection-failure case targets the proven-free
sentinel port with no sentinel. Stop each API/sentinel through `stop_host_processes` before reusing
a port; it waits and immediately unregisters both active PIDs.

For every row, use a fixed curl timeout longer than the client's hard deadline, parse the exact Hub
JSON with a task-owned Node standard-library verifier, count only sentinel JSON log lines, and scan
the matching task-owned API log for forbidden synthetic markers. Do not compare incidental uvicorn
timestamps. After the final row, call `stop_host_processes` and prove both host ports are free.
Keep the root/trap alive; database, sidecars, and logs remain cleanup-owned until the final audit.

- [ ] **Step 4: Repeat migration and schema preservation from the exact candidate**

Repeat the upgrade/check/downgrade/re-upgrade/base lifecycle with
`DATABASE_URL="sqlite:///$ACCEPTANCE_ROOT/migration-matrix.db"` on every Alembic command. Keep the
database and sidecars inside the live outer supervisor root; do not create another fixed `/tmp`
path. Recompute and compare both committed migration hashes:

- 0001:
  `4f1e37711a7d7311a6d138023bc014bd7c755e20ca860082c494bd34ba50f8b5`
- 0002:
  `03b30ecf269a7fb716058c477f33acfde1ba4be3a2bca2c0b21072675f3a7407`

Run `alembic check` at head. Verify Prompt, Workflow Link, and transfer tests remain green, there is no
revision after 0002, and no integration table/column/index. Remove only this database and its
sidecars after the matrix, then keep the outer supervisor/root alive for Compose and Firefox.

- [ ] **Step 5: Repeat isolated direct/proxied Compose acceptance**

Use the still-live fresh outer supervisor/project, its free loopback ports, `compose_phase2a`,
`start_sentinel`, and `stop_sentinel`. Every Compose call therefore has explicit
`OLLAMA_BASE_URL=http://127.0.0.1:9`, explicit `N8N_BASE_URL`, and `--env-file /dev/null`.

1. Set `COMPOSE_STARTED=true` before the first `up`. Prove blank configuration returns the exact
   unconfigured contract through both
   `127.0.0.1:<api-port>` and `127.0.0.1:<web-port>`.
2. Attach a no-port sentinel container made from the already built API image to only this project's
   network.
3. For online, degraded, liveness non-200, redirect, and delay, remove the prior task-owned sentinel
   and start one fresh container with that immutable `SENTINEL_MODE`. Recreate only the task-owned
   Hub services when changing process configuration; never add a mutable mode-control endpoint.
4. For each mode, compare direct and Vite-proxied JSON byte-for-semantic-byte, headers, state/check
   combination, and fixed error.
5. Prove each individual online observation makes two ordered GETs; the direct and proxied requests
   therefore produce two pairs. Each liveness failure observation makes one request and each
   degraded observation makes two; redirects are not followed, delay maps safely, and readiness
   never receives the liveness cookie.
6. Prove marker bodies/cookies are absent from API/web JSON and logs.
7. Smoke direct and proxied `/health`, Ollama, Prompt, Workflow Link, and Transfer behavior.
8. Inspect the rendered stack: two services only; n8n value only in API; loopback host publishing;
   no Docker socket, privileged mode, added capability, API key, n8n container, secret, or public port.
9. Call `stop_sentinel`, force-recreate the API with explicit blank n8n configuration, and leave the
   two-service stack running for the Firefox phase. Do not invoke outer cleanup or remove the
   override/root.
10. Compare only safe current Docker ID lists to the pre-run lists and prove every preexisting ID
    remains. Final task-owned object absence is checked after Step 8 outer cleanup.

- [ ] **Step 6: Run real Firefox functional acceptance**

Use the installed real Firefox and geckodriver against the isolated Vite URL, with a fresh task-owned
profile that is deleted afterward. Browser automation must not disable TLS, CORS, or security
features.

Before creating or launching the verifier, read and encode every requirement in both Steps 6 and 7.
The functional flow and exact viewport matrix are one continuous WebDriver session; the verifier
must not send `DONE` until both are complete.

After the Task 5 stack is ready, create `$ACCEPTANCE_ROOT/firefox_acceptance.mjs` with `apply_patch`.
It must use only Node built-ins and the W3C WebDriver HTTP protocol; do not install Selenium,
Playwright, an npm package, or a browser extension. Create two task-owned FIFOs after the outer trap
is live. Snap geckodriver cannot use a host-created profile subdirectory, so use its verified `/tmp`
profile root and let the one WebDriver session own the generated profile:

~~~bash
COMMAND_FIFO="$ACCEPTANCE_ROOT/browser.commands"
ACK_FIFO="$ACCEPTANCE_ROOT/browser.acks"
EVIDENCE_PATH="$ACCEPTANCE_ROOT/firefox-evidence.json"
mkfifo "$COMMAND_FIFO" "$ACK_FIFO"
setsid geckodriver --host 127.0.0.1 --port "$GECKO_PORT" --profile-root /tmp >"$ACCEPTANCE_ROOT/geckodriver.log" 2>&1 &
GECKO_PID=$!
register_child "$GECKO_PID"
DRIVER_URL="http://127.0.0.1:$GECKO_PORT"
HUB_URL="http://127.0.0.1:$WEB_PORT"
~~~

Wait for `$DRIVER_URL/status` with a bounded localhost-only readiness loop. The verifier must create
exactly one session with this capability body and fail if Firefox reports
`acceptInsecureCerts: true`, a proxy, or a non-Firefox browser:

~~~json
{
  "capabilities": {
    "alwaysMatch": {
      "browserName": "firefox",
      "acceptInsecureCerts": false,
      "moz:firefoxOptions": { "args": ["-headless"] }
    }
  }
}
~~~

Implement small `webdriver(method, path, body)`, `execute(script, args)`,
`executeAsync(script, args)`, `setWindowRect(width, height)`, `resourceEntries()`,
`requestState(state)`, and `ackState(state)` helpers around the session ID and the two FIFOs. Use
WebDriver element lookup/click, Actions keyboard input, computed-role, and computed-label endpoints
for interaction and accessibility; use JavaScript execution only to observe DOM rectangles, scroll
widths, resource timing, focus, live regions, and storage. Never inject app state, replace `fetch`,
bypass a guard, or request the provider from the browser.

The Node verifier writes exactly one newline command, then waits for its matching acknowledgement
before continuing. Its closed command vocabulary is:

~~~text
SET unconfigured
SET invalid
SET online
SET degraded
SET offline
SET delay
SET max_origin
SET hub_down
DONE
~~~

Add this exact supervisor-side state function. It is the only temporary verifier component allowed
to invoke Docker; the Node/Firefox process never does:

~~~bash
set_browser_state() {
  local state=$1 sentinel_mode= n8n_value= ready=false attempt
  stop_sentinel
  case "$state" in
    unconfigured)
      n8n_value=
      ;;
    invalid)
      n8n_value=" invalid synthetic URL "
      ;;
    max_origin)
      n8n_value="$MAX_ORIGIN"
      ;;
    online)
      sentinel_mode=online
      ;;
    degraded)
      sentinel_mode=degraded
      ;;
    offline)
      sentinel_mode=liveness_fail
      ;;
    delay)
      sentinel_mode=delay
      ;;
    hub_down)
      compose_phase2a "" stop api
      return
      ;;
    *)
      return 1
      ;;
  esac
  if test -n "$sentinel_mode"; then
    start_sentinel "$sentinel_mode"
    n8n_value=http://n8n-sentinel:5678
  fi
  compose_phase2a "$n8n_value" up -d --force-recreate api
  for attempt in {1..50}; do
    if curl --silent --fail --max-time 1 "http://127.0.0.1:$API_PORT/health" >/dev/null; then
      ready=true
      break
    fi
    sleep 0.1
  done
  test "$ready" = true
}
~~~

Start the verifier in its own registered process group, passing the driver URL explicitly:

~~~bash
setsid node "$ACCEPTANCE_ROOT/firefox_acceptance.mjs" "$DRIVER_URL" "$HUB_URL" "http://n8n-sentinel:5678" "$MAX_ORIGIN" "$CANDIDATE" "$COMMAND_FIFO" "$ACK_FIFO" "$EVIDENCE_PATH" >"$ACCEPTANCE_ROOT/firefox-verifier.log" 2>&1 &
BROWSER_PID=$!
register_child "$BROWSER_PID"
exec 7<>"$COMMAND_FIFO"
exec 8<>"$ACK_FIFO"
while true; do
  if ! IFS= read -r -t 30 command <&7; then
    test -r "/proc/$BROWSER_PID/stat"
    test "$(child_start_token "$BROWSER_PID")" = "${ACTIVE_CHILD_STARTS[$BROWSER_PID]}"
    continue
  fi
  case "$command" in
    "SET "*)
      state=${command#SET }
      case "$state" in
        unconfigured|invalid|online|degraded|offline|delay|max_origin|hub_down) ;;
        *) false ;;
      esac
      set_browser_state "$state"
      printf 'READY %s\n' "$state" >&8
      ;;
    DONE)
      printf 'DONE\n' >&8
      break
      ;;
    *)
      false
      ;;
  esac
done
exec 7>&-
exec 8>&-
wait_child "$BROWSER_PID"
BROWSER_PID=
~~~

Before each lifecycle assertion, the Node verifier calls `performance.clearResourceTimings()`.
Count entries whose URL origin equals the isolated Vite origin and whose path is exactly
`/api/integrations/n8n/status`; separately assert no entry uses the rendered provider origin.
Cross-check each count against task-owned API access logs and the sentinel's fixed-path JSON lines,
so an aborted or failed request cannot disappear from evidence merely because Resource Timing omits
it. The same browser session must span online-to-failure stale-state and delay/leave/re-entry cases.

Write exactly one private JSON evidence document below the task root containing: candidate and tool
versions; request counts for initial load, each entry, refresh, idle wait, and provider-origin
resources; visible state/check/error text; computed roles/labels/live-region text; focus owner;
before/after storage key counts; guard outcomes; returned `moz:profile`; checkpoint/ack sequence;
and the viewport rectangle matrix. Store no provider body, cookie value, private page content,
screenshot, or ambient environment value.

In a `finally` block, the Node verifier must send `DONE`, consume its acknowledgement, DELETE the
WebDriver session, and assert a host-visible returned temporary profile is absent after deletion.
`DONE` is permitted only after the Step 7 viewport matrix has completed and its evidence is written;
Step 6 must not tear down or wait out the verifier before then. If snap namespace isolation makes
that path host-invisible, record that fact and rely on session
deletion plus process-group teardown. After `wait_child "$BROWSER_PID"`, call
`stop_child "$GECKO_PID"`, clear `GECKO_PID`, and verify only those recorded PIDs/groups are absent;
never enumerate unrelated process command lines. Any verifier or IPC assertion failure exits
nonzero and exercises the outer trap.

Verify this operator flow:

1. Initial Overview load makes zero `/api/integrations/n8n/status` requests.
2. Integrations button is the sole current page after activation and starts exactly one request.
3. Unconfigured guidance is visible with no input, link, clipboard, credential, or provider action.
4. Online, degraded, offline, and invalid-configuration states display their exact state,
   liveness/readiness text, inert safe origin, and sanitized fixed copy.
5. Refresh is disabled and says `Checking n8n` while pending; focus stays on it afterward.
6. Manual refresh makes exactly one Hub request and no automatic retry or timer request follows after
   advancing/waiting beyond the normal observation duration.
7. After a successful snapshot, a failing refresh keeps the old origin/state/time and announces the
   fixed stale warning politely.
8. Stop/delay the Hub response, leave Integrations, and prove the browser request aborts without a
   stale UI update or confirmation dialog.
9. Re-entry starts one new observation and the newest completion owns the card.
10. Prompt, Workflow, and Transfer dirty/pending guards block Integrations exactly as they block other
    destinations. Leaving Integrations itself needs no confirmation.
11. Browser network records contain only the relative Hub status path, never the rendered n8n origin.
12. `localStorage`, `sessionStorage`, Cache Storage, IndexedDB, and service-worker registrations do
    not gain integration data.

Record accessible-role/name assertions and the polite live-region text. Do not record or commit
private page data.

- [ ] **Step 7: Run the exact Firefox viewport matrix**

Firefox 152 enforces a 500 px outer-window minimum, so `setWindowRect(320, 900)` cannot create the
approved 320 px CSS viewport. Do not treat requested outer dimensions as evidence. Instead, use a
real, unmodified cross-origin frame browsing context:

1. Send `SET max_origin` and wait for `READY max_origin`; assert the synthetic origin is exactly
   2,048 characters before navigating.
2. For each target width, set the outer headless window large enough to contain the target, navigate
   the top context to a `data:text/html` document whose only visible child is a borderless iframe
   with exact CSS/attribute width `<target>px`, height `900px`, and `src=HUB_URL`.
3. Switch to the iframe with WebDriver, wait for the real Vite app, and assert
   `window.innerWidth === target` and `window.innerHeight === 900` before collecting any geometry.
   This harness sizes a real Firefox document viewport; it neither injects app state nor changes
   browser security.
4. Load Integrations and assert the exact maximum origin is rendered as inert text. At that same
   width, request and acknowledge unconfigured, online, degraded, and offline checkpoints, refresh
   through the real Hub, and assert each textual state.
5. Switch back to the top context before creating the next exact iframe.

Test widths `320`, `600`, `601`, `880`, `881`, `1024`, `1080`, `1081`, and `1280`.
At every exact iframe width assert:

- document/body scroll width is no greater than client width;
- every masthead/navigation/view/card/toolbar/telemetry bound stays inside the viewport;
- all five navigation buttons are visible, keyboard reachable, at least 44 CSS px high, and have
  non-overlapping rectangles;
- the exact 2,048-character origin wraps inside the card without an anchor or root overflow;
- online/degraded/offline/unconfigured labels remain textual and visible;
- focus indicator is not clipped.

At 320 and 600 px, assert Overview/Prompts/Workflows share the first row and Transfer/Integrations
share the second row in the approved 3+2 six-track structure. At 601, 880, 881, 1024, and 1080 px,
assert all five buttons share one row and the whole navigation group is below the brand/node
metadata. At 1081 and 1280 px, assert all five buttons remain on one row and the group is inline with
metadata. This measures both sides of the old 880 px edge and both sides of the new 1080 px reflow.

Capture requested outer size, actual outer/inner/client size, iframe rectangle, every relevant
element rectangle, and scroll widths in the private evidence. Fail on any dimension mismatch;
requested WebDriver dimensions alone never count. Screenshots are optional debugging artifacts only
and must be removed by the outer trap.

- [ ] **Step 8: Run the 20-point scope, artifact, and security audit**

Map evidence explicitly:

1. blank -> zero requests;
2. invalid -> zero requests;
3. only credential-free root HTTP(S) origin accepted;
4. only the two fixed GET paths;
5. redirect/proxy/TLS/timeout/cookie/body policies;
6. exact four-state table;
7. strict route JSON and privacy headers;
8. zero request outside Integrations;
9. entry/manual-only lifecycle;
10. abort and generation ownership;
11. Hub error distinct from provider state;
12. inert origin and no browser provider request;
13. accessible overflow-free five-view matrix;
14. no live n8n, API key, or internet requirement; no Docker requirement for unit/frontend gates,
    with local Docker used only for the isolated Compose acceptance;
15. no dependency/schema/mutation/generic target/public/auth/production drift;
16. explicit Compose config and API-only forwarding;
17. Phase 1 regression/migration/Compose preservation;
18. accurate docs/history/security;
19. complete disposable cleanup and clean Git;
20. conventional commits and no push.

Run targeted repository scans and compare the exact candidate to the parent design commit. Confirm:

- backend/frontend manifests and lockfiles are unchanged;
- migrations, models, repositories, transfer version, Dockerfiles, and Vite config are unchanged;
- no `N8N_API_KEY`, authorization/custom provider header, browser provider fetch, saved-link probe,
  arbitrary target/path, retry, polling, provider persistence, mutation method, Docker
  socket/SDK/Engine/CLI, privileged capability, TLS bypass, public host bind, auth, or production
  proxy was added;
- only `.env.example` is tracked among environment files;
- no database, dependency directory, build output, cache, bytecode, profile, log, certificate, key,
  credential, or secret artifact is tracked or Git-visible as untracked;
- preexisting ignored dependency/cache/build directories are preserved, and only task-created
  acceptance artifacts are removed;
- no task-owned process, listener, file, database, container, network, or volume remains;
- Git has no remote/upstream/push action and the worktree is still clean.

Use path-aware scans and manually review matches so documentation/non-goal mentions are not mistaken
for capabilities.

Before item 19 can pass, copy only derived counts, hashes, state/request conclusions, rectangle
measurements, and tool versions into the implementation worker's transient notes. Do not copy raw
provider/log/profile content. Call `stop_sentinel` if it is active, confirm the browser and
geckodriver PIDs were already waited/unregistered, then exit the one outer supervisor normally.
Its trap must perform the only final Compose down, safe-ID preservation comparison, project/owner
absence checks, database/log/profile/root removal, and listener teardown.

From a fresh ordinary shell, require the supervisor exit status to be zero and prove: the exact root
is absent; safe project/owner-label queries return no IDs; all five selected ports are free; every
preexisting safe Docker ID was preserved according to the trap; preexisting ignored dependency paths
still have their original existence state; and `git status --short` is empty. Do not run Docker
inspect or enumerate unrelated process command lines. If any cleanup assertion fails, item 19 and the
entire candidate fail; fix the verifier/product as appropriate and restart from Step 1.

- [ ] **Step 9: Mark the accepted phase and record only observed evidence**

After every prior step passes from the same candidate:

- change the design status to `Implemented and accepted`;
- update README validation/current-status/roadmap with actual test counts, tool versions, exact
  candidate hash, Compose matrix, Firefox matrix, cleanup, and Phase 2B/2C deferral;
- append one final acceptance entry to `history/BUILD_LOG.md` with all fresh commands, observed counts,
  hashes, state/request matrices, privacy evidence, viewport measurements, scope audit, cleanup, and
  candidate hash;
- include any truly observed new failure/resolution in `docs/FAILURES.md`, otherwise leave it
  unchanged.

Run documentation whitespace and content consistency checks. Stage only these records:

~~~bash
git add README.md docs/superpowers/specs/2026-07-19-phase-2a-n8n-health-design.md history/BUILD_LOG.md
git diff --cached --check
git diff --cached --stat
git commit -m "test: record phase 2a acceptance validation"
~~~

Add `docs/FAILURES.md` only if it genuinely changed for a new observed incident.

- [ ] **Step 10: Perform final handoff audit**

Run:

~~~bash
git status --short
git log --oneline --decorate -12
git ls-files
git remote
~~~

Expected:

- status output is empty;
- the design-plan commit and every planned Phase 2A conventional commit are present;
- no generated or secret path is tracked;
- no remote exists or push occurred.

Produce the final file tree from tracked paths, list full commit hashes/messages for the Phase 2A
range, summarize the four normalized states and fifth view, identify Phase 2B credentialed inventory
as the next design milestone, and state that no real n8n server was required. Do not start Phase 2B
without a new brainstorming/design approval.

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
        if base_url is None or base_url == "":
            configured = False
            request_base_url = None
        else:
            configured = True
            request_base_url = _normalize_base_url(base_url)
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

        transport = self._transport_factory() if self._transport_factory is not None else None
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

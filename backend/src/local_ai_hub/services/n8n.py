"""Credential-free, read-only n8n liveness and readiness observation."""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from ipaddress import AddressValueError, IPv4Address, IPv6Address
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


def _is_legacy_ipv4_number(value: str) -> bool:
    if value.startswith(("0x", "0X")):
        hexadecimal = value[2:]
        return all(character in "0123456789abcdefABCDEF" for character in hexadecimal)
    return bool(value) and value.isascii() and value.isdigit()


def _compress_pure_hex_ipv6(address: IPv6Address) -> str:
    hexadecimal = f"{int(address):032x}"
    hextets = [hexadecimal[index : index + 4].lstrip("0") or "0" for index in range(0, 32, 4)]

    best_start = -1
    best_length = 0
    current_start = -1
    for index, hextet in enumerate([*hextets, "end"]):
        if hextet == "0":
            if current_start == -1:
                current_start = index
            continue
        if current_start != -1:
            current_length = index - current_start
            if current_length > best_length:
                best_start = current_start
                best_length = current_length
            current_start = -1

    if best_length < 2:
        return ":".join(hextets)

    left = ":".join(hextets[:best_start])
    right = ":".join(hextets[best_start + best_length :])
    return f"{left}::{right}"


def _normalize_host(host: str) -> str | None:
    if host.endswith(".") or any(marker in host for marker in ("%", "\\", "^", "|")):
        return None

    if ":" in host:
        try:
            return _compress_pure_hex_ipv6(IPv6Address(host))
        except AddressValueError:
            return None

    try:
        ipv4 = IPv4Address(host)
    except AddressValueError:
        if _is_legacy_ipv4_number(host.rsplit(".", maxsplit=1)[-1]):
            return None
        return host
    canonical_ipv4 = str(ipv4)
    return canonical_ipv4 if host == canonical_ipv4 else None


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
            request_base_url = normalize_n8n_origin(base_url)
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

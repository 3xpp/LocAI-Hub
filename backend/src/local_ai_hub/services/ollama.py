"""Safe, read-only access to the local Ollama HTTP API."""

from dataclasses import dataclass
from typing import cast

import httpx

INVALID_BASE_URL_DISPLAY = "Invalid configuration"
INVALID_BASE_URL_ERROR = "Invalid Ollama base URL"


def _normalize_base_url(base_url: str) -> str | None:
    """Return a canonical safe HTTP URL, or fail closed without reflecting input."""

    if base_url != base_url.strip() or any(marker in base_url for marker in ("@", "?", "#")):
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
        or (port is not None and not 1 <= port <= 65535)
    ):
        return None

    canonical = httpx.URL(scheme=parsed.scheme, host=parsed.host, port=port)
    return str(canonical).removesuffix("/")


@dataclass(frozen=True, slots=True)
class OllamaStatus:
    """Normalized Ollama reachability state."""

    online: bool
    base_url: str
    error: str | None


@dataclass(frozen=True, slots=True)
class OllamaModel:
    """The model metadata exposed by the Phase 0 API."""

    name: str
    modified_at: str | None
    size: int | None


@dataclass(frozen=True, slots=True)
class OllamaModelsResult:
    """A normalized model listing or a safe user-facing error."""

    models: tuple[OllamaModel, ...]
    error: str | None


class OllamaClientError(Exception):
    """An Ollama failure safe to expose through the local dashboard."""


class OllamaClient:
    """Query Ollama without exposing transport or upstream response details."""

    def __init__(
        self,
        base_url: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 3.0,
    ) -> None:
        normalized_base_url = _normalize_base_url(base_url)
        self._request_base_url = normalized_base_url
        self.base_url = normalized_base_url or INVALID_BASE_URL_DISPLAY
        self.transport = transport
        self.timeout = timeout

    async def get_status(self) -> OllamaStatus:
        """Return reachability without allowing Ollama failures to escape."""

        try:
            await self._fetch_tags()
        except OllamaClientError as exc:
            return OllamaStatus(False, self.base_url, str(exc))
        return OllamaStatus(True, self.base_url, None)

    async def list_models(self) -> OllamaModelsResult:
        """Return a minimal model list while ignoring unsupported fields."""

        try:
            payload = await self._fetch_tags()
        except OllamaClientError as exc:
            return OllamaModelsResult((), str(exc))

        raw_models = payload["models"]
        if not isinstance(raw_models, list):
            return OllamaModelsResult((), "Invalid response from Ollama")

        normalized: list[OllamaModel] = []
        for raw_model in raw_models:
            if not isinstance(raw_model, dict):
                continue
            item = cast(dict[str, object], raw_model)
            name = item.get("name")
            if not isinstance(name, str) or not name.strip():
                continue
            modified_at = item.get("modified_at")
            size = item.get("size")
            normalized.append(
                OllamaModel(
                    name=name,
                    modified_at=modified_at if isinstance(modified_at, str) else None,
                    size=size if isinstance(size, int) and not isinstance(size, bool) else None,
                )
            )
        return OllamaModelsResult(tuple(normalized), None)

    async def _fetch_tags(self) -> dict[str, object]:
        if self._request_base_url is None:
            raise OllamaClientError(INVALID_BASE_URL_ERROR)

        try:
            async with httpx.AsyncClient(
                base_url=self._request_base_url,
                timeout=self.timeout,
                transport=self.transport,
                trust_env=False,
            ) as client:
                response = await client.get("/api/tags")
                response.raise_for_status()
        except httpx.RequestError as exc:
            raise OllamaClientError("Connection failed") from exc
        except httpx.HTTPStatusError as exc:
            raise OllamaClientError("Ollama request failed") from exc

        try:
            payload: object = response.json()
        except ValueError as exc:
            raise OllamaClientError("Invalid response from Ollama") from exc
        if not isinstance(payload, dict) or "models" not in payload:
            raise OllamaClientError("Invalid response from Ollama")
        return cast(dict[str, object], payload)

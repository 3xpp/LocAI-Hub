"""Credentialed, bounded, read-only n8n workflow summary inventory."""

import asyncio
import json
import math
import time
import unicodedata
from collections.abc import Awaitable, Callable
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
type JsonValue = None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]


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
    return 1 <= len(value) <= maximum and all(0x21 <= ord(character) <= 0x7E for character in value)


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


async def _close_before_deadline(
    operation: Callable[[], Awaitable[None]],
    *,
    clock: Callable[[], float],
    deadline: float,
) -> None:
    async with asyncio.timeout(max(deadline - clock(), 0.0)):
        await operation()


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
    if encodings and (len(encodings) != 1 or encodings[0].strip().lower() != "identity"):
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
            len(normalized_length) == len(remaining_text) and normalized_length > remaining_text
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
        unicodedata.category(character) == "Cc" or 0xD800 <= ord(character) <= 0xDFFF
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

        client: httpx.AsyncClient | None = None
        response: httpx.Response | None = None
        body_result: bytes | None = None
        operation_error: BaseException | None = None

        try:
            try:
                transport = (
                    self._transport_factory() if self._transport_factory is not None else None
                )
                remaining = _check_deadline(self._monotonic, deadline)
                client = httpx.AsyncClient(
                    base_url=base_url,
                    timeout=httpx.Timeout(remaining),
                    transport=transport,
                    trust_env=False,
                    verify=True,
                    follow_redirects=False,
                )
                request = client.build_request(
                    "GET",
                    _N8N_WORKFLOWS_PATH,
                    params=params,
                    headers=headers,
                )
                remaining = _check_deadline(self._monotonic, deadline)
                async with asyncio.timeout(remaining):
                    response = await client.send(request, stream=True)
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
                    body_result = bytes(body)
            except BaseException as error:
                operation_error = error

            cleanup_error: BaseException | None = None
            if response is not None:
                try:
                    await _close_before_deadline(
                        response.aclose,
                        clock=self._monotonic,
                        deadline=deadline,
                    )
                except BaseException as error:
                    cleanup_error = error
            if client is not None:
                try:
                    await _close_before_deadline(
                        client.aclose,
                        clock=self._monotonic,
                        deadline=deadline,
                    )
                except BaseException as error:
                    if (
                        cleanup_error is None
                        or isinstance(error, asyncio.CancelledError)
                        or (
                            isinstance(error, TimeoutError)
                            and not isinstance(cleanup_error, asyncio.CancelledError)
                        )
                    ):
                        cleanup_error = error

            if operation_error is not None and not isinstance(operation_error, Exception):
                raise operation_error
            if cleanup_error is not None and not isinstance(cleanup_error, Exception):
                raise cleanup_error
            if cleanup_error is not None:
                raise cleanup_error
            if operation_error is not None:
                raise operation_error
            if body_result is None:
                raise RuntimeError("inventory page exited without a body or error")
            return body_result
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

                if page_number == MAX_N8N_WORKFLOW_PAGES or len(items) == MAX_N8N_WORKFLOW_ITEMS:
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

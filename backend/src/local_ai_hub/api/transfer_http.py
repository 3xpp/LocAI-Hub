"""Bounded raw request and privacy-safe response helpers for registry transfers."""

import json
from dataclasses import dataclass

from fastapi import Request
from fastapi.responses import Response
from pydantic import BaseModel

from local_ai_hub.api.transfer_schemas import (
    TransferContractError,
    TransferErrorDetailResponse,
    TransferErrorResponse,
)
from local_ai_hub.services.transfer import MAX_BUNDLE_BYTES


@dataclass(frozen=True, slots=True)
class TransferHttpProblem(Exception):
    """A fixed safe HTTP boundary failure."""

    status_code: int
    code: str
    message: str


def _unsupported_media_type() -> TransferHttpProblem:
    return TransferHttpProblem(
        415,
        "unsupported_media_type",
        "Content-Type must be UTF-8 JSON.",
    )


def validate_json_media_type(value: str | None) -> None:
    """Accept only JSON with no parameter or one explicit UTF-8 charset."""

    if value is None:
        raise _unsupported_media_type()

    parts = [part.strip() for part in value.split(";")]
    if not parts or parts[0].casefold() != "application/json" or len(parts) > 2:
        raise _unsupported_media_type()
    if len(parts) == 1:
        return

    name, separator, raw_charset = parts[1].partition("=")
    charset = raw_charset.strip()
    if len(charset) >= 2 and charset[0] == charset[-1] == '"':
        charset = charset[1:-1]
    if separator != "=" or name.strip().casefold() != "charset" or charset.casefold() != "utf-8":
        raise _unsupported_media_type()


async def read_transfer_body(request: Request) -> bytes:
    """Stream one JSON body while enforcing its final encoded byte limit."""

    validate_json_media_type(request.headers.get("content-type"))
    declared = request.headers.get("content-length")
    if declared is not None and declared.isascii() and declared.isdecimal():
        normalized_length = declared.lstrip("0") or "0"
        maximum = str(MAX_BUNDLE_BYTES)
        if len(normalized_length) > len(maximum) or (
            len(normalized_length) == len(maximum) and normalized_length > maximum
        ):
            raise TransferHttpProblem(413, "bundle_too_large", "Bundle is too large.")

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_BUNDLE_BYTES:
            raise TransferHttpProblem(413, "bundle_too_large", "Bundle is too large.")
        body.extend(chunk)
    return bytes(body)


def transfer_headers(content_disposition: str | None = None) -> dict[str, str]:
    """Return the fixed privacy headers for every transfer response."""

    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
    }
    if content_disposition is not None:
        headers["Content-Disposition"] = content_disposition
    return headers


def transfer_json_response(
    body: bytes,
    *,
    status_code: int,
    content_disposition: str | None = None,
) -> Response:
    """Return already-serialized JSON with fixed transfer headers."""

    return Response(
        content=body,
        status_code=status_code,
        headers=transfer_headers(content_disposition),
    )


def _model_bytes(model: BaseModel) -> bytes:
    return json.dumps(
        model.model_dump(mode="json"),
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    ).encode("utf-8")


def transfer_model_response(model: BaseModel, *, status_code: int) -> Response:
    """Serialize one validated response model with transfer privacy headers."""

    return transfer_json_response(_model_bytes(model), status_code=status_code)


def _error_model(code: str, message: str) -> TransferErrorResponse:
    return TransferErrorResponse(
        detail=TransferErrorDetailResponse(
            code=code,
            message=message,
            issues=[],
            issues_truncated=False,
        )
    )


def transfer_http_problem_response(problem: TransferHttpProblem) -> Response:
    """Map a bounded request failure without reflecting request data."""

    return transfer_model_response(
        _error_model(problem.code, problem.message),
        status_code=problem.status_code,
    )


_CONTRACT_STATUS = {
    "malformed_json": 400,
    "bundle_too_large": 413,
}


def transfer_contract_error_response(error: TransferContractError) -> Response:
    """Map strict contract failures to their documented status codes."""

    return transfer_model_response(
        error.as_response(),
        status_code=_CONTRACT_STATUS.get(error.code, 422),
    )


def fixed_transfer_error_response(
    *,
    status_code: int,
    code: str,
    message: str,
) -> Response:
    """Create a fixed operation failure without accepting caught exception data."""

    return transfer_model_response(
        _error_model(code, message),
        status_code=status_code,
    )

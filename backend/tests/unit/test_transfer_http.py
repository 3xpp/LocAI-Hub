import asyncio
from collections.abc import Iterable

import pytest
from fastapi import Request

from local_ai_hub.api.transfer_http import (
    TransferHttpProblem,
    fixed_transfer_error_response,
    read_transfer_body,
    transfer_contract_error_response,
    transfer_http_problem_response,
    transfer_json_response,
    validate_json_media_type,
)
from local_ai_hub.api.transfer_schemas import TransferContractError
from local_ai_hub.services.transfer import MAX_BUNDLE_BYTES


def request_for_chunks(
    chunks: Iterable[bytes],
    *,
    content_type: str = "application/json",
    content_length: str | None = None,
) -> tuple[Request, list[int]]:
    bodies = tuple(chunks)
    received: list[int] = []

    async def receive() -> dict[str, object]:
        index = len(received)
        received.append(index)
        if index >= len(bodies):
            return {"type": "http.request", "body": b"", "more_body": False}
        return {
            "type": "http.request",
            "body": bodies[index],
            "more_body": index < len(bodies) - 1,
        }

    headers = [(b"content-type", content_type.encode("latin-1"))]
    if content_length is not None:
        headers.append((b"content-length", content_length.encode("ascii")))
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/transfer/import/preview",
        "raw_path": b"/api/transfer/import/preview",
        "query_string": b"",
        "headers": headers,
        "client": ("127.0.0.1", 50000),
        "server": ("127.0.0.1", 8000),
    }
    return Request(scope, receive), received


@pytest.mark.parametrize(
    "value",
    [
        "application/json",
        "APPLICATION/JSON",
        "application/json; charset=utf-8",
        'application/json; CHARSET="UTF-8"',
    ],
)
def test_json_media_type_accepts_only_utf8_json(value: str) -> None:
    validate_json_media_type(value)


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        "text/json",
        "application/json; charset=latin-1",
        "application/json; charset=utf-8; profile=x",
        "application/json; charset=utf-8;",
        "application/json; charset=utf-8; charset=utf-8",
    ],
)
def test_json_media_type_rejects_every_other_shape(value: str | None) -> None:
    with pytest.raises(TransferHttpProblem) as caught:
        validate_json_media_type(value)
    assert caught.value.status_code == 415
    assert caught.value.code == "unsupported_media_type"
    assert caught.value.message == "Content-Type must be UTF-8 JSON."


def test_declared_oversize_rejects_before_receiving_a_chunk() -> None:
    request, received = request_for_chunks(
        [b"should-not-be-read"],
        content_length=str(MAX_BUNDLE_BYTES + 1),
    )

    with pytest.raises(TransferHttpProblem) as caught:
        asyncio.run(read_transfer_body(request))

    assert caught.value.status_code == 413
    assert caught.value.code == "bundle_too_large"
    assert received == []


def test_exact_byte_limit_is_accepted() -> None:
    body = b"x" * MAX_BUNDLE_BYTES
    request, received = request_for_chunks(
        [body[:1024], body[1024:]],
        content_length=str(MAX_BUNDLE_BYTES),
    )

    assert asyncio.run(read_transfer_body(request)) == body
    assert received == [0, 1]


@pytest.mark.parametrize("declared", [None, "1", "not-a-number", "-1"])
def test_streaming_limit_cannot_be_bypassed_by_content_length(
    declared: str | None,
) -> None:
    request, _received = request_for_chunks(
        [b"x" * MAX_BUNDLE_BYTES, b"!"],
        content_length=declared,
    )

    with pytest.raises(TransferHttpProblem) as caught:
        asyncio.run(read_transfer_body(request))

    assert caught.value.status_code == 413
    assert caught.value.code == "bundle_too_large"


def test_extremely_large_decimal_content_length_is_rejected_safely() -> None:
    request, received = request_for_chunks(
        [b"should-not-be-read"],
        content_length="9" * 5_000,
    )

    with pytest.raises(TransferHttpProblem) as caught:
        asyncio.run(read_transfer_body(request))

    assert caught.value.code == "bundle_too_large"
    assert received == []


def test_reader_returns_chunks_in_order_without_extra_data() -> None:
    request, received = request_for_chunks([b'{"one":', b"1}"])

    assert asyncio.run(read_transfer_body(request)) == b'{"one":1}'
    assert received == [0, 1]


def test_transfer_response_sets_privacy_headers_and_optional_disposition() -> None:
    response = transfer_json_response(b"{}", status_code=200)

    assert response.status_code == 200
    assert response.body == b"{}"
    assert response.headers["content-type"] == "application/json; charset=utf-8"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "content-disposition" not in response.headers

    download = transfer_json_response(
        b"{}",
        status_code=200,
        content_disposition='attachment; filename="local-ai-workflow-hub.json"',
    )
    assert download.headers["content-disposition"] == (
        'attachment; filename="local-ai-workflow-hub.json"'
    )


def test_http_problem_response_uses_the_fixed_error_envelope() -> None:
    response = transfer_http_problem_response(
        TransferHttpProblem(415, "unsupported_media_type", "Content-Type must be UTF-8 JSON.")
    )

    assert response.status_code == 415
    assert response.headers["cache-control"] == "no-store"
    assert response.body == (
        b'{"detail":{"code":"unsupported_media_type","message":"Content-Type must be UTF-8 '
        b'JSON.","issues":[],"issues_truncated":false}}'
    )


@pytest.mark.parametrize(
    ("code", "expected_status"),
    [("malformed_json", 400), ("bundle_too_large", 413), ("invalid_bundle", 422)],
)
def test_contract_error_response_has_deterministic_status(
    code: str,
    expected_status: int,
) -> None:
    response = transfer_contract_error_response(
        TransferContractError.fixed(code, "Fixed safe message.")
    )

    assert response.status_code == expected_status
    assert b"Fixed safe message." in response.body
    assert response.headers["pragma"] == "no-cache"


def test_fixed_internal_error_response_cannot_reflect_an_exception() -> None:
    secret = "database-secret-marker"
    response = fixed_transfer_error_response(
        status_code=500,
        code="import_failed",
        message="Import failed safely.",
    )

    assert response.status_code == 500
    assert secret.encode() not in response.body
    assert response.body == (
        b'{"detail":{"code":"import_failed","message":"Import failed safely.","issues":[],'
        b'"issues_truncated":false}}'
    )

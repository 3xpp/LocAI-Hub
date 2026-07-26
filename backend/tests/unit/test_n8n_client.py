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
        ("http://dead.beef:5678", "http://dead.beef:5678"),
        ("http://service.1a:5678", "http://service.1a:5678"),
        ("http://0xfeed.example:5678", "http://0xfeed.example:5678"),
        ("http://192.168.1.12:5678", "http://192.168.1.12:5678"),
        ("http://[::1]:5678", "http://[::1]:5678"),
        ("http://[0:0:0:0:0:0:0:1]:5678", "http://[::1]:5678"),
        (
            "http://[::ffff:192.168.1.1]:5678",
            "http://[::ffff:c0a8:101]:5678",
        ),
        ("http://[::ffff:c0a8:101]:5678", "http://[::ffff:c0a8:101]:5678"),
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

    result = asyncio.run(N8nHealthClient(base_url, transport_factory=factory(handler)).get_status())
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
        "http://[fe80::1%25eth0]:5678",
        "http://127.1:5678",
        "http://2130706433:5678",
        "http://0x7f000001:5678",
        "http://127.000.000.001:5678",
        "http://example.1:5678",
        "http://example.0001:5678",
        "http://example.0x1:5678",
        "http://example.0X:5678",
        "http://n8n.test.",
        "http://127.1.",
        "http://2130706433.",
        "http://0x7f000001.",
        "http://127.000.000.001.",
        "http://example.1.",
        "http://example.0x1.",
        "http://%65xample.com",
        "http://example%2ecom",
        "http://a b",
        "http://a\\b",
        "http://a|b",
        "http://a^b",
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
        assert "X-N8N-API-KEY" not in request.headers
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
            transport_factory=factory(lambda request: httpx.Response(200, request=request)),
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

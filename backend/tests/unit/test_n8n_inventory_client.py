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


class StaticBodyStream(httpx.AsyncByteStream):
    def __init__(self, body: bytes) -> None:
        self._body = body

    async def __aiter__(self):
        yield self._body


def json_response(
    request: httpx.Request,
    payload: object,
    *,
    status: int = 200,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    return httpx.Response(
        status,
        stream=StaticBodyStream(json.dumps(payload).encode()),
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
            stream=StaticBodyStream(b'{"data":[],"nextCursor":null}'),
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
            stream=StaticBodyStream(b'{"data":[],"nextCursor":null}'),
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


def test_inventory_paginates_with_one_encoded_backend_cursor() -> None:
    urls: list[httpx.URL] = []
    cursor = 'page/"quoted"&admin=true?next=#fragment%'

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
    assert cursor not in repr(result)


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
            stream=StaticBodyStream(b"{"),
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


def test_inventory_maps_transport_factory_error_without_reflection() -> None:
    marker = "private-transport-factory-marker"
    request = httpx.Request("GET", "https://n8n.test/api/v1/workflows")

    def failing_transport_factory() -> httpx.AsyncBaseTransport:
        raise httpx.ConnectError(marker, request=request)

    result = asyncio.run(
        N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=failing_transport_factory,
        ).get_inventory()
    )

    assert result.state == "unavailable"
    assert result.items == ()
    assert marker not in repr(result)


class SlowStream(httpx.AsyncByteStream):
    async def __aiter__(self):
        await asyncio.sleep(0.05)
        yield b'{"data":[],"nextCursor":null}'


class NonReturningCleanupStream(httpx.AsyncByteStream):
    def __init__(self) -> None:
        self.close_started = False
        self.read_started = asyncio.Event()

    async def __aiter__(self):
        self.read_started.set()
        await asyncio.Event().wait()
        yield b'{"data":[],"nextCursor":null}'

    async def aclose(self) -> None:
        self.close_started = True
        await asyncio.Event().wait()


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


def test_inventory_timeout_cancels_non_returning_cleanup_without_task_leak() -> None:
    async def run_attempt() -> tuple[object, float, bool, int]:
        stream = NonReturningCleanupStream()

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                stream=stream,
                headers={"Content-Type": "application/json"},
                request=request,
            )

        loop = asyncio.get_running_loop()
        started = loop.time()
        result = await N8nWorkflowInventoryClient(
            "https://n8n.test",
            KEY,
            transport_factory=transport_factory(handler),
            timeout=0.01,
        ).get_inventory()
        elapsed = loop.time() - started
        await asyncio.sleep(0)
        current = asyncio.current_task()
        remaining_tasks = sum(
            task is not current and not task.done() for task in asyncio.all_tasks()
        )
        return result, elapsed, stream.close_started, remaining_tasks

    result, elapsed, close_started, remaining_tasks = asyncio.run(run_attempt())

    assert result.state == "timeout"
    assert result.items == ()
    assert elapsed < 0.2
    assert close_started is True
    assert remaining_tasks == 0


def test_inventory_preserves_external_cancellation_during_cleanup() -> None:
    async def run_attempt() -> tuple[bool, int]:
        stream = NonReturningCleanupStream()

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                stream=stream,
                headers={"Content-Type": "application/json"},
                request=request,
            )

        task = asyncio.create_task(
            N8nWorkflowInventoryClient(
                "https://n8n.test",
                KEY,
                transport_factory=transport_factory(handler),
                timeout=0.05,
            ).get_inventory()
        )
        await asyncio.wait_for(stream.read_started.wait(), timeout=0.2)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

        await asyncio.sleep(0)
        current = asyncio.current_task()
        remaining_tasks = sum(
            pending is not current and not pending.done() for pending in asyncio.all_tasks()
        )
        return stream.close_started, remaining_tasks

    close_started, remaining_tasks = asyncio.run(run_attempt())

    assert close_started is True
    assert remaining_tasks == 0


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
    body = prefix + b"x" * (MAX_N8N_WORKFLOW_BYTES + extra - len(prefix) - len(suffix)) + suffix

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
    second = prefix + b"x" * (MAX_N8N_WORKFLOW_BYTES - len(prefix) - len(suffix)) + suffix

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            stream=StaticBodyStream(first if calls == 1 else second),
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
    body = prefix + b"x" * (MAX_N8N_WORKFLOW_BYTES - len(prefix) - len(suffix)) + suffix

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
    body = ('{"data":[],"ignored":' + nested + ',"nextCursor":null}').encode()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            stream=StaticBodyStream(body),
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
            stream=StaticBodyStream(body),
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
            stream=StaticBodyStream(body),
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
            ('{"data":[],"ignored":' + "[" * 64 + "0" + "]" * 64 + "}").encode(),
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
            stream=StaticBodyStream(body),
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

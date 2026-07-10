import asyncio

import httpx
import pytest

from local_ai_hub.services.ollama import OllamaClient


def offline_handler(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("sensitive low-level detail", request=request)


def models_handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/api/tags"
    return httpx.Response(
        200,
        json={
            "models": [
                {
                    "name": "llama3.1:8b",
                    "modified_at": "2026-07-10T10:00:00Z",
                    "size": 123456,
                    "digest": "ignored",
                }
            ]
        },
    )


def invalid_models_handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/api/tags"
    return httpx.Response(200, json={"models": "not-a-list"})


def server_error_handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/api/tags"
    return httpx.Response(503, text="sensitive upstream response")


def invalid_json_handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/api/tags"
    return httpx.Response(
        200,
        content=b"not-json",
        headers={"content-type": "application/json"},
    )


def unexpected_request_handler(request: httpx.Request) -> httpx.Response:
    raise AssertionError(f"invalid configuration attempted request to {request.url.host}")


def test_status_reports_offline_without_raising() -> None:
    client = OllamaClient(
        "http://ollama.test",
        transport=httpx.MockTransport(offline_handler),
    )

    result = asyncio.run(client.get_status())

    assert result.online is False
    assert result.base_url == "http://ollama.test"
    assert result.error == "Connection failed"


def test_status_reports_online_when_tags_endpoint_responds() -> None:
    client = OllamaClient(
        "HTTP://OLLAMA.TEST:80/",
        transport=httpx.MockTransport(models_handler),
    )

    result = asyncio.run(client.get_status())

    assert result.online is True
    assert result.base_url == "http://ollama.test"
    assert result.error is None


@pytest.mark.parametrize(
    "base_url",
    [
        "not-a-url",
        "ftp://ollama.test",
        "http:///missing-host",
        "http://ollama.test/private/path",
        "http://ollama.test?token=sensitive-query",
        "http://ollama.test#sensitive-fragment",
    ],
)
def test_status_rejects_malformed_base_urls_without_reflecting_them(base_url: str) -> None:
    client = OllamaClient(
        base_url,
        transport=httpx.MockTransport(unexpected_request_handler),
    )

    result = asyncio.run(client.get_status())

    assert result.online is False
    assert result.base_url == "Invalid configuration"
    assert result.error == "Invalid Ollama base URL"
    assert base_url not in f"{result.base_url} {result.error}"


def test_credentials_in_base_url_are_never_reflected() -> None:
    sensitive_value = "http://admin:never-reflect-me@ollama.test"
    client = OllamaClient(
        sensitive_value,
        transport=httpx.MockTransport(unexpected_request_handler),
    )

    status = asyncio.run(client.get_status())
    models = asyncio.run(client.list_models())

    assert status.online is False
    assert status.base_url == "Invalid configuration"
    assert status.error == "Invalid Ollama base URL"
    assert models.models == ()
    assert models.error == "Invalid Ollama base URL"
    assert "never-reflect-me" not in f"{status.base_url} {status.error} {models.error}"


def test_models_are_normalized() -> None:
    client = OllamaClient(
        "http://ollama.test",
        transport=httpx.MockTransport(models_handler),
    )

    result = asyncio.run(client.list_models())

    assert result.error is None
    assert len(result.models) == 1
    assert result.models[0].name == "llama3.1:8b"
    assert result.models[0].modified_at == "2026-07-10T10:00:00Z"
    assert result.models[0].size == 123456


def test_models_report_invalid_shape_without_raising() -> None:
    client = OllamaClient(
        "http://ollama.test",
        transport=httpx.MockTransport(invalid_models_handler),
    )

    result = asyncio.run(client.list_models())

    assert result.models == ()
    assert result.error == "Invalid response from Ollama"


def test_models_normalize_http_errors_without_disclosing_upstream_body() -> None:
    client = OllamaClient(
        "http://ollama.test",
        transport=httpx.MockTransport(server_error_handler),
    )

    result = asyncio.run(client.list_models())

    assert result.models == ()
    assert result.error == "Ollama request failed"


def test_models_normalize_invalid_json_without_raising() -> None:
    client = OllamaClient(
        "http://ollama.test",
        transport=httpx.MockTransport(invalid_json_handler),
    )

    result = asyncio.run(client.list_models())

    assert result.models == ()
    assert result.error == "Invalid response from Ollama"

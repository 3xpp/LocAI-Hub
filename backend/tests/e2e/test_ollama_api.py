from collections.abc import Iterator
from contextlib import contextmanager

import httpx
from fastapi.testclient import TestClient

from local_ai_hub.api.dependencies import get_ollama_client
from local_ai_hub.api.main import app
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
                    "name": "qwen2.5-coder:7b",
                    "modified_at": "2026-07-10T12:30:00Z",
                    "size": 4_700_000_000,
                    "details": {"family": "qwen2"},
                }
            ]
        },
    )


@contextmanager
def client_with_ollama(ollama_client: OllamaClient) -> Iterator[TestClient]:
    previous_override = app.dependency_overrides.get(get_ollama_client)
    app.dependency_overrides[get_ollama_client] = lambda: ollama_client
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_ollama_client, None)
        else:
            app.dependency_overrides[get_ollama_client] = previous_override


def test_ollama_status_reports_unavailable_service() -> None:
    ollama_client = OllamaClient(
        "http://ollama.test",
        transport=httpx.MockTransport(offline_handler),
    )
    with client_with_ollama(ollama_client) as client:
        response = client.get("/api/ollama/status")

    assert response.status_code == 200
    assert response.json() == {
        "online": False,
        "base_url": "http://ollama.test",
        "error": "Connection failed",
    }


def test_ollama_status_rejects_credential_bearing_configuration_safely() -> None:
    sensitive_marker = "never-reflect-me"
    ollama_client = OllamaClient(f"http://admin:{sensitive_marker}@ollama.test")
    with client_with_ollama(ollama_client) as client:
        response = client.get("/api/ollama/status")

    assert response.status_code == 200
    assert response.json() == {
        "online": False,
        "base_url": "Invalid configuration",
        "error": "Invalid Ollama base URL",
    }
    assert sensitive_marker not in response.text


def test_ollama_models_returns_normalized_models() -> None:
    ollama_client = OllamaClient(
        "http://ollama.test",
        transport=httpx.MockTransport(models_handler),
    )
    with client_with_ollama(ollama_client) as client:
        response = client.get("/api/ollama/models")

    assert response.status_code == 200
    assert response.json() == {
        "models": [
            {
                "name": "qwen2.5-coder:7b",
                "modified_at": "2026-07-10T12:30:00Z",
                "size": 4_700_000_000,
            }
        ],
        "error": None,
    }


def test_ollama_models_reports_offline_service() -> None:
    ollama_client = OllamaClient(
        "http://ollama.test",
        transport=httpx.MockTransport(offline_handler),
    )
    with client_with_ollama(ollama_client) as client:
        response = client.get("/api/ollama/models")

    assert response.status_code == 200
    assert response.json() == {
        "models": [],
        "error": "Connection failed",
    }

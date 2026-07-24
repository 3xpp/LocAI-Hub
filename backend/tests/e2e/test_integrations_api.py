from collections.abc import Iterator
from contextlib import contextmanager
from typing import Protocol

import httpx
import pytest
from fastapi.testclient import TestClient

from local_ai_hub.api.dependencies import get_n8n_health_client
from local_ai_hub.api.main import app
from local_ai_hub.services.n8n import N8nHealthClient, N8nHealthResult


class N8nStatusClient(Protocol):
    async def get_status(self) -> N8nHealthResult: ...


class StubN8nClient:
    def __init__(
        self,
        result: N8nHealthResult | None = None,
        error: Exception | None = None,
    ) -> None:
        self.result = result
        self.error = error

    async def get_status(self) -> N8nHealthResult:
        if self.error is not None:
            raise self.error
        if self.result is None:
            raise AssertionError("stub result is required")
        return self.result


@contextmanager
def client_with_n8n(stub: N8nStatusClient) -> Iterator[TestClient]:
    previous = app.dependency_overrides.get(get_n8n_health_client)
    app.dependency_overrides[get_n8n_health_client] = lambda: stub
    try:
        with TestClient(app) as client:
            yield client
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_n8n_health_client, None)
        else:
            app.dependency_overrides[get_n8n_health_client] = previous


@pytest.mark.parametrize(
    ("result", "expected"),
    [
        (
            N8nHealthResult(
                "unconfigured",
                None,
                "not_checked",
                "not_checked",
                None,
            ),
            {
                "state": "unconfigured",
                "base_url": None,
                "liveness": "not_checked",
                "readiness": "not_checked",
                "error": None,
            },
        ),
        (
            N8nHealthResult(
                "online",
                "http://n8n.test",
                "passed",
                "passed",
                None,
            ),
            {
                "state": "online",
                "base_url": "http://n8n.test",
                "liveness": "passed",
                "readiness": "passed",
                "error": None,
            },
        ),
        (
            N8nHealthResult(
                "degraded",
                "http://n8n.test",
                "passed",
                "failed",
                "n8n is reachable but not ready",
            ),
            {
                "state": "degraded",
                "base_url": "http://n8n.test",
                "liveness": "passed",
                "readiness": "failed",
                "error": "n8n is reachable but not ready",
            },
        ),
        (
            N8nHealthResult(
                "offline",
                "http://n8n.test",
                "failed",
                "not_checked",
                "Connection failed",
            ),
            {
                "state": "offline",
                "base_url": "http://n8n.test",
                "liveness": "failed",
                "readiness": "not_checked",
                "error": "Connection failed",
            },
        ),
        (
            N8nHealthResult(
                "offline",
                "http://n8n.test",
                "failed",
                "not_checked",
                "n8n health check failed",
            ),
            {
                "state": "offline",
                "base_url": "http://n8n.test",
                "liveness": "failed",
                "readiness": "not_checked",
                "error": "n8n health check failed",
            },
        ),
        (
            N8nHealthResult(
                "offline",
                "Invalid configuration",
                "not_checked",
                "not_checked",
                "Invalid n8n base URL",
            ),
            {
                "state": "offline",
                "base_url": "Invalid configuration",
                "liveness": "not_checked",
                "readiness": "not_checked",
                "error": "Invalid n8n base URL",
            },
        ),
    ],
)
def test_n8n_status_returns_normalized_contract_with_privacy_headers(
    result: N8nHealthResult,
    expected: dict[str, object],
) -> None:
    with client_with_n8n(StubN8nClient(result)) as client:
        response = client.get("/api/integrations/n8n/status")

    assert response.status_code == 200
    assert response.json() == expected
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-type"] == "application/json"
    assert "content-disposition" not in response.headers


def test_n8n_status_does_not_reflect_invalid_configuration() -> None:
    marker = " http://private-config-marker.test/path "

    def unexpected_transport() -> httpx.AsyncBaseTransport:
        raise AssertionError("invalid configuration created a transport")

    health_client = N8nHealthClient(
        marker,
        transport_factory=unexpected_transport,
    )
    with client_with_n8n(health_client) as client:
        response = client.get("/api/integrations/n8n/status")

    assert response.status_code == 200
    assert response.json()["base_url"] == "Invalid configuration"
    assert marker not in response.text


def test_unexpected_client_error_remains_a_hub_failure() -> None:
    marker = "private-programming-error"
    previous = app.dependency_overrides.get(get_n8n_health_client)
    app.dependency_overrides[get_n8n_health_client] = lambda: StubN8nClient(
        error=RuntimeError(marker)
    )
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/api/integrations/n8n/status")
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_n8n_health_client, None)
        else:
            app.dependency_overrides[get_n8n_health_client] = previous

    assert response.status_code == 500
    assert marker not in response.text
    assert "offline" not in response.text


def test_client_override_restores_previous_identity() -> None:
    outer_override = app.dependency_overrides.get(get_n8n_health_client)
    previous_client = StubN8nClient(
        N8nHealthResult("unconfigured", None, "not_checked", "not_checked", None)
    )

    def previous_override() -> StubN8nClient:
        return previous_client

    app.dependency_overrides[get_n8n_health_client] = previous_override
    replacement = StubN8nClient(
        N8nHealthResult("online", "http://n8n.test", "passed", "passed", None)
    )
    try:
        with client_with_n8n(replacement):
            assert app.dependency_overrides[get_n8n_health_client] is not previous_override
        assert app.dependency_overrides[get_n8n_health_client] is previous_override
    finally:
        if outer_override is None:
            app.dependency_overrides.pop(get_n8n_health_client, None)
        else:
            app.dependency_overrides[get_n8n_health_client] = outer_override

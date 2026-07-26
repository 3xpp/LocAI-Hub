from collections.abc import Iterator
from contextlib import contextmanager
from typing import Protocol

import httpx
import pytest
from fastapi.testclient import TestClient

from local_ai_hub.api.dependencies import (
    get_n8n_health_client,
    get_n8n_workflow_inventory_client,
)
from local_ai_hub.api.main import app
from local_ai_hub.config import Settings
from local_ai_hub.services.n8n import N8nHealthClient, N8nHealthResult
from local_ai_hub.services.n8n_inventory import (
    N8nWorkflowInventoryResult,
    N8nWorkflowSummary,
)


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


class N8nInventoryClient(Protocol):
    async def get_inventory(self) -> N8nWorkflowInventoryResult: ...


class StubN8nInventoryClient:
    def __init__(
        self,
        result: N8nWorkflowInventoryResult | None = None,
        error: Exception | None = None,
    ) -> None:
        self.result = result
        self.error = error
        self.calls = 0

    async def get_inventory(self) -> N8nWorkflowInventoryResult:
        self.calls += 1
        if self.error is not None:
            raise self.error
        if self.result is None:
            raise AssertionError("inventory stub result is required")
        return self.result


def assert_privacy_headers(response: httpx.Response) -> None:
    expected = {
        "content-type": "application/json",
        "cache-control": "no-store",
        "pragma": "no-cache",
        "x-content-type-options": "nosniff",
    }
    for name, value in expected.items():
        assert response.headers.get_list(name) == [value]
    assert "content-disposition" not in response.headers


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


@contextmanager
def client_with_n8n_inventory(
    stub: N8nInventoryClient,
) -> Iterator[TestClient]:
    previous = app.dependency_overrides.get(get_n8n_workflow_inventory_client)
    app.dependency_overrides[get_n8n_workflow_inventory_client] = lambda: stub
    try:
        with TestClient(app) as client:
            yield client
    finally:
        if previous is None:
            app.dependency_overrides.pop(
                get_n8n_workflow_inventory_client,
                None,
            )
        else:
            app.dependency_overrides[get_n8n_workflow_inventory_client] = previous


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
    assert_privacy_headers(response)
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


def test_n8n_workflows_returns_projection_with_privacy_headers() -> None:
    result = N8nWorkflowInventoryResult(
        "available",
        (
            N8nWorkflowSummary(
                "Daily local backup",
                True,
                "2026-07-26T08:30:00Z",
            ),
        ),
        False,
        None,
    )
    with client_with_n8n_inventory(StubN8nInventoryClient(result)) as client:
        response = client.get("/api/integrations/n8n/workflows")

    assert response.status_code == 200
    assert response.json() == {
        "state": "available",
        "items": [
            {
                "name": "Daily local backup",
                "active": True,
                "updated_at": "2026-07-26T08:30:00Z",
            }
        ],
        "truncated": False,
        "error": None,
    }
    assert_privacy_headers(response)


def test_n8n_workflows_openapi_has_no_input_or_mutation_surface() -> None:
    with TestClient(app) as client:
        document = client.get("/openapi.json").json()

    operation = document["paths"]["/api/integrations/n8n/workflows"]
    assert set(operation) == {"get"}
    assert operation["get"].get("parameters", []) == []
    assert "requestBody" not in operation["get"]
    assert all("/api/integrations/n8n/workflows/" not in path for path in document["paths"])
    assert not any("execution" in path.lower() for path in document["paths"])


@pytest.mark.parametrize(
    "path",
    [
        "/api/integrations/n8n/workflows/",
        "/api/integrations/n8n/workflows//",
        "/api/integrations/n8n/workflows/private-path-marker",
        "/api/integrations/n8n/workflows%2Fencoded-private-marker",
    ],
)
def test_n8n_workflow_descendants_are_fixed_private_404_without_redirect(
    path: str,
) -> None:
    marker = "trailing-slash-private-marker"
    stub = StubN8nInventoryClient(N8nWorkflowInventoryResult("available", (), False, None))
    with client_with_n8n_inventory(stub) as client:
        response = client.get(
            path,
            params={"cursor": marker},
            follow_redirects=False,
        )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
    assert "location" not in response.headers
    assert marker not in response.text
    assert "private-path-marker" not in response.text
    assert "encoded-private-marker" not in response.text
    assert stub.calls == 0
    assert_privacy_headers(response)


def test_inventory_dependency_uses_only_trusted_settings_without_repr_leak() -> None:
    key_marker = "phase2b-dependency-Key-9zQ"
    origin_marker = "https://n8n-dependency-marker.test"
    settings = Settings(
        n8n_base_url=origin_marker,
        n8n_api_key=key_marker,
    )

    inventory_client = get_n8n_workflow_inventory_client(settings)
    health_client = get_n8n_health_client(settings)

    assert key_marker not in repr(settings)
    assert key_marker not in repr(inventory_client)
    assert key_marker not in repr(health_client)
    assert origin_marker not in repr(inventory_client)
    assert origin_marker not in repr(health_client)


INVENTORY_RESULTS = [
    N8nWorkflowInventoryResult("unconfigured", (), False, None),
    N8nWorkflowInventoryResult("available", (), False, None),
    N8nWorkflowInventoryResult(
        "invalid_configuration",
        (),
        False,
        "Invalid n8n inventory configuration",
    ),
    N8nWorkflowInventoryResult(
        "access_denied",
        (),
        False,
        "n8n denied workflow inventory access",
    ),
    N8nWorkflowInventoryResult(
        "unavailable",
        (),
        False,
        "n8n workflow inventory is unavailable",
    ),
    N8nWorkflowInventoryResult(
        "timeout",
        (),
        False,
        "n8n workflow inventory timed out",
    ),
    N8nWorkflowInventoryResult(
        "invalid_response",
        (),
        False,
        "n8n returned an invalid workflow inventory",
    ),
]


@pytest.mark.parametrize("result", INVENTORY_RESULTS)
def test_n8n_workflows_maps_every_normalized_state(
    result: N8nWorkflowInventoryResult,
) -> None:
    stub = StubN8nInventoryClient(result)
    with client_with_n8n_inventory(stub) as client:
        response = client.get("/api/integrations/n8n/workflows")

    assert response.status_code == 200
    assert response.json() == {
        "state": result.state,
        "items": [],
        "truncated": result.truncated,
        "error": result.error,
    }
    assert stub.calls == 1


def test_n8n_workflows_ignores_unowned_input_without_reflection() -> None:
    marker = "request-controlled-private-marker"
    result = N8nWorkflowInventoryResult("available", (), False, None)
    stub = StubN8nInventoryClient(result)
    with client_with_n8n_inventory(stub) as client:
        response = client.request(
            "GET",
            "/api/integrations/n8n/workflows",
            params={"target": marker, "cursor": marker, "filter": marker},
            json={"key": marker, "path": marker},
            headers={"X-Provider-Target": marker},
        )

    assert response.status_code == 200
    assert response.json() == {
        "state": "available",
        "items": [],
        "truncated": False,
        "error": None,
    }
    assert marker not in response.text
    assert stub.calls == 1


@pytest.mark.parametrize(
    "method",
    ["HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
)
def test_n8n_workflows_rejects_non_get_methods(method: str) -> None:
    stub = StubN8nInventoryClient(N8nWorkflowInventoryResult("available", (), False, None))
    with client_with_n8n_inventory(stub) as client:
        response = client.request(
            method,
            "/api/integrations/n8n/workflows",
        )

    assert response.status_code == 405
    assert stub.calls == 0
    assert_privacy_headers(response)


def test_n8n_workflows_unexpected_error_remains_hub_failure() -> None:
    marker = "private-programming-marker"
    previous = app.dependency_overrides.get(get_n8n_workflow_inventory_client)
    app.dependency_overrides[get_n8n_workflow_inventory_client] = lambda: StubN8nInventoryClient(
        error=RuntimeError(marker)
    )
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/api/integrations/n8n/workflows")
    finally:
        if previous is None:
            app.dependency_overrides.pop(
                get_n8n_workflow_inventory_client,
                None,
            )
        else:
            app.dependency_overrides[get_n8n_workflow_inventory_client] = previous

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}
    assert marker not in response.text
    assert "available" not in response.text
    assert "Daily local backup" not in response.text
    assert_privacy_headers(response)


def test_n8n_workflows_default_test_client_raises_only_sanitized_defect() -> None:
    marker = "private-default-client-programming-marker"
    previous = app.dependency_overrides.get(get_n8n_workflow_inventory_client)
    app.dependency_overrides[get_n8n_workflow_inventory_client] = lambda: StubN8nInventoryClient(
        error=RuntimeError(marker)
    )
    try:
        with (
            TestClient(app) as client,
            pytest.raises(
                RuntimeError,
                match="^n8n workflow inventory request failed$",
            ) as raised,
        ):
            client.get("/api/integrations/n8n/workflows")
    finally:
        if previous is None:
            app.dependency_overrides.pop(
                get_n8n_workflow_inventory_client,
                None,
            )
        else:
            app.dependency_overrides[get_n8n_workflow_inventory_client] = previous

    assert marker not in str(raised.value)
    assert raised.value.__cause__ is None
    assert raised.value.__context__ is None


def test_inventory_boundary_does_not_change_unrelated_404() -> None:
    with TestClient(app) as client:
        response = client.get("/api/integrations/n8n/workflows-unrelated")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
    assert "cache-control" not in response.headers
    assert "pragma" not in response.headers
    assert "x-content-type-options" not in response.headers

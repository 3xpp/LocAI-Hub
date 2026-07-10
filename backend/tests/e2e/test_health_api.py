from fastapi.testclient import TestClient

from local_ai_hub.api.main import app


def test_health_returns_service_metadata() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "local-ai-workflow-hub",
        "version": "0.1.0",
    }

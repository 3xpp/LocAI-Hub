import pytest
from pydantic import ValidationError

from local_ai_hub.api.integration_schemas import N8nStatusResponse

VALID_PAYLOADS = [
    {
        "state": "unconfigured",
        "base_url": None,
        "liveness": "not_checked",
        "readiness": "not_checked",
        "error": None,
    },
    {
        "state": "online",
        "base_url": "http://n8n.test",
        "liveness": "passed",
        "readiness": "passed",
        "error": None,
    },
    {
        "state": "degraded",
        "base_url": "http://n8n.test",
        "liveness": "passed",
        "readiness": "failed",
        "error": "n8n is reachable but not ready",
    },
    {
        "state": "offline",
        "base_url": "http://n8n.test",
        "liveness": "failed",
        "readiness": "not_checked",
        "error": "Connection failed",
    },
    {
        "state": "offline",
        "base_url": "Invalid configuration",
        "liveness": "not_checked",
        "readiness": "not_checked",
        "error": "Invalid n8n base URL",
    },
    {
        "state": "offline",
        "base_url": "http://n8n.test",
        "liveness": "failed",
        "readiness": "not_checked",
        "error": "n8n health check failed",
    },
]


@pytest.mark.parametrize("payload", VALID_PAYLOADS)
def test_status_response_accepts_only_approved_combinations(
    payload: dict[str, object],
) -> None:
    assert N8nStatusResponse.model_validate(payload).model_dump() == payload


@pytest.mark.parametrize(
    "payload",
    [
        {**VALID_PAYLOADS[0], "private": "no"},
        {**VALID_PAYLOADS[0], "state": "online"},
        {**VALID_PAYLOADS[1], "readiness": "failed"},
        {**VALID_PAYLOADS[2], "error": "private upstream detail"},
        {**VALID_PAYLOADS[3], "liveness": "passed"},
        {**VALID_PAYLOADS[4], "base_url": "http://n8n.test"},
        {**VALID_PAYLOADS[1], "base_url": ""},
        {**VALID_PAYLOADS[1], "base_url": "x" * 2_049},
        {**VALID_PAYLOADS[1], "base_url": "not-an-origin"},
        {**VALID_PAYLOADS[1], "base_url": "HTTP://N8N.TEST:80/"},
        {**VALID_PAYLOADS[1], "base_url": "http://n8n.test/"},
        {**VALID_PAYLOADS[1], "base_url": "http://user@n8n.test"},
        {**VALID_PAYLOADS[1], "base_url": "http://n8n.test/path"},
        {**VALID_PAYLOADS[1], "base_url": "http://n8n.test?private=1"},
        {**VALID_PAYLOADS[1], "base_url": "http://n8n.test#private"},
    ],
)
def test_status_response_rejects_extra_fields_and_impossible_combinations(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        N8nStatusResponse.model_validate(payload)

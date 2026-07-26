import pytest
from pydantic import ValidationError

from local_ai_hub.api.integration_schemas import (
    N8nStatusResponse,
    N8nWorkflowInventoryResponse,
)

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


AVAILABLE_INVENTORY = {
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

INVENTORY_FAILURES = [
    (
        "invalid_configuration",
        "Invalid n8n inventory configuration",
    ),
    (
        "access_denied",
        "n8n denied workflow inventory access",
    ),
    (
        "unavailable",
        "n8n workflow inventory is unavailable",
    ),
    (
        "timeout",
        "n8n workflow inventory timed out",
    ),
    (
        "invalid_response",
        "n8n returned an invalid workflow inventory",
    ),
]


def test_inventory_response_accepts_available_and_unconfigured() -> None:
    assert (
        N8nWorkflowInventoryResponse.model_validate(AVAILABLE_INVENTORY).model_dump()
        == AVAILABLE_INVENTORY
    )
    unconfigured = {
        "state": "unconfigured",
        "items": [],
        "truncated": False,
        "error": None,
    }
    assert N8nWorkflowInventoryResponse.model_validate(unconfigured).model_dump() == unconfigured
    empty_truncated = {
        "state": "available",
        "items": [],
        "truncated": True,
        "error": None,
    }
    assert (
        N8nWorkflowInventoryResponse.model_validate(empty_truncated).model_dump() == empty_truncated
    )


@pytest.mark.parametrize(("state", "error"), INVENTORY_FAILURES)
def test_inventory_response_accepts_fixed_failure(
    state: str,
    error: str,
) -> None:
    payload = {
        "state": state,
        "items": [],
        "truncated": False,
        "error": error,
    }
    assert N8nWorkflowInventoryResponse.model_validate(payload).model_dump() == payload


@pytest.mark.parametrize(
    "payload",
    [
        {**AVAILABLE_INVENTORY, "private": "no"},
        {**AVAILABLE_INVENTORY, "state": "unconfigured"},
        {**AVAILABLE_INVENTORY, "error": "private provider detail"},
        {
            "state": "access_denied",
            "items": AVAILABLE_INVENTORY["items"],
            "truncated": False,
            "error": "n8n denied workflow inventory access",
        },
        {
            "state": "unconfigured",
            "items": [],
            "truncated": False,
            "error": "Invalid n8n inventory configuration",
        },
    ],
)
def test_inventory_response_rejects_impossible_combinations(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        N8nWorkflowInventoryResponse.model_validate(payload)


@pytest.mark.parametrize(
    "item",
    [
        {
            "name": "",
            "active": True,
            "updated_at": "2026-07-26T08:30:00Z",
        },
        {
            "name": "x" * 257,
            "active": True,
            "updated_at": "2026-07-26T08:30:00Z",
        },
        {
            "name": "line\nbreak",
            "active": True,
            "updated_at": "2026-07-26T08:30:00Z",
        },
        {
            "name": "\ud800",
            "active": True,
            "updated_at": "2026-07-26T08:30:00Z",
        },
        {
            "name": "Wrong boolean",
            "active": 1,
            "updated_at": "2026-07-26T08:30:00Z",
        },
        {
            "name": "Naive",
            "active": True,
            "updated_at": "2026-07-26T08:30:00",
        },
        {
            "name": "Offset",
            "active": True,
            "updated_at": "2026-07-26T10:30:00+02:00",
        },
        {
            "name": "Invalid",
            "active": True,
            "updated_at": "not-a-time",
        },
        {
            "name": "Overlong",
            "active": True,
            "updated_at": "x" * 65,
        },
        {
            "name": "Extra",
            "active": True,
            "updated_at": "2026-07-26T08:30:00Z",
            "id": "private-id",
        },
        {
            "name": "Missing time",
            "active": True,
        },
    ],
)
def test_inventory_item_rejects_invalid_fields(
    item: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        N8nWorkflowInventoryResponse.model_validate(
            {
                "state": "available",
                "items": [item],
                "truncated": False,
                "error": None,
            }
        )


def test_inventory_response_rejects_more_than_200_items() -> None:
    with pytest.raises(ValidationError):
        N8nWorkflowInventoryResponse.model_validate(
            {
                **AVAILABLE_INVENTORY,
                "items": AVAILABLE_INVENTORY["items"] * 201,
            }
        )

"""Strict response contracts for provider integrations."""

import unicodedata
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from local_ai_hub.services.n8n import (
    INVALID_N8N_BASE_URL_DISPLAY,
    MAX_N8N_BASE_URL_LENGTH,
    N8nCheckState,
    N8nHealthError,
    N8nObservationState,
    is_canonical_n8n_origin,
)
from local_ai_hub.services.n8n_inventory import (
    MAX_N8N_WORKFLOW_ITEMS,
    MAX_N8N_WORKFLOW_NAME_LENGTH,
    MAX_N8N_WORKFLOW_TIMESTAMP_LENGTH,
    N8nWorkflowInventoryError,
    N8nWorkflowInventoryState,
    is_normalized_n8n_workflow_timestamp,
)


class N8nStatusResponse(BaseModel):
    """One closed and internally consistent n8n observation."""

    model_config = ConfigDict(extra="forbid", strict=True)

    state: N8nObservationState
    base_url: Annotated[str, Field(max_length=MAX_N8N_BASE_URL_LENGTH)] | None
    liveness: N8nCheckState
    readiness: N8nCheckState
    error: N8nHealthError | None

    @model_validator(mode="after")
    def validate_combination(self) -> "N8nStatusResponse":
        if self.state == "unconfigured":
            valid = (
                self.base_url is None
                and self.liveness == "not_checked"
                and self.readiness == "not_checked"
                and self.error is None
            )
        elif self.base_url == INVALID_N8N_BASE_URL_DISPLAY:
            valid = (
                self.state == "offline"
                and self.liveness == "not_checked"
                and self.readiness == "not_checked"
                and self.error == "Invalid n8n base URL"
            )
        elif not self.base_url or not is_canonical_n8n_origin(self.base_url):
            valid = False
        elif self.state == "online":
            valid = self.liveness == "passed" and self.readiness == "passed" and self.error is None
        elif self.state == "degraded":
            valid = (
                self.liveness == "passed"
                and self.readiness == "failed"
                and self.error == "n8n is reachable but not ready"
            )
        else:
            valid = (
                self.liveness == "failed"
                and self.readiness == "not_checked"
                and self.error in {"Connection failed", "n8n health check failed"}
            )
        if not valid:
            raise ValueError("invalid n8n status combination")
        return self


class N8nWorkflowSummaryResponse(BaseModel):
    """One strict browser-visible workflow projection."""

    model_config = ConfigDict(extra="forbid", strict=True)

    name: Annotated[
        str,
        Field(min_length=1, max_length=MAX_N8N_WORKFLOW_NAME_LENGTH),
    ]
    active: bool
    updated_at: Annotated[
        str,
        Field(max_length=MAX_N8N_WORKFLOW_TIMESTAMP_LENGTH),
    ]

    @model_validator(mode="after")
    def validate_projected_fields(self) -> "N8nWorkflowSummaryResponse":
        if any(
            unicodedata.category(character) == "Cc" or 0xD800 <= ord(character) <= 0xDFFF
            for character in self.name
        ):
            raise ValueError("invalid workflow name")
        if not is_normalized_n8n_workflow_timestamp(self.updated_at):
            raise ValueError("invalid workflow timestamp")
        return self


class N8nWorkflowInventoryResponse(BaseModel):
    """One closed and internally consistent inventory response."""

    model_config = ConfigDict(extra="forbid", strict=True)

    state: N8nWorkflowInventoryState
    items: Annotated[
        list[N8nWorkflowSummaryResponse],
        Field(max_length=MAX_N8N_WORKFLOW_ITEMS),
    ]
    truncated: bool
    error: N8nWorkflowInventoryError | None

    @model_validator(mode="after")
    def validate_combination(self) -> "N8nWorkflowInventoryResponse":
        expected_errors: dict[
            N8nWorkflowInventoryState,
            N8nWorkflowInventoryError,
        ] = {
            "invalid_configuration": "Invalid n8n inventory configuration",
            "access_denied": "n8n denied workflow inventory access",
            "unavailable": "n8n workflow inventory is unavailable",
            "timeout": "n8n workflow inventory timed out",
            "invalid_response": "n8n returned an invalid workflow inventory",
        }
        if self.state == "available":
            valid = self.error is None
        elif self.state == "unconfigured":
            valid = not self.items and not self.truncated and self.error is None
        else:
            valid = (
                not self.items and not self.truncated and self.error == expected_errors[self.state]
            )
        if not valid:
            raise ValueError("invalid n8n workflow inventory combination")
        return self

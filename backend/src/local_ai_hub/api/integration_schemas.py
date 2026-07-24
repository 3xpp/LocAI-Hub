"""Strict response contracts for provider integrations."""

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

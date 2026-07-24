"""Credential-free, read-only provider integration routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from local_ai_hub.api.dependencies import get_n8n_health_client
from local_ai_hub.api.integration_schemas import N8nStatusResponse
from local_ai_hub.services.n8n import N8nHealthClient

router = APIRouter(tags=["integrations"])

_PRIVACY_HEADERS = {
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
}


@router.get("/n8n/status", response_model=N8nStatusResponse)
async def n8n_status(
    response: Response,
    client: Annotated[N8nHealthClient, Depends(get_n8n_health_client)],
) -> N8nStatusResponse:
    """Return one normalized n8n health observation."""

    for name, value in _PRIVACY_HEADERS.items():
        response.headers[name] = value

    result = await client.get_status()
    return N8nStatusResponse(
        state=result.state,
        base_url=result.base_url,
        liveness=result.liveness,
        readiness=result.readiness,
        error=result.error,
    )

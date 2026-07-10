"""Backend health route."""

from fastapi import APIRouter

from local_ai_hub import __version__
from local_ai_hub.api.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Report that the API process is available."""

    return HealthResponse(
        status="ok",
        service="local-ai-workflow-hub",
        version=__version__,
    )

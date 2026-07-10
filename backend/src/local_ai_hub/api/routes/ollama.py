"""Read-only Ollama observation routes."""

from typing import Annotated

from fastapi import APIRouter, Depends

from local_ai_hub.api.dependencies import get_ollama_client
from local_ai_hub.api.schemas import (
    OllamaModelResponse,
    OllamaModelsResponse,
    OllamaStatusResponse,
)
from local_ai_hub.services.ollama import OllamaClient

router = APIRouter(tags=["ollama"])


@router.get("/status", response_model=OllamaStatusResponse)
async def ollama_status(
    client: Annotated[OllamaClient, Depends(get_ollama_client)],
) -> OllamaStatusResponse:
    """Return whether the configured Ollama server is reachable."""

    result = await client.get_status()
    return OllamaStatusResponse(
        online=result.online,
        base_url=result.base_url,
        error=result.error,
    )


@router.get("/models", response_model=OllamaModelsResponse)
async def ollama_models(
    client: Annotated[OllamaClient, Depends(get_ollama_client)],
) -> OllamaModelsResponse:
    """Return normalized Ollama model metadata."""

    result = await client.list_models()
    return OllamaModelsResponse(
        models=[
            OllamaModelResponse(
                name=model.name,
                modified_at=model.modified_at,
                size=model.size,
            )
            for model in result.models
        ],
        error=result.error,
    )

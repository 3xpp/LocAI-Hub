"""FastAPI dependency factories."""

from typing import Annotated

from fastapi import Depends

from local_ai_hub.config import Settings, get_settings
from local_ai_hub.services.n8n import N8nHealthClient
from local_ai_hub.services.ollama import OllamaClient


def get_ollama_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> OllamaClient:
    """Build an Ollama client from process-environment settings."""

    return OllamaClient(settings.ollama_base_url)


def get_n8n_health_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> N8nHealthClient:
    """Build an n8n health client from trusted process configuration."""

    return N8nHealthClient(settings.n8n_base_url)

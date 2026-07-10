"""Response models for Local AI Workflow Hub HTTP APIs."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Static backend health metadata."""

    status: str
    service: str
    version: str


class OllamaStatusResponse(BaseModel):
    """Ollama reachability response."""

    online: bool
    base_url: str
    error: str | None


class OllamaModelResponse(BaseModel):
    """Normalized Ollama model metadata."""

    name: str
    modified_at: str | None
    size: int | None


class OllamaModelsResponse(BaseModel):
    """Ollama model listing response."""

    models: list[OllamaModelResponse]
    error: str | None

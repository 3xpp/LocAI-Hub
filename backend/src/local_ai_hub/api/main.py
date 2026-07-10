"""FastAPI application assembly."""

from fastapi import FastAPI

from local_ai_hub import __version__
from local_ai_hub.api.routes import health, ollama

app = FastAPI(
    title="Local AI Workflow Hub",
    version=__version__,
)
app.include_router(health.router)
app.include_router(ollama.router, prefix="/api/ollama")

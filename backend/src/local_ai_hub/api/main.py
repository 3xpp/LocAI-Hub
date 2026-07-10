"""FastAPI application assembly and safe shared error responses."""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from local_ai_hub import __version__
from local_ai_hub.api.routes import health, ollama, prompts

app = FastAPI(
    title="Local AI Workflow Hub",
    version=__version__,
)


@app.exception_handler(RequestValidationError)
async def sanitized_validation_error(
    _request: Request,
    error: RequestValidationError,
) -> JSONResponse:
    """Return validation locations and messages without reflecting submitted values."""

    details: list[dict[str, object]] = [
        {
            "type": issue["type"],
            "loc": issue["loc"],
            "msg": issue["msg"],
        }
        for issue in error.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": details},
    )


app.include_router(health.router)
app.include_router(ollama.router, prefix="/api/ollama")
app.include_router(prompts.router, prefix="/api/prompts")

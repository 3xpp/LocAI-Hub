"""Path-scoped HTTP privacy boundary for the n8n workflow inventory."""

from types import TracebackType
from typing import Final

from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

N8N_WORKFLOW_INVENTORY_PATH: Final = "/api/integrations/n8n/workflows"

_PRIVACY_HEADERS: Final = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
}
_SANITIZED_DEFECT_MESSAGE: Final = "n8n workflow inventory request failed"


def _fixed_response(status_code: int, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail},
        headers=_PRIVACY_HEADERS,
    )


def _apply_privacy_headers(message: Message) -> None:
    headers = MutableHeaders(scope=message)
    for name, value in _PRIVACY_HEADERS.items():
        headers[name] = value


class N8nInventoryHttpBoundary:
    """Keep every inventory-path response fixed, private, and non-redirecting."""

    def __init__(self, app: ASGIApp) -> None:
        self._app = app

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        path = scope.get("path")
        if isinstance(path, str) and path.startswith(f"{N8N_WORKFLOW_INVENTORY_PATH}/"):
            await _fixed_response(404, "Not Found")(scope, receive, send)
            return
        if path != N8N_WORKFLOW_INVENTORY_PATH:
            await self._app(scope, receive, send)
            return

        response_started = False

        async def send_with_privacy_headers(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                _apply_privacy_headers(message)
                response_started = True
            await send(message)

        failure_traceback: TracebackType | None = None
        try:
            await self._app(scope, receive, send_with_privacy_headers)
        except Exception as error:
            failure_traceback = error.__traceback__

        if failure_traceback is None:
            return
        if not response_started:
            await _fixed_response(500, "Internal Server Error")(
                scope,
                receive,
                send_with_privacy_headers,
            )

        sanitized_error = RuntimeError(_SANITIZED_DEFECT_MESSAGE)
        raise sanitized_error.with_traceback(failure_traceback) from None

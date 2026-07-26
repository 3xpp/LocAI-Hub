import io
import logging
import socket
import time
from collections.abc import Generator
from threading import Thread
from typing import Any, cast

import httpx
import pytest
import uvicorn
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from local_ai_hub.api.access_logs import (
    UVICORN_ACCESS_LOGGER,
    SafeAccessLogFilter,
    install_safe_access_log_filter,
)
from local_ai_hub.api.dependencies import get_n8n_workflow_inventory_client
from local_ai_hub.api.main import app
from local_ai_hub.db.models import Base
from local_ai_hub.db.session import get_db
from local_ai_hub.db.sqlite_functions import register_sqlite_functions
from local_ai_hub.services.n8n_inventory import (
    N8nWorkflowInventoryResult,
    N8nWorkflowSummary,
)


def access_record(target: str) -> logging.LogRecord:
    return logging.LogRecord(
        UVICORN_ACCESS_LOGGER,
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:1234", "GET", target, "1.1", 200),
        None,
    )


@pytest.mark.parametrize(
    ("target", "expected"),
    [
        ("/api/workflow-links", "/api/workflow-links"),
        (
            "/api/workflow-links?q=private-query&tag=secret-tag",
            "/api/workflow-links?<redacted>",
        ),
        (
            "/api/workflow-links?q=encoded%3Fvalue%26other",
            "/api/workflow-links?<redacted>",
        ),
        ("/api/workflow-links?<redacted>", "/api/workflow-links?<redacted>"),
        (
            "/api/integrations/n8n/workflows",
            "/api/integrations/n8n/workflows",
        ),
    ],
)
def test_filter_redacts_complete_query_and_preserves_request_shape(
    target: str,
    expected: str,
) -> None:
    record = access_record(target)
    original_args = record.args

    assert SafeAccessLogFilter().filter(record) is True

    assert isinstance(record.args, tuple)
    assert record.args is not original_args
    assert record.args == ("127.0.0.1:1234", "GET", expected, "1.1", 200)


@pytest.mark.parametrize("args", [None, {"target": "/?secret"}, ["GET", "/?secret"]])
def test_filter_tolerates_unexpected_argument_shapes(args: object) -> None:
    record = access_record("/safe")
    cast(Any, record).args = args

    assert SafeAccessLogFilter().filter(record) is True
    assert record.args is args


def test_filter_tolerates_short_or_non_string_request_targets() -> None:
    filter_ = SafeAccessLogFilter()
    short = access_record("/safe")
    short.args = ("client", "GET")
    non_string = access_record("/safe")
    non_string.args = ("client", "GET", 42, "1.1", 200)

    assert filter_.filter(short) is True
    assert filter_.filter(non_string) is True
    assert short.args == ("client", "GET")
    assert non_string.args == ("client", "GET", 42, "1.1", 200)


def test_install_is_idempotent() -> None:
    logger = logging.getLogger(UVICORN_ACCESS_LOGGER)
    original_filters = list(logger.filters)
    for filter_ in list(logger.filters):
        logger.removeFilter(filter_)
    try:
        install_safe_access_log_filter()
        install_safe_access_log_filter()

        project_filters = [
            filter_
            for filter_ in logger.filters
            if getattr(filter_, "_local_ai_hub_query_redaction_filter", False)
        ]
        assert len(project_filters) == 1
    finally:
        for filter_ in list(logger.filters):
            logger.removeFilter(filter_)
        for filter_ in original_filters:
            logger.addFilter(filter_)


@pytest.fixture
def isolated_database_override() -> Generator[None, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    register_sqlite_functions(engine)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )

    def override_get_db() -> Generator[Session, None, None]:
        with session_factory() as session:
            yield session

    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    try:
        yield
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override
        engine.dispose()


def test_real_uvicorn_access_log_redacts_query_values(
    isolated_database_override: None,
) -> None:
    del isolated_database_override
    query_marker = "access-log-private-query-marker"
    tag_marker = "access-log-secret-tag-marker"
    logger = logging.getLogger(UVICORN_ACCESS_LOGGER)
    original_handlers = list(logger.handlers)
    original_filters = list(logger.filters)
    original_level = logger.level
    original_propagate = logger.propagate
    original_disabled = logger.disabled

    output = io.StringIO()
    capture = logging.StreamHandler(output)
    capture.setFormatter(logging.Formatter("%(message)s"))

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen(5)
    host, port = listener.getsockname()

    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        access_log=True,
        log_config=None,
        log_level="info",
        lifespan="on",
    )
    server = uvicorn.Server(config)
    thread = Thread(
        target=server.run,
        kwargs={"sockets": [listener]},
        daemon=True,
    )

    try:
        logger.handlers = [capture]
        logger.filters = []
        logger.setLevel(logging.INFO)
        logger.propagate = False
        logger.disabled = False
        thread.start()

        deadline = time.monotonic() + 5
        while not server.started and thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert server.started

        with httpx.Client(trust_env=False, timeout=5) as client:
            response = client.get(
                f"http://{host}:{port}/api/workflow-links",
                params={"q": query_marker, "tag": tag_marker},
            )
        assert response.status_code == 200
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        if thread.is_alive():
            server.force_exit = True
            thread.join(timeout=5)
        listener.close()
        capture.flush()
        logger.handlers = original_handlers
        logger.filters = original_filters
        logger.setLevel(original_level)
        logger.propagate = original_propagate
        logger.disabled = original_disabled

    assert not thread.is_alive()
    formatted = output.getvalue()
    assert query_marker not in formatted
    assert tag_marker not in formatted
    assert "/api/workflow-links?<redacted>" in formatted


class AccessLogInventoryClient:
    def __init__(self, secret_marker: str, body_marker: str) -> None:
        self.secret_marker = secret_marker
        self.body_marker = body_marker

    async def get_inventory(self) -> N8nWorkflowInventoryResult:
        return N8nWorkflowInventoryResult(
            "available",
            (
                N8nWorkflowSummary(
                    "workflow-name-private-marker",
                    True,
                    "2026-07-26T08:30:00Z",
                ),
            ),
            False,
            None,
        )


def test_real_uvicorn_inventory_log_contains_only_fixed_path() -> None:
    synthetic_key_marker = "phase2b-access-key-marker"
    provider_body_marker = "phase2b-provider-body-marker"
    cursor_marker = "phase2b-cursor-marker"
    workflow_name_marker = "workflow-name-private-marker"
    logger = logging.getLogger(UVICORN_ACCESS_LOGGER)
    original_handlers = list(logger.handlers)
    original_filters = list(logger.filters)
    original_level = logger.level
    original_propagate = logger.propagate
    original_disabled = logger.disabled
    previous_override = app.dependency_overrides.get(get_n8n_workflow_inventory_client)
    app.dependency_overrides[get_n8n_workflow_inventory_client] = lambda: AccessLogInventoryClient(
        synthetic_key_marker,
        provider_body_marker,
    )

    output = io.StringIO()
    capture = logging.StreamHandler(output)
    capture.setFormatter(logging.Formatter("%(message)s"))
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen(5)
    host, port = listener.getsockname()
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        access_log=True,
        log_config=None,
        log_level="info",
        lifespan="on",
    )
    server = uvicorn.Server(config)
    thread = Thread(
        target=server.run,
        kwargs={"sockets": [listener]},
        daemon=True,
    )

    try:
        logger.handlers = [capture]
        logger.filters = []
        logger.setLevel(logging.INFO)
        logger.propagate = False
        logger.disabled = False
        thread.start()
        deadline = time.monotonic() + 5
        while not server.started and thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert server.started
        with httpx.Client(trust_env=False, timeout=5) as client:
            response = client.get(
                f"http://{host}:{port}/api/integrations/n8n/workflows",
                params={"cursor": cursor_marker},
            )
        assert response.status_code == 200
        assert workflow_name_marker in response.text
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        if thread.is_alive():
            server.force_exit = True
            thread.join(timeout=5)
        listener.close()
        capture.flush()
        logger.handlers = original_handlers
        logger.filters = original_filters
        logger.setLevel(original_level)
        logger.propagate = original_propagate
        logger.disabled = original_disabled
        if previous_override is None:
            app.dependency_overrides.pop(
                get_n8n_workflow_inventory_client,
                None,
            )
        else:
            app.dependency_overrides[get_n8n_workflow_inventory_client] = previous_override

    assert not thread.is_alive()
    formatted = output.getvalue()
    assert "/api/integrations/n8n/workflows?<redacted>" in formatted
    assert synthetic_key_marker not in formatted
    assert provider_body_marker not in formatted
    assert cursor_marker not in formatted
    assert workflow_name_marker not in formatted


class FailingAccessLogInventoryClient:
    def __init__(self, marker: str) -> None:
        self.marker = marker

    async def get_inventory(self) -> N8nWorkflowInventoryResult:
        raise RuntimeError(self.marker)


def test_real_uvicorn_inventory_error_log_uses_only_sanitized_defect() -> None:
    synthetic_key_marker = "phase2b-error-key-marker"
    provider_body_marker = "phase2b-error-provider-body-marker"
    cursor_marker = "phase2b-error-cursor-marker"
    workflow_name_marker = "phase2b-error-workflow-name-marker"
    private_marker = " ".join(
        (
            synthetic_key_marker,
            provider_body_marker,
            cursor_marker,
            workflow_name_marker,
        )
    )
    access_logger = logging.getLogger(UVICORN_ACCESS_LOGGER)
    error_logger = logging.getLogger("uvicorn.error")
    original_access_state = (
        list(access_logger.handlers),
        list(access_logger.filters),
        access_logger.level,
        access_logger.propagate,
        access_logger.disabled,
    )
    original_error_state = (
        list(error_logger.handlers),
        list(error_logger.filters),
        error_logger.level,
        error_logger.propagate,
        error_logger.disabled,
    )
    previous_override = app.dependency_overrides.get(get_n8n_workflow_inventory_client)
    app.dependency_overrides[get_n8n_workflow_inventory_client] = lambda: (
        FailingAccessLogInventoryClient(private_marker)
    )

    output = io.StringIO()
    capture = logging.StreamHandler(output)
    capture.setFormatter(logging.Formatter("%(message)s"))
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen(5)
    host, port = listener.getsockname()
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        access_log=True,
        log_config=None,
        log_level="info",
        lifespan="on",
    )
    server = uvicorn.Server(config)
    thread = Thread(
        target=server.run,
        kwargs={"sockets": [listener]},
        daemon=True,
    )

    try:
        for logger in (access_logger, error_logger):
            logger.handlers = [capture]
            logger.filters = []
            logger.setLevel(logging.INFO)
            logger.propagate = False
            logger.disabled = False
        thread.start()
        deadline = time.monotonic() + 5
        while not server.started and thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert server.started
        with httpx.Client(trust_env=False, timeout=5) as client:
            response = client.get(
                f"http://{host}:{port}/api/integrations/n8n/workflows",
                params={"cursor": cursor_marker},
            )
        assert response.status_code == 500
        assert response.json() == {"detail": "Internal Server Error"}
        assert response.headers.get_list("content-type") == ["application/json"]
        assert response.headers.get_list("cache-control") == ["no-store"]
        assert response.headers.get_list("pragma") == ["no-cache"]
        assert response.headers.get_list("x-content-type-options") == ["nosniff"]
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        if thread.is_alive():
            server.force_exit = True
            thread.join(timeout=5)
        listener.close()
        capture.flush()
        (
            access_logger.handlers,
            access_logger.filters,
            access_logger.level,
            access_logger.propagate,
            access_logger.disabled,
        ) = original_access_state
        (
            error_logger.handlers,
            error_logger.filters,
            error_logger.level,
            error_logger.propagate,
            error_logger.disabled,
        ) = original_error_state
        if previous_override is None:
            app.dependency_overrides.pop(
                get_n8n_workflow_inventory_client,
                None,
            )
        else:
            app.dependency_overrides[get_n8n_workflow_inventory_client] = previous_override

    assert not thread.is_alive()
    formatted = output.getvalue()
    assert "/api/integrations/n8n/workflows?<redacted>" in formatted
    assert "n8n workflow inventory request failed" in formatted
    assert synthetic_key_marker not in formatted
    assert provider_body_marker not in formatted
    assert cursor_marker not in formatted
    assert workflow_name_marker not in formatted

import json
from collections.abc import Generator
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from local_ai_hub.api.main import app
from local_ai_hub.api.routes.workflow_links import workflow_link_collection
from local_ai_hub.api.workflow_link_schemas import workflow_link_to_response
from local_ai_hub.db.models import Base
from local_ai_hub.db.session import get_db
from local_ai_hub.db.sqlite_functions import register_sqlite_functions
from local_ai_hub.services.workflow_links import WorkflowLinkInputError


@dataclass(frozen=True, slots=True)
class WorkflowLinkApiHarness:
    client: TestClient
    session_factory: sessionmaker[Session]


@pytest.fixture
def harness() -> Generator[WorkflowLinkApiHarness, None, None]:
    database_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    register_sqlite_functions(database_engine)
    Base.metadata.create_all(database_engine)
    session_factory = sessionmaker(
        bind=database_engine,
        autoflush=False,
        expire_on_commit=False,
    )

    def override_get_db() -> Generator[Session, None, None]:
        with session_factory() as session:
            yield session

    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            yield WorkflowLinkApiHarness(client=client, session_factory=session_factory)
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override
        database_engine.dispose()


def workflow_link_payload(
    *,
    title: str = "Local n8n workflow",
    url: str = "http://localhost:5678/workflow/abc?view=full#node",
    description: str = "Runs the local repository summary.",
    tags: list[str] | None = None,
) -> dict[str, object]:
    return {
        "title": title,
        "url": url,
        "description": description,
        "tags": ["N8N", "local", "n8n"] if tags is None else tags,
    }


def assert_json(response: Response, status_code: int) -> None:
    assert response.status_code == status_code
    assert response.headers["content-type"].startswith("application/json")


def test_create_get_replace_delete_and_repeat_404(harness: WorkflowLinkApiHarness) -> None:
    created = harness.client.post("/api/workflow-links", json=workflow_link_payload())

    assert_json(created, 201)
    body = created.json()
    assert body["title"] == "Local n8n workflow"
    assert body["url"] == "http://localhost:5678/workflow/abc?view=full#node"
    assert body["description"] == "Runs the local repository summary."
    assert body["tags"] == ["n8n", "local"]
    assert body["created_at"].endswith("Z")
    assert body["updated_at"].endswith("Z")

    item_id = body["id"]
    retrieved = harness.client.get(f"/api/workflow-links/{item_id}")
    assert_json(retrieved, 200)
    assert retrieved.json() == body

    updated = harness.client.put(
        f"/api/workflow-links/{item_id}",
        json={
            "title": "Updated workflow",
            "url": "https://example.com/workflow/updated",
        },
    )
    assert_json(updated, 200)
    assert updated.json()["description"] == ""
    assert updated.json()["tags"] == []

    deleted = harness.client.delete(f"/api/workflow-links/{item_id}")
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert "content-type" not in deleted.headers

    repeated = harness.client.delete(f"/api/workflow-links/{item_id}")
    assert_json(repeated, 404)
    assert repeated.json() == {"detail": "Workflow link not found"}


def test_summary_omits_description_and_handles_empty_preview(
    harness: WorkflowLinkApiHarness,
) -> None:
    full_description = "Sensitive full description " + ("x" * 200)
    first = harness.client.post(
        "/api/workflow-links",
        json=workflow_link_payload(description=full_description),
    )
    second = harness.client.post(
        "/api/workflow-links",
        json=workflow_link_payload(title="Empty description", description="", tags=[]),
    )
    assert first.status_code == second.status_code == 201

    listed = harness.client.get("/api/workflow-links")

    assert_json(listed, 200)
    items = listed.json()["items"]
    assert listed.json()["total"] == 2
    assert all("description" not in item for item in items)
    assert items[0]["description_preview"] == ""
    assert items[1]["description_preview"].endswith("…")
    assert full_description not in listed.text


def test_search_exact_tag_pagination_order_and_duplicates(
    harness: WorkflowLinkApiHarness,
) -> None:
    records = [
        workflow_link_payload(
            title="Repository one",
            url="http://localhost:5678/workflow/duplicate",
            tags=["n8n", "repository"],
        ),
        workflow_link_payload(
            title="Repository two",
            url="http://localhost:5678/workflow/duplicate",
            tags=["n8n", "repository"],
        ),
        workflow_link_payload(title="Repository notes", tags=["documentation"]),
        workflow_link_payload(title="Meeting", description="Repository activity", tags=["n8n"]),
    ]
    created_ids = []
    for record in records:
        response = harness.client.post("/api/workflow-links", json=record)
        assert response.status_code == 201
        created_ids.append(response.json()["id"])

    first = harness.client.get(
        "/api/workflow-links",
        params={"q": "repository", "tag": " N8N ", "limit": 1, "offset": 0},
    )
    second = harness.client.get(
        "/api/workflow-links",
        params={"q": "repository", "tag": "n8n", "limit": 1, "offset": 1},
    )

    assert_json(first, 200)
    assert first.json()["total"] == second.json()["total"] == 3
    assert first.json()["limit"] == 1
    assert first.json()["offset"] == 0
    assert second.json()["offset"] == 1
    assert first.json()["items"][0]["id"] != second.json()["items"][0]["id"]

    unfiltered = harness.client.get("/api/workflow-links").json()["items"]
    assert [item["id"] for item in unfiltered] == list(reversed(created_ids))
    assert sum(item["url"].endswith("/duplicate") for item in unfiltered) == 2


def test_omitted_create_defaults_and_empty_query(harness: WorkflowLinkApiHarness) -> None:
    created = harness.client.post(
        "/api/workflow-links",
        json={"title": "Minimal", "url": "http://localhost:5678/minimal"},
    )
    assert created.status_code == 201
    assert created.json()["description"] == ""
    assert created.json()["tags"] == []

    listed = harness.client.get("/api/workflow-links", params={"q": "  \n "})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1


@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_missing_items_use_one_fixed_404(
    harness: WorkflowLinkApiHarness,
    method: str,
) -> None:
    if method == "get":
        response = harness.client.get("/api/workflow-links/999")
    elif method == "put":
        response = harness.client.put(
            "/api/workflow-links/999",
            json=workflow_link_payload(),
        )
    else:
        response = harness.client.delete("/api/workflow-links/999")

    assert_json(response, 404)
    assert response.json() == {"detail": "Workflow link not found"}


@pytest.mark.parametrize(
    "item_id",
    ["0", "-1", "not-an-integer", "9223372036854775808"],
)
def test_invalid_ids_are_sanitized_422(
    harness: WorkflowLinkApiHarness,
    item_id: str,
) -> None:
    response = harness.client.get(f"/api/workflow-links/{item_id}")

    assert_json(response, 422)
    assert "input" not in response.json()["detail"][0]


@pytest.mark.parametrize(
    "params",
    [
        {"q": "q" * 201},
        {"tag": "invalid,tag"},
        {"limit": 0},
        {"limit": 101},
        {"offset": -1},
        {"offset": 9_223_372_036_854_775_808},
    ],
)
def test_invalid_collection_parameters_are_sanitized_422(
    harness: WorkflowLinkApiHarness,
    params: dict[str, object],
) -> None:
    response = harness.client.get("/api/workflow-links", params=params)

    assert_json(response, 422)
    assert "input" not in response.json()["detail"][0]


@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_oversized_item_ids_are_sanitized_for_every_item_method(
    harness: WorkflowLinkApiHarness,
    method: str,
) -> None:
    path = "/api/workflow-links/9223372036854775808"
    if method == "get":
        response = harness.client.get(path)
    elif method == "put":
        response = harness.client.put(path, json=workflow_link_payload())
    else:
        response = harness.client.delete(path)

    assert_json(response, 422)
    assert "input" not in response.json()["detail"][0]


def test_unknown_fields_are_rejected_without_mutation(harness: WorkflowLinkApiHarness) -> None:
    invalid_create = harness.client.post(
        "/api/workflow-links",
        json={
            **workflow_link_payload(),
            "provider": "sensitive-provider-marker",
        },
    )
    assert_json(invalid_create, 422)
    assert "sensitive-provider-marker" not in invalid_create.text
    assert harness.client.get("/api/workflow-links").json()["total"] == 0

    created = harness.client.post("/api/workflow-links", json=workflow_link_payload()).json()
    invalid_update = harness.client.put(
        f"/api/workflow-links/{created['id']}",
        json={**workflow_link_payload(title="Changed"), "provider": "ignored"},
    )
    assert invalid_update.status_code == 422
    assert harness.client.get(f"/api/workflow-links/{created['id']}").json() == created


def _url_fixture() -> dict[str, list[dict[str, str]]]:
    fixture = (
        Path(__file__).resolve().parents[3]
        / "web"
        / "src"
        / "test"
        / "fixtures"
        / "workflowLinkUrlCases.json"
    )
    return json.loads(fixture.read_text(encoding="utf-8"))


@pytest.mark.parametrize("url", [case["value"] for case in _url_fixture()["accepted"]])
def test_api_accepts_shared_valid_url_cases(
    harness: WorkflowLinkApiHarness,
    url: str,
) -> None:
    response = harness.client.post(
        "/api/workflow-links",
        json=workflow_link_payload(url=url),
    )

    assert response.status_code == 201
    assert response.json()["url"] == url.strip()


@pytest.mark.parametrize("url", [case["value"] for case in _url_fixture()["rejected"]])
def test_api_rejects_every_shared_invalid_url_without_reflection(
    harness: WorkflowLinkApiHarness,
    url: str,
) -> None:
    response = harness.client.post(
        "/api/workflow-links",
        json=workflow_link_payload(url=url),
    )

    assert_json(response, 422)
    assert url not in response.text
    assert "input" not in response.json()["detail"][0]


def test_oversized_body_and_query_values_never_reflect(
    harness: WorkflowLinkApiHarness,
) -> None:
    cases = (
        (
            harness.client.post,
            "/api/workflow-links",
            {"json": workflow_link_payload(url="http://example.com/" + ("u" * 2_100))},
            "u" * 2_100,
        ),
        (
            harness.client.post,
            "/api/workflow-links",
            {"json": workflow_link_payload(description="d" * 5_001)},
            "d" * 5_001,
        ),
        (
            harness.client.get,
            "/api/workflow-links",
            {"params": {"q": "q" * 201}},
            "q" * 201,
        ),
    )
    for request, path, kwargs, marker in cases:
        response = request(path, **kwargs)
        assert_json(response, 422)
        assert marker not in response.text
        assert len(response.content) < 1_000


@pytest.mark.parametrize("operation", ["list", "create", "get", "update", "delete"])
def test_repository_failures_rollback_once_without_leaking(
    harness: WorkflowLinkApiHarness,
    caplog: pytest.LogCaptureFixture,
    operation: str,
) -> None:
    marker = f"sensitive-{operation}-sql-marker"
    item_id: int | None = None
    if operation in {"update", "delete"}:
        item_id = harness.client.post(
            "/api/workflow-links",
            json=workflow_link_payload(),
        ).json()["id"]

    repository_names = {
        "list": "list_workflow_links",
        "create": "create_workflow_link",
        "get": "get_workflow_link",
        "update": "update_workflow_link",
        "delete": "delete_workflow_link",
    }
    target = "local_ai_hub.api.routes.workflow_links." + repository_names[operation]
    with (
        patch(target, side_effect=SQLAlchemyError("SELECT secret WHERE value=" + marker)),
        patch.object(Session, "rollback", autospec=True) as rollback,
    ):
        if operation == "list":
            response = harness.client.get("/api/workflow-links")
        elif operation == "create":
            response = harness.client.post(
                "/api/workflow-links",
                json=workflow_link_payload(),
            )
        elif operation == "get":
            response = harness.client.get("/api/workflow-links/1")
        elif operation == "update":
            response = harness.client.put(
                f"/api/workflow-links/{item_id}",
                json=workflow_link_payload(title="Updated"),
            )
        else:
            response = harness.client.delete(f"/api/workflow-links/{item_id}")

    assert_json(response, 500)
    assert response.json() == {"detail": "Workflow link operation failed"}
    assert marker not in response.text
    assert marker not in caplog.text
    rollback.assert_called_once()


def test_rollback_failure_cannot_replace_or_leak_fixed_error(
    harness: WorkflowLinkApiHarness,
    caplog: pytest.LogCaptureFixture,
) -> None:
    marker = "sensitive-rollback-marker"
    with (
        patch(
            "local_ai_hub.api.routes.workflow_links.list_workflow_links",
            side_effect=SQLAlchemyError(marker),
        ),
        patch.object(Session, "rollback", autospec=True, side_effect=RuntimeError(marker)),
    ):
        response = harness.client.get("/api/workflow-links")

    assert_json(response, 500)
    assert response.json() == {"detail": "Workflow link operation failed"}
    assert marker not in response.text
    assert marker not in caplog.text


def test_fixed_operation_error_suppresses_the_persistence_exception_chain() -> None:
    session = Session()
    try:
        with (
            patch(
                "local_ai_hub.api.routes.workflow_links.list_workflow_links",
                side_effect=SQLAlchemyError("sensitive-chain-marker"),
            ),
            pytest.raises(HTTPException) as caught,
        ):
            workflow_link_collection(
                session=session,
                q=None,
                tag=None,
                limit=50,
                offset=0,
            )
    finally:
        session.close()

    assert caught.value.status_code == 500
    assert caught.value.__cause__ is None
    assert caught.value.__suppress_context__ is True


@pytest.mark.parametrize(
    ("column", "value"),
    [
        ("id", 0),
        ("title", " corrupt title "),
        ("url", "file://sensitive-url-marker"),
        ("description", " corrupt description "),
        ("tags", " Corrupt Tag "),
        ("created_at", "invalid-created-at-marker"),
        ("updated_at", "invalid-updated-at-marker"),
    ],
)
def test_corrupt_stored_scalars_fail_closed_in_list(
    harness: WorkflowLinkApiHarness,
    caplog: pytest.LogCaptureFixture,
    column: str,
    value: object,
) -> None:
    created = harness.client.post(
        "/api/workflow-links",
        json=workflow_link_payload(),
    ).json()
    with harness.session_factory.begin() as session:
        session.execute(
            text(f"UPDATE workflow_links SET {column} = :value WHERE id = :item_id"),
            {"value": value, "item_id": created["id"]},
        )

    response = harness.client.get("/api/workflow-links")

    assert_json(response, 500)
    assert response.json() == {"detail": "Workflow link operation failed"}
    assert str(value) not in response.text
    assert str(value) not in caplog.text


@pytest.mark.parametrize(
    ("column", "value"),
    [
        ("title", " corrupt title "),
        ("url", "file://sensitive-url-marker"),
        ("description", " corrupt description "),
        ("tags", " Corrupt Tag "),
        ("created_at", "invalid-created-at-marker"),
        ("updated_at", "invalid-updated-at-marker"),
    ],
)
def test_corrupt_stored_scalars_fail_closed_in_detail(
    harness: WorkflowLinkApiHarness,
    column: str,
    value: object,
) -> None:
    created = harness.client.post(
        "/api/workflow-links",
        json=workflow_link_payload(),
    ).json()
    with harness.session_factory.begin() as session:
        session.execute(
            text(f"UPDATE workflow_links SET {column} = :value WHERE id = :item_id"),
            {"value": value, "item_id": created["id"]},
        )

    response = harness.client.get(f"/api/workflow-links/{created['id']}")

    assert_json(response, 500)
    assert response.json() == {"detail": "Workflow link operation failed"}
    assert str(value) not in response.text


@pytest.mark.parametrize("operation", ["put", "delete"])
def test_mutations_neither_repair_nor_delete_corrupt_storage(
    harness: WorkflowLinkApiHarness,
    operation: str,
) -> None:
    corrupt_title = " corrupt-mutation-marker "
    created = harness.client.post(
        "/api/workflow-links",
        json=workflow_link_payload(),
    ).json()
    with harness.session_factory.begin() as session:
        session.execute(
            text("UPDATE workflow_links SET title = :title WHERE id = :item_id"),
            {"title": corrupt_title, "item_id": created["id"]},
        )

    if operation == "put":
        response = harness.client.put(
            f"/api/workflow-links/{created['id']}",
            json=workflow_link_payload(title="Attempted repair"),
        )
    else:
        response = harness.client.delete(f"/api/workflow-links/{created['id']}")

    assert_json(response, 500)
    assert response.json() == {"detail": "Workflow link operation failed"}
    assert corrupt_title not in response.text
    with harness.session_factory() as session:
        stored_title = session.scalar(
            text("SELECT title FROM workflow_links WHERE id = :item_id"),
            {"item_id": created["id"]},
        )
    assert stored_title == corrupt_title


def test_response_converter_rejects_bool_identifier() -> None:
    corrupt = SimpleNamespace(
        id=True,
        title="Title",
        url="http://localhost:5678/workflow",
        description="",
        tags="",
        created_at=None,
        updated_at=None,
    )

    with pytest.raises(WorkflowLinkInputError, match="stored workflow link is invalid"):
        workflow_link_to_response(corrupt)  # type: ignore[arg-type]

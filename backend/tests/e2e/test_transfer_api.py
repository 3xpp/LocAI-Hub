"""End-to-end tests for safe local registry transfer routes."""

import json
from collections.abc import Generator
from dataclasses import dataclass
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from local_ai_hub.api.main import app
from local_ai_hub.db.models import Base, Prompt, WorkflowLink
from local_ai_hub.db.session import get_db
from local_ai_hub.db.sqlite_functions import register_sqlite_functions
from local_ai_hub.services.transfer import MAX_BUNDLE_BYTES, MAX_BUNDLE_RECORDS


@dataclass(frozen=True, slots=True)
class TransferApiHarness:
    client: TestClient
    session_factory: sessionmaker[Session]


@pytest.fixture
def harness() -> Generator[TransferApiHarness, None, None]:
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
            yield TransferApiHarness(client=client, session_factory=session_factory)
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override
        database_engine.dispose()


def prompt_record(**overrides: object) -> dict[str, object]:
    record: dict[str, object] = {
        "type": "prompt",
        "title": "Imported prompt",
        "content": "  Exact imported content\n",
        "tags": ["local", "review"],
    }
    record.update(overrides)
    return record


def workflow_record(**overrides: object) -> dict[str, object]:
    record: dict[str, object] = {
        "type": "workflow_link",
        "title": "Imported workflow",
        "url": "http://localhost:19999/never-request?opaque=yes#fragment",
        "description": "Operator reference",
        "tags": ["local", "n8n"],
    }
    record.update(overrides)
    return record


def bundle(records: list[dict[str, object]] | None = None) -> dict[str, object]:
    return {
        "application": "local-ai-workflow-hub",
        "format_version": 1,
        "exported_at": "2026-07-18T12:00:00Z",
        "records": [] if records is None else records,
    }


def post_raw(client: TestClient, path: str, value: object) -> Response:
    return client.post(
        path,
        content=json.dumps(value, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )


def assert_transfer_headers(response: Response, *, download: bool = False) -> None:
    assert response.headers["content-type"] == "application/json; charset=utf-8"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    if download:
        assert response.headers["content-disposition"].startswith(
            'attachment; filename="local-ai-workflow-hub-'
        )
    else:
        assert "content-disposition" not in response.headers


def stored_counts(harness: TransferApiHarness) -> tuple[int, int]:
    with harness.session_factory() as session:
        prompts = session.scalar(select(func.count()).select_from(Prompt)) or 0
        workflows = session.scalar(select(func.count()).select_from(WorkflowLink)) or 0
    return prompts, workflows


def test_empty_export_previews_but_cannot_be_committed(harness: TransferApiHarness) -> None:
    exported = harness.client.get("/api/transfer/export")

    assert exported.status_code == 200
    assert exported.json()["application"] == "local-ai-workflow-hub"
    assert exported.json()["format_version"] == 1
    assert exported.json()["records"] == []
    assert exported.content.endswith(b"\n")
    assert_transfer_headers(exported, download=True)

    preview = harness.client.post(
        "/api/transfer/import/preview",
        content=exported.content,
        headers={"Content-Type": "application/json"},
    )
    assert preview.status_code == 200
    assert preview.json() == {
        "valid": True,
        "importable": False,
        "format_version": 1,
        "counts": {"total": 0, "prompts": 0, "workflow_links": 0},
        "duplicates": {"total": 0, "prompts": 0, "workflow_links": 0},
        "warnings": [
            {
                "code": "empty_bundle",
                "message": "This bundle contains no records and cannot be imported.",
            }
        ],
    }
    assert_transfer_headers(preview)

    committed = harness.client.post(
        "/api/transfer/import",
        content=exported.content,
        headers={"Content-Type": "application/json"},
    )
    assert committed.status_code == 422
    assert committed.json()["detail"]["code"] == "empty_bundle"
    assert stored_counts(harness) == (0, 0)
    assert_transfer_headers(committed)


def test_export_is_deterministic_portable_and_fails_closed_on_no_values(
    harness: TransferApiHarness,
) -> None:
    with harness.session_factory() as session:
        session.add_all(
            [
                Prompt(title="First prompt", content="one", tags=None),
                Prompt(title="Second prompt", content="two", tags=""),
                WorkflowLink(
                    title="First workflow",
                    url="http://localhost:5678/workflow/one",
                    description="One",
                    tags="local",
                ),
                WorkflowLink(
                    title="Second workflow",
                    url="http://localhost:5678/workflow/two",
                    description="Two",
                    tags="local,n8n",
                ),
            ]
        )
        session.commit()

    response = harness.client.get("/api/transfer/export")

    assert response.status_code == 200
    assert_transfer_headers(response, download=True)
    value = response.json()
    assert value["exported_at"].endswith("Z")
    assert [record["type"] for record in value["records"]] == [
        "prompt",
        "prompt",
        "workflow_link",
        "workflow_link",
    ]
    assert [record["title"] for record in value["records"]] == [
        "First prompt",
        "Second prompt",
        "First workflow",
        "Second workflow",
    ]
    assert value["records"][0]["tags"] == []
    assert value["records"][1]["tags"] == []
    assert all("id" not in record for record in value["records"])
    assert all("created_at" not in record for record in value["records"])
    assert all("updated_at" not in record for record in value["records"])


def test_preview_never_mutates_and_reports_storage_and_bundle_duplicates(
    harness: TransferApiHarness,
) -> None:
    raw = bundle([prompt_record(), prompt_record(), workflow_record()])
    with harness.session_factory() as session:
        session.add(
            Prompt(
                title="Imported prompt",
                content="  Exact imported content\n",
                tags="review,local",
            )
        )
        session.commit()

    before = stored_counts(harness)
    response = post_raw(harness.client, "/api/transfer/import/preview", raw)

    assert response.status_code == 200
    assert response.json()["counts"] == {"total": 3, "prompts": 2, "workflow_links": 1}
    assert response.json()["duplicates"] == {
        "total": 2,
        "prompts": 2,
        "workflow_links": 0,
    }
    assert response.json()["warnings"] == [
        {
            "code": "exact_duplicates",
            "message": "Exact duplicates will be imported as new records.",
        }
    ]
    assert stored_counts(harness) == before
    assert_transfer_headers(response)


def test_repeat_import_appends_every_record_with_fresh_identity_and_times(
    harness: TransferApiHarness,
) -> None:
    raw = bundle(
        [
            prompt_record(title="  Imported prompt  ", tags=[" Local ", "local", "Review"]),
            workflow_record(
                title="  Imported workflow  ",
                url="  http://localhost:19999/never-request?opaque=yes#fragment  ",
                description="  Operator reference  ",
                tags=[" Local ", "N8N", "local"],
            ),
        ]
    )

    first = post_raw(harness.client, "/api/transfer/import", raw)
    assert first.status_code == 201
    assert first.json() == {
        "imported": {"total": 2, "prompts": 1, "workflow_links": 1},
        "duplicates_imported": {"total": 0, "prompts": 0, "workflow_links": 0},
    }
    assert_transfer_headers(first)

    second_preview = post_raw(harness.client, "/api/transfer/import/preview", raw)
    assert second_preview.json()["duplicates"]["total"] == 2
    second = post_raw(harness.client, "/api/transfer/import", raw)
    assert second.status_code == 201
    assert second.json()["duplicates_imported"] == {
        "total": 2,
        "prompts": 1,
        "workflow_links": 1,
    }
    assert stored_counts(harness) == (2, 2)

    with harness.session_factory() as session:
        prompts = tuple(session.scalars(select(Prompt).order_by(Prompt.id)).all())
        workflows = tuple(session.scalars(select(WorkflowLink).order_by(WorkflowLink.id)).all())
    assert len({item.id for item in prompts}) == 2
    assert len({item.id for item in workflows}) == 2
    assert all(item.created_at.tzinfo is not None for item in prompts + workflows)
    assert all(item.updated_at.tzinfo is not None for item in prompts + workflows)
    assert all(item.title == "Imported prompt" for item in prompts)
    assert all(item.tags == "local,review" for item in prompts)
    assert all(item.title == "Imported workflow" for item in workflows)
    assert all(item.tags == "local,n8n" for item in workflows)


@pytest.mark.parametrize(
    ("content_type", "expected_status", "expected_code"),
    [
        (None, 415, "unsupported_media_type"),
        ("text/json", 415, "unsupported_media_type"),
        ("application/json; charset=latin-1", 415, "unsupported_media_type"),
    ],
)
def test_invalid_media_types_are_safe(
    harness: TransferApiHarness,
    content_type: str | None,
    expected_status: int,
    expected_code: str,
) -> None:
    headers = {} if content_type is None else {"Content-Type": content_type}
    response = harness.client.post(
        "/api/transfer/import/preview",
        content=b"{}",
        headers=headers,
    )

    assert response.status_code == expected_status
    assert response.json()["detail"]["code"] == expected_code
    assert_transfer_headers(response)


@pytest.mark.parametrize(
    ("raw", "expected_code"),
    [
        (b"{", "malformed_json"),
        (b'{"application":"a","application":"b"}', "malformed_json"),
        (b'{"value":NaN}', "malformed_json"),
        (b"\xff", "malformed_json"),
    ],
)
def test_malformed_json_is_bounded_and_safe(
    harness: TransferApiHarness,
    raw: bytes,
    expected_code: str,
) -> None:
    response = harness.client.post(
        "/api/transfer/import/preview",
        content=raw,
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == expected_code
    assert len(response.content) < 1_000
    assert_transfer_headers(response)


def test_invalid_bundle_never_reflects_unknown_keys_or_values(
    harness: TransferApiHarness,
) -> None:
    marker = "private-marker-never-reflect"
    value = bundle([prompt_record(**{marker: marker})])

    response = post_raw(harness.client, "/api/transfer/import/preview", value)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_bundle"
    assert marker not in response.text
    assert response.json()["detail"]["issues"][0]["field"] is None
    assert_transfer_headers(response)


def test_declared_oversize_is_rejected_without_parsing(harness: TransferApiHarness) -> None:
    response = harness.client.post(
        "/api/transfer/import/preview",
        content=b"{}",
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(MAX_BUNDLE_BYTES + 1),
        },
    )

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "bundle_too_large"
    assert_transfer_headers(response)


@pytest.mark.parametrize(
    ("path", "expected_code"),
    [
        ("/api/transfer/export", "export_failed"),
        ("/api/transfer/import/preview", "preview_failed"),
        ("/api/transfer/import", "import_failed"),
    ],
)
def test_corrupt_stored_data_fails_closed(
    harness: TransferApiHarness,
    path: str,
    expected_code: str,
) -> None:
    with harness.session_factory() as session:
        session.add(Prompt(title="Corrupt", content="content", tags=" invalid "))
        session.commit()

    if path.endswith("export"):
        response = harness.client.get(path)
    else:
        response = post_raw(harness.client, path, bundle([prompt_record()]))

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == expected_code
    assert "invalid" not in response.text
    assert_transfer_headers(response)


def test_export_limits_fail_without_a_partial_bundle(harness: TransferApiHarness) -> None:
    with (
        patch(
            "local_ai_hub.api.routes.transfer.count_transfer_rows",
            return_value=MAX_BUNDLE_RECORDS + 1,
        ),
        patch("local_ai_hub.api.routes.transfer.list_transfer_rows") as list_rows,
    ):
        count_limited = harness.client.get("/api/transfer/export")
    assert count_limited.status_code == 413
    assert count_limited.json()["detail"]["code"] == "export_too_large"
    list_rows.assert_not_called()

    with harness.session_factory() as session:
        session.add(Prompt(title="One", content="body", tags=""))
        session.commit()
    with patch(
        "local_ai_hub.api.routes.transfer.serialize_bundle",
        return_value=b"x" * (MAX_BUNDLE_BYTES + 1),
    ):
        byte_limited = harness.client.get("/api/transfer/export")
    assert byte_limited.status_code == 413
    assert byte_limited.json()["detail"]["code"] == "export_too_large"
    assert "content-disposition" not in byte_limited.headers


def test_import_failure_is_fixed_and_leaves_no_rows(harness: TransferApiHarness) -> None:
    marker = "private-database-error-marker"
    with patch(
        "local_ai_hub.api.routes.transfer.append_transfer_records",
        side_effect=RuntimeError(marker),
    ):
        response = post_raw(
            harness.client,
            "/api/transfer/import",
            bundle([prompt_record(), workflow_record()]),
        )

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "import_failed"
    assert marker not in response.text
    assert stored_counts(harness) == (0, 0)
    assert_transfer_headers(response)


def test_transfer_never_constructs_an_http_client_for_workflow_urls(
    harness: TransferApiHarness,
) -> None:
    value = bundle([workflow_record()])
    with (
        patch("httpx.Client", side_effect=AssertionError("destination client constructed")),
        patch("httpx.AsyncClient", side_effect=AssertionError("destination client constructed")),
    ):
        preview = post_raw(harness.client, "/api/transfer/import/preview", value)
        imported = post_raw(harness.client, "/api/transfer/import", value)
        exported = harness.client.get("/api/transfer/export")

    assert preview.status_code == 200
    assert imported.status_code == 201
    assert exported.status_code == 200
    assert exported.json()["records"][0]["url"].endswith("#fragment")

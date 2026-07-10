from collections.abc import Generator
from dataclasses import dataclass
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from local_ai_hub.api.main import app
from local_ai_hub.db.models import Base, Prompt
from local_ai_hub.db.session import get_db
from local_ai_hub.db.sqlite_functions import register_sqlite_functions


@dataclass(frozen=True, slots=True)
class PromptApiHarness:
    client: TestClient
    session_factory: sessionmaker[Session]


@pytest.fixture
def harness() -> Generator[PromptApiHarness, None, None]:
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
            yield PromptApiHarness(client=client, session_factory=session_factory)
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override
        database_engine.dispose()


def prompt_payload(
    *,
    title: str = "Refactor review",
    content: str = "Review this code.",
    tags: list[str] | None = None,
) -> dict[str, object]:
    return {
        "title": title,
        "content": content,
        "tags": ["Code", "review", "code"] if tags is None else tags,
    }


def test_create_get_update_and_delete_prompt(harness: PromptApiHarness) -> None:
    created = harness.client.post(
        "/api/prompts",
        json=prompt_payload(
            title="  Refactor review  ",
            content="  Preserve this spacing.\n",
        ),
    )

    assert created.status_code == 201
    created_body = created.json()
    assert created_body["title"] == "Refactor review"
    assert created_body["content"] == "  Preserve this spacing.\n"
    assert created_body["tags"] == ["code", "review"]
    assert created_body["created_at"].endswith("Z")
    assert created_body["updated_at"].endswith("Z")
    prompt_id = created_body["id"]

    retrieved = harness.client.get(f"/api/prompts/{prompt_id}")
    assert retrieved.status_code == 200
    assert retrieved.json() == created_body

    updated = harness.client.put(
        f"/api/prompts/{prompt_id}",
        json=prompt_payload(title="Updated", content="New content", tags=["Edited"]),
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Updated"
    assert updated.json()["tags"] == ["edited"]

    deleted = harness.client.delete(f"/api/prompts/{prompt_id}")
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert harness.client.get(f"/api/prompts/{prompt_id}").json() == {"detail": "Prompt not found"}


def test_duplicate_titles_and_summary_without_full_content(harness: PromptApiHarness) -> None:
    content = "Sensitive full content\n" + ("x" * 200)
    for tag in ("one", "two"):
        response = harness.client.post(
            "/api/prompts",
            json=prompt_payload(title="Duplicate", content=content, tags=[tag]),
        )
        assert response.status_code == 201

    listed = harness.client.get("/api/prompts")

    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] == 2
    assert body["limit"] == 50
    assert body["offset"] == 0
    assert [item["title"] for item in body["items"]] == ["Duplicate", "Duplicate"]
    assert all("content" not in item for item in body["items"])
    assert all(item["content_preview"].endswith("…") for item in body["items"])
    assert content not in listed.text


def test_omitted_tags_default_to_an_empty_array(harness: PromptApiHarness) -> None:
    response = harness.client.post(
        "/api/prompts",
        json={"title": "No tags", "content": "Raw content"},
    )

    assert response.status_code == 201
    assert response.json()["tags"] == []


def test_search_exact_tag_and_pagination_metadata(harness: PromptApiHarness) -> None:
    records = [
        prompt_payload(title="Refactor one", content="clean code", tags=["code"]),
        prompt_payload(title="Refactor two", content="clean code", tags=["code"]),
        prompt_payload(title="Refactor notes", content="writing", tags=["notes"]),
        prompt_payload(title="Meeting", content="clean code", tags=["code"]),
    ]
    for record in records:
        assert harness.client.post("/api/prompts", json=record).status_code == 201

    first_page = harness.client.get(
        "/api/prompts",
        params={"q": "refactor", "tag": " CODE ", "limit": 1, "offset": 0},
    )
    second_page = harness.client.get(
        "/api/prompts",
        params={"q": "refactor", "tag": "code", "limit": 1, "offset": 1},
    )

    assert first_page.status_code == 200
    assert first_page.json()["total"] == 2
    assert first_page.json()["limit"] == 1
    assert first_page.json()["offset"] == 0
    assert len(first_page.json()["items"]) == 1
    assert second_page.status_code == 200
    assert second_page.json()["total"] == 2
    assert second_page.json()["offset"] == 1
    assert first_page.json()["items"][0]["id"] != second_page.json()["items"][0]["id"]


def test_unicode_search_and_legacy_tag_filter_use_api_contract(
    harness: PromptApiHarness,
) -> None:
    assert (
        harness.client.post(
            "/api/prompts",
            json=prompt_payload(title="Straße prüfen", tags=[]),
        ).status_code
        == 201
    )
    with harness.session_factory() as session:
        legacy = Prompt(
            title="Legacy",
            content="content",
            tags=" Code ,ẞ,Error   Review,line\nbreak",
        )
        session.add(legacy)
        session.commit()
        legacy_id = legacy.id

    unicode_search = harness.client.get("/api/prompts", params={"q": "STRASSE"})
    legacy_get = harness.client.get(f"/api/prompts/{legacy_id}")
    legacy_filter = harness.client.get("/api/prompts", params={"tag": "error review"})

    assert [item["title"] for item in unicode_search.json()["items"]] == ["Straße prüfen"]
    assert legacy_get.json()["tags"] == ["code", "ss", "error review"]
    assert [item["id"] for item in legacy_filter.json()["items"]] == [legacy_id]


def test_empty_search_is_omitted(harness: PromptApiHarness) -> None:
    assert harness.client.post("/api/prompts", json=prompt_payload()).status_code == 201

    response = harness.client.get("/api/prompts", params={"q": "  \n "})

    assert response.status_code == 200
    assert response.json()["total"] == 1


@pytest.mark.parametrize(
    "payload",
    [
        prompt_payload(title="   "),
        prompt_payload(content=" \n\t "),
        prompt_payload(tags=["invalid,tag"]),
        prompt_payload(tags=[f"tag-{index}" for index in range(11)]),
        prompt_payload(title="t" * 201),
        prompt_payload(content="c" * 50_001),
        prompt_payload(tags=[12]),
    ],
)
def test_invalid_prompt_bodies_return_422(
    harness: PromptApiHarness,
    payload: dict[str, object],
) -> None:
    response = harness.client.post("/api/prompts", json=payload)

    assert response.status_code == 422


def test_validation_errors_never_reflect_prompt_or_query_values(
    harness: PromptApiHarness,
) -> None:
    content_marker = "sensitive-prompt-marker-" + ("x" * 50_001)
    query_marker = "sensitive-query-marker-" + ("q" * 201)

    body_response = harness.client.post(
        "/api/prompts",
        json=prompt_payload(content=content_marker),
    )
    query_response = harness.client.get("/api/prompts", params={"q": query_marker})

    assert body_response.status_code == 422
    assert query_response.status_code == 422
    assert content_marker not in body_response.text
    assert query_marker not in query_response.text
    assert len(body_response.content) < 1_000
    assert len(query_response.content) < 1_000
    assert "input" not in body_response.json()["detail"][0]


def test_unknown_create_fields_are_rejected(harness: PromptApiHarness) -> None:
    response = harness.client.post(
        "/api/prompts",
        json={"title": "Typo", "content": "content", "tag": ["lost"]},
    )

    assert response.status_code == 422
    assert harness.client.get("/api/prompts").json()["total"] == 0


def test_unknown_update_fields_do_not_mutate_the_prompt(harness: PromptApiHarness) -> None:
    created = harness.client.post(
        "/api/prompts",
        json=prompt_payload(tags=["keep-me"]),
    ).json()

    response = harness.client.put(
        f"/api/prompts/{created['id']}",
        json={"title": "Updated", "content": "new", "tag": []},
    )

    assert response.status_code == 422
    unchanged = harness.client.get(f"/api/prompts/{created['id']}").json()
    assert unchanged["title"] == created["title"]
    assert unchanged["tags"] == ["keep-me"]


@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("/api/prompts", {"q": "q" * 201}),
        ("/api/prompts", {"tag": "invalid,tag"}),
        ("/api/prompts", {"limit": 0}),
        ("/api/prompts", {"limit": 101}),
        ("/api/prompts", {"offset": -1}),
        ("/api/prompts/0", {}),
    ],
)
def test_invalid_query_values_and_ids_return_422(
    harness: PromptApiHarness,
    path: str,
    params: dict[str, object],
) -> None:
    response = harness.client.get(path, params=params)

    assert response.status_code == 422


def test_query_length_is_checked_after_trimming(harness: PromptApiHarness) -> None:
    assert (
        harness.client.post(
            "/api/prompts",
            json=prompt_payload(title="q" * 200),
        ).status_code
        == 201
    )

    response = harness.client.get("/api/prompts", params={"q": "  " + ("q" * 200) + "  "})

    assert response.status_code == 200
    assert response.json()["total"] == 1


def test_domain_query_errors_use_the_public_parameter_location(
    harness: PromptApiHarness,
) -> None:
    response = harness.client.get("/api/prompts", params={"q": "q" * 201})

    assert response.status_code == 422
    assert response.json()["detail"] == [
        {
            "type": "value_error",
            "loc": ["query", "q"],
            "msg": "must be at most 200 characters",
        }
    ]


@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_missing_prompt_mutations_return_fixed_404(
    harness: PromptApiHarness,
    method: str,
) -> None:
    if method == "put":
        response = harness.client.put("/api/prompts/999", json=prompt_payload())
    else:
        response = getattr(harness.client, method)("/api/prompts/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Prompt not found"}


def test_unexpected_persistence_errors_do_not_leak_details(harness: PromptApiHarness) -> None:
    sensitive_marker = "never-return-this-database-detail"
    with patch(
        "local_ai_hub.api.routes.prompts.create_prompt",
        side_effect=RuntimeError(sensitive_marker),
    ):
        response = harness.client.post("/api/prompts", json=prompt_payload())

    assert response.status_code == 500
    assert sensitive_marker not in response.text

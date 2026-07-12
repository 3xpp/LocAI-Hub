from collections.abc import Generator
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from local_ai_hub.db.models import Base, WorkflowLink
from local_ai_hub.db.repositories.workflow_links import (
    create_workflow_link,
    delete_workflow_link,
    get_workflow_link,
    list_workflow_links,
    update_workflow_link,
)
from local_ai_hub.db.sqlite_functions import register_sqlite_functions


@pytest.fixture
def session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    register_sqlite_functions(engine)
    Base.metadata.create_all(engine)

    with Session(engine, expire_on_commit=False) as database_session:
        yield database_session

    engine.dispose()


def test_repository_crud_search_and_duplicate_preservation(session: Session) -> None:
    first = create_workflow_link(
        session,
        title="Nightly summary",
        url="http://localhost:5678/workflow/a",
        description="Repository activity",
        tags=("n8n", "repository"),
    )
    original_updated_at = first.updated_at
    duplicate = create_workflow_link(
        session,
        title="Nightly summary",
        url="http://localhost:5678/workflow/a",
        description="Second operator context",
        tags=("n8n",),
    )

    assert duplicate.id != first.id
    assert first.created_at.tzinfo is UTC
    assert first.updated_at.tzinfo is UTC
    assert get_workflow_link(session, first.id) is first

    updated = update_workflow_link(
        session,
        first,
        title="Nightly summary edited",
        url=first.url,
        description="Updated activity",
        tags=("n8n", "edited"),
    )
    page = list_workflow_links(
        session,
        query="activity",
        tag="edited",
        limit=50,
        offset=0,
    )
    all_items = list_workflow_links(
        session,
        query=None,
        tag=None,
        limit=50,
        offset=0,
    )

    assert updated is first
    assert updated.title == "Nightly summary edited"
    assert updated.url == "http://localhost:5678/workflow/a"
    assert updated.description == "Updated activity"
    assert updated.tags == "n8n,edited"
    assert updated.updated_at > original_updated_at
    assert updated.updated_at >= updated.created_at
    assert page.total == 1
    assert [item.id for item in page.items] == [first.id]
    assert {item.id for item in all_items.items} == {first.id, duplicate.id}
    assert all_items.total == 2

    duplicate_id = duplicate.id
    delete_workflow_link(session, duplicate)

    assert get_workflow_link(session, duplicate_id) is None


def test_model_applies_empty_python_defaults_and_utc_timestamps(session: Session) -> None:
    workflow_link = WorkflowLink(
        title="Minimal",
        url="http://localhost:5678/minimal",
    )
    session.add(workflow_link)
    session.commit()

    assert workflow_link.description == ""
    assert workflow_link.tags == ""
    assert workflow_link.created_at.tzinfo is UTC
    assert workflow_link.updated_at.tzinfo is UTC


@pytest.mark.parametrize(
    ("query", "expected_title"),
    [
        ("TITLE MARKER", "Title marker"),
        ("workflow/url-marker", "URL record"),
        ("DESCRIPTION-MARKER", "Description record"),
        ("TAG-MARKER", "Tag record"),
    ],
)
def test_search_spans_all_four_fields(
    session: Session,
    query: str,
    expected_title: str,
) -> None:
    create_workflow_link(
        session,
        title="Title marker",
        url="http://localhost:5678/workflow/title",
        description="alpha",
        tags=("one",),
    )
    create_workflow_link(
        session,
        title="URL record",
        url="http://localhost:5678/workflow/url-marker",
        description="beta",
        tags=("two",),
    )
    create_workflow_link(
        session,
        title="Description record",
        url="http://localhost:5678/workflow/description",
        description="Description-marker",
        tags=("three",),
    )
    create_workflow_link(
        session,
        title="Tag record",
        url="http://localhost:5678/workflow/tag",
        description="delta",
        tags=("tag-marker",),
    )

    page = list_workflow_links(
        session,
        query=query,
        tag=None,
        limit=50,
        offset=0,
    )

    assert [item.title for item in page.items] == [expected_title]
    assert page.total == 1


def test_search_uses_unicode_casefolding_across_all_fields(session: Session) -> None:
    records = (
        create_workflow_link(
            session,
            title="Ärger workflow",
            url="http://localhost:5678/title",
            description="plain",
            tags=(),
        ),
        create_workflow_link(
            session,
            title="URL record",
            url="http://localhost:5678/straße",
            description="plain",
            tags=(),
        ),
        create_workflow_link(
            session,
            title="Description record",
            url="http://localhost:5678/description",
            description="Grüße vom workflow",
            tags=(),
        ),
        create_workflow_link(
            session,
            title="Tag record",
            url="http://localhost:5678/tag",
            description="plain",
            tags=("maßnahme",),
        ),
    )

    cases = {
        "äRGER": records[0].id,
        "STRASSE": records[1].id,
        "GRÜSSE": records[2].id,
        "MASSNAHME": records[3].id,
    }
    for query, expected_id in cases.items():
        page = list_workflow_links(
            session,
            query=query,
            tag=None,
            limit=50,
            offset=0,
        )
        assert [item.id for item in page.items] == [expected_id]
        assert page.total == 1


def test_search_and_tag_filters_treat_like_characters_as_literals(session: Session) -> None:
    percent = create_workflow_link(
        session,
        title="Percent 100%",
        url="http://localhost:5678/percent",
        description="literal",
        tags=("metric%",),
    )
    underscore = create_workflow_link(
        session,
        title="Under_score",
        url="http://localhost:5678/underscore",
        description="literal",
        tags=("snake_case",),
    )
    backslash = create_workflow_link(
        session,
        title=r"Back\slash",
        url="http://localhost:5678/backslash",
        description="literal",
        tags=(r"path\tag",),
    )
    create_workflow_link(
        session,
        title="Percent 1000",
        url="http://localhost:5678/trap-one",
        description="wildcard trap",
        tags=("metricx",),
    )
    create_workflow_link(
        session,
        title="UnderXscore",
        url="http://localhost:5678/trap-two",
        description="wildcard trap",
        tags=("snake-case",),
    )
    create_workflow_link(
        session,
        title="Backslash",
        url="http://localhost:5678/trap-three",
        description="wildcard trap",
        tags=("pathtag",),
    )

    cases = (
        ("100%", None, percent.id),
        ("under_", None, underscore.id),
        (r"back\s", None, backslash.id),
        (None, "metric%", percent.id),
        (None, "snake_case", underscore.id),
        (None, r"path\tag", backslash.id),
    )
    for query, tag, expected_id in cases:
        page = list_workflow_links(
            session,
            query=query,
            tag=tag,
            limit=50,
            offset=0,
        )
        assert [item.id for item in page.items] == [expected_id]
        assert page.total == 1


def test_exact_tag_filter_ignores_partial_and_malformed_fragments(session: Session) -> None:
    exact = create_workflow_link(
        session,
        title="Exact",
        url="http://localhost:5678/exact",
        description="",
        tags=("code",),
    )
    create_workflow_link(
        session,
        title="Prefix",
        url="http://localhost:5678/prefix",
        description="",
        tags=("code-review",),
    )
    create_workflow_link(
        session,
        title="Suffix",
        url="http://localhost:5678/suffix",
        description="",
        tags=("decode",),
    )
    legacy = WorkflowLink(
        title="Legacy",
        url="http://localhost:5678/legacy",
        description="",
        tags=" code ,line\nbreak,Valid  Tag,code ",
    )
    session.add(legacy)
    session.commit()

    code_page = list_workflow_links(
        session,
        query=None,
        tag="code",
        limit=50,
        offset=0,
    )
    valid_page = list_workflow_links(
        session,
        query=None,
        tag="valid tag",
        limit=50,
        offset=0,
    )
    partial_page = list_workflow_links(
        session,
        query=None,
        tag="valid",
        limit=50,
        offset=0,
    )

    assert {item.id for item in code_page.items} == {exact.id, legacy.id}
    assert code_page.total == 2
    assert [item.id for item in valid_page.items] == [legacy.id]
    assert valid_page.total == 1
    assert partial_page.items == ()
    assert partial_page.total == 0


def test_combined_filters_and_pagination_share_one_count(session: Session) -> None:
    matching_ids = {
        create_workflow_link(
            session,
            title=f"Repository workflow {index}",
            url=f"http://localhost:5678/repository/{index}",
            description="Daily summary",
            tags=("n8n", "repository"),
        ).id
        for index in range(3)
    }
    create_workflow_link(
        session,
        title="Repository notes",
        url="http://localhost:5678/notes",
        description="Not an automation",
        tags=("documentation",),
    )

    first_page = list_workflow_links(
        session,
        query="repository",
        tag="n8n",
        limit=2,
        offset=0,
    )
    second_page = list_workflow_links(
        session,
        query="repository",
        tag="n8n",
        limit=2,
        offset=2,
    )
    past_end = list_workflow_links(
        session,
        query="repository",
        tag="n8n",
        limit=2,
        offset=10,
    )

    assert first_page.total == second_page.total == past_end.total == 3
    assert len(first_page.items) == 2
    assert len(second_page.items) == 1
    assert past_end.items == ()
    assert {item.id for item in first_page.items + second_page.items} == matching_ids


def test_order_is_updated_at_descending_then_id_descending(session: Session) -> None:
    tied_time = datetime(2026, 7, 10, 12, 0, tzinfo=UTC)
    first = WorkflowLink(
        title="First",
        url="http://localhost:5678/first",
        description="",
        tags="",
        created_at=tied_time,
        updated_at=tied_time,
    )
    second = WorkflowLink(
        title="Second",
        url="http://localhost:5678/second",
        description="",
        tags="",
        created_at=tied_time,
        updated_at=tied_time,
    )
    older = WorkflowLink(
        title="Older",
        url="http://localhost:5678/older",
        description="",
        tags="",
        created_at=tied_time,
        updated_at=datetime(2026, 7, 9, 12, 0, tzinfo=UTC),
    )
    session.add_all([first, second, older])
    session.commit()

    page = list_workflow_links(
        session,
        query=None,
        tag=None,
        limit=50,
        offset=0,
    )

    assert [item.id for item in page.items] == [second.id, first.id, older.id]


@pytest.mark.parametrize("operation", ["create", "update", "delete"])
def test_each_mutation_commits_exactly_once(session: Session, operation: str) -> None:
    workflow_link: WorkflowLink | None = None
    if operation != "create":
        workflow_link = WorkflowLink(
            title="Existing",
            url="http://localhost:5678/existing",
            description="",
            tags="",
        )
        session.add(workflow_link)
        session.commit()

    commit_count = 0

    def count_commit(database_session: Session) -> None:
        nonlocal commit_count
        assert database_session is session
        commit_count += 1

    event.listen(session, "after_commit", count_commit)
    try:
        if operation == "create":
            create_workflow_link(
                session,
                title="Created",
                url="http://localhost:5678/created",
                description="",
                tags=(),
            )
        elif operation == "update":
            assert workflow_link is not None
            update_workflow_link(
                session,
                workflow_link,
                title="Updated",
                url="http://localhost:5678/updated",
                description="new context",
                tags=("edited",),
            )
        else:
            assert workflow_link is not None
            delete_workflow_link(session, workflow_link)
    finally:
        event.remove(session, "after_commit", count_commit)

    assert commit_count == 1


def test_create_and_update_refresh_once_after_commit(session: Session) -> None:
    with patch.object(session, "refresh", wraps=session.refresh) as refresh:
        workflow_link = create_workflow_link(
            session,
            title="Created",
            url="http://localhost:5678/created",
            description="",
            tags=(),
        )

    refresh.assert_called_once_with(workflow_link)

    with patch.object(session, "refresh", wraps=session.refresh) as refresh:
        updated = update_workflow_link(
            session,
            workflow_link,
            title="Updated",
            url="http://localhost:5678/updated",
            description="new context",
            tags=("edited",),
        )

    refresh.assert_called_once_with(updated)


def test_reads_do_not_commit_and_delete_does_not_refresh(session: Session) -> None:
    workflow_link = create_workflow_link(
        session,
        title="Read only",
        url="http://localhost:5678/read-only",
        description="",
        tags=(),
    )
    commit_count = 0

    def count_commit(database_session: Session) -> None:
        nonlocal commit_count
        assert database_session is session
        commit_count += 1

    event.listen(session, "after_commit", count_commit)
    try:
        assert get_workflow_link(session, workflow_link.id) is workflow_link
        page = list_workflow_links(
            session,
            query="read",
            tag=None,
            limit=50,
            offset=0,
        )
        assert [item.id for item in page.items] == [workflow_link.id]
    finally:
        event.remove(session, "after_commit", count_commit)

    assert commit_count == 0

    with patch.object(session, "refresh", wraps=session.refresh) as refresh:
        delete_workflow_link(session, workflow_link)

    refresh.assert_not_called()


def test_empty_and_out_of_range_collections_have_stable_shapes(session: Session) -> None:
    empty = list_workflow_links(
        session,
        query=None,
        tag=None,
        limit=50,
        offset=0,
    )
    create_workflow_link(
        session,
        title="Only",
        url="http://localhost:5678/only",
        description="",
        tags=(),
    )
    past_end = list_workflow_links(
        session,
        query=None,
        tag=None,
        limit=50,
        offset=10,
    )

    assert empty.items == ()
    assert empty.total == 0
    assert past_end.items == ()
    assert past_end.total == 1

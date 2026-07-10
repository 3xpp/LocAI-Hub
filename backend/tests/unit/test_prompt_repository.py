from collections.abc import Generator
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from sqlalchemy import event
from sqlalchemy.orm import Session

from local_ai_hub.db.engine import create_db_engine
from local_ai_hub.db.models import Base, Prompt
from local_ai_hub.db.repositories.prompts import (
    create_prompt,
    delete_prompt,
    get_prompt,
    list_prompts,
    update_prompt,
)
from local_ai_hub.services.prompts import decode_tags


@pytest.fixture
def session() -> Generator[Session, None, None]:
    engine = create_db_engine("sqlite://")
    Base.metadata.create_all(engine)

    with Session(engine, expire_on_commit=False) as database_session:
        yield database_session

    engine.dispose()


def test_repository_crud_and_updated_order(session: Session) -> None:
    first = create_prompt(session, title="First", content="alpha", tags=("one",))
    second = create_prompt(session, title="Second", content="beta", tags=("two",))
    original_updated_at = first.updated_at

    updated = update_prompt(
        session,
        first,
        title="First edited",
        content="alpha changed",
        tags=("one", "edited"),
    )
    page = list_prompts(session, query=None, tag=None, limit=50, offset=0)

    assert updated is first
    assert updated.title == "First edited"
    assert updated.content == "alpha changed"
    assert updated.tags == "one,edited"
    assert updated.created_at.tzinfo is UTC
    assert updated.updated_at.tzinfo is UTC
    assert updated.updated_at > original_updated_at
    assert updated.updated_at >= updated.created_at
    assert [item.id for item in page.items] == [first.id, second.id]
    assert page.total == 2

    delete_prompt(session, second)

    assert get_prompt(session, second.id) is None


def test_search_tag_and_pagination_share_filters(session: Session) -> None:
    create_prompt(
        session,
        title="Refactor review",
        content="clean code",
        tags=("code", "review"),
    )
    create_prompt(session, title="Meeting summary", content="decisions", tags=("writing",))
    create_prompt(session, title="Debug notes", content="refactor stack", tags=("debug",))

    search = list_prompts(session, query="refactor", tag=None, limit=1, offset=0)
    second_search_page = list_prompts(session, query="refactor", tag=None, limit=1, offset=1)
    tagged = list_prompts(session, query=None, tag="code", limit=50, offset=0)
    combined = list_prompts(session, query="clean", tag="code", limit=50, offset=0)
    no_combined_match = list_prompts(
        session,
        query="decisions",
        tag="code",
        limit=50,
        offset=0,
    )

    assert search.total == 2
    assert len(search.items) == 1
    assert second_search_page.total == 2
    assert len(second_search_page.items) == 1
    assert search.items[0].id != second_search_page.items[0].id
    assert [item.title for item in tagged.items] == ["Refactor review"]
    assert tagged.total == 1
    assert [item.title for item in combined.items] == ["Refactor review"]
    assert combined.total == 1
    assert no_combined_match.items == ()
    assert no_combined_match.total == 0


def test_search_is_case_insensitive_across_title_content_and_tags(session: Session) -> None:
    create_prompt(session, title="UPPER TITLE", content="nothing", tags=())
    create_prompt(session, title="Nothing", content="UPPER CONTENT", tags=())
    create_prompt(session, title="Also nothing", content="none", tags=("upper-tag",))

    page = list_prompts(session, query="upper", tag=None, limit=50, offset=0)

    assert {item.title for item in page.items} == {"UPPER TITLE", "Nothing", "Also nothing"}
    assert page.total == 3


def test_search_uses_unicode_casefolding_for_title_content_and_canonical_tags(
    session: Session,
) -> None:
    title = create_prompt(session, title="Ärger plan", content="nothing", tags=())
    content = create_prompt(session, title="Nothing", content="Straße prüfen", tags=())
    tag = create_prompt(session, title="Also nothing", content="none", tags=("ärger",))

    title_search = list_prompts(session, query="äRGER", tag=None, limit=50, offset=0)
    content_search = list_prompts(session, query="STRASSE", tag=None, limit=50, offset=0)
    tag_search = list_prompts(session, query="ÄRGER", tag=None, limit=50, offset=0)

    assert title.id in {item.id for item in title_search.items}
    assert content.id in {item.id for item in content_search.items}
    assert tag.id in {item.id for item in tag_search.items}


def test_search_treats_sql_wildcards_and_escape_character_as_literals(session: Session) -> None:
    percent = create_prompt(session, title="Percent 100%", content="literal", tags=("metric%",))
    underscore = create_prompt(
        session, title="Under_score", content="literal", tags=("snake_case",)
    )
    backslash = create_prompt(session, title=r"Back\slash", content="literal", tags=(r"path\tag",))
    create_prompt(session, title="Percent 1000", content="wildcard trap", tags=("metricx",))
    create_prompt(session, title="UnderXscore", content="wildcard trap", tags=("snake-case",))
    create_prompt(session, title="Backslash", content="wildcard trap", tags=("pathtag",))

    percent_search = list_prompts(session, query="100%", tag=None, limit=50, offset=0)
    underscore_search = list_prompts(session, query="under_", tag=None, limit=50, offset=0)
    backslash_search = list_prompts(session, query=r"back\s", tag=None, limit=50, offset=0)
    percent_tag = list_prompts(session, query=None, tag="metric%", limit=50, offset=0)
    underscore_tag = list_prompts(session, query=None, tag="snake_case", limit=50, offset=0)
    backslash_tag = list_prompts(session, query=None, tag=r"path\tag", limit=50, offset=0)

    assert [item.id for item in percent_search.items] == [percent.id]
    assert [item.id for item in underscore_search.items] == [underscore.id]
    assert [item.id for item in backslash_search.items] == [backslash.id]
    assert [item.id for item in percent_tag.items] == [percent.id]
    assert [item.id for item in underscore_tag.items] == [underscore.id]
    assert [item.id for item in backslash_tag.items] == [backslash.id]


def test_exact_tag_filter_does_not_match_partial_tag_or_invalid_legacy_storage(
    session: Session,
) -> None:
    exact = create_prompt(session, title="Exact", content="content", tags=("code",))
    create_prompt(session, title="Prefix", content="content", tags=("code-review",))
    create_prompt(session, title="Suffix", content="content", tags=("decode",))
    session.add(Prompt(title="Legacy null", content="content", tags=None))
    session.add(Prompt(title="Legacy invalid", content="content", tags="code\nreview"))
    session.commit()

    page = list_prompts(session, query=None, tag="code", limit=50, offset=0)

    assert [item.id for item in page.items] == [exact.id]
    assert page.total == 1


def test_exact_tag_filter_matches_canonical_tags_exposed_from_legacy_storage(
    session: Session,
) -> None:
    legacy = Prompt(
        title="Legacy tags",
        content="content",
        tags=" Code ,ẞ,Error   Review,line\nbreak",
    )
    session.add(legacy)
    session.commit()

    assert decode_tags(legacy.tags) == ("code", "ss", "error review")

    for tag in decode_tags(legacy.tags):
        page = list_prompts(session, query=None, tag=tag, limit=50, offset=0)
        assert [item.id for item in page.items] == [legacy.id]
        assert page.total == 1


def test_order_is_updated_at_descending_then_id_descending(session: Session) -> None:
    tied_time = datetime(2026, 7, 10, 12, 0, tzinfo=UTC)
    first = Prompt(
        title="First",
        content="content",
        tags="",
        created_at=tied_time,
        updated_at=tied_time,
    )
    second = Prompt(
        title="Second",
        content="content",
        tags="",
        created_at=tied_time,
        updated_at=tied_time,
    )
    older = Prompt(
        title="Older",
        content="content",
        tags="",
        created_at=tied_time,
        updated_at=datetime(2026, 7, 9, 12, 0, tzinfo=UTC),
    )
    session.add_all([first, second, older])
    session.commit()

    page = list_prompts(session, query=None, tag=None, limit=50, offset=0)

    assert [item.id for item in page.items] == [second.id, first.id, older.id]


@pytest.mark.parametrize("operation", ["create", "update", "delete"])
def test_each_mutation_commits_exactly_once(session: Session, operation: str) -> None:
    prompt: Prompt | None = None
    if operation != "create":
        prompt = Prompt(title="Existing", content="content", tags="")
        session.add(prompt)
        session.commit()

    commit_count = 0

    def count_commit(database_session: Session) -> None:
        nonlocal commit_count
        assert database_session is session
        commit_count += 1

    event.listen(session, "after_commit", count_commit)
    try:
        if operation == "create":
            create_prompt(session, title="Created", content="content", tags=())
        elif operation == "update":
            assert prompt is not None
            update_prompt(
                session,
                prompt,
                title="Updated",
                content="new content",
                tags=("edited",),
            )
        else:
            assert prompt is not None
            delete_prompt(session, prompt)
    finally:
        event.remove(session, "after_commit", count_commit)

    assert commit_count == 1


def test_create_and_update_refresh_once_after_commit(session: Session) -> None:
    with patch.object(session, "refresh", wraps=session.refresh) as refresh:
        prompt = create_prompt(session, title="Created", content="content", tags=())

    refresh.assert_called_once_with(prompt)

    with patch.object(session, "refresh", wraps=session.refresh) as refresh:
        updated = update_prompt(
            session,
            prompt,
            title="Updated",
            content="new content",
            tags=("edited",),
        )

    refresh.assert_called_once_with(updated)


def test_empty_and_out_of_range_pages_return_stable_shapes(session: Session) -> None:
    empty = list_prompts(session, query=None, tag=None, limit=50, offset=0)
    create_prompt(session, title="Only", content="content", tags=())
    past_end = list_prompts(session, query=None, tag=None, limit=50, offset=10)

    assert empty.items == ()
    assert empty.total == 0
    assert past_end.items == ()
    assert past_end.total == 1

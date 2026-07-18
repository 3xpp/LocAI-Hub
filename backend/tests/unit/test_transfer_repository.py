from collections.abc import Generator
from unittest.mock import patch

import pytest
from sqlalchemy import Engine, create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from local_ai_hub.db.models import Base, Prompt, WorkflowLink
from local_ai_hub.db.repositories.transfer import (
    append_transfer_records,
    count_transfer_rows,
    list_transfer_rows,
)
from local_ai_hub.db.sqlite_functions import register_sqlite_functions
from local_ai_hub.services.transfer import PortablePrompt, PortableWorkflowLink


@pytest.fixture
def engine() -> Generator[Engine, None, None]:
    database_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    register_sqlite_functions(database_engine)
    Base.metadata.create_all(database_engine)
    yield database_engine
    database_engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Generator[Session, None, None]:
    with Session(
        engine,
        autoflush=False,
        expire_on_commit=False,
    ) as database_session:
        yield database_session


def mixed_records() -> tuple[PortablePrompt, PortableWorkflowLink]:
    return (
        PortablePrompt("Imported prompt", "  Preserve content\n", ("two", "one")),
        PortableWorkflowLink(
            "Imported workflow",
            "http://localhost:5678/workflow/imported",
            "Operator reference",
            ("local", "review"),
        ),
    )


def assert_empty_from_fresh_session(engine: Engine) -> None:
    with Session(engine) as fresh:
        assert fresh.scalar(select(func.count()).select_from(Prompt)) == 0
        assert fresh.scalar(select(func.count()).select_from(WorkflowLink)) == 0


def test_count_and_reads_are_deterministic_without_mutation(session: Session) -> None:
    second_prompt = Prompt(title="Second", content="body", tags="")
    first_prompt = Prompt(title="First", content="body", tags=None)
    second_link = WorkflowLink(
        title="Second link",
        url="http://localhost:5678/two",
        description="",
        tags="local",
    )
    first_link = WorkflowLink(
        title="First link",
        url="http://localhost:5678/one",
        description="",
        tags="local",
    )
    session.add_all([second_prompt, first_prompt, second_link, first_link])
    session.commit()

    with (
        patch.object(session, "flush", wraps=session.flush) as flush,
        patch.object(session, "commit", wraps=session.commit) as commit,
    ):
        assert count_transfer_rows(session) == 4
        rows = list_transfer_rows(session)

    assert [item.id for item in rows.prompts] == sorted([second_prompt.id, first_prompt.id])
    assert [item.id for item in rows.workflow_links] == sorted([second_link.id, first_link.id])
    assert rows.total == 4
    flush.assert_not_called()
    commit.assert_not_called()


def test_empty_repository_has_stable_shapes(session: Session) -> None:
    assert count_transfer_rows(session) == 0
    rows = list_transfer_rows(session)
    assert rows.prompts == ()
    assert rows.workflow_links == ()
    assert rows.total == 0


def test_mixed_append_commits_once_with_fresh_identity_and_canonical_tags(
    session: Session,
) -> None:
    commit_count = 0

    def count_commit(database_session: Session) -> None:
        nonlocal commit_count
        assert database_session is session
        commit_count += 1

    event.listen(session, "after_commit", count_commit)
    try:
        append_transfer_records(session, mixed_records())
    finally:
        event.remove(session, "after_commit", count_commit)

    session.expire_all()
    prompt = session.scalars(select(Prompt)).one()
    workflow = session.scalars(select(WorkflowLink)).one()

    assert commit_count == 1
    assert prompt.id > 0 and workflow.id > 0
    assert prompt.created_at.tzinfo is not None
    assert prompt.updated_at.tzinfo is not None
    assert workflow.created_at.tzinfo is not None
    assert workflow.updated_at.tzinfo is not None
    assert prompt.content == "  Preserve content\n"
    assert prompt.tags == "two,one"
    assert workflow.tags == "local,review"


def test_append_does_not_change_existing_editable_fields(session: Session) -> None:
    original_prompt = Prompt(title="Original", content="exact\n", tags="one,two")
    original_workflow = WorkflowLink(
        title="Original workflow",
        url="http://localhost:5678/original?opaque=yes#fragment",
        description="Exact context",
        tags="two,one",
    )
    session.add_all([original_prompt, original_workflow])
    session.commit()
    expected = (
        original_prompt.title,
        original_prompt.content,
        original_prompt.tags,
        original_workflow.title,
        original_workflow.url,
        original_workflow.description,
        original_workflow.tags,
    )

    append_transfer_records(session, mixed_records())

    session.refresh(original_prompt)
    session.refresh(original_workflow)
    assert (
        original_prompt.title,
        original_prompt.content,
        original_prompt.tags,
        original_workflow.title,
        original_workflow.url,
        original_workflow.description,
        original_workflow.tags,
    ) == expected


def test_add_all_failure_rolls_back_without_partial_rows(
    engine: Engine,
    session: Session,
) -> None:
    with (
        patch.object(session, "add_all", side_effect=RuntimeError("injected add failure")),
        patch.object(session, "rollback", wraps=session.rollback) as rollback,
        pytest.raises(RuntimeError, match="injected add failure"),
    ):
        append_transfer_records(session, mixed_records())

    rollback.assert_called_once_with()
    assert_empty_from_fresh_session(engine)


def test_failure_after_both_types_are_pending_rolls_back_atomically(
    engine: Engine,
    session: Session,
) -> None:
    def fail_before_flush(
        database_session: Session,
        _flush_context: object,
        _instances: object,
    ) -> None:
        assert any(isinstance(item, Prompt) for item in database_session.new)
        assert any(isinstance(item, WorkflowLink) for item in database_session.new)
        raise RuntimeError("injected mixed flush failure")

    event.listen(session, "before_flush", fail_before_flush)
    try:
        with pytest.raises(RuntimeError, match="injected mixed flush failure"):
            append_transfer_records(session, mixed_records())
    finally:
        event.remove(session, "before_flush", fail_before_flush)

    assert not session.new
    assert_empty_from_fresh_session(engine)


def test_commit_failure_rolls_back_without_partial_rows(
    engine: Engine,
    session: Session,
) -> None:
    with (
        patch.object(session, "commit", side_effect=RuntimeError("injected commit failure")),
        patch.object(session, "rollback", wraps=session.rollback) as rollback,
        pytest.raises(RuntimeError, match="injected commit failure"),
    ):
        append_transfer_records(session, mixed_records())

    rollback.assert_called_once_with()
    assert not session.new
    assert_empty_from_fresh_session(engine)


def test_rollback_failure_does_not_replace_original_error(session: Session) -> None:
    with (
        patch.object(session, "commit", side_effect=RuntimeError("original commit failure")),
        patch.object(session, "rollback", side_effect=RuntimeError("rollback failure")),
        pytest.raises(RuntimeError, match="original commit failure"),
    ):
        append_transfer_records(session, mixed_records())

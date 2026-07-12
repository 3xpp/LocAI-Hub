from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext


def test_migrations_preserve_prompts_through_workflow_link_round_trip(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "migration%20check.db"
    database_url = f"sqlite:///{database_path}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    backend_dir = Path(__file__).resolve().parents[2]
    alembic_config = Config(str(backend_dir / "alembic.ini"))

    command.upgrade(alembic_config, "0001_create_prompts")

    engine = sa.create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            sa.text("INSERT INTO prompts (title, content, tags) VALUES (:title, :content, :tags)"),
            {"title": "Preserved", "content": "Keep me", "tags": "migration"},
        )

    expected_prompt = {
        "title": "Preserved",
        "content": "Keep me",
        "tags": "migration",
    }

    command.upgrade(alembic_config, "head")

    inspector = sa.inspect(engine)
    assert {
        table_name for table_name in inspector.get_table_names() if table_name != "alembic_version"
    } == {"prompts", "workflow_links"}

    prompt_columns = {column["name"]: column for column in inspector.get_columns("prompts")}
    assert set(prompt_columns) == {
        "id",
        "title",
        "content",
        "tags",
        "created_at",
        "updated_at",
    }
    assert prompt_columns["tags"]["nullable"] is True
    assert all(
        prompt_columns[column_name]["nullable"] is False
        for column_name in ("id", "title", "content", "created_at", "updated_at")
    )
    assert "CURRENT_TIMESTAMP" in str(prompt_columns["created_at"]["default"]).upper()
    assert "CURRENT_TIMESTAMP" in str(prompt_columns["updated_at"]["default"]).upper()

    workflow_link_columns = {
        column["name"]: column for column in inspector.get_columns("workflow_links")
    }
    assert set(workflow_link_columns) == {
        "id",
        "title",
        "url",
        "description",
        "tags",
        "created_at",
        "updated_at",
    }
    assert all(
        workflow_link_columns[column_name]["nullable"] is False
        for column_name in workflow_link_columns
    )
    assert isinstance(workflow_link_columns["id"]["type"], sa.Integer)
    assert isinstance(workflow_link_columns["title"]["type"], sa.String)
    assert workflow_link_columns["title"]["type"].length == 200
    assert isinstance(workflow_link_columns["url"]["type"], sa.String)
    assert workflow_link_columns["url"]["type"].length == 2048
    assert isinstance(workflow_link_columns["description"]["type"], sa.Text)
    assert isinstance(workflow_link_columns["tags"]["type"], sa.Text)
    assert isinstance(workflow_link_columns["created_at"]["type"], sa.DateTime)
    assert isinstance(workflow_link_columns["updated_at"]["type"], sa.DateTime)
    assert str(workflow_link_columns["description"]["default"]).strip("()") == "''"
    assert str(workflow_link_columns["tags"]["default"]).strip("()") == "''"
    assert "CURRENT_TIMESTAMP" in str(workflow_link_columns["created_at"]["default"]).upper()
    assert "CURRENT_TIMESTAMP" in str(workflow_link_columns["updated_at"]["default"]).upper()
    assert inspector.get_pk_constraint("workflow_links")["constrained_columns"] == ["id"]
    assert inspector.get_indexes("workflow_links") == []
    assert inspector.get_foreign_keys("workflow_links") == []
    assert inspector.get_unique_constraints("workflow_links") == []

    with engine.begin() as connection:
        migration_context = MigrationContext.configure(connection)
        assert migration_context.get_current_revision() == "0002_create_workflow_links"
        stored_prompt = (
            connection.execute(sa.text("SELECT title, content, tags FROM prompts")).mappings().one()
        )
        assert dict(stored_prompt) == expected_prompt
        connection.execute(
            sa.text("INSERT INTO workflow_links (title, url) VALUES (:title, :url)"),
            {"title": "Local workflow", "url": "http://localhost:5678/workflow/1"},
        )
        stored_defaults = connection.execute(
            sa.text("SELECT description, tags, created_at, updated_at FROM workflow_links")
        ).one()
        assert stored_defaults.description == ""
        assert stored_defaults.tags == ""
        assert stored_defaults.created_at is not None
        assert stored_defaults.updated_at is not None

    command.check(alembic_config)
    command.downgrade(alembic_config, "0001_create_prompts")

    downgraded_inspector = sa.inspect(engine)
    assert downgraded_inspector.has_table("prompts")
    assert not downgraded_inspector.has_table("workflow_links")
    with engine.connect() as connection:
        migration_context = MigrationContext.configure(connection)
        assert migration_context.get_current_revision() == "0001_create_prompts"
        stored_prompt = (
            connection.execute(sa.text("SELECT title, content, tags FROM prompts")).mappings().one()
        )
        assert dict(stored_prompt) == expected_prompt

    command.downgrade(alembic_config, "base")

    assert not sa.inspect(engine).has_table("prompts")
    with engine.connect() as connection:
        migration_context = MigrationContext.configure(connection)
        assert migration_context.get_current_revision() is None
    engine.dispose()
    database_path.unlink()
    assert not database_path.exists()

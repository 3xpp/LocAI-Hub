from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, inspect


def test_prompt_migration_round_trip(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "migration%20check.db"
    database_url = f"sqlite:///{database_path}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    backend_dir = Path(__file__).resolve().parents[2]
    alembic_config = Config(str(backend_dir / "alembic.ini"))

    command.upgrade(alembic_config, "head")

    engine = create_engine(database_url)
    inspector = inspect(engine)
    assert inspector.has_table("prompts")

    columns = {column["name"]: column for column in inspector.get_columns("prompts")}
    assert set(columns) == {
        "id",
        "title",
        "content",
        "tags",
        "created_at",
        "updated_at",
    }
    assert "CURRENT_TIMESTAMP" in str(columns["created_at"]["default"]).upper()
    assert "CURRENT_TIMESTAMP" in str(columns["updated_at"]["default"]).upper()

    with engine.connect() as connection:
        migration_context = MigrationContext.configure(connection)
        assert migration_context.get_current_revision() == "0001_create_prompts"

    command.check(alembic_config)
    command.downgrade(alembic_config, "base")

    assert not inspect(engine).has_table("prompts")
    engine.dispose()
    database_path.unlink()
    assert not database_path.exists()

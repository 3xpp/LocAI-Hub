"""Database engine construction."""

from sqlalchemy import Engine, create_engine

from local_ai_hub.config import get_settings


def create_db_engine(database_url: str) -> Engine:
    """Create an engine with SQLite's thread check disabled when applicable."""

    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(database_url, connect_args=connect_args)


engine = create_db_engine(get_settings().database_url)

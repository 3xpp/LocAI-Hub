"""Database engine construction."""

from sqlalchemy import Engine, create_engine

from local_ai_hub.config import get_settings
from local_ai_hub.db.sqlite_functions import register_sqlite_functions


def create_db_engine(database_url: str) -> Engine:
    """Create an engine with SQLite's thread check disabled when applicable."""

    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    database_engine = create_engine(database_url, connect_args=connect_args)
    register_sqlite_functions(database_engine)
    return database_engine


engine = create_db_engine(get_settings().database_url)

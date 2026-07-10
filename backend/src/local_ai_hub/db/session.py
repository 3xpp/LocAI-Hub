"""Database session lifecycle."""

from collections.abc import Generator

from sqlalchemy.orm import Session, sessionmaker

from local_ai_hub.db.engine import engine

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """Yield one database session and close it after request use."""

    with SessionLocal() as session:
        yield session

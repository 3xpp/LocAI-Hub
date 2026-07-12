"""SQLAlchemy models for Local AI Workflow Hub."""

from datetime import UTC, datetime

from sqlalchemy import DateTime, String, Text, text
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp."""

    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Store UTC datetimes and restore SQLite's naive values as UTC-aware."""

    impl = DateTime
    cache_ok = True

    def __init__(self) -> None:
        super().__init__(timezone=True)

    def process_bind_param(
        self,
        value: datetime | None,
        dialect: Dialect,
    ) -> datetime | None:
        """Normalize bound timestamps to UTC and reject ambiguous naive values."""

        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise TypeError("UTCDateTime requires a timezone-aware datetime")
        return value.astimezone(UTC)

    def process_result_value(
        self,
        value: datetime | None,
        dialect: Dialect,
    ) -> datetime | None:
        """Restore UTC awareness when a backend such as SQLite omits it."""

        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class Base(DeclarativeBase):
    """Declarative base shared by application models."""


class Prompt(Base):
    """A reusable local prompt definition."""

    __tablename__ = "prompts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utc_now,
        onupdate=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class WorkflowLink(Base):
    """A saved local workflow destination and its operator context."""

    __tablename__ = "workflow_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(String(2048))
    description: Mapped[str] = mapped_column(
        Text,
        default="",
        server_default=text("''"),
    )
    tags: Mapped[str] = mapped_column(
        Text,
        default="",
        server_default=text("''"),
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utc_now,
        onupdate=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )

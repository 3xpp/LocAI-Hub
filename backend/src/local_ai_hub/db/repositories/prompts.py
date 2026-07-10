"""SQLAlchemy persistence operations for the prompt registry."""

from dataclasses import dataclass

from sqlalchemy import func, literal, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from local_ai_hub.db.models import Prompt
from local_ai_hub.db.sqlite_functions import (
    CANONICAL_PROMPT_TAGS_FUNCTION,
    UNICODE_CASEFOLD_FUNCTION,
)
from local_ai_hub.services.prompts import encode_tags

LIKE_ESCAPE = "\\"


@dataclass(frozen=True, slots=True)
class PromptPage:
    """A page of prompts plus the count for the same filters."""

    items: tuple[Prompt, ...]
    total: int


def _escape_like(value: str) -> str:
    """Escape input so SQL LIKE metacharacters remain literal text."""

    return (
        value.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", f"{LIKE_ESCAPE}%")
        .replace("_", f"{LIKE_ESCAPE}_")
    )


def _prompt_filters(query: str | None, tag: str | None) -> tuple[ColumnElement[bool], ...]:
    filters: list[ColumnElement[bool]] = []
    if query:
        pattern = f"%{_escape_like(query.casefold())}%"
        canonical_tags = getattr(func, CANONICAL_PROMPT_TAGS_FUNCTION)(Prompt.tags)
        unicode_casefold = getattr(func, UNICODE_CASEFOLD_FUNCTION)
        filters.append(
            or_(
                unicode_casefold(Prompt.title).like(pattern, escape=LIKE_ESCAPE),
                unicode_casefold(Prompt.content).like(pattern, escape=LIKE_ESCAPE),
                unicode_casefold(canonical_tags).like(pattern, escape=LIKE_ESCAPE),
            )
        )
    if tag:
        canonical_tags = getattr(func, CANONICAL_PROMPT_TAGS_FUNCTION)(Prompt.tags)
        padded_tags = literal(",") + canonical_tags + literal(",")
        pattern = f"%,{_escape_like(tag.casefold())},%"
        filters.append(padded_tags.like(pattern, escape=LIKE_ESCAPE))
    return tuple(filters)


def list_prompts(
    session: Session,
    *,
    query: str | None,
    tag: str | None,
    limit: int,
    offset: int,
) -> PromptPage:
    """List a deterministic page and count using identical optional filters."""

    filters = _prompt_filters(query, tag)
    total = session.scalar(select(func.count()).select_from(Prompt).where(*filters))
    statement = (
        select(Prompt)
        .where(*filters)
        .order_by(Prompt.updated_at.desc(), Prompt.id.desc())
        .limit(limit)
        .offset(offset)
    )
    items = tuple(session.scalars(statement).all())
    return PromptPage(items=items, total=total or 0)


def get_prompt(session: Session, prompt_id: int) -> Prompt | None:
    """Return one prompt by primary key when it exists."""

    return session.get(Prompt, prompt_id)


def create_prompt(
    session: Session,
    *,
    title: str,
    content: str,
    tags: tuple[str, ...],
) -> Prompt:
    """Persist one prompt in a single transaction and return refreshed state."""

    prompt = Prompt(title=title, content=content, tags=encode_tags(tags))
    session.add(prompt)
    session.commit()
    session.refresh(prompt)
    return prompt


def update_prompt(
    session: Session,
    prompt: Prompt,
    *,
    title: str,
    content: str,
    tags: tuple[str, ...],
) -> Prompt:
    """Replace editable prompt fields in a single transaction."""

    prompt.title = title
    prompt.content = content
    prompt.tags = encode_tags(tags)
    session.commit()
    session.refresh(prompt)
    return prompt


def delete_prompt(session: Session, prompt: Prompt) -> None:
    """Permanently delete one prompt in a single transaction."""

    session.delete(prompt)
    session.commit()

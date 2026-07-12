"""SQLAlchemy persistence operations for the workflow-link registry."""

from dataclasses import dataclass

from sqlalchemy import func, literal, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from local_ai_hub.db.models import WorkflowLink
from local_ai_hub.db.sqlite_functions import (
    CANONICAL_TAGS_FUNCTION,
    UNICODE_CASEFOLD_FUNCTION,
)
from local_ai_hub.services.tags import encode_tags

LIKE_ESCAPE = "\\"


@dataclass(frozen=True, slots=True)
class WorkflowLinkPage:
    """A page of workflow links plus the count for the same filters."""

    items: tuple[WorkflowLink, ...]
    total: int


def _escape_like(value: str) -> str:
    """Escape input so SQL LIKE metacharacters remain literal text."""

    return (
        value.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", LIKE_ESCAPE + "%")
        .replace("_", LIKE_ESCAPE + "_")
    )


def _workflow_link_filters(
    query: str | None,
    tag: str | None,
) -> tuple[ColumnElement[bool], ...]:
    filters: list[ColumnElement[bool]] = []
    canonical_tags = getattr(func, CANONICAL_TAGS_FUNCTION)(WorkflowLink.tags)
    casefold = getattr(func, UNICODE_CASEFOLD_FUNCTION)
    if query:
        pattern = "%" + _escape_like(query.casefold()) + "%"
        filters.append(
            or_(
                casefold(WorkflowLink.title).like(pattern, escape=LIKE_ESCAPE),
                casefold(WorkflowLink.url).like(pattern, escape=LIKE_ESCAPE),
                casefold(WorkflowLink.description).like(pattern, escape=LIKE_ESCAPE),
                casefold(canonical_tags).like(pattern, escape=LIKE_ESCAPE),
            )
        )
    if tag:
        padded_tags = literal(",") + canonical_tags + literal(",")
        pattern = "%," + _escape_like(tag.casefold()) + ",%"
        filters.append(padded_tags.like(pattern, escape=LIKE_ESCAPE))
    return tuple(filters)


def list_workflow_links(
    session: Session,
    *,
    query: str | None,
    tag: str | None,
    limit: int,
    offset: int,
) -> WorkflowLinkPage:
    """List a deterministic page and count using identical optional filters."""

    filters = _workflow_link_filters(query, tag)
    count = session.scalar(select(func.count()).select_from(WorkflowLink).where(*filters))
    statement = (
        select(WorkflowLink)
        .where(*filters)
        .order_by(WorkflowLink.updated_at.desc(), WorkflowLink.id.desc())
        .limit(limit)
        .offset(offset)
    )
    items = tuple(session.scalars(statement).all())
    return WorkflowLinkPage(items=items, total=count or 0)


def get_workflow_link(
    session: Session,
    workflow_link_id: int,
) -> WorkflowLink | None:
    """Return one workflow link by primary key when it exists."""

    return session.get(WorkflowLink, workflow_link_id)


def create_workflow_link(
    session: Session,
    *,
    title: str,
    url: str,
    description: str,
    tags: tuple[str, ...],
) -> WorkflowLink:
    """Persist one workflow link in a single transaction and return refreshed state."""

    workflow_link = WorkflowLink(
        title=title,
        url=url,
        description=description,
        tags=encode_tags(tags),
    )
    session.add(workflow_link)
    session.commit()
    session.refresh(workflow_link)
    return workflow_link


def update_workflow_link(
    session: Session,
    workflow_link: WorkflowLink,
    *,
    title: str,
    url: str,
    description: str,
    tags: tuple[str, ...],
) -> WorkflowLink:
    """Replace editable workflow-link fields in a single transaction."""

    workflow_link.title = title
    workflow_link.url = url
    workflow_link.description = description
    workflow_link.tags = encode_tags(tags)
    session.commit()
    session.refresh(workflow_link)
    return workflow_link


def delete_workflow_link(session: Session, workflow_link: WorkflowLink) -> None:
    """Permanently delete one workflow link in a single transaction."""

    session.delete(workflow_link)
    session.commit()

"""Safe CRUD and filtered listing routes for local workflow links."""

from contextlib import suppress
from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from local_ai_hub.api.workflow_link_schemas import (
    WorkflowLinkCreate,
    WorkflowLinkListResponse,
    WorkflowLinkResponse,
    WorkflowLinkUpdate,
    workflow_link_to_response,
    workflow_link_to_summary,
)
from local_ai_hub.db.models import WorkflowLink
from local_ai_hub.db.repositories.workflow_links import (
    create_workflow_link,
    delete_workflow_link,
    get_workflow_link,
    list_workflow_links,
    update_workflow_link,
)
from local_ai_hub.db.session import get_db
from local_ai_hub.services.tags import normalize_tag
from local_ai_hub.services.workflow_links import (
    WorkflowLinkInputError,
    normalize_search,
)

router = APIRouter(tags=["workflow-links"])
DatabaseSession = Annotated[Session, Depends(get_db)]
SQLITE_MAX_INTEGER = (1 << 63) - 1
WorkflowLinkId = Annotated[int, Path(ge=1, le=SQLITE_MAX_INTEGER)]


def _raise_query_error(field: str, error: WorkflowLinkInputError) -> NoReturn:
    """Raise a fixed field-oriented validation response."""

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=[
            {
                "type": "value_error",
                "loc": ["query", field],
                "msg": error.message,
            }
        ],
    ) from error


def _normalized_filters(q: str | None, tag: str | None) -> tuple[str | None, str | None]:
    """Normalize collection filters before persistence sees them."""

    try:
        normalized_query = normalize_search(q)
    except WorkflowLinkInputError as error:
        _raise_query_error("q", error)

    if tag is None:
        return normalized_query, None
    try:
        normalized_tag = normalize_tag(tag)
    except WorkflowLinkInputError as error:
        _raise_query_error("tag", error)
    return normalized_query, normalized_tag


def _raise_operation_failed(session: Session) -> NoReturn:
    """Rollback best-effort and return only the fixed persistence error."""

    with suppress(Exception):
        session.rollback()
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Workflow link operation failed",
    ) from None


def _required_workflow_link(session: Session, workflow_link_id: int) -> WorkflowLink:
    """Return one record or a fixed safe 404/500 response."""

    try:
        workflow_link = get_workflow_link(session, workflow_link_id)
    except (
        SQLAlchemyError,
        WorkflowLinkInputError,
        OverflowError,
        ValueError,
        TypeError,
    ):
        _raise_operation_failed(session)
    if workflow_link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow link not found",
        )
    try:
        workflow_link_to_response(workflow_link)
    except (
        SQLAlchemyError,
        WorkflowLinkInputError,
        OverflowError,
        ValueError,
        TypeError,
    ):
        _raise_operation_failed(session)
    return workflow_link


@router.get("", response_model=WorkflowLinkListResponse)
def workflow_link_collection(
    session: DatabaseSession,
    q: str | None = None,
    tag: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=SQLITE_MAX_INTEGER)] = 0,
) -> WorkflowLinkListResponse:
    """Return one server-filtered page of safe workflow-link summaries."""

    normalized_query, normalized_tag = _normalized_filters(q, tag)
    try:
        page = list_workflow_links(
            session,
            query=normalized_query,
            tag=normalized_tag,
            limit=limit,
            offset=offset,
        )
        return WorkflowLinkListResponse(
            items=[workflow_link_to_summary(item) for item in page.items],
            total=page.total,
            limit=limit,
            offset=offset,
        )
    except (
        SQLAlchemyError,
        WorkflowLinkInputError,
        OverflowError,
        ValueError,
        TypeError,
    ):
        _raise_operation_failed(session)


@router.post("", response_model=WorkflowLinkResponse, status_code=status.HTTP_201_CREATED)
def create_workflow_link_item(
    body: WorkflowLinkCreate,
    session: DatabaseSession,
) -> WorkflowLinkResponse:
    """Create and return one canonical local workflow link."""

    try:
        workflow_link = create_workflow_link(
            session,
            title=body.title,
            url=body.url,
            description=body.description,
            tags=tuple(body.tags),
        )
        return workflow_link_to_response(workflow_link)
    except (
        SQLAlchemyError,
        WorkflowLinkInputError,
        OverflowError,
        ValueError,
        TypeError,
    ):
        _raise_operation_failed(session)


@router.get("/{workflow_link_id}", response_model=WorkflowLinkResponse)
def get_workflow_link_item(
    workflow_link_id: WorkflowLinkId,
    session: DatabaseSession,
) -> WorkflowLinkResponse:
    """Return one full canonical workflow link."""

    workflow_link = _required_workflow_link(session, workflow_link_id)
    try:
        return workflow_link_to_response(workflow_link)
    except (
        SQLAlchemyError,
        WorkflowLinkInputError,
        OverflowError,
        ValueError,
        TypeError,
    ):
        _raise_operation_failed(session)


@router.put("/{workflow_link_id}", response_model=WorkflowLinkResponse)
def update_workflow_link_item(
    workflow_link_id: WorkflowLinkId,
    body: WorkflowLinkUpdate,
    session: DatabaseSession,
) -> WorkflowLinkResponse:
    """Replace all editable fields on one workflow link."""

    workflow_link = _required_workflow_link(session, workflow_link_id)
    try:
        updated = update_workflow_link(
            session,
            workflow_link,
            title=body.title,
            url=body.url,
            description=body.description,
            tags=tuple(body.tags),
        )
        return workflow_link_to_response(updated)
    except (
        SQLAlchemyError,
        WorkflowLinkInputError,
        OverflowError,
        ValueError,
        TypeError,
    ):
        _raise_operation_failed(session)


@router.delete("/{workflow_link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow_link_item(
    workflow_link_id: WorkflowLinkId,
    session: DatabaseSession,
) -> Response:
    """Permanently delete one workflow-link reference."""

    workflow_link = _required_workflow_link(session, workflow_link_id)
    try:
        delete_workflow_link(session, workflow_link)
    except (
        SQLAlchemyError,
        WorkflowLinkInputError,
        OverflowError,
        ValueError,
        TypeError,
    ):
        _raise_operation_failed(session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

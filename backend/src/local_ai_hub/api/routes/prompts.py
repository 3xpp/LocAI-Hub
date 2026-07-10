"""CRUD and server-filtered listing routes for local prompts."""

from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.orm import Session

from local_ai_hub.api.prompt_schemas import (
    PromptCreate,
    PromptListResponse,
    PromptResponse,
    PromptUpdate,
    prompt_to_response,
    prompt_to_summary,
)
from local_ai_hub.db.models import Prompt
from local_ai_hub.db.repositories.prompts import (
    create_prompt,
    delete_prompt,
    get_prompt,
    list_prompts,
    update_prompt,
)
from local_ai_hub.db.session import get_db
from local_ai_hub.services.prompts import (
    PromptInputError,
    normalize_search,
    normalize_tag,
)

router = APIRouter(tags=["prompts"])
DatabaseSession = Annotated[Session, Depends(get_db)]
PromptId = Annotated[int, Path(ge=1)]


def _raise_query_error(field: str, error: PromptInputError) -> NoReturn:
    """Raise a safe field-oriented FastAPI validation response."""

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
    except PromptInputError as error:
        _raise_query_error("q", error)

    if tag is None:
        return normalized_query, None
    try:
        normalized_tag = normalize_tag(tag)
    except PromptInputError as error:
        _raise_query_error("tag", error)
    return normalized_query, normalized_tag


def _required_prompt(session: Session, prompt_id: int) -> Prompt:
    """Return a prompt or raise the fixed item-not-found response."""

    prompt = get_prompt(session, prompt_id)
    if prompt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    return prompt


@router.get("", response_model=PromptListResponse)
def prompt_collection(
    session: DatabaseSession,
    q: str | None = None,
    tag: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PromptListResponse:
    """Return one server-filtered page of prompt summaries."""

    normalized_query, normalized_tag = _normalized_filters(q, tag)
    page = list_prompts(
        session,
        query=normalized_query,
        tag=normalized_tag,
        limit=limit,
        offset=offset,
    )
    return PromptListResponse(
        items=[prompt_to_summary(prompt) for prompt in page.items],
        total=page.total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=PromptResponse, status_code=status.HTTP_201_CREATED)
def create_prompt_item(body: PromptCreate, session: DatabaseSession) -> PromptResponse:
    """Create and return one normalized local prompt."""

    prompt = create_prompt(
        session,
        title=body.title,
        content=body.content,
        tags=tuple(body.tags),
    )
    return prompt_to_response(prompt)


@router.get("/{prompt_id}", response_model=PromptResponse)
def get_prompt_item(prompt_id: PromptId, session: DatabaseSession) -> PromptResponse:
    """Return one full prompt."""

    return prompt_to_response(_required_prompt(session, prompt_id))


@router.put("/{prompt_id}", response_model=PromptResponse)
def update_prompt_item(
    prompt_id: PromptId,
    body: PromptUpdate,
    session: DatabaseSession,
) -> PromptResponse:
    """Replace all editable fields on one prompt."""

    prompt = _required_prompt(session, prompt_id)
    updated = update_prompt(
        session,
        prompt,
        title=body.title,
        content=body.content,
        tags=tuple(body.tags),
    )
    return prompt_to_response(updated)


@router.delete("/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prompt_item(prompt_id: PromptId, session: DatabaseSession) -> Response:
    """Permanently delete one prompt after its caller has confirmed intent."""

    prompt = _required_prompt(session, prompt_id)
    delete_prompt(session, prompt)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

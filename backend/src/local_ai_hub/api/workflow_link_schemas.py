"""Validated HTTP contracts for the local workflow-link registry."""

from dataclasses import dataclass
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from local_ai_hub.db.models import WorkflowLink
from local_ai_hub.services.tags import decode_tags, encode_tags, normalize_tags
from local_ai_hub.services.workflow_links import (
    WorkflowLinkInputError,
    description_preview,
    normalize_description,
    normalize_title,
    normalize_url,
)


class _WorkflowLinkWrite(BaseModel):
    """Shared complete-replacement fields for workflow-link mutations."""

    model_config = ConfigDict(extra="forbid")

    title: str
    url: str
    description: str = ""
    tags: list[str] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        """Return the canonical workflow-link title."""

        try:
            return normalize_title(value)
        except WorkflowLinkInputError as error:
            raise ValueError(error.message) from error

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        """Return one validated absolute HTTP(S) destination."""

        try:
            return normalize_url(value)
        except WorkflowLinkInputError as error:
            raise ValueError(error.message) from error

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        """Return the canonical optional description."""

        try:
            return normalize_description(value)
        except WorkflowLinkInputError as error:
            raise ValueError(error.message) from error

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        """Return canonical, stably deduplicated tags."""

        try:
            return list(normalize_tags(value))
        except WorkflowLinkInputError as error:
            raise ValueError(error.message) from error


class WorkflowLinkCreate(_WorkflowLinkWrite):
    """Complete body for creating one workflow link."""


class WorkflowLinkUpdate(_WorkflowLinkWrite):
    """Complete body for replacing one workflow link."""


class WorkflowLinkSummaryResponse(BaseModel):
    """List-safe workflow-link fields with a bounded description preview."""

    id: int
    title: str
    url: str
    description_preview: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class WorkflowLinkResponse(BaseModel):
    """Full workflow-link record returned by item and mutation endpoints."""

    id: int
    title: str
    url: str
    description: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class WorkflowLinkListResponse(BaseModel):
    """One deterministic page of workflow-link summaries."""

    items: list[WorkflowLinkSummaryResponse]
    total: int
    limit: int
    offset: int


@dataclass(frozen=True, slots=True)
class _ValidatedWorkflowLink:
    id: int
    title: str
    url: str
    description: str
    tags: tuple[str, ...]
    created_at: datetime
    updated_at: datetime


def _stored_value_error(field: str) -> WorkflowLinkInputError:
    return WorkflowLinkInputError(field, "stored workflow link is invalid")


def _aware_datetime(value: object, field: str) -> datetime:
    if not isinstance(value, datetime):
        raise _stored_value_error(field)
    try:
        if value.tzinfo is None or value.utcoffset() is None:
            raise _stored_value_error(field)
    except (OverflowError, ValueError):
        raise _stored_value_error(field) from None
    return value


def _validated_workflow_link(workflow_link: WorkflowLink) -> _ValidatedWorkflowLink:
    """Reject corrupt persistence values before they reach response models."""

    identifier = workflow_link.id
    if type(identifier) is not int or identifier <= 0:
        raise _stored_value_error("id")

    title = workflow_link.title
    if not isinstance(title, str) or normalize_title(title) != title:
        raise _stored_value_error("title")

    url = workflow_link.url
    if not isinstance(url, str) or normalize_url(url) != url:
        raise _stored_value_error("url")

    description = workflow_link.description
    if not isinstance(description, str) or normalize_description(description) != description:
        raise _stored_value_error("description")

    raw_tags = workflow_link.tags
    if not isinstance(raw_tags, str):
        raise _stored_value_error("tags")
    tags = decode_tags(raw_tags)
    if encode_tags(tags) != raw_tags:
        raise _stored_value_error("tags")

    return _ValidatedWorkflowLink(
        id=identifier,
        title=title,
        url=url,
        description=description,
        tags=tags,
        created_at=_aware_datetime(workflow_link.created_at, "created_at"),
        updated_at=_aware_datetime(workflow_link.updated_at, "updated_at"),
    )


def workflow_link_to_summary(workflow_link: WorkflowLink) -> WorkflowLinkSummaryResponse:
    """Convert a validated persistence record into a list-safe response."""

    value = _validated_workflow_link(workflow_link)
    return WorkflowLinkSummaryResponse(
        id=value.id,
        title=value.title,
        url=value.url,
        description_preview=description_preview(value.description),
        tags=list(value.tags),
        created_at=value.created_at,
        updated_at=value.updated_at,
    )


def workflow_link_to_response(workflow_link: WorkflowLink) -> WorkflowLinkResponse:
    """Convert a validated persistence record into a full response."""

    value = _validated_workflow_link(workflow_link)
    return WorkflowLinkResponse(
        id=value.id,
        title=value.title,
        url=value.url,
        description=value.description,
        tags=list(value.tags),
        created_at=value.created_at,
        updated_at=value.updated_at,
    )

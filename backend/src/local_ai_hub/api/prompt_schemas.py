"""Validated HTTP contracts for the local prompt registry."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from local_ai_hub.db.models import Prompt
from local_ai_hub.services.prompts import (
    PromptInputError,
    content_preview,
    decode_tags,
    normalize_content,
    normalize_tags,
    normalize_title,
)


class _PromptWrite(BaseModel):
    """Shared complete-replacement fields for prompt mutations."""

    model_config = ConfigDict(extra="forbid")

    title: str
    content: str
    tags: list[str] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        """Normalize a title after Pydantic has confirmed its type."""

        try:
            return normalize_title(value)
        except PromptInputError as error:
            raise ValueError(error.message) from error

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        """Validate raw prompt content without trimming it."""

        try:
            return normalize_content(value)
        except PromptInputError as error:
            raise ValueError(error.message) from error

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        """Return canonical, stably deduplicated API tags."""

        try:
            return list(normalize_tags(value))
        except PromptInputError as error:
            raise ValueError(error.message) from error


class PromptCreate(_PromptWrite):
    """Complete body for creating one prompt."""


class PromptUpdate(_PromptWrite):
    """Complete body for replacing one prompt's editable fields."""


class PromptSummaryResponse(BaseModel):
    """List-safe prompt fields without full content."""

    id: int
    title: str
    content_preview: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class PromptResponse(BaseModel):
    """Full prompt returned by item and mutation endpoints."""

    id: int
    title: str
    content: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class PromptListResponse(BaseModel):
    """One deterministic page of prompt summaries."""

    items: list[PromptSummaryResponse]
    total: int
    limit: int
    offset: int


def prompt_to_summary(prompt: Prompt) -> PromptSummaryResponse:
    """Convert a persistence record into a list-safe response."""

    return PromptSummaryResponse(
        id=prompt.id,
        title=prompt.title,
        content_preview=content_preview(prompt.content),
        tags=list(decode_tags(prompt.tags)),
        created_at=prompt.created_at,
        updated_at=prompt.updated_at,
    )


def prompt_to_response(prompt: Prompt) -> PromptResponse:
    """Convert a persistence record into a full API response."""

    return PromptResponse(
        id=prompt.id,
        title=prompt.title,
        content=prompt.content,
        tags=list(decode_tags(prompt.tags)),
        created_at=prompt.created_at,
        updated_at=prompt.updated_at,
    )

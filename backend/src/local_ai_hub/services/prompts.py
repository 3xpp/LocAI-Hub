"""Pure normalization helpers and compatible tag exports for Prompt data."""

from local_ai_hub.services.tags import (
    MAX_TAG_COUNT,
    MAX_TAG_LENGTH,
    decode_tags,
    encode_tags,
    normalize_tag,
    normalize_tags,
)
from local_ai_hub.services.validation import InputValidationError as PromptInputError

__all__ = [
    "MAX_CONTENT_LENGTH",
    "MAX_PREVIEW_LENGTH",
    "MAX_QUERY_LENGTH",
    "MAX_TAG_COUNT",
    "MAX_TAG_LENGTH",
    "MAX_TITLE_LENGTH",
    "PromptInputError",
    "content_preview",
    "decode_tags",
    "encode_tags",
    "normalize_content",
    "normalize_search",
    "normalize_tag",
    "normalize_tags",
    "normalize_title",
]

MAX_TITLE_LENGTH = 200
MAX_CONTENT_LENGTH = 50_000
MAX_QUERY_LENGTH = 200
MAX_PREVIEW_LENGTH = 160


def normalize_title(value: str) -> str:
    """Trim a title and enforce the prompt-title contract."""

    normalized = value.strip()
    if not normalized:
        raise PromptInputError("title", "must not be empty")
    if len(normalized) > MAX_TITLE_LENGTH:
        raise PromptInputError("title", f"must be at most {MAX_TITLE_LENGTH} characters")
    return normalized


def normalize_content(value: str) -> str:
    """Validate prompt content while preserving every original character."""

    if not value.strip():
        raise PromptInputError("content", "must not be empty or whitespace only")
    if len(value) > MAX_CONTENT_LENGTH:
        raise PromptInputError("content", f"must be at most {MAX_CONTENT_LENGTH} characters")
    return value


def normalize_search(value: str | None) -> str | None:
    """Trim an optional search query and map an empty query to no filter."""

    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > MAX_QUERY_LENGTH:
        raise PromptInputError("query", f"must be at most {MAX_QUERY_LENGTH} characters")
    return normalized


def content_preview(value: str) -> str:
    """Collapse content to one line and truncate its text portion when needed."""

    collapsed = " ".join(value.split())
    if len(collapsed) <= MAX_PREVIEW_LENGTH:
        return collapsed
    return collapsed[:MAX_PREVIEW_LENGTH] + "…"

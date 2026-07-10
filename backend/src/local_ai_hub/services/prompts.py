"""Pure normalization and serialization helpers for prompt registry data."""

import unicodedata

MAX_TITLE_LENGTH = 200
MAX_CONTENT_LENGTH = 50_000
MAX_TAG_COUNT = 10
MAX_TAG_LENGTH = 30
MAX_QUERY_LENGTH = 200
MAX_PREVIEW_LENGTH = 160


class PromptInputError(ValueError):
    """Describe a domain validation failure without coupling it to HTTP."""

    field: str
    message: str

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


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


def normalize_tag(value: str) -> str:
    """Return one canonical tag or raise a field-specific validation error."""

    if "," in value:
        raise PromptInputError("tag", "must not contain commas")
    if any(unicodedata.category(character).startswith("C") for character in value):
        raise PromptInputError("tag", "must not contain control or format characters")

    normalized = " ".join(value.split()).casefold()
    if not normalized:
        raise PromptInputError("tag", "must not be empty")
    if len(normalized) > MAX_TAG_LENGTH:
        raise PromptInputError("tag", f"must be at most {MAX_TAG_LENGTH} characters")
    return normalized


def normalize_tags(values: list[str] | tuple[str, ...]) -> tuple[str, ...]:
    """Canonicalize and stably deduplicate a prompt's tags."""

    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        tag = normalize_tag(value)
        if tag in seen:
            continue
        normalized.append(tag)
        seen.add(tag)

    if len(normalized) > MAX_TAG_COUNT:
        raise PromptInputError("tags", f"must contain at most {MAX_TAG_COUNT} tags")
    return tuple(normalized)


def encode_tags(values: tuple[str, ...]) -> str:
    """Encode tags in the existing unambiguous comma-delimited column format."""

    return ",".join(normalize_tags(values))


def decode_tags(value: str | None) -> tuple[str, ...]:
    """Decode storage defensively so malformed legacy fragments cannot break reads."""

    if not value:
        return ()

    decoded: list[str] = []
    seen: set[str] = set()
    for fragment in value.split(","):
        try:
            tag = normalize_tag(fragment)
        except PromptInputError:
            continue
        if tag in seen:
            continue
        decoded.append(tag)
        seen.add(tag)
        if len(decoded) == MAX_TAG_COUNT:
            break
    return tuple(decoded)


def content_preview(value: str) -> str:
    """Collapse content to one line and truncate its text portion when needed."""

    collapsed = " ".join(value.split())
    if len(collapsed) <= MAX_PREVIEW_LENGTH:
        return collapsed
    return collapsed[:MAX_PREVIEW_LENGTH] + "…"

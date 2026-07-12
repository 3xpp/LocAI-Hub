"""Domain-neutral normalization and storage helpers for canonical tags."""

import unicodedata

from local_ai_hub.services.validation import InputValidationError

MAX_TAG_COUNT = 10
MAX_TAG_LENGTH = 30


def normalize_tag(value: str) -> str:
    """Return one canonical tag or raise a field-specific validation error."""

    if not isinstance(value, str):
        raise InputValidationError("tag", "must be a string")
    if "," in value:
        raise InputValidationError("tag", "must not contain commas")
    if any(unicodedata.category(character).startswith("C") for character in value):
        raise InputValidationError("tag", "must not contain control or format characters")

    normalized = " ".join(value.split()).casefold()
    if not normalized:
        raise InputValidationError("tag", "must not be empty")
    if len(normalized) > MAX_TAG_LENGTH:
        raise InputValidationError("tag", f"must be at most {MAX_TAG_LENGTH} characters")
    return normalized


def normalize_tags(values: list[str] | tuple[str, ...]) -> tuple[str, ...]:
    """Canonicalize and stably deduplicate tags."""

    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        tag = normalize_tag(value)
        if tag in seen:
            continue
        normalized.append(tag)
        seen.add(tag)

    if len(normalized) > MAX_TAG_COUNT:
        raise InputValidationError("tags", f"must contain at most {MAX_TAG_COUNT} tags")
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
        except InputValidationError:
            continue
        if tag in seen:
            continue
        decoded.append(tag)
        seen.add(tag)
        if len(decoded) == MAX_TAG_COUNT:
            break
    return tuple(decoded)

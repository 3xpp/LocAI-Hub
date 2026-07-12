import unicodedata

import pytest

from local_ai_hub.db.sqlite_functions import (
    CANONICAL_PROMPT_TAGS_FUNCTION,
    CANONICAL_TAGS_FUNCTION,
)
from local_ai_hub.services import tags as shared_tags
from local_ai_hub.services.prompts import (
    MAX_CONTENT_LENGTH,
    MAX_QUERY_LENGTH,
    MAX_TAG_COUNT,
    MAX_TAG_LENGTH,
    MAX_TITLE_LENGTH,
    PromptInputError,
    content_preview,
    decode_tags,
    encode_tags,
    normalize_content,
    normalize_search,
    normalize_tag,
    normalize_tags,
    normalize_title,
)
from local_ai_hub.services.validation import InputValidationError


def test_normalize_title_trims_but_content_preserves_edges() -> None:
    assert normalize_title("  Review code  ") == "Review code"
    assert normalize_content("  Keep prompt spacing.\n") == "  Keep prompt spacing.\n"


@pytest.mark.parametrize("value", ["", "   ", "\n\t"])
def test_title_rejects_empty_normalized_value(value: str) -> None:
    with pytest.raises(PromptInputError, match="title") as error:
        normalize_title(value)

    assert error.value.field == "title"
    assert error.value.message


def test_title_and_content_enforce_their_length_limits() -> None:
    assert normalize_title("t" * MAX_TITLE_LENGTH) == "t" * MAX_TITLE_LENGTH
    assert normalize_content("c" * MAX_CONTENT_LENGTH) == "c" * MAX_CONTENT_LENGTH

    with pytest.raises(PromptInputError, match="title"):
        normalize_title("t" * (MAX_TITLE_LENGTH + 1))
    with pytest.raises(PromptInputError, match="content"):
        normalize_content("c" * (MAX_CONTENT_LENGTH + 1))


def test_content_rejects_whitespace_only() -> None:
    with pytest.raises(PromptInputError, match="content"):
        normalize_content(" \n\t ")


def test_search_is_trimmed_and_empty_search_is_omitted() -> None:
    assert normalize_search(None) is None
    assert normalize_search("") is None
    assert normalize_search("  \n ") is None
    assert normalize_search("  Refactor notes  ") == "Refactor notes"
    assert normalize_search("q" * MAX_QUERY_LENGTH) == "q" * MAX_QUERY_LENGTH

    with pytest.raises(PromptInputError, match="query"):
        normalize_search("q" * (MAX_QUERY_LENGTH + 1))


def test_tags_are_canonical_deduplicated_and_round_trip() -> None:
    tags = normalize_tags([" Code ", "code", "Error   Review"])

    assert tags == ("code", "error review")
    assert encode_tags(tags) == "code,error review"
    assert decode_tags("code,error review") == tags
    assert decode_tags(None) == ()
    assert decode_tags("") == ()


def test_prompt_tag_public_imports_remain_compatible_shared_exports() -> None:
    assert PromptInputError is InputValidationError
    assert normalize_tag is shared_tags.normalize_tag
    assert normalize_tags is shared_tags.normalize_tags
    assert encode_tags is shared_tags.encode_tags
    assert decode_tags is shared_tags.decode_tags
    assert MAX_TAG_COUNT == shared_tags.MAX_TAG_COUNT
    assert MAX_TAG_LENGTH == shared_tags.MAX_TAG_LENGTH


def test_prompt_sqlite_tag_function_name_remains_a_compatible_alias() -> None:
    assert CANONICAL_TAGS_FUNCTION == "local_ai_hub_tags"
    assert CANONICAL_PROMPT_TAGS_FUNCTION == CANONICAL_TAGS_FUNCTION


def test_tag_casefolding_is_unicode_aware() -> None:
    assert normalize_tag(" STRASSË ") == "strassë"
    assert normalize_tag("ẞ") == "ss"


def test_tag_rejects_empty_comma_and_control_characters() -> None:
    with pytest.raises(PromptInputError, match="tag"):
        normalize_tags(["  "])
    with pytest.raises(PromptInputError, match="tag"):
        normalize_tags(["code,review"])
    with pytest.raises(PromptInputError, match="tag"):
        normalize_tags(["line\nbreak"])

    for value in ("zero\u200bwidth", "delete\x7fcharacter"):
        assert any(unicodedata.category(character).startswith("C") for character in value)
        with pytest.raises(PromptInputError, match="tag"):
            normalize_tag(value)


def test_tags_enforce_canonical_count_and_length_limits() -> None:
    assert len(normalize_tags([f"tag-{index}" for index in range(MAX_TAG_COUNT)])) == MAX_TAG_COUNT
    assert normalize_tag("x" * MAX_TAG_LENGTH) == "x" * MAX_TAG_LENGTH

    with pytest.raises(PromptInputError, match="tags"):
        normalize_tags([f"tag-{index}" for index in range(MAX_TAG_COUNT + 1)])
    with pytest.raises(PromptInputError, match="tag"):
        normalize_tag("x" * (MAX_TAG_LENGTH + 1))


def test_tag_count_is_applied_after_deduplication() -> None:
    values = ["same"] * (MAX_TAG_COUNT + 1)

    assert normalize_tags(values) == ("same",)


def test_decode_tags_omits_invalid_legacy_fragments_and_deduplicates() -> None:
    stored = " Code ,code,,valid tag,line\nbreak," + ("x" * (MAX_TAG_LENGTH + 1))

    assert decode_tags(stored) == ("code", "valid tag")


def test_encode_tags_canonicalizes_values() -> None:
    assert encode_tags((" Code ", "code", "Error   Review")) == "code,error review"


def test_preview_collapses_whitespace_and_truncates() -> None:
    assert content_preview("one\n\n two") == "one two"
    preview = content_preview("x" * 161)

    assert preview == ("x" * 160) + "…"

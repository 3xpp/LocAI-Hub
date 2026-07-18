"""Strict and non-reflective HTTP contracts for registry transfer bundles."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from pydantic_core import ErrorDetails

from local_ai_hub.services.prompts import (
    normalize_content,
)
from local_ai_hub.services.prompts import (
    normalize_title as normalize_prompt_title,
)
from local_ai_hub.services.tags import normalize_tags
from local_ai_hub.services.transfer import (
    APPLICATION_ID,
    FORMAT_VERSION,
    MAX_BUNDLE_RECORDS,
    MAX_TRANSFER_ISSUES,
    NormalizedTransferBundle,
    PortablePrompt,
    PortableWorkflowLink,
)
from local_ai_hub.services.validation import InputValidationError
from local_ai_hub.services.workflow_links import (
    normalize_description,
    normalize_url,
)
from local_ai_hub.services.workflow_links import (
    normalize_title as normalize_workflow_title,
)

_UTC_TIMESTAMP = re.compile(r"\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)\Z")
_KNOWN_LOCATION_NAMES = frozenset(
    {
        "application",
        "format_version",
        "exported_at",
        "records",
        "prompt",
        "workflow_link",
        "type",
        "title",
        "content",
        "tags",
        "url",
        "description",
    }
)
_KNOWN_FIELDS = frozenset(
    {
        "application",
        "format_version",
        "exported_at",
        "records",
        "type",
        "title",
        "content",
        "tags",
        "url",
        "description",
    }
)


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class PromptTransferRecord(_StrictModel):
    """Required version 1 Prompt wire fields."""

    type: Literal["prompt"]
    title: str
    content: str
    tags: list[str]

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return _normalize_or_value_error(normalize_prompt_title, value)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return _normalize_or_value_error(normalize_content, value)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        return list(_normalize_or_value_error(normalize_tags, value))


class WorkflowLinkTransferRecord(_StrictModel):
    """Required version 1 Workflow Link wire fields."""

    type: Literal["workflow_link"]
    title: str
    url: str
    description: str
    tags: list[str]

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return _normalize_or_value_error(normalize_workflow_title, value)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return _normalize_or_value_error(normalize_url, value)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        return _normalize_or_value_error(normalize_description, value)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        return list(_normalize_or_value_error(normalize_tags, value))


type TransferRecordModel = Annotated[
    PromptTransferRecord | WorkflowLinkTransferRecord,
    Field(discriminator="type"),
]


class TransferBundleV1(_StrictModel):
    """Closed version 1 transfer manifest."""

    application: Literal["local-ai-workflow-hub"]
    format_version: int
    exported_at: str
    records: list[TransferRecordModel] = Field(max_length=MAX_BUNDLE_RECORDS)

    @field_validator("format_version", mode="before")
    @classmethod
    def validate_format_version(cls, value: object) -> object:
        if type(value) is not int or value != FORMAT_VERSION:
            raise ValueError("unsupported format version")
        return value

    @field_validator("exported_at")
    @classmethod
    def validate_exported_at(cls, value: str) -> str:
        if _UTC_TIMESTAMP.fullmatch(value) is None:
            raise ValueError("timestamp must have an explicit UTC offset")
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            offset = parsed.utcoffset()
            if offset is None or offset.total_seconds() != 0:
                raise ValueError("timestamp must have a zero UTC offset")
        except (OverflowError, ValueError):
            raise ValueError("timestamp must be valid RFC 3339") from None
        return value


class TransferIssueResponse(_StrictModel):
    """One bounded validation issue containing metadata only."""

    location: list[str | int]
    record_index: int | None
    record_type: Literal["prompt", "workflow_link"] | None
    field: str | None
    code: str
    message: str


class TransferErrorDetailResponse(_StrictModel):
    """Stable transfer error detail envelope."""

    code: str
    message: str
    issues: list[TransferIssueResponse]
    issues_truncated: bool


class TransferErrorResponse(_StrictModel):
    """Stable transfer error response envelope."""

    detail: TransferErrorDetailResponse


class TransferCountsResponse(_StrictModel):
    """Wire representation of transfer counts."""

    total: int
    prompts: int
    workflow_links: int


class TransferWarningResponse(_StrictModel):
    """One fixed preview warning."""

    code: str
    message: str


class TransferPreviewResponse(_StrictModel):
    """Successful non-mutating preview response."""

    valid: Literal[True]
    importable: bool
    format_version: Literal[1]
    counts: TransferCountsResponse
    duplicates: TransferCountsResponse
    warnings: list[TransferWarningResponse]


class TransferImportResponse(_StrictModel):
    """Successful atomic append response."""

    imported: TransferCountsResponse
    duplicates_imported: TransferCountsResponse


class TransferContractError(ValueError):
    """A stable, sanitized failure produced by strict transfer parsing."""

    code: str
    message: str
    issues: list[TransferIssueResponse]
    issues_truncated: bool

    def __init__(
        self,
        code: str,
        message: str,
        issues: list[TransferIssueResponse] | None = None,
        *,
        issues_truncated: bool = False,
    ) -> None:
        self.code = code
        self.message = message
        self.issues = [] if issues is None else issues
        self.issues_truncated = issues_truncated
        super().__init__(code)

    @classmethod
    def fixed(cls, code: str, message: str) -> TransferContractError:
        """Create a fixed failure without field issues."""

        return cls(code, message)

    @classmethod
    def from_validation(
        cls,
        error: ValidationError,
        submitted: object,
    ) -> TransferContractError:
        """Map Pydantic errors to a bounded allowlisted representation."""

        raw_errors = error.errors(include_url=False, include_context=False, include_input=False)
        issues = [_safe_issue(item, submitted) for item in raw_errors[:MAX_TRANSFER_ISSUES]]
        return cls(
            "invalid_bundle",
            "Bundle validation failed.",
            issues,
            issues_truncated=len(raw_errors) > MAX_TRANSFER_ISSUES,
        )

    def as_response(self) -> TransferErrorResponse:
        """Return the one allowed HTTP error envelope."""

        return TransferErrorResponse(
            detail=TransferErrorDetailResponse(
                code=self.code,
                message=self.message,
                issues=self.issues,
                issues_truncated=self.issues_truncated,
            )
        )


class _MalformedJson(ValueError):
    pass


def _normalize_or_value_error[InputT, OutputT](
    normalizer: Callable[[InputT], OutputT],
    value: InputT,
) -> OutputT:
    try:
        return normalizer(value)
    except InputValidationError as error:
        raise ValueError("field value is invalid") from error


def _object_without_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
    value: dict[str, object] = {}
    for key, item in pairs:
        if key in value:
            raise _MalformedJson("duplicate object key")
        value[key] = item
    return value


def _reject_constant(_value: str) -> object:
    raise _MalformedJson("non-standard numeric constant")


def decode_transfer_json(body: bytes) -> object:
    """Decode strict UTF-8 JSON while rejecting duplicate keys and extensions."""

    try:
        text = body.decode("utf-8", errors="strict")
        return json.loads(
            text,
            object_pairs_hook=_object_without_duplicates,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, _MalformedJson, RecursionError, ValueError):
        raise TransferContractError.fixed(
            "malformed_json",
            "Bundle is not valid UTF-8 JSON.",
        ) from None


def parse_transfer_bundle(value: object) -> NormalizedTransferBundle:
    """Apply deterministic manifest preflight and full version 1 normalization."""

    if not isinstance(value, dict):
        raise TransferContractError.fixed("invalid_bundle", "Bundle validation failed.")
    if value.get("application") != APPLICATION_ID:
        raise TransferContractError.fixed(
            "invalid_application",
            "Bundle application is not supported.",
        )
    version = value.get("format_version")
    if type(version) is not int or version != FORMAT_VERSION:
        raise TransferContractError.fixed(
            "unsupported_format_version",
            "Bundle format version is not supported.",
        )
    records = value.get("records")
    if isinstance(records, list) and len(records) > MAX_BUNDLE_RECORDS:
        raise TransferContractError.fixed(
            "too_many_records",
            "Bundle contains too many records.",
        )
    try:
        model = TransferBundleV1.model_validate(value)
    except ValidationError as error:
        raise TransferContractError.from_validation(error, value) from None
    portable = tuple(
        PortablePrompt(record.title, record.content, tuple(record.tags))
        if isinstance(record, PromptTransferRecord)
        else PortableWorkflowLink(
            record.title,
            record.url,
            record.description,
            tuple(record.tags),
        )
        for record in model.records
    )
    return NormalizedTransferBundle(model.exported_at, portable)


def _safe_issue(error: ErrorDetails, submitted: object) -> TransferIssueResponse:
    raw_location = error.get("loc", ())
    location = [
        segment
        for segment in raw_location
        if (isinstance(segment, str) and segment in _KNOWN_LOCATION_NAMES)
        or (type(segment) is int and segment >= 0)
    ]
    record_index = next(
        (
            segment
            for index, segment in enumerate(location)
            if index > 0 and location[index - 1] == "records" and type(segment) is int
        ),
        None,
    )
    record_type = _submitted_record_type(submitted, record_index)
    final_segment = raw_location[-1] if raw_location else None
    field = (
        final_segment if isinstance(final_segment, str) and final_segment in _KNOWN_FIELDS else None
    )
    code, message = _safe_issue_kind(str(error.get("type", "")))
    return TransferIssueResponse(
        location=location,
        record_index=record_index,
        record_type=record_type,
        field=field,
        code=code,
        message=message,
    )


def _submitted_record_type(
    submitted: object,
    record_index: int | None,
) -> Literal["prompt", "workflow_link"] | None:
    if record_index is None or not isinstance(submitted, dict):
        return None
    records = submitted.get("records")
    if not isinstance(records, list) or record_index >= len(records):
        return None
    record = records[record_index]
    if not isinstance(record, dict):
        return None
    record_type = record.get("type")
    if record_type == "prompt":
        return "prompt"
    if record_type == "workflow_link":
        return "workflow_link"
    return None


def _safe_issue_kind(error_type: str) -> tuple[str, str]:
    if error_type == "missing":
        return ("missing_field", "Required field is missing.")
    if error_type == "extra_forbidden":
        return ("unexpected_field", "Bundle contains an unexpected field.")
    if error_type in {"string_type", "int_type", "list_type", "model_type"}:
        return ("invalid_type", "Field has an invalid type.")
    if error_type in {"union_tag_invalid", "union_tag_not_found"}:
        return ("unknown_record_type", "Record type is not supported.")
    return ("invalid_value", "Field value is invalid.")

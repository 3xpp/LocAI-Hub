"""Pure, versioned transfer-domain contracts for local registry data."""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final

from local_ai_hub.db.models import Prompt, WorkflowLink
from local_ai_hub.services.prompts import (
    normalize_content,
)
from local_ai_hub.services.prompts import (
    normalize_title as normalize_prompt_title,
)
from local_ai_hub.services.tags import decode_tags, encode_tags
from local_ai_hub.services.workflow_links import (
    normalize_description,
    normalize_url,
)
from local_ai_hub.services.workflow_links import (
    normalize_title as normalize_workflow_title,
)

APPLICATION_ID: Final = "local-ai-workflow-hub"
FORMAT_VERSION: Final = 1
MAX_BUNDLE_BYTES: Final = 10_485_760
MAX_BUNDLE_RECORDS: Final = 5_000
MAX_TRANSFER_ISSUES: Final = 100


class StoredTransferDataError(ValueError):
    """One stored editable value is outside the canonical domain contract."""


@dataclass(frozen=True, slots=True)
class PortablePrompt:
    """Portable Prompt fields without local identity or timestamps."""

    title: str
    content: str
    tags: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class PortableWorkflowLink:
    """Portable Workflow Link fields without local identity or timestamps."""

    title: str
    url: str
    description: str
    tags: tuple[str, ...]


type PortableRecord = PortablePrompt | PortableWorkflowLink


@dataclass(frozen=True, slots=True)
class NormalizedTransferBundle:
    """One validated transfer bundle ready for preview or persistence."""

    exported_at: str
    records: tuple[PortableRecord, ...]


@dataclass(frozen=True, slots=True)
class TransferCounts:
    """Total and per-record-type counts."""

    total: int
    prompts: int
    workflow_links: int


@dataclass(frozen=True, slots=True)
class TransferWarning:
    """One fixed, non-reflective preview warning."""

    code: str
    message: str


@dataclass(frozen=True, slots=True)
class TransferPreview:
    """Pure preview counts and advisory warnings."""

    counts: TransferCounts
    duplicates: TransferCounts
    warnings: tuple[TransferWarning, ...]


def _stored_tags(raw: object, *, nullable: bool) -> tuple[str, ...]:
    if nullable and raw is None:
        return ()
    if not isinstance(raw, str):
        raise StoredTransferDataError("stored tags are invalid")
    if raw == "":
        return ()
    tags = decode_tags(raw)
    if encode_tags(tags) != raw:
        raise StoredTransferDataError("stored tags are invalid")
    return tags


def validate_stored_prompt(prompt: Prompt) -> PortablePrompt:
    """Project one Prompt only when every stored value is canonical."""

    try:
        if not isinstance(prompt.title, str):
            raise StoredTransferDataError("stored prompt title is invalid")
        title = normalize_prompt_title(prompt.title)
        if title != prompt.title:
            raise StoredTransferDataError("stored prompt title is invalid")
        if not isinstance(prompt.content, str):
            raise StoredTransferDataError("stored prompt content is invalid")
        content = normalize_content(prompt.content)
        if content != prompt.content:
            raise StoredTransferDataError("stored prompt content is invalid")
        tags = _stored_tags(prompt.tags, nullable=True)
    except (TypeError, ValueError) as error:
        if isinstance(error, StoredTransferDataError):
            raise
        raise StoredTransferDataError("stored prompt is invalid") from None
    return PortablePrompt(title, content, tags)


def validate_stored_workflow_link(link: WorkflowLink) -> PortableWorkflowLink:
    """Project one Workflow Link only when every stored value is canonical."""

    try:
        if not all(isinstance(value, str) for value in (link.title, link.url, link.description)):
            raise StoredTransferDataError("stored workflow link is invalid")
        title = normalize_workflow_title(link.title)
        url = normalize_url(link.url)
        description = normalize_description(link.description)
        if (title, url, description) != (link.title, link.url, link.description):
            raise StoredTransferDataError("stored workflow link is invalid")
        tags = _stored_tags(link.tags, nullable=False)
    except (TypeError, ValueError) as error:
        if isinstance(error, StoredTransferDataError):
            raise
        raise StoredTransferDataError("stored workflow link is invalid") from None
    return PortableWorkflowLink(title, url, description, tags)


def project_stored_records(
    prompts: Sequence[Prompt],
    workflow_links: Sequence[WorkflowLink],
) -> tuple[PortableRecord, ...]:
    """Project Prompts followed by Workflow Links without reordering either input."""

    return tuple(
        [validate_stored_prompt(prompt) for prompt in prompts]
        + [validate_stored_workflow_link(link) for link in workflow_links]
    )


def transfer_counts(records: Sequence[PortableRecord]) -> TransferCounts:
    """Count all records and each closed record type."""

    prompts = sum(isinstance(record, PortablePrompt) for record in records)
    workflows = len(records) - prompts
    return TransferCounts(len(records), prompts, workflows)


def record_fingerprint(record: PortableRecord) -> tuple[object, ...]:
    """Build exact editable identity while treating tag order as semantic-free."""

    tags = tuple(sorted(record.tags))
    if isinstance(record, PortablePrompt):
        return ("prompt", record.title, record.content, tags)
    return (
        "workflow_link",
        record.title,
        record.url,
        record.description,
        tags,
    )


def count_exact_duplicates(
    incoming: Sequence[PortableRecord],
    existing: Sequence[PortableRecord],
) -> TransferCounts:
    """Count matches against stored records and earlier incoming records."""

    seen = {record_fingerprint(record) for record in existing}
    duplicates: list[PortableRecord] = []
    for record in incoming:
        fingerprint = record_fingerprint(record)
        if fingerprint in seen:
            duplicates.append(record)
        seen.add(fingerprint)
    return transfer_counts(duplicates)


def build_preview(
    incoming: Sequence[PortableRecord],
    existing: Sequence[PortableRecord],
) -> TransferPreview:
    """Build a non-mutating import preview with fixed advisory warnings."""

    counts = transfer_counts(incoming)
    duplicates = count_exact_duplicates(incoming, existing)
    warnings: list[TransferWarning] = []
    if counts.total == 0:
        warnings.append(
            TransferWarning(
                "empty_bundle",
                "This bundle contains no records and cannot be imported.",
            )
        )
    if duplicates.total > 0:
        warnings.append(
            TransferWarning(
                "exact_duplicates",
                "Exact duplicates will be imported as new records.",
            )
        )
    return TransferPreview(counts, duplicates, tuple(warnings))


def utc_transfer_timestamp(value: datetime) -> str:
    """Render one timezone-aware datetime as an RFC 3339 UTC timestamp."""

    try:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("transfer timestamp must be timezone-aware")
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    except (OverflowError, TypeError):
        raise ValueError("transfer timestamp must be timezone-aware") from None


def bundle_json_value(bundle: NormalizedTransferBundle) -> dict[str, object]:
    """Project a normalized bundle to the stable version 1 JSON shape."""

    records: list[dict[str, object]] = []
    for record in bundle.records:
        if isinstance(record, PortablePrompt):
            records.append(
                {
                    "type": "prompt",
                    "title": record.title,
                    "content": record.content,
                    "tags": list(record.tags),
                }
            )
        else:
            records.append(
                {
                    "type": "workflow_link",
                    "title": record.title,
                    "url": record.url,
                    "description": record.description,
                    "tags": list(record.tags),
                }
            )
    return {
        "application": APPLICATION_ID,
        "format_version": FORMAT_VERSION,
        "exported_at": bundle.exported_at,
        "records": records,
    }


def serialize_bundle(bundle: NormalizedTransferBundle) -> bytes:
    """Serialize one bundle deterministically as readable UTF-8 JSON."""

    text = json.dumps(
        bundle_json_value(bundle),
        ensure_ascii=False,
        allow_nan=False,
        indent=2,
    )
    return (text + "\n").encode("utf-8")

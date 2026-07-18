# Phase 1C Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver safe local JSON export, non-mutating preview, and atomic append-only import for every Prompt and Workflow Link, with a polished fourth dashboard view and complete Phase 1 acceptance evidence.

**Architecture:** FastAPI receives transfer bodies as bounded raw bytes, applies a strict versioned schema and the existing domain normalizers, and uses one SQLAlchemy Session transaction for mixed-record imports. React keeps selected bundle text only in hook memory, runtime-validates every transfer response, previews before confirmation, never retries an uncertain import automatically, and relies on the existing registry hooks to reload imported rows when their views become active.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic, SQLAlchemy, SQLite, pytest, Ruff, mypy, React 19, TypeScript, Vite, Vitest, Testing Library, jsdom, pnpm, Docker Compose, Firefox WebDriver.

---

## Starting Point and Non-Negotiable Boundaries

- Start implementation from the clean implementation-plan commit descended from
  5ddbca37dec0831c358847c0d701cab7b4ff051e.
- Use 5ddbca37dec0831c358847c0d701cab7b4ff051e only as the protected-file comparison baseline for
  dependency manifests, lockfiles, models, migrations, Docker definitions, and scope audits.
- Treat docs/superpowers/specs/2026-07-13-phase-1c-import-export-design.md as authoritative.
- Do not read, print, edit, or stage .env or any real secret file.
- Do not change backend/pyproject.toml, backend/uv.lock, web/package.json, or web/pnpm-lock.yaml.
- Do not change backend/src/local_ai_hub/db/models.py or create migration 0003.
- Do not add authentication, Docker socket/SDK access, n8n integration, remote imports, destination requests, production configuration, or a runtime dependency.
- Use raw application/json requests; do not add multipart handling.
- Keep every implementation milestone small, test-first, conventional, and paired with its history/BUILD_LOG.md entry.
- Run backend tests before every backend commit. Run frontend typecheck, lint, and make test-web before every Transfer UI behavior commit.
- Record docs/FAILURES.md entries only for failures or warnings actually observed.
- Never push.

## File Responsibility Map

### Backend files to create

- backend/src/local_ai_hub/services/transfer.py — portable domain records, stored-value validation, counts, fingerprints, preview logic, deterministic serialization, and limits.
- backend/src/local_ai_hub/api/transfer_schemas.py — strict v1 wire schemas, duplicate-key-safe JSON decoding, safe validation issues, and response contracts.
- backend/src/local_ai_hub/api/transfer_http.py — media-type validation, streamed byte limits, fixed privacy headers, and safe transfer responses.
- backend/src/local_ai_hub/db/repositories/transfer.py — deterministic full-registry reads and one-commit mixed-record append.
- backend/src/local_ai_hub/api/routes/transfer.py — export, preview, and import HTTP orchestration.
- backend/tests/unit/test_transfer_service.py — stored projection, counts, duplicate semantics, and deterministic serialization.
- backend/tests/unit/test_transfer_schemas.py — strict manifest/record parsing, malformed JSON, limits, and safe issue mapping.
- backend/tests/unit/test_transfer_repository.py — deterministic reads, fresh identity/time, one commit, and rollback.
- backend/tests/unit/test_transfer_http.py — media type, Content-Length, streamed limit, and privacy headers.
- backend/tests/e2e/test_transfer_api.py — complete HTTP export/preview/import behavior and no-dereference evidence.

### Backend files to modify

- backend/src/local_ai_hub/api/main.py — mount the transfer router at /api/transfer.

### Frontend files to create

- web/src/api/transfer.ts — strict runtime contracts, raw JSON requests, bounded error parsing, and safe export filename handling.
- web/src/api/transfer.test.ts — success/error/runtime/path/body/abort/network contract coverage.
- web/src/features/transfer/transferState.ts — fatal UTF-8 file decoding, size checks, preview freshness, and discard predicates.
- web/src/features/transfer/transferState.test.ts — exact byte boundary, decode, generation, and discard tests.
- web/src/features/transfer/useTransfer.ts — memory-only selection, request generations, preview/export cancellation, import uncertainty, download lifecycle, and navigation guard.
- web/src/features/transfer/TransferPreview.tsx — count, warning, and bounded issue presentation without record values.
- web/src/features/transfer/ExportPanel.tsx — explicit sensitive-data warning and download action.
- web/src/features/transfer/ImportPanel.tsx — file selection, preview, re-preview, confirmation, and safe result/error UI.
- web/src/features/transfer/TransferView.tsx — page composition, announcements, focus handoff, and footer.
- web/src/features/transfer/TransferView.test.tsx — controller/UI/download/import/cleanup/accessibility behavior.

### Frontend files to modify

- web/src/App.tsx — fourth Transfer view, centralized guards, Transfer rendering, and Phase 01 footer.
- web/src/App.navigation.test.tsx — four-view navigation and Transfer dirty/pending/reload regressions.
- web/src/styles.css — distinct Transfer panels, four-column mobile switcher, focus, wrapping, and responsive behavior.

### Integration and records to modify

- Makefile — make build uses an explicit safe Compose env file and sample Ollama URL.
- AGENTS.md — require make test-web for Transfer UI behavior commits.
- README.md — completed Phase 1C behavior, usage, routes, security, limits, validation, limitations, and roadmap.
- docs/DECISIONS.md — typed v1 transfer, atomic append, duplicate, and limit decisions.
- docs/SECURITY_NOTES.md — export sensitivity, memory-only files, no-store responses, inert URLs, and exposure warning.
- docs/FAILURES.md — only newly observed implementation/acceptance incidents.
- docs/superpowers/specs/2026-07-13-phase-1c-import-export-design.md — implementation/final acceptance status.
- history/BUILD_LOG.md — same-commit chronological evidence for every task.

## Planned Commit Sequence

1. feat: add transfer bundle contracts
2. feat: add atomic transfer persistence
3. feat: add import and export api
4. feat: add transfer frontend contracts
5. feat: add transfer workflow controller
6. feat: add safe import export interface
7. feat: integrate transfer dashboard view
8. chore: finalize phase 1c integration
9. test: record phase 1c acceptance validation

### Task 1: Strict Bundle Contracts and Pure Transfer Logic

**Files:**
- Create: backend/src/local_ai_hub/services/transfer.py
- Create: backend/src/local_ai_hub/api/transfer_schemas.py
- Create: backend/tests/unit/test_transfer_service.py
- Create: backend/tests/unit/test_transfer_schemas.py
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing service tests for stored projection and duplicate semantics**

Create test_transfer_service.py with real Prompt and WorkflowLink objects and these named tests:

~~~python
from datetime import UTC, datetime

import pytest

from local_ai_hub.db.models import Prompt, WorkflowLink
from local_ai_hub.services.transfer import (
    PortablePrompt,
    PortableWorkflowLink,
    StoredTransferDataError,
    build_preview,
    count_exact_duplicates,
    record_fingerprint,
    serialize_bundle,
    transfer_counts,
    validate_stored_prompt,
    validate_stored_workflow_link,
)


def test_nullable_and_empty_prompt_tags_export_as_empty() -> None:
    for raw_tags in (None, ""):
        prompt = Prompt(title="Canonical", content="  exact content\n", tags=raw_tags)
        assert validate_stored_prompt(prompt) == PortablePrompt(
            title="Canonical",
            content="  exact content\n",
            tags=(),
        )


@pytest.mark.parametrize("raw_tags", [" Code ", "code,code", "line\nbreak"])
def test_noncanonical_stored_prompt_tags_fail_closed(raw_tags: str) -> None:
    prompt = Prompt(title="Canonical", content="content", tags=raw_tags)
    with pytest.raises(StoredTransferDataError):
        validate_stored_prompt(prompt)


def test_tag_order_is_ignored_only_for_duplicate_identity() -> None:
    first = PortablePrompt("Title", "Body", ("one", "two"))
    second = PortablePrompt("Title", "Body", ("two", "one"))
    assert record_fingerprint(first) == record_fingerprint(second)
    assert second.tags == ("two", "one")


def test_three_equal_incoming_records_count_against_seen_state() -> None:
    record = PortableWorkflowLink(
        "Local editor",
        "http://localhost:5678/workflow/a",
        "Reference",
        ("local",),
    )
    assert count_exact_duplicates((record, record, record), ()).total == 2
    assert count_exact_duplicates((record, record, record), (record,)).total == 3


def test_preview_warns_but_keeps_every_record_importable() -> None:
    record = PortablePrompt("Title", "Body", ())
    preview = build_preview((record, record), ())
    assert preview.counts.total == 2
    assert preview.duplicates.total == 1
    assert [warning.code for warning in preview.warnings] == ["exact_duplicates"]
~~~

Add explicit tests for canonical/noncanonical title, content, URL, description, Workflow Link tags,
Prompt content preservation, prompt/workflow/type counts, empty preview, stable Prompt-then-Workflow
projection, UTF-8 output, ensure_ascii=False, allow_nan=False, one trailing newline, and exported_at
being the only changing value.

- [ ] **Step 2: Run the service tests and verify the red state**

Run:

~~~bash
cd backend && uv run pytest tests/unit/test_transfer_service.py -q
~~~

Expected: collection fails because local_ai_hub.services.transfer does not exist.

- [ ] **Step 3: Implement the portable domain and pure algorithms**

Create transfer.py with these exact constants and public values:

~~~python
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final, Sequence

from local_ai_hub.db.models import Prompt, WorkflowLink
from local_ai_hub.services.prompts import normalize_content, normalize_title as normalize_prompt_title
from local_ai_hub.services.tags import decode_tags, encode_tags
from local_ai_hub.services.workflow_links import (
    normalize_description,
    normalize_title as normalize_workflow_title,
    normalize_url,
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
    title: str
    content: str
    tags: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class PortableWorkflowLink:
    title: str
    url: str
    description: str
    tags: tuple[str, ...]


type PortableRecord = PortablePrompt | PortableWorkflowLink


@dataclass(frozen=True, slots=True)
class NormalizedTransferBundle:
    exported_at: str
    records: tuple[PortableRecord, ...]


@dataclass(frozen=True, slots=True)
class TransferCounts:
    total: int
    prompts: int
    workflow_links: int


@dataclass(frozen=True, slots=True)
class TransferWarning:
    code: str
    message: str


@dataclass(frozen=True, slots=True)
class TransferPreview:
    counts: TransferCounts
    duplicates: TransferCounts
    warnings: tuple[TransferWarning, ...]
~~~

Implement canonical stored-row validation without repair:

~~~python
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
~~~

Implement counts, structural fingerprints, duplicate scanning, preview warnings, projection, and
serialization:

~~~python
def transfer_counts(records: Sequence[PortableRecord]) -> TransferCounts:
    prompts = sum(isinstance(record, PortablePrompt) for record in records)
    workflows = len(records) - prompts
    return TransferCounts(len(records), prompts, workflows)


def record_fingerprint(record: PortableRecord) -> tuple[object, ...]:
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
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("transfer timestamp must be timezone-aware")
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def bundle_json_value(bundle: NormalizedTransferBundle) -> dict[str, object]:
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
    text = json.dumps(
        bundle_json_value(bundle),
        ensure_ascii=False,
        allow_nan=False,
        indent=2,
    )
    return (text + "\n").encode("utf-8")
~~~

- [ ] **Step 4: Write failing strict-schema and safe-error tests**

Create test_transfer_schemas.py. Use one valid bundle helper and name every contract:

~~~python
import json

import pytest

from local_ai_hub.api.transfer_schemas import (
    TransferContractError,
    decode_transfer_json,
    parse_transfer_bundle,
)


def valid_bundle(records: list[dict[str, object]] | None = None) -> dict[str, object]:
    return {
        "application": "local-ai-workflow-hub",
        "format_version": 1,
        "exported_at": "2026-07-18T12:00:00Z",
        "records": [] if records is None else records,
    }


def valid_prompt() -> dict[str, object]:
    return {
        "type": "prompt",
        "title": "  Normalized title  ",
        "content": "  Preserve me\n",
        "tags": [" Code ", "code", "Review"],
    }


def test_valid_bundle_normalizes_records_without_trimming_prompt_content() -> None:
    raw = json.dumps(valid_bundle([valid_prompt()]), ensure_ascii=False).encode()
    parsed = parse_transfer_bundle(decode_transfer_json(raw))
    prompt = parsed.records[0]
    assert prompt.title == "Normalized title"
    assert prompt.content == "  Preserve me\n"
    assert prompt.tags == ("code", "review")


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        (b'{"application":"a","application":"b"}', "malformed_json"),
        (b'{"value":NaN}', "malformed_json"),
        (b'{"value":Infinity}', "malformed_json"),
        (b'{"value":1} trailing', "malformed_json"),
        (b'\xff', "malformed_json"),
    ],
)
def test_non_strict_json_is_rejected(raw: bytes, code: str) -> None:
    with pytest.raises(TransferContractError) as caught:
        decode_transfer_json(raw)
    assert caught.value.code == code


@pytest.mark.parametrize("version", [True, 1.0, "1", None, 2])
def test_version_is_a_strict_supported_integer(version: object) -> None:
    payload = valid_bundle()
    payload["format_version"] = version
    with pytest.raises(TransferContractError) as caught:
        parse_transfer_bundle(payload)
    assert caught.value.code == "unsupported_format_version"


def test_safe_issues_never_reflect_unknown_keys_or_values() -> None:
    marker = "secret-marker-never-reflect"
    payload = valid_bundle([valid_prompt()])
    payload["records"][0][marker] = marker
    with pytest.raises(TransferContractError) as caught:
        parse_transfer_bundle(payload)
    rendered = caught.value.as_response().model_dump_json()
    assert marker not in rendered
    assert caught.value.code == "invalid_bundle"
~~~

Add parameterized cases for non-object roots, wrong/missing application, missing version, 5,000 and
5,001 records, non-UTC/malformed timestamps, unknown/missing record type, unknown root/record fields,
wrong scalar/list types, every Prompt and Workflow Link field boundary, 100/101 safe issues, and
fixed sanitized location metadata.

- [ ] **Step 5: Run the schema tests and verify the red state**

Run:

~~~bash
cd backend && uv run pytest tests/unit/test_transfer_schemas.py -q
~~~

Expected: collection fails because local_ai_hub.api.transfer_schemas does not exist.

- [ ] **Step 6: Implement strict schemas, decode precedence, and response models**

Create transfer_schemas.py with strict required record models:

~~~python
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from local_ai_hub.services.prompts import normalize_content, normalize_title as normalize_prompt_title
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
from local_ai_hub.services.workflow_links import (
    normalize_description,
    normalize_title as normalize_workflow_title,
    normalize_url,
)


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class PromptTransferRecord(_StrictModel):
    type: Literal["prompt"]
    title: str
    content: str
    tags: list[str]


class WorkflowLinkTransferRecord(_StrictModel):
    type: Literal["workflow_link"]
    title: str
    url: str
    description: str
    tags: list[str]


type TransferRecordModel = Annotated[
    PromptTransferRecord | WorkflowLinkTransferRecord,
    Field(discriminator="type"),
]


class TransferBundleV1(_StrictModel):
    application: Literal["local-ai-workflow-hub"]
    format_version: int
    exported_at: str
    records: list[TransferRecordModel] = Field(max_length=MAX_BUNDLE_RECORDS)
~~~

Add before/after validators that require type(value) is int for format_version, parse only RFC 3339
timestamps with Z or +00:00 and a zero offset, and call the existing domain normalizers for every
record field. All fields remain required; there are no default tags or description values.

Implement duplicate-key-safe decoding and deterministic preflight:

~~~python
class _MalformedJson(ValueError):
    pass


def _object_without_duplicates(
    pairs: list[tuple[str, object]],
) -> dict[str, object]:
    value: dict[str, object] = {}
    for key, item in pairs:
        if key in value:
            raise _MalformedJson("duplicate object key")
        value[key] = item
    return value


def _reject_constant(_value: str) -> object:
    raise _MalformedJson("non-standard numeric constant")


def decode_transfer_json(body: bytes) -> object:
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
~~~

Define TransferIssueResponse, TransferErrorDetailResponse, TransferErrorResponse,
TransferCountsResponse, TransferWarningResponse, TransferPreviewResponse, and TransferImportResponse
with extra="forbid". TransferContractError must store code/message/issues/issues_truncated, expose
fixed() and from_validation(), and map Pydantic errors through this allowlist only:

| Pydantic type family | Safe issue code | Safe message |
| --- | --- | --- |
| missing | missing_field | Required field is missing. |
| extra_forbidden | unexpected_field | Bundle contains an unexpected field. |
| string_type, int_type, list_type, model_type | invalid_type | Field has an invalid type. |
| union_tag_invalid, union_tag_not_found | unknown_record_type | Record type is not supported. |
| every other type | invalid_value | Field value is invalid. |

Retain only known location segments: application, format_version, exported_at, records, type, title,
content, tags, url, description, known discriminators, and non-negative indices. Unknown submitted
key names never enter the response. Stop at 100 issues and set issues_truncated when another exists.

- [ ] **Step 7: Run focused and existing backend contract gates**

Run:

~~~bash
cd backend && uv run pytest tests/unit/test_transfer_service.py tests/unit/test_transfer_schemas.py -q
cd backend && uv run pytest tests/unit/test_prompt_service.py tests/unit/test_workflow_link_service.py -q
cd backend && uv run ruff check .
cd backend && uv run mypy src
cd backend && uv run ruff format --check .
~~~

Expected: every command passes; existing Prompt/Workflow normalization is unchanged.

- [ ] **Step 8: Record and commit Task 1**

Append a 2026-07-18 Phase 1C transfer-contract entry to history/BUILD_LOG.md with exact test counts,
strict parsing decisions, nullable Prompt tag compatibility, no schema/dependency changes, and the
commit message. Then run:

~~~bash
git add backend/src/local_ai_hub/services/transfer.py backend/src/local_ai_hub/api/transfer_schemas.py backend/tests/unit/test_transfer_service.py backend/tests/unit/test_transfer_schemas.py history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add transfer bundle contracts"
~~~

### Task 2: Deterministic Reads and Atomic Transfer Persistence

**Files:**
- Create: backend/src/local_ai_hub/db/repositories/transfer.py
- Create: backend/tests/unit/test_transfer_repository.py
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing repository tests**

Create an isolated in-memory SQLite fixture with StaticPool and registered SQLite functions. Add:

~~~python
def test_reads_prompts_then_workflows_in_ascending_id(session: Session) -> None:
    second_prompt = Prompt(title="Second", content="body", tags="")
    first_prompt = Prompt(title="First", content="body", tags=None)
    second_link = WorkflowLink(
        title="Second link",
        url="http://localhost:5678/two",
        description="",
        tags="local",
    )
    first_link = WorkflowLink(
        title="First link",
        url="http://localhost:5678/one",
        description="",
        tags="local",
    )
    session.add_all([second_prompt, first_prompt, second_link, first_link])
    session.commit()
    rows = list_transfer_rows(session)
    assert [item.id for item in rows.prompts] == sorted(
        [second_prompt.id, first_prompt.id]
    )
    assert [item.id for item in rows.workflow_links] == sorted(
        [second_link.id, first_link.id]
    )


def test_mixed_append_uses_one_commit_and_fresh_identity(session: Session) -> None:
    records = (
        PortablePrompt("Prompt", "Body", ("local",)),
        PortableWorkflowLink(
            "Workflow",
            "http://localhost:5678/workflow/imported",
            "Reference",
            ("local",),
        ),
    )
    with patch.object(session, "commit", wraps=session.commit) as commit:
        append_transfer_records(session, records)
    assert commit.call_count == 1
    session.expire_all()
    prompts = tuple(session.scalars(select(Prompt)).all())
    workflows = tuple(session.scalars(select(WorkflowLink)).all())
    assert len(prompts) == len(workflows) == 1
    assert prompts[0].id > 0 and workflows[0].id > 0
    assert prompts[0].created_at.tzinfo is not None
    assert workflows[0].created_at.tzinfo is not None
~~~

Add tests for empty count, count across both tables, zero commit/flush during reads, source-row
editable-field preservation, tag order persistence, add_all failure, a before_flush failure after
both model types are pending, commit failure, best-effort rollback failure, and zero partial rows
from a fresh Session after each failure.

- [ ] **Step 2: Verify the repository tests fail**

Run:

~~~bash
cd backend && uv run pytest tests/unit/test_transfer_repository.py -q
~~~

Expected: collection fails because local_ai_hub.db.repositories.transfer does not exist.

- [ ] **Step 3: Implement the focused repository**

Create transfer.py:

~~~python
from contextlib import suppress
from dataclasses import dataclass
from typing import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from local_ai_hub.db.models import Prompt, WorkflowLink
from local_ai_hub.services.tags import encode_tags
from local_ai_hub.services.transfer import (
    PortablePrompt,
    PortableRecord,
    PortableWorkflowLink,
)


@dataclass(frozen=True, slots=True)
class StoredTransferRows:
    prompts: tuple[Prompt, ...]
    workflow_links: tuple[WorkflowLink, ...]

    @property
    def total(self) -> int:
        return len(self.prompts) + len(self.workflow_links)


def count_transfer_rows(session: Session) -> int:
    prompts = session.scalar(select(func.count()).select_from(Prompt)) or 0
    workflows = session.scalar(select(func.count()).select_from(WorkflowLink)) or 0
    return prompts + workflows


def list_transfer_rows(session: Session) -> StoredTransferRows:
    prompts = tuple(session.scalars(select(Prompt).order_by(Prompt.id.asc())).all())
    workflows = tuple(
        session.scalars(select(WorkflowLink).order_by(WorkflowLink.id.asc())).all()
    )
    return StoredTransferRows(prompts, workflows)


def append_transfer_records(
    session: Session,
    records: Sequence[PortableRecord],
) -> None:
    models: list[Prompt | WorkflowLink] = []
    for record in records:
        if isinstance(record, PortablePrompt):
            models.append(
                Prompt(
                    title=record.title,
                    content=record.content,
                    tags=encode_tags(record.tags),
                )
            )
        else:
            models.append(
                WorkflowLink(
                    title=record.title,
                    url=record.url,
                    description=record.description,
                    tags=encode_tags(record.tags),
                )
            )
    try:
        session.add_all(models)
        session.commit()
    except Exception:
        with suppress(Exception):
            session.rollback()
        raise
~~~

Do not call existing create_prompt or create_workflow_link functions because they commit
independently. Do not refresh imported objects because the HTTP response contains only counts.

- [ ] **Step 4: Run repository and domain regression gates**

Run:

~~~bash
cd backend && uv run pytest tests/unit/test_transfer_repository.py -q
cd backend && uv run pytest tests/unit/test_prompt_repository.py tests/unit/test_workflow_link_repository.py -q
cd backend && uv run ruff check .
cd backend && uv run mypy src
cd backend && uv run ruff format --check .
~~~

Expected: all tests and static checks pass; one mixed import produces exactly one commit.

- [ ] **Step 5: Record and commit Task 2**

Append the deterministic-read, one-transaction, rollback, fresh ID/time, and source-preservation
evidence to history/BUILD_LOG.md. Then:

~~~bash
git add backend/src/local_ai_hub/db/repositories/transfer.py backend/tests/unit/test_transfer_repository.py history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add atomic transfer persistence"
~~~

### Task 3: Bounded Transfer HTTP and Complete Backend API

**Files:**
- Create: backend/src/local_ai_hub/api/transfer_http.py
- Create: backend/src/local_ai_hub/api/routes/transfer.py
- Create: backend/tests/unit/test_transfer_http.py
- Create: backend/tests/e2e/test_transfer_api.py
- Modify: backend/src/local_ai_hub/api/main.py
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing media-type, stream-limit, and header tests**

Create test_transfer_http.py with direct Starlette Request receive channels. Prove:

~~~python
@pytest.mark.parametrize(
    "value",
    [
        "application/json",
        "APPLICATION/JSON",
        "application/json; charset=utf-8",
        'application/json; CHARSET="UTF-8"',
    ],
)
def test_json_media_type_accepts_only_utf8_json(value: str) -> None:
    validate_json_media_type(value)


@pytest.mark.parametrize(
    "value",
    [
        None,
        "text/json",
        "application/json; charset=latin-1",
        "application/json; charset=utf-8; profile=x",
    ],
)
def test_json_media_type_rejects_every_other_shape(value: str | None) -> None:
    with pytest.raises(TransferHttpProblem) as caught:
        validate_json_media_type(value)
    assert caught.value.status_code == 415
    assert caught.value.code == "unsupported_media_type"
~~~

Add async tests proving Content-Length above 10 MiB rejects before receive, absent/smaller headers
cannot bypass streaming, exactly 10,485,760 bytes passes, one byte over fails before append, and
transfer_json_response always sets JSON charset, no-store, no-cache, and nosniff while adding
Content-Disposition only when requested.

- [ ] **Step 2: Write failing end-to-end API tests**

Create a StaticPool/TestClient harness like the Prompt and Workflow API suites. Define a compact
bundle helper and add these assertions:

~~~python
def test_empty_export_is_importable_format_but_empty_import_is_rejected(
    harness: TransferApiHarness,
) -> None:
    exported = harness.client.get("/api/transfer/export")
    assert exported.status_code == 200
    assert exported.json()["records"] == []
    assert "Content-Disposition" in exported.headers

    preview = harness.client.post(
        "/api/transfer/import/preview",
        content=exported.content,
        headers={"Content-Type": "application/json"},
    )
    assert preview.status_code == 200
    assert preview.json()["valid"] is True
    assert preview.json()["importable"] is False
    assert preview.json()["warnings"] == [
        {
            "code": "empty_bundle",
            "message": "This bundle contains no records and cannot be imported.",
        }
    ]

    committed = harness.client.post(
        "/api/transfer/import",
        content=exported.content,
        headers={"Content-Type": "application/json"},
    )
    assert committed.status_code == 422
    assert committed.json()["detail"]["code"] == "empty_bundle"


def test_repeat_import_appends_every_record_and_updates_duplicate_counts(
    harness: TransferApiHarness,
) -> None:
    raw = encoded_mixed_bundle()
    first_preview = post_raw(harness.client, "/api/transfer/import/preview", raw)
    assert first_preview.json()["duplicates"]["total"] == 0
    first = post_raw(harness.client, "/api/transfer/import", raw)
    assert first.status_code == 201
    assert first.json()["imported"]["total"] == 2
    second_preview = post_raw(harness.client, "/api/transfer/import/preview", raw)
    assert second_preview.json()["duplicates"]["total"] == 2
    second = post_raw(harness.client, "/api/transfer/import", raw)
    assert second.status_code == 201
    assert second.json()["duplicates_imported"]["total"] == 2
    with harness.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Prompt)) == 2
        assert session.scalar(select(func.count()).select_from(WorkflowLink)) == 2
~~~

Also test deterministic Prompt-then-Workflow export without IDs/timestamps; UTC exported_at; fixed
safe filename; all privacy headers on success/error; no Content-Disposition on preview/import/error;
stored Prompt NULL/empty tags; corrupt stored row export/preview/import failures; record/byte export
limits; wrong media/charset; declared, exact, and over-byte boundaries; malformed UTF-8/JSON;
duplicate keys; NaN; root/application/version/schema/record errors; 100/101 issues; preview no
mutation/commit; mixed 201 import with fresh IDs/timestamps; direct empty import; injected
before_flush/commit failure with complete rollback; source-row preservation; marker non-reflection in
response/captured logs; and zero socket/client creation for an inert imported workflow URL.

- [ ] **Step 3: Verify the HTTP and API tests fail**

Run:

~~~bash
cd backend && uv run pytest tests/unit/test_transfer_http.py tests/e2e/test_transfer_api.py -q
~~~

Expected: imports or routes fail because transfer_http.py and routes/transfer.py do not exist.

- [ ] **Step 4: Implement the bounded raw-body and response helpers**

Create transfer_http.py with:

~~~python
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request
from fastapi.responses import Response

from local_ai_hub.services.transfer import MAX_BUNDLE_BYTES


@dataclass(frozen=True, slots=True)
class TransferHttpProblem(Exception):
    status_code: int
    code: str
    message: str


def validate_json_media_type(value: str | None) -> None:
    if value is None:
        raise TransferHttpProblem(415, "unsupported_media_type", "Content-Type must be UTF-8 JSON.")
    parts = [part.strip() for part in value.split(";")]
    if parts[0].casefold() != "application/json" or len(parts) > 2:
        raise TransferHttpProblem(415, "unsupported_media_type", "Content-Type must be UTF-8 JSON.")
    if len(parts) == 2:
        name, separator, raw_value = parts[1].partition("=")
        charset = raw_value.strip().strip('"').casefold()
        if separator != "=" or name.strip().casefold() != "charset" or charset != "utf-8":
            raise TransferHttpProblem(
                415,
                "unsupported_media_type",
                "Content-Type must be UTF-8 JSON.",
            )


async def read_transfer_body(request: Request) -> bytes:
    validate_json_media_type(request.headers.get("content-type"))
    declared = request.headers.get("content-length")
    if declared is not None and declared.isascii() and declared.isdecimal():
        if int(declared) > MAX_BUNDLE_BYTES:
            raise TransferHttpProblem(413, "bundle_too_large", "Bundle is too large.")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_BUNDLE_BYTES:
            raise TransferHttpProblem(413, "bundle_too_large", "Bundle is too large.")
        body.extend(chunk)
    return bytes(body)


def transfer_headers(content_disposition: str | None = None) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
    }
    if content_disposition is not None:
        headers["Content-Disposition"] = content_disposition
    return headers


def transfer_json_response(
    body: bytes,
    *,
    status_code: int,
    content_disposition: str | None = None,
) -> Response:
    return Response(
        content=body,
        status_code=status_code,
        headers=transfer_headers(content_disposition),
    )
~~~

Extend transfer_http.py with `json`, `BaseModel`, and the transfer error response models, then add
these exact serializers. They use only already-sanitized models and never accept an exception string:

~~~python
def _model_bytes(model: BaseModel) -> bytes:
    return json.dumps(
        model.model_dump(mode="json"),
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    ).encode("utf-8")


def transfer_model_response(model: BaseModel, *, status_code: int) -> Response:
    return transfer_json_response(_model_bytes(model), status_code=status_code)


def _error_model(code: str, message: str) -> TransferErrorResponse:
    return TransferErrorResponse(
        detail=TransferErrorDetailResponse(
            code=code,
            message=message,
            issues=[],
            issues_truncated=False,
        )
    )


def transfer_http_problem_response(problem: TransferHttpProblem) -> Response:
    return transfer_model_response(
        _error_model(problem.code, problem.message),
        status_code=problem.status_code,
    )


_CONTRACT_STATUS = {
    "malformed_json": 400,
    "bundle_too_large": 413,
}


def transfer_contract_error_response(error: TransferContractError) -> Response:
    return transfer_model_response(
        error.as_response(),
        status_code=_CONTRACT_STATUS.get(error.code, 422),
    )


def fixed_transfer_error_response(
    *,
    status_code: int,
    code: str,
    message: str,
) -> Response:
    return transfer_model_response(
        _error_model(code, message),
        status_code=status_code,
    )
~~~

- [ ] **Step 5: Implement all three transfer routes**

Create routes/transfer.py. Use Request rather than a Pydantic body and one shared request-scoped
Session:

~~~python
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from local_ai_hub.api.transfer_http import (
    TransferHttpProblem,
    read_transfer_body,
    transfer_json_response,
)
from local_ai_hub.api.transfer_schemas import (
    TransferContractError,
    decode_transfer_json,
    parse_transfer_bundle,
)
from local_ai_hub.db.repositories.transfer import (
    append_transfer_records,
    count_transfer_rows,
    list_transfer_rows,
)
from local_ai_hub.db.session import get_db
from local_ai_hub.services.transfer import (
    MAX_BUNDLE_BYTES,
    MAX_BUNDLE_RECORDS,
    NormalizedTransferBundle,
    PortableRecord,
    StoredTransferDataError,
    build_preview,
    serialize_bundle,
    utc_transfer_timestamp,
    validate_stored_prompt,
    validate_stored_workflow_link,
)

router = APIRouter(tags=["transfer"])
DatabaseSession = Annotated[Session, Depends(get_db)]


def _existing_records(session: Session) -> tuple[PortableRecord, ...]:
    rows = list_transfer_rows(session)
    return tuple(
        [validate_stored_prompt(item) for item in rows.prompts]
        + [validate_stored_workflow_link(item) for item in rows.workflow_links]
    )
~~~

Implement route flows exactly:

1. export checks count before reads, rejects more than 5,000, reads/rechecks total, validates stored
   records, captures one UTC timestamp, serializes once, rejects encoded bytes over 10 MiB, and returns
   filename local-ai-workflow-hub-YYYYMMDDTHHMMSSZ.json.
2. preview reads bounded bytes, decodes/parses strictly, validates every existing stored record,
   computes counts/duplicates/warnings, performs no flush/commit, and returns 200.
3. import independently repeats read/decode/parse/existing/duplicate work, rejects zero input records,
   calls append_transfer_records once, and returns 201 with imported and duplicates_imported.
4. TransferHttpProblem and TransferContractError keep their documented status/code. Stored/data/read
   failures become export_failed, preview_failed, or import_failed with a fixed 500 response.
5. Never include str(error), repr(error), exc_info, a body, a filename, or record value in logs.

Mount the router in main.py:

~~~python
from local_ai_hub.api.routes import health, ollama, prompts, transfer, workflow_links

app.include_router(transfer.router, prefix="/api/transfer")
~~~

- [ ] **Step 6: Run all backend gates**

Run:

~~~bash
cd backend && uv run pytest tests/unit/test_transfer_http.py tests/e2e/test_transfer_api.py -q
cd backend && uv run pytest
cd backend && uv run pytest tests/e2e
cd backend && uv run ruff check .
cd backend && uv run mypy src
cd backend && uv run ruff format --check .
~~~

Expected: every backend and e2e test passes without a real Ollama server or destination request.

- [ ] **Step 7: Record and commit Task 3**

Append exact endpoint, limit, header, transaction, rollback, no-reflection, no-dereference, test, and
static-check evidence to history/BUILD_LOG.md. Then:

~~~bash
git add backend/src/local_ai_hub/api/transfer_http.py backend/src/local_ai_hub/api/routes/transfer.py backend/src/local_ai_hub/api/main.py backend/tests/unit/test_transfer_http.py backend/tests/e2e/test_transfer_api.py history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add import and export api"
~~~

### Task 4: Strict Frontend Transfer Contracts

**Files:**
- Create: web/src/api/transfer.ts
- Create: web/src/api/transfer.test.ts
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing runtime and request tests**

Create transfer.test.ts with mocked fetch and helpers. Assert exact paths/methods/body:

~~~typescript
it('posts the selected JSON object text without stringifying it again', async () => {
  const rawJson = JSON.stringify(validBundle())
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      jsonResponse(validPreview(), { status: 200 }),
    ),
  )

  await previewTransferBundle(rawJson)

  expect(fetch).toHaveBeenCalledWith(
    '/api/transfer/import/preview',
    expect.objectContaining({
      method: 'POST',
      body: rawJson,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    }),
  )
})


it('treats a malformed successful import response as outcome uncertain', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse({ imported: 'wrong' }, { status: 201 })),
  )
  await expect(importTransferBundle(JSON.stringify(validBundle()))).rejects.toMatchObject({
    outcomeUncertain: true,
  })
})
~~~

Cover strict exact keys, application/version/type literals, prompt/workflow field boundaries,
canonical tags, inert URL validation, Prompt-then-Workflow grouping, UTC exported_at, 5,000 record
cap, 10 MiB encoded export response, count invariants, warning code/message invariants, bounded issue
shapes, all success statuses, wrong status, malformed JSON, valid/invalid error envelopes, abort,
fixed network error, safe filename, raw body identity, and zero destination requests.

- [ ] **Step 2: Verify the frontend contract tests fail**

Run:

~~~bash
cd web && pnpm test -- src/api/transfer.test.ts
~~~

Expected: the test suite fails because src/api/transfer.ts does not exist.

- [ ] **Step 3: Implement the transfer types and dedicated request boundary**

Create transfer.ts with:

~~~typescript
import { isSafeWorkflowLinkUrl } from './workflowLinkUrl'

export const MAX_TRANSFER_BUNDLE_BYTES = 10_485_760
export const MAX_TRANSFER_RECORDS = 5_000
export const MAX_TRANSFER_ISSUES = 100

export interface TransferCounts {
  total: number
  prompts: number
  workflow_links: number
}

export interface PromptTransferRecord {
  type: 'prompt'
  title: string
  content: string
  tags: string[]
}

export interface WorkflowLinkTransferRecord {
  type: 'workflow_link'
  title: string
  url: string
  description: string
  tags: string[]
}

export type TransferRecord = PromptTransferRecord | WorkflowLinkTransferRecord

export interface TransferBundleV1 {
  application: 'local-ai-workflow-hub'
  format_version: 1
  exported_at: string
  records: TransferRecord[]
}

export interface TransferPreviewResponse {
  valid: true
  importable: boolean
  format_version: 1
  counts: TransferCounts
  duplicates: TransferCounts
  warnings: TransferWarning[]
}

export interface TransferImportResponse {
  imported: TransferCounts
  duplicates_imported: TransferCounts
}

export interface TransferExportResult {
  bundle: TransferBundleV1
  rawJson: string
  filename: string
  counts: TransferCounts
}
~~~

Define TransferWarning, TransferIssue, TransferErrorDetail, a closed TransferErrorCode union, and:

~~~typescript
export class TransferHttpError extends Error {
  readonly status: number
  readonly detail: TransferErrorDetail | null
  readonly outcomeUncertain: boolean

  constructor(
    status: number,
    detail: TransferErrorDetail | null,
    outcomeUncertain = false,
  ) {
    super(detail?.message ?? 'Backend returned an invalid transfer response')
    this.name = 'TransferHttpError'
    this.status = status
    this.detail = detail
    this.outcomeUncertain = outcomeUncertain
  }
}
~~~

Implement exact-key runtime guards, Unicode code-point lengths, canonical title/content/description/
tags, zero-UTC timestamp parsing, safe URL parsing, non-negative count invariants, warning conditions,
bounded issues, fixed filename extraction, and record grouping. Do not render or include record
values in thrown messages.

Implement one dedicated request function that uses relative paths and never retries:

~~~typescript
async function transferRequest(
  path: string,
  expectedStatus: number,
  options: RequestInit,
  outcomeUncertain: boolean,
): Promise<{ response: Response; text: string; payload: unknown }> {
  let response: Response
  try {
    response = await fetch(path, options)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('Unable to reach the backend', { cause: error })
  }
  const text = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    if (response.status === expectedStatus && outcomeUncertain) {
      throw new TransferHttpError(response.status, null, true)
    }
    throw new TransferHttpError(response.status, null)
  }
  if (response.status !== expectedStatus) {
    throw new TransferHttpError(response.status, parseTransferError(payload))
  }
  return { response, text, payload }
}
~~~

Export exportTransferBundle(signal), previewTransferBundle(rawJson, signal), and
importTransferBundle(rawJson). The import function accepts no AbortSignal. Export reads raw response
text, validates its encoded byte size and bundle, requires the safe Content-Disposition filename,
and returns only validated data.

- [ ] **Step 4: Run focused frontend contract gates**

Run:

~~~bash
cd web && pnpm test -- src/api/transfer.test.ts
cd web && pnpm lint
cd web && pnpm typecheck
~~~

Expected: all commands pass and the existing shared client is unchanged.

- [ ] **Step 5: Record and commit Task 4**

Append runtime validation, raw-body, fixed error, no-retry, safe filename, and no-destination evidence
to history/BUILD_LOG.md. Then:

~~~bash
git add web/src/api/transfer.ts web/src/api/transfer.test.ts history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add transfer frontend contracts"
~~~

### Task 5: Memory-Only File State and Transfer Controller

**Files:**
- Create: web/src/features/transfer/transferState.ts
- Create: web/src/features/transfer/transferState.test.ts
- Create: web/src/features/transfer/useTransfer.ts
- Create: web/src/features/transfer/TransferView.test.tsx
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing file-boundary tests**

Create transferState.test.ts:

~~~typescript
it('accepts the exact byte limit and decodes UTF-8 fatally', async () => {
  const bytes = new TextEncoder().encode('{"title":"Straße"}')
  const file = {
    size: bytes.byteLength,
    arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
  } as unknown as File
  await expect(readTransferFile(file)).resolves.toBe('{"title":"Straße"}')
})


it('rejects one byte over before reading', async () => {
  const file = {
    size: MAX_TRANSFER_BUNDLE_BYTES + 1,
    arrayBuffer: vi.fn(),
  } as unknown as File
  await expect(readTransferFile(file)).rejects.toMatchObject({ code: 'too_large' })
  expect(file.arrayBuffer).not.toHaveBeenCalled()
})


it('rejects invalid UTF-8 rather than replacing it', async () => {
  const bytes = new Uint8Array([0xff])
  const file = {
    size: 1,
    arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
  } as unknown as File
  await expect(readTransferFile(file)).rejects.toMatchObject({ code: 'invalid_utf8' })
})
~~~

Add exact buffer-length recheck, unreadable file, generation freshness, valid-empty/invalid preview,
prepared import, and discard-confirmation predicate cases.

- [ ] **Step 2: Verify the state tests fail**

Run:

~~~bash
cd web && pnpm test -- src/features/transfer/transferState.test.ts
~~~

Expected: the module import fails.

- [ ] **Step 3: Implement the pure file/state boundary**

Create transferState.ts:

~~~typescript
import {
  MAX_TRANSFER_BUNDLE_BYTES,
  type TransferPreviewResponse,
} from '../../api/transfer'

export interface TransferSelection {
  generation: number
  filename: string
  size: number
  rawJson: string | null
}

export interface FreshTransferPreview {
  selectionGeneration: number
  response: TransferPreviewResponse
}

export type TransferFileErrorCode = 'too_large' | 'unreadable' | 'invalid_utf8'

export class TransferFileError extends Error {
  readonly code: TransferFileErrorCode

  constructor(code: TransferFileErrorCode, message: string) {
    super(message)
    this.name = 'TransferFileError'
    this.code = code
  }
}

export const isTransferFileSizeAllowed = (size: number) =>
  Number.isSafeInteger(size) && size >= 0 && size <= MAX_TRANSFER_BUNDLE_BYTES

export async function readTransferFile(file: File): Promise<string> {
  if (!isTransferFileSizeAllowed(file.size)) {
    throw new TransferFileError('too_large', 'Selected bundle is larger than 10 MiB')
  }
  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    throw new TransferFileError('unreadable', 'Selected bundle could not be read')
  }
  if (!isTransferFileSizeAllowed(buffer.byteLength)) {
    throw new TransferFileError('too_large', 'Selected bundle is larger than 10 MiB')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new TransferFileError('invalid_utf8', 'Selected bundle is not valid UTF-8')
  }
}

export function hasFreshImportablePreview(
  selection: TransferSelection | null,
  preview: FreshTransferPreview | null,
): boolean {
  return (
    selection !== null &&
    preview !== null &&
    preview.selectionGeneration === selection.generation &&
    preview.response.importable
  )
}
~~~

requiresDiscardConfirmation returns true only for a fresh importable preview; invalid/empty/stale
selection data still clears on navigation but does not claim destructive data loss.

- [ ] **Step 4: Write failing controller behavior tests**

Start TransferView.test.tsx with a minimal hook harness and mocked api/transfer. Add tests for:

- no request while disabled or merely mounting;
- selection read then preview;
- replacement abort/generation ignoring stale completion;
- clear/replacement/unmount memory release;
- empty/invalid preview state;
- prepared discard Cancel/Confirm;
- pending navigation returns false without window.confirm;
- preview/export AbortController cleanup;
- beforeunload only while prepared/pending;
- export Blob, safe anchor, removal, and URL revocation;
- import success clears raw/preview and keeps safe counts;
- valid server rejection invalidates preview;
- network or malformed 201 marks uncertain and requires explicit re-preview;
- no automatic import retry and no Import AbortController.

Use deferred promises to prove stale and pending behavior without timing races.

- [ ] **Step 5: Verify the controller tests fail**

Run:

~~~bash
cd web && pnpm test -- src/features/transfer/TransferView.test.tsx
~~~

Expected: the local hook-harness tests fail because useTransfer.ts is not present. Do not import or
reference TransferView.tsx in Task 5. Add all component assertions only in Task 6; do not commit
skipped tests.

- [ ] **Step 6: Implement the controller state machine**

Create useTransfer.ts with this public boundary:

~~~typescript
export type TransferRequestStatus = 'idle' | 'pending' | 'success' | 'error'

export interface TransferController {
  selection: { filename: string; size: number } | null
  exportStatus: TransferRequestStatus
  exportResult: TransferCounts | null
  exportError: string | null
  previewStatus: 'idle' | 'reading' | 'pending' | 'ready' | 'error'
  preview: TransferPreviewResponse | null
  previewError: string | null
  previewIssues: TransferIssue[]
  importStatus: TransferRequestStatus
  importResult: TransferImportResponse | null
  importError: string | null
  importOutcomeUncertain: boolean
  confirmationOpen: boolean
  pending: boolean
  canImport: boolean
  hasPreparedImport: boolean
  selectFile: (file: File | null) => void
  clearSelection: () => void
  previewAgain: () => void
  downloadBundle: () => void
  openImportConfirmation: () => void
  cancelImportConfirmation: () => void
  confirmImport: () => void
  confirmDiscard: () => boolean
}

export function useTransfer(enabled: boolean): TransferController
~~~

Implement these deterministic transitions:

| Event | Required transition |
| --- | --- |
| select | increment generation, abort preview, clear old results, read fatally |
| read success | store raw string privately, post preview for same generation |
| stale settle | ignore because generation differs |
| preview success | store FreshTransferPreview only for current generation |
| clear/disable | abort preview/export; increment generation; drop raw/file/preview/dialog |
| export | explicit request; temporary Blob/anchor; remove and revoke in finally; retain counts only |
| open confirm | only when fresh non-empty preview exists |
| import confirm | close dialog, set pending, send same private raw text without AbortSignal |
| import success | clear raw/file/preview; retain safe imported counts |
| any import failure | invalidate preview; retain raw for previewAgain; never retry |
| network/malformed 201 | set importOutcomeUncertain true |
| confirmDiscard | return false while pending; prompt only for prepared import; clear on approval |

While any request or file read is pending, reject selectFile, clearSelection, previewAgain,
downloadBundle, openImportConfirmation, and repeated confirmImport calls. In particular, once import
is confirmed, expose no cancellation or teardown control until its single request settles.

Add a beforeunload listener while pending or prepared. For download use:

~~~typescript
const blob = new Blob([result.rawJson], {
  type: 'application/json;charset=utf-8',
})
const url = URL.createObjectURL(blob)
const anchor = document.createElement('a')
anchor.href = url
anchor.download = result.filename
anchor.hidden = true
document.body.append(anchor)
try {
  anchor.click()
} finally {
  anchor.remove()
  URL.revokeObjectURL(url)
}
~~~

Do not store File, exported bundle, Blob, anchor, or object URL in React state.

- [ ] **Step 7: Run controller/state and frontend gates**

In this task, test useTransfer through a local hook harness declared inside
TransferView.test.tsx; do not create or import TransferView until Task 6. Run:

~~~bash
cd web && pnpm test -- src/features/transfer/transferState.test.ts src/features/transfer/TransferView.test.tsx
cd web && pnpm lint
cd web && pnpm typecheck
~~~

Expected: pure state and hook lifecycle tests pass.

- [ ] **Step 8: Record and commit Task 5**

Append file-byte, fatal UTF-8, generation, memory release, uncertain-outcome, no-retry, Blob cleanup,
and focused test evidence to history/BUILD_LOG.md. Then:

~~~bash
git add web/src/features/transfer/transferState.ts web/src/features/transfer/transferState.test.ts web/src/features/transfer/useTransfer.ts web/src/features/transfer/TransferView.test.tsx history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add transfer workflow controller"
~~~

### Task 6: Safe Import/Export Interface

**Required skill:** Before editing UI code, the implementing main agent must announce and read the
frontend-design skill. Preserve the established control-room design while giving Transfer a distinct
portable-data visual identity.

**Files:**
- Create: web/src/features/transfer/TransferPreview.tsx
- Create: web/src/features/transfer/ExportPanel.tsx
- Create: web/src/features/transfer/ImportPanel.tsx
- Create: web/src/features/transfer/TransferView.tsx
- Modify: web/src/features/transfer/TransferView.test.tsx
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Add failing accessible UI tests**

Extend TransferView.test.tsx using a real useTransfer(true) harness and mocked api/transfer. Test:

~~~typescript
it('does not export until the explicit download action', async () => {
  render(<TransferHarness />)
  expect(exportTransferBundle).not.toHaveBeenCalled()
  await userEvent.click(
    screen.getByRole('button', { name: 'Download JSON bundle' }),
  )
  expect(exportTransferBundle).toHaveBeenCalledTimes(1)
})


it('shows duplicate counts and confirms append-only behavior without skip controls', async () => {
  previewTransferBundleMock.mockResolvedValueOnce(
    previewResponse({ total: 2, prompts: 1, workflow_links: 1 }, 1),
  )
  render(<TransferHarness />)
  await chooseBundle()
  expect(await screen.findByText('1 exact duplicate')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Import records' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('append-only')
  expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument()
})
~~~

Cover sensitive export warning, selected filename/size wrapping, input value reset, same-file
reselection, replace/clear, preview pending/error/empty/valid/duplicates, safe issues only, confirmation
Cancel/Escape/focus restoration, type/total/duplicate confirmation copy, import pending/success/error/
uncertain states, explicit Preview again, committed-result focus after dialog close, export error focus,
live regions, aria-describedby, and absence of raw content/description/full URL rendering.

- [ ] **Step 2: Verify UI tests fail**

Run:

~~~bash
cd web && pnpm test -- src/features/transfer/TransferView.test.tsx
~~~

Expected: component imports fail.

- [ ] **Step 3: Build focused presentational components**

TransferPreview.tsx receives preview and issues and renders only counts, fixed warning messages, safe
issue code/message, record index, and field. It must never accept rawJson or TransferRecord props.

ExportPanel.tsx receives controller and renders:

~~~tsx
<section className="transfer-panel transfer-panel--export" aria-labelledby="transfer-export-title">
  <p className="eyebrow">Portable copy · Outbound</p>
  <h2 id="transfer-export-title">Export local registries</h2>
  <p>
    Download every prompt and workflow link as one JSON bundle. The file can contain sensitive
    prompt text, internal hosts, query strings, and fragments.
  </p>
  <button
    type="button"
    disabled={controller.pending}
    onClick={controller.downloadBundle}
  >
    {controller.exportStatus === 'pending'
      ? 'Preparing bundle…'
      : 'Download JSON bundle'}
  </button>
</section>
~~~

ImportPanel.tsx uses accept=".json,application/json", captures only the first File, immediately sets
event.currentTarget.value = "", and delegates to controller.selectFile. Render selected filename/
size, Clear selection, Preview again, TransferPreview, and Import records. Use the unchanged shared
ConfirmDialog with fixed append-only explanation and total/type/duplicate counts.

Disable file replacement, Clear selection, Preview again, Download, and Import while
controller.pending is true. After import confirmation there is no cancel action and no enabled
control that can release or replace the private raw bundle until the request settles.

TransferView.tsx composes the header, two panels, safe result announcements, deferred focus handoff,
and footer:

~~~tsx
<section className="registry-view transfer-view" aria-labelledby="transfer-title">
  <header className="registry-header transfer-header">
    <div>
      <p className="kicker">Portable state · Transfer control 03</p>
      <h1 id="transfer-title" data-transfer-heading tabIndex={-1}>
        Data transfer
      </h1>
    </div>
    <p>
      Move prompts and workflow references between local Hub installations without replacing
      anything already saved.
    </p>
  </header>
  <div className="transfer-grid">
    <ExportPanel controller={controller} />
    <ImportPanel controller={controller} />
  </div>
  <footer className="footer registry-footer">
    <span>Portable JSON</span>
    <span aria-hidden="true">//</span>
    <span>Append only</span>
    <span className="footer__rule" aria-hidden="true" />
    <span>Phase 01C</span>
  </footer>
</section>
~~~

Errors use role="alert" and tabIndex={-1}; pending/success use role="status" and aria-live="polite".
Defer result focus with a zero-delay timer so ConfirmDialog focus restoration completes first.

- [ ] **Step 4: Run focused UI and static gates**

Run:

~~~bash
cd web && pnpm test -- src/features/transfer
cd web && pnpm lint
cd web && pnpm typecheck
~~~

Expected: all Transfer feature tests pass with no dependency or lock change.

- [ ] **Step 5: Record and commit Task 6**

Append exact UI, accessibility, confirmation, sensitive-data, focus, and test evidence to history.
Then:

~~~bash
git add web/src/features/transfer history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add safe import export interface"
~~~

### Task 7: Four-View Navigation and Responsive Integration

**Files:**
- Modify: web/src/App.tsx
- Modify: web/src/App.navigation.test.tsx
- Modify: web/src/styles.css
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Extend navigation tests red-first**

Mock api/transfer alongside current API modules. Change the primary navigation test to assert
Overview, Prompts, Workflows, and Transfer. Add:

~~~typescript
it('keeps Transfer active when prepared-import discard is cancelled', async () => {
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'Transfer' }))
  await selectValidBundle()
  await screen.findByRole('button', { name: 'Import records' })
  await userEvent.click(screen.getByRole('button', { name: 'Overview' }))
  expect(window.confirm).toHaveBeenCalledWith(
    'Discard prepared import and selected bundle?',
  )
  expect(screen.getByRole('heading', { name: 'Data transfer' })).toBeInTheDocument()
})
~~~

Add Prompt dirty guard targeting Transfer, Workflow dirty parameterization including Transfer,
prepared Transfer confirm navigation, invalid/empty selection clearing without confirmation,
deterministically deferred preview/export/import navigation blocking without confirm, no request on
entering Transfer, Phase 01 overview label, and successful import followed by fresh Prompt and
Workflow list calls.

- [ ] **Step 2: Verify the navigation tests fail**

Run:

~~~bash
cd web && pnpm test -- src/App.navigation.test.tsx
~~~

Expected: Transfer navigation and heading assertions fail.

- [ ] **Step 3: Integrate the controller and fourth view**

Modify App.tsx:

~~~typescript
type ActiveView = 'overview' | 'prompts' | 'workflows' | 'transfer'

const transfer = useTransfer(activeView === 'transfer')

const navigateTo = (target: ActiveView) => {
  if (target === activeView) return
  if (activeView === 'prompts' && !promptRegistry.confirmDiscard()) return
  if (activeView === 'workflows' && !workflowRegistry.confirmDiscard()) return
  if (activeView === 'transfer' && !transfer.confirmDiscard()) return
  setActiveView(target)
}
~~~

Add the Transfer masthead button with aria-current, render TransferView for the transfer branch, and
change the overview footer label from Phase 00 to Phase 01. Do not add a router/global store or inject
imported rows; existing registry enabled effects reload on entry.

- [ ] **Step 4: Add scoped responsive Transfer styling**

Add .transfer-* rules with:

- an amber/pending transfer accent inside the existing dark control-room palette;
- two minmax(0, 1fr) panels, min-width: 0, strong border hierarchy, and no fixed width;
- selected-file, warning, count, issue, action, status, and alert treatments;
- overflow-wrap: anywhere for filename/status and max-width: 100% for file input;
- visible focus for transfer heading, alerts, result summaries, and actions;
- 44 px minimum mobile controls;
- stacked panels at max-width 880px;
- four equal mobile masthead columns at max-width 600px;
- zero intrinsic or negative-margin overflow at 320 px.

Do not add remote fonts, images, UI libraries, or generated assets.

- [ ] **Step 5: Run complete frontend gates**

Run:

~~~bash
cd web && pnpm test -- src/App.navigation.test.tsx src/features/transfer
make test-web
cd web && pnpm lint
cd web && pnpm typecheck
cd web && pnpm build
~~~

Expected: every frontend test, lint, typecheck, and production build passes.

- [ ] **Step 6: Record and commit Task 7**

Append four-view, dirty/pending guard, registry reload, Phase 01, responsive, build, and test evidence
to history/BUILD_LOG.md. Then:

~~~bash
git add web/src/App.tsx web/src/App.navigation.test.tsx web/src/styles.css history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: integrate transfer dashboard view"
~~~

### Task 8: Integration Documentation and Regression Gates

**Files:**
- Modify: Makefile
- Modify: AGENTS.md
- Modify: README.md
- Modify: docs/DECISIONS.md
- Modify: docs/SECURITY_NOTES.md
- Modify: docs/FAILURES.md only for newly observed incidents
- Modify: docs/superpowers/specs/2026-07-13-phase-1c-import-export-design.md
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Harden make build against implicit .env loading**

Change only the build recipe:

~~~make
build:
	OLLAMA_BASE_URL=http://127.0.0.1:9 docker compose --env-file /dev/null build
	cd web && pnpm build
~~~

Do not modify docker-compose.yml, either Dockerfile, or runtime deployment behavior.

- [ ] **Step 2: Run complete host gates**

Run literally:

~~~bash
make install
make format
git diff --check
make test
make test-e2e
make test-web
make lint
make typecheck
cd backend && uv run ruff format --check .
cd web && pnpm build
make build
~~~

Expected: formatting makes no unexpected semantic change, then all dependencies, tests, lint,
types, frontend build, and safe Compose build
pass. Confirm dependency manifests/locks remain unchanged from 5ddbca3. Record exact counts and only
warnings actually printed.

- [ ] **Step 3: Prove migration preservation without creating revision 0003**

Run the existing migration test and a task-owned SQLite lifecycle with an explicit safe URL:

~~~bash
cd backend && uv run pytest tests/e2e/test_migrations.py -q
rg --files backend/migrations/versions
cd backend && env DATABASE_URL=sqlite:////tmp/local-ai-hub-phase1c.sqlite uv run alembic upgrade head
cd backend && env DATABASE_URL=sqlite:////tmp/local-ai-hub-phase1c.sqlite uv run alembic check
cd backend && env DATABASE_URL=sqlite:////tmp/local-ai-hub-phase1c.sqlite uv run alembic downgrade 0001_create_prompts
cd backend && env DATABASE_URL=sqlite:////tmp/local-ai-hub-phase1c.sqlite uv run alembic upgrade head
cd backend && env DATABASE_URL=sqlite:////tmp/local-ai-hub-phase1c.sqlite uv run alembic downgrade base
sha256sum backend/migrations/versions/0001_create_prompts.py
rm -f /tmp/local-ai-hub-phase1c.sqlite /tmp/local-ai-hub-phase1c.sqlite-wal /tmp/local-ai-hub-phase1c.sqlite-shm
~~~

The automated migration test is the preservation harness: it upgrades to 0001, inserts the fixed
synthetic Prompt `{title: Preserved, content: Keep me, tags: migration}`, upgrades to 0002, asserts
the editable fields, downgrades to 0001, asserts them again, and removes its pytest-owned database.
Expected: `rg --files` prints only 0001 and 0002; Alembic reports no drift; the checksum command
prints `4f1e37711a7d7311a6d138023bc014bd7c755e20ca860082c494bd34ba50f8b5`; and the explicit database
and sidecars are absent after cleanup.

- [ ] **Step 4: Run isolated direct and proxied Compose acceptance**

Use project local-ai-workflow-hub-phase1c-acceptance with `/dev/null` as the env file and the explicit
safe Ollama URL. Record the preexisting main-project volume names before starting. Run:

~~~bash
docker volume ls --format '{{.Name}}'
env OLLAMA_BASE_URL=http://127.0.0.1:9 docker compose --env-file /dev/null -p local-ai-workflow-hub-phase1c-acceptance build
env OLLAMA_BASE_URL=http://127.0.0.1:9 docker compose --env-file /dev/null -p local-ai-workflow-hub-phase1c-acceptance up -d
curl --fail --silent --show-error http://127.0.0.1:8000/health
curl --fail --silent --show-error http://127.0.0.1:5173/health
curl --fail --silent --show-error http://127.0.0.1:8000/api/ollama/status
curl --fail --silent --show-error http://127.0.0.1:5173/api/ollama/status
docker compose --env-file /dev/null -p local-ai-workflow-hub-phase1c-acceptance exec -T web pnpm store path --store-dir=/pnpm/store
~~~

Expected: both health calls return status ok, both Ollama calls return the graceful offline HTTP 200
shape for `http://127.0.0.1:9`, and the container store path is `/pnpm/store/v10`.

Seed one synthetic Prompt and one inert localhost Workflow Link. Verify direct and proxied:

- export status, privacy headers, safe Content-Disposition, prompt-first record order, and absence of
  IDs/per-record timestamps;
- empty, malformed, invalid, mixed, and duplicate previews with zero mutation;
- direct first import 201 and proxied repeat import 201;
- full append counts, duplicate counts, fresh IDs/timestamps, and unchanged source editable fields;
- privacy headers on every success/error and no Content-Disposition outside successful export;
- zero requests at a task-owned destination sentinel;
- /pnpm/store/v10 and no source .pnpm-store.

Tear down with:

~~~bash
docker compose --env-file /dev/null -p local-ai-workflow-hub-phase1c-acceptance down --volumes --remove-orphans
docker compose --env-file /dev/null -p local-ai-workflow-hub-phase1c-acceptance ps -a
~~~

Expected: no acceptance container/network/volume remains and the main four volumes are unchanged.

- [ ] **Step 5: Update user, security, decision, and agent documentation**

README must describe the fourth Transfer view, all three routes, v1 full-registry JSON, preview with
no mutation, 10 MiB/5,000 limits, append-all duplicates, one transaction, fresh IDs/timestamps,
download sensitivity, local usage, validation, limitations, Phase 1 complete, Phase 2 next, and links
to the Phase 1C spec/plan.

DECISIONS records typed API-level v1/no schema, atomic append-only imports/duplicate warnings, and
bounded local-file memory-only handling. SECURITY_NOTES changes its posture to Phase 1C and documents
download/browser/OS sensitivity, no encryption/secure erase, no-store/no-cache, no body/error/log
reflection, local-file-only/no path/URL imports, and zero destination dereferencing. AGENTS extends
make test-web to Transfer UI behavior changes. Set the spec status to Approved; implementation
complete, final acceptance pending.

Do not add a failure entry unless a new incident actually occurred.

- [ ] **Step 6: Run prohibited-capability, artifact, and documentation checks**

Search tracked and Git-visible untracked paths only. Prove no runtime dependency/schema/auth/Docker
socket/SDK/privileged/n8n key/integration/cloud AI/remote import/production config was added; host
publishing remains loopback-only; transfer values never become request/redirect targets; no tracked
or Git-visible untracked environment, database, dependency, build, cache, bytecode, or TypeScript
artifact remains. Do not inspect ignored .env.

- [ ] **Step 7: Record and commit Task 8**

Append exact gates, migration, Compose, docs, warnings, teardown, and artifact evidence to history.
Then:

~~~bash
git add Makefile AGENTS.md README.md docs/DECISIONS.md docs/SECURITY_NOTES.md docs/superpowers/specs/2026-07-13-phase-1c-import-export-design.md history/BUILD_LOG.md
# Add docs/FAILURES.md separately only when this milestone recorded a newly observed incident.
git diff --cached --name-only
git diff --cached --check
git commit -m "chore: finalize phase 1c integration"
~~~

### Task 9: Exact-Candidate Phase 1C and Full Phase 1 Acceptance

**Files:**
- Modify: README.md
- Modify: docs/superpowers/specs/2026-07-13-phase-1c-import-export-design.md
- Modify: history/BUILD_LOG.md
- Modify: docs/FAILURES.md only if final validation exposes a new actual incident
- Modify implementation/test files only for acceptance blockers, each with a focused regression and conventional fix commit

- [ ] **Step 1: Build a 16-item requirement-to-evidence matrix**

Map every numbered acceptance criterion in the committed Phase 1C specification to direct source,
automated test, API, migration, Compose, browser, documentation, security/artifact, cleanup, and Git
evidence. Treat indirect, stale, missing, or narrower evidence as incomplete. Dispatch independent
read-only behavior and security/artifact audits against the exact candidate.

- [ ] **Step 2: Re-run every exact-candidate gate**

Run:

~~~bash
make install
make format
git diff --check
make test
make test-e2e
make test-web
make lint
make typecheck
cd backend && uv run ruff format --check .
cd web && pnpm build
make build
~~~

Repeat the disposable migration checksum/preservation/drift lifecycle and isolated Compose direct/
proxied transfer lifecycle from Task 8. Any failure requires a focused regression, the smallest
spec-aligned correction, affected and broad reruns, an actual docs/FAILURES entry when appropriate,
and a conventional fix commit before restarting exact-candidate acceptance from the new HEAD.

- [ ] **Step 3: Run deterministic Firefox desktop/mobile acceptance**

Use Firefox/geckodriver with a disposable migrated database, safe offline Ollama, Vite proxy,
task-owned /tmp download/upload fixtures, a destination sentinel, and deterministic delayed
transfer responses. Exercise:

- four-view masthead and Phase 01;
- no automatic export request, explicit real JSON download, safe filename/content;
- file select, same-file reselection, replace, clear, fatal/invalid/empty/mixed/duplicate preview;
- preview no mutation;
- prepared navigation Cancel/Confirm;
- preview/export/import pending navigation blocking without confirmation;
- ConfirmDialog Cancel, native Escape, and Confirm;
- import success clearing memory and refreshing both registries;
- failed/lost import requiring fresh preview and never auto-retrying;
- repeat duplicate preview/confirmation/append;
- focus/live regions, no raw record/full URL reflection, and no browser storage changes;
- viewports 320, 600, 601, and 1280 px with no horizontal overflow;
- zero destination sentinel requests throughout; do not activate Workflow Open.

Remove the browser fixture/download directory, database/WAL/SHM, API/Vite/geckodriver/Firefox/
sentinel/delay processes and listeners afterward.

- [ ] **Step 4: Audit scope, artifacts, containers, Git, and remote state**

Require:

- no dependency or lockfile diff from 5ddbca3;
- exactly migrations 0001 and 0002, unchanged models, unchanged 0001 checksum, no drift;
- no auth, Docker socket/SDK, privileged mode, n8n key/integration, cloud AI, remote import, destination
  fetch, deployment, or production config;
- loopback host publishing unchanged;
- no tracked or Git-visible untracked secret/environment/database/dependency/build/cache/bytecode/
  TypeScript artifact;
- no task-owned /tmp file/process/listener and no acceptance container/network/volume;
- the main four project volumes unchanged;
- no configured upstream/push;
- git diff --check and clean git status.

Show the final tracked tree with git ls-files, not an ignored-file traversal.

- [ ] **Step 5: Record and commit final validation**

Mark Phase 1C and Phase 1 complete in README. Set the spec status to Approved; implementation and
final acceptance complete. Append exact dependency/test/build counts, warning text, migration
evidence, Compose direct/proxy flow, Firefox viewports/actions/focus/no-overflow, zero-destination
evidence, independent audit outcomes, teardown, artifact/remote audit, and clean status to history.
Include docs/FAILURES.md only if a new actual final incident was recorded.

Then:

~~~bash
git add README.md docs/superpowers/specs/2026-07-13-phase-1c-import-export-design.md history/BUILD_LOG.md docs/FAILURES.md
git diff --cached --check
git commit -m "test: record phase 1c acceptance validation"
git status --short
git log --oneline --decorate=no -15
git ls-files
~~~

Expected: the acceptance commit succeeds, git status prints nothing, Phase 1A/1B/1C are proven
complete, Phase 2 remains separately designed, and no remote push occurs.

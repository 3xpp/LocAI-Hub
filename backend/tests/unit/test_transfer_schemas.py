"""Strict and privacy-preserving transfer-schema tests."""

import json

import pytest

from local_ai_hub.api.transfer_schemas import (
    TransferContractError,
    TransferCountsResponse,
    TransferErrorResponse,
    TransferImportResponse,
    TransferPreviewResponse,
    decode_transfer_json,
    parse_transfer_bundle,
)
from local_ai_hub.services.transfer import MAX_BUNDLE_RECORDS, PortablePrompt, PortableWorkflowLink


def valid_bundle(records: list[dict[str, object]] | None = None) -> dict[str, object]:
    return {
        "application": "local-ai-workflow-hub",
        "format_version": 1,
        "exported_at": "2026-07-18T12:00:00Z",
        "records": [] if records is None else records,
    }


def valid_prompt(**overrides: object) -> dict[str, object]:
    record: dict[str, object] = {
        "type": "prompt",
        "title": "  Normalized title  ",
        "content": "  Preserve me\n",
        "tags": [" Code ", "code", "Review"],
    }
    record.update(overrides)
    return record


def valid_workflow(**overrides: object) -> dict[str, object]:
    record: dict[str, object] = {
        "type": "workflow_link",
        "title": "  Local editor  ",
        "url": "  http://localhost:5678/workflow/a  ",
        "description": "  Reference  ",
        "tags": [" Local ", "local", "N8N"],
    }
    record.update(overrides)
    return record


def parse(payload: object):  # type: ignore[no-untyped-def]
    return parse_transfer_bundle(payload)


def test_valid_bundle_normalizes_records_without_trimming_prompt_content() -> None:
    raw = json.dumps(valid_bundle([valid_prompt(), valid_workflow()]), ensure_ascii=False).encode()
    parsed = parse_transfer_bundle(decode_transfer_json(raw))
    assert parsed.exported_at == "2026-07-18T12:00:00Z"
    assert parsed.records == (
        PortablePrompt("Normalized title", "  Preserve me\n", ("code", "review")),
        PortableWorkflowLink(
            "Local editor",
            "http://localhost:5678/workflow/a",
            "Reference",
            ("local", "n8n"),
        ),
    )


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        (b'{"application":"a","application":"b"}', "malformed_json"),
        (b'{"value":NaN}', "malformed_json"),
        (b'{"value":Infinity}', "malformed_json"),
        (b'{"value":-Infinity}', "malformed_json"),
        (b'{"value":1} trailing', "malformed_json"),
        (b"\xff", "malformed_json"),
    ],
)
def test_non_strict_json_is_rejected(raw: bytes, code: str) -> None:
    with pytest.raises(TransferContractError) as caught:
        decode_transfer_json(raw)
    assert caught.value.code == code


@pytest.mark.parametrize("root", [None, [], "bundle", 1, True])
def test_root_must_be_an_object(root: object) -> None:
    with pytest.raises(TransferContractError) as caught:
        parse(root)
    assert caught.value.code == "invalid_bundle"


@pytest.mark.parametrize("application", [None, "other-app", 1, True])
def test_application_is_required_and_exact(application: object) -> None:
    payload = valid_bundle()
    if application is None:
        del payload["application"]
    else:
        payload["application"] = application
    with pytest.raises(TransferContractError) as caught:
        parse(payload)
    assert caught.value.code == "invalid_application"


@pytest.mark.parametrize("version", [True, 1.0, "1", None, 2])
def test_version_is_a_strict_supported_integer(version: object) -> None:
    payload = valid_bundle()
    if version is None:
        del payload["format_version"]
    else:
        payload["format_version"] = version
    with pytest.raises(TransferContractError) as caught:
        parse(payload)
    assert caught.value.code == "unsupported_format_version"


@pytest.mark.parametrize(
    "timestamp",
    [
        "2026-07-18T12:00:00",
        "2026-07-18 12:00:00Z",
        "2026-07-18T12:00:00+01:00",
        "2026-07-18T12:00:00-00:00",
        "2026-07-18",
        "not-a-time",
        1,
    ],
)
def test_timestamp_requires_rfc3339_and_explicit_positive_zero_offset(timestamp: object) -> None:
    payload = valid_bundle()
    payload["exported_at"] = timestamp
    with pytest.raises(TransferContractError) as caught:
        parse(payload)
    assert caught.value.code == "invalid_bundle"


@pytest.mark.parametrize(
    "timestamp",
    ["2026-07-18T12:00:00Z", "2026-07-18T12:00:00.123456Z", "2026-07-18T12:00:00+00:00"],
)
def test_timestamp_accepts_z_or_positive_zero_offset(timestamp: str) -> None:
    payload = valid_bundle()
    payload["exported_at"] = timestamp
    assert parse(payload).exported_at == timestamp


def test_record_count_boundary_is_exact() -> None:
    assert len(parse(valid_bundle([valid_prompt()] * MAX_BUNDLE_RECORDS)).records) == 5_000
    with pytest.raises(TransferContractError) as caught:
        parse(valid_bundle([valid_prompt()] * (MAX_BUNDLE_RECORDS + 1)))
    assert caught.value.code == "too_many_records"


@pytest.mark.parametrize("record", [{}, {"title": "missing type"}, {"type": "unknown"}])
def test_missing_or_unknown_record_discriminator_is_rejected(record: object) -> None:
    with pytest.raises(TransferContractError) as caught:
        parse(valid_bundle([record]))  # type: ignore[list-item]
    assert caught.value.code == "invalid_bundle"
    assert caught.value.issues[0].code == "unknown_record_type"


def test_non_object_record_is_rejected_as_an_invalid_value() -> None:
    with pytest.raises(TransferContractError) as caught:
        parse(valid_bundle(["prompt"]))  # type: ignore[list-item]
    assert caught.value.code == "invalid_bundle"
    assert caught.value.issues[0].code == "invalid_value"


@pytest.mark.parametrize(
    ("target", "key"),
    [("root", "secret-root"), ("prompt", "secret-record"), ("workflow", "secret-workflow")],
)
def test_unknown_fields_are_rejected_without_reflection(target: str, key: str) -> None:
    marker = "secret-marker-never-reflect"
    if target == "root":
        payload = valid_bundle()
        payload[key] = marker
    else:
        record = valid_prompt() if target == "prompt" else valid_workflow()
        record[key] = marker
        payload = valid_bundle([record])
    with pytest.raises(TransferContractError) as caught:
        parse(payload)
    rendered = caught.value.as_response().model_dump_json()
    assert marker not in rendered
    assert key not in rendered
    assert caught.value.code == "invalid_bundle"
    assert caught.value.issues[0].code == "unexpected_field"
    assert caught.value.issues[0].field is None


@pytest.mark.parametrize(
    ("record", "expected_field"),
    [
        (valid_prompt(title=1), "title"),
        (valid_prompt(content=[]), "content"),
        (valid_prompt(tags="code"), "tags"),
        (valid_prompt(tags=[1]), None),
        (valid_workflow(title=1), "title"),
        (valid_workflow(url=[]), "url"),
        (valid_workflow(description=None), "description"),
        (valid_workflow(tags="local"), "tags"),
    ],
)
def test_record_scalars_and_lists_are_strict(
    record: dict[str, object], expected_field: str | None
) -> None:
    with pytest.raises(TransferContractError) as caught:
        parse(valid_bundle([record]))
    assert caught.value.code == "invalid_bundle"
    assert caught.value.issues[0].field == expected_field


@pytest.mark.parametrize(
    ("record", "field"),
    [
        (valid_prompt(title="   "), "title"),
        (valid_prompt(title="x" * 201), "title"),
        (valid_prompt(content="   "), "content"),
        (valid_prompt(content="x" * 50_001), "content"),
        (valid_prompt(tags=["x" * 31]), "tags"),
        (valid_prompt(tags=[str(index) for index in range(11)]), "tags"),
        (valid_workflow(title="   "), "title"),
        (valid_workflow(url="file:///tmp/a"), "url"),
        (valid_workflow(url="http://localhost/" + "x" * 2_049), "url"),
        (valid_workflow(description="x" * 5_001), "description"),
        (valid_workflow(tags=["bad,tag"]), "tags"),
    ],
)
def test_domain_field_boundaries_are_enforced(record: dict[str, object], field: str) -> None:
    with pytest.raises(TransferContractError) as caught:
        parse(valid_bundle([record]))
    assert caught.value.code == "invalid_bundle"
    assert caught.value.issues[0].field == field
    assert caught.value.issues[0].code == "invalid_value"


def test_every_record_field_is_required() -> None:
    records = [valid_prompt(), valid_workflow()]
    expected = [
        (0, ["type", "title", "content", "tags"]),
        (1, ["type", "title", "url", "description", "tags"]),
    ]
    for record_index, fields in expected:
        for field in fields:
            record = records[record_index].copy()
            del record[field]
            with pytest.raises(TransferContractError) as caught:
                parse(valid_bundle([record]))
            expected_code = "unknown_record_type" if field == "type" else "missing_field"
            assert caught.value.issues[0].code == expected_code


def test_safe_issues_have_fixed_sanitized_location_metadata() -> None:
    marker = "private-content-never-reflect"
    payload = valid_bundle([valid_prompt(content=marker, title=1)])
    with pytest.raises(TransferContractError) as caught:
        parse(payload)
    issue = caught.value.issues[0]
    assert issue.location == ["records", 0, "prompt", "title"]
    assert issue.record_index == 0
    assert issue.record_type == "prompt"
    assert issue.field == "title"
    assert issue.code == "invalid_type"
    assert issue.message == "Field has an invalid type."
    assert marker not in caught.value.as_response().model_dump_json()


def test_safe_issue_collection_stops_at_100() -> None:
    records = [valid_prompt(title=1, content=2, tags="bad") for _ in range(34)]
    with pytest.raises(TransferContractError) as caught:
        parse(valid_bundle(records))
    assert len(caught.value.issues) == 100
    assert caught.value.issues_truncated is True


def test_exactly_100_issues_are_not_marked_truncated() -> None:
    records = [valid_prompt(title=1, content=2) for _ in range(50)]
    with pytest.raises(TransferContractError) as caught:
        parse(valid_bundle(records))
    assert len(caught.value.issues) == 100
    assert caught.value.issues_truncated is False


def test_response_models_are_strict_closed_contracts() -> None:
    counts = TransferCountsResponse(total=2, prompts=1, workflow_links=1)
    preview = TransferPreviewResponse(
        valid=True,
        importable=True,
        format_version=1,
        counts=counts,
        duplicates=TransferCountsResponse(total=0, prompts=0, workflow_links=0),
        warnings=[],
    )
    imported = TransferImportResponse(imported=counts, duplicates_imported=counts)
    assert preview.model_dump()["counts"]["total"] == 2
    assert imported.model_dump()["imported"]["workflow_links"] == 1
    with pytest.raises(ValueError):
        TransferCountsResponse(total=0, prompts=0, workflow_links=0, private="no")  # type: ignore[call-arg]
    with pytest.raises(ValueError):
        TransferErrorResponse.model_validate(
            {
                "detail": {
                    "code": "invalid_bundle",
                    "message": "Bundle validation failed.",
                    "issues": [],
                    "issues_truncated": False,
                    "private": "no",
                }
            }
        )

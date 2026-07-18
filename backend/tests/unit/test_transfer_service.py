"""Pure transfer-domain contract tests."""

import json
from datetime import datetime, timedelta, timezone

import pytest

from local_ai_hub.db.models import Prompt, WorkflowLink
from local_ai_hub.services.transfer import (
    NormalizedTransferBundle,
    PortablePrompt,
    PortableWorkflowLink,
    StoredTransferDataError,
    build_preview,
    bundle_json_value,
    count_exact_duplicates,
    project_stored_records,
    record_fingerprint,
    serialize_bundle,
    transfer_counts,
    utc_transfer_timestamp,
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


@pytest.mark.parametrize("raw_tags", [" Code ", "code,code", "line\nbreak", ","])
def test_noncanonical_stored_prompt_tags_fail_closed(raw_tags: str) -> None:
    prompt = Prompt(title="Canonical", content="content", tags=raw_tags)
    with pytest.raises(StoredTransferDataError):
        validate_stored_prompt(prompt)


@pytest.mark.parametrize(
    ("title", "content"),
    [
        (" padded ", "content"),
        ("", "content"),
        ("Canonical", "   "),
        ("Canonical", "x" * 50_001),
    ],
)
def test_noncanonical_stored_prompt_fields_fail_closed(title: str, content: str) -> None:
    with pytest.raises(StoredTransferDataError):
        validate_stored_prompt(Prompt(title=title, content=content, tags=""))


def test_stored_prompt_preserves_content_exactly() -> None:
    content = "  line one\nline two  "
    assert validate_stored_prompt(Prompt(title="Title", content=content, tags="code")) == (
        PortablePrompt("Title", content, ("code",))
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("title", " padded "),
        ("url", " http://localhost:5678/workflow/a "),
        ("url", "file:///tmp/workflow"),
        ("description", " padded "),
        ("tags", " Local "),
        ("tags", "local,local"),
    ],
)
def test_noncanonical_stored_workflow_fields_fail_closed(field: str, value: str) -> None:
    values = {
        "title": "Local editor",
        "url": "http://localhost:5678/workflow/a",
        "description": "Reference",
        "tags": "local",
    }
    values[field] = value
    with pytest.raises(StoredTransferDataError):
        validate_stored_workflow_link(WorkflowLink(**values))


def test_canonical_stored_workflow_projects_all_fields() -> None:
    link = WorkflowLink(
        title="Local editor",
        url="http://localhost:5678/workflow/a",
        description="Reference",
        tags="local,n8n",
    )
    assert validate_stored_workflow_link(link) == PortableWorkflowLink(
        "Local editor",
        "http://localhost:5678/workflow/a",
        "Reference",
        ("local", "n8n"),
    )


def test_tag_order_is_ignored_only_for_duplicate_identity() -> None:
    first = PortablePrompt("Title", "Body", ("one", "two"))
    second = PortablePrompt("Title", "Body", ("two", "one"))
    assert record_fingerprint(first) == record_fingerprint(second)
    assert second.tags == ("two", "one")


def test_record_types_and_all_editable_fields_are_part_of_duplicate_identity() -> None:
    prompt = PortablePrompt("Title", "http://localhost/a", ())
    workflow = PortableWorkflowLink("Title", "http://localhost/a", "", ())
    changed = PortableWorkflowLink("Title", "http://localhost/a", "changed", ())
    assert record_fingerprint(prompt) != record_fingerprint(workflow)
    assert record_fingerprint(workflow) != record_fingerprint(changed)


def test_three_equal_incoming_records_count_against_seen_state() -> None:
    record = PortableWorkflowLink(
        "Local editor",
        "http://localhost:5678/workflow/a",
        "Reference",
        ("local",),
    )
    assert count_exact_duplicates((record, record, record), ()).total == 2
    assert count_exact_duplicates((record, record, record), (record,)).total == 3


def test_duplicate_counts_are_split_by_record_type() -> None:
    prompt = PortablePrompt("Title", "Body", ())
    workflow = PortableWorkflowLink("Link", "http://localhost/a", "", ())
    counts = count_exact_duplicates((prompt, workflow, prompt, workflow), ())
    assert counts.total == 2
    assert counts.prompts == 1
    assert counts.workflow_links == 1


def test_preview_warns_but_keeps_every_record_importable() -> None:
    record = PortablePrompt("Title", "Body", ())
    preview = build_preview((record, record), ())
    assert preview.counts.total == 2
    assert preview.duplicates.total == 1
    assert [warning.code for warning in preview.warnings] == ["exact_duplicates"]


def test_empty_preview_has_only_empty_bundle_warning() -> None:
    preview = build_preview((), ())
    assert preview.counts.total == 0
    assert preview.duplicates.total == 0
    assert [(item.code, item.message) for item in preview.warnings] == [
        ("empty_bundle", "This bundle contains no records and cannot be imported.")
    ]


def test_transfer_counts_reports_total_and_types() -> None:
    counts = transfer_counts(
        (
            PortablePrompt("One", "Body", ()),
            PortableWorkflowLink("Two", "http://localhost/two", "", ()),
            PortablePrompt("Three", "Body", ()),
        )
    )
    assert (counts.total, counts.prompts, counts.workflow_links) == (3, 2, 1)


def test_projection_is_prompts_then_workflows_and_preserves_each_input_order() -> None:
    prompts = [
        Prompt(title="Second id", content="two", tags=""),
        Prompt(title="Third id", content="three", tags="code"),
    ]
    workflows = [
        WorkflowLink(
            title="First link",
            url="http://localhost/one",
            description="",
            tags="",
        ),
        WorkflowLink(
            title="Second link",
            url="http://localhost/two",
            description="Two",
            tags="local",
        ),
    ]
    assert project_stored_records(prompts, workflows) == (
        PortablePrompt("Second id", "two", ()),
        PortablePrompt("Third id", "three", ("code",)),
        PortableWorkflowLink("First link", "http://localhost/one", "", ()),
        PortableWorkflowLink("Second link", "http://localhost/two", "Two", ("local",)),
    )


def test_utc_transfer_timestamp_requires_awareness_and_emits_z() -> None:
    value = datetime(2026, 7, 18, 14, 30, 45, 123456, tzinfo=timezone(timedelta(hours=2)))
    assert utc_transfer_timestamp(value) == "2026-07-18T12:30:45.123456Z"
    with pytest.raises(ValueError):
        utc_transfer_timestamp(datetime(2026, 7, 18, 12, 30, 45))


def test_bundle_value_has_stable_manifest_and_record_field_order() -> None:
    bundle = NormalizedTransferBundle(
        exported_at="2026-07-18T12:00:00Z",
        records=(
            PortablePrompt("Café", "Résumé", ("local",)),
            PortableWorkflowLink("Editor", "http://localhost/a", "Note", ()),
        ),
    )
    value = bundle_json_value(bundle)
    assert list(value) == ["application", "format_version", "exported_at", "records"]
    records = value["records"]
    assert isinstance(records, list)
    assert list(records[0]) == ["type", "title", "content", "tags"]
    assert list(records[1]) == ["type", "title", "url", "description", "tags"]


def test_serialization_is_utf8_deterministic_and_has_one_trailing_newline() -> None:
    bundle = NormalizedTransferBundle(
        exported_at="2026-07-18T12:00:00Z",
        records=(PortablePrompt("Café", "Résumé", ("local",)),),
    )
    first = serialize_bundle(bundle)
    second = serialize_bundle(bundle)
    assert first == second
    assert b"Caf\xc3\xa9" in first
    assert b"\\u00e9" not in first
    assert first.endswith(b"\n") and not first.endswith(b"\n\n")
    assert json.loads(first) == bundle_json_value(bundle)


def test_exported_at_is_the_only_value_that_changes_between_equivalent_bundles() -> None:
    records = (PortablePrompt("Title", "Body", ()),)
    first = bundle_json_value(NormalizedTransferBundle("2026-07-18T12:00:00Z", records))
    second = bundle_json_value(NormalizedTransferBundle("2026-07-18T12:00:01Z", records))
    assert {key: value for key, value in first.items() if key != "exported_at"} == {
        key: value for key, value in second.items() if key != "exported_at"
    }


def test_serialize_bundle_rejects_non_finite_values() -> None:
    malformed = NormalizedTransferBundle(
        exported_at=float("nan"),  # type: ignore[arg-type]
        records=(),
    )
    with pytest.raises(ValueError):
        serialize_bundle(malformed)

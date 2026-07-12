import json
import unicodedata
from pathlib import Path

import httpx
import pytest

from local_ai_hub.services.tags import normalize_tags
from local_ai_hub.services.workflow_links import (
    MAX_DESCRIPTION_LENGTH,
    MAX_QUERY_LENGTH,
    MAX_TITLE_LENGTH,
    MAX_URL_LENGTH,
    WorkflowLinkInputError,
    description_preview,
    normalize_description,
    normalize_search,
    normalize_title,
    normalize_url,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "web"
    / "src"
    / "test"
    / "fixtures"
    / "workflowLinkUrlCases.json"
)
URL_CASES: dict[str, list[dict[str, str]]] = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", URL_CASES["accepted"], ids=lambda case: case["name"])
def test_accepted_url_corpus(case: dict[str, str]) -> None:
    assert normalize_url(case["value"]) == case["value"].strip()


@pytest.mark.parametrize("case", URL_CASES["rejected"], ids=lambda case: case["name"])
def test_rejected_url_corpus(case: dict[str, str]) -> None:
    with pytest.raises(WorkflowLinkInputError, match="URL") as error:
        normalize_url(case["value"])

    assert error.value.field == "url"
    assert error.value.message


def test_title_description_preview_and_tags() -> None:
    assert normalize_title("  Nightly summary  ") == "Nightly summary"
    assert normalize_description("  first\nsecond  ") == "first\nsecond"
    assert normalize_description(" \n ") == ""
    assert description_preview("") == ""
    assert description_preview("x" * 161) == ("x" * 160) + "…"
    assert normalize_tags([" N8N ", "n8n", "Local Flow"]) == ("n8n", "local flow")


@pytest.mark.parametrize("value", ["", "   ", "\n\t"])
def test_title_rejects_empty_normalized_value(value: str) -> None:
    with pytest.raises(WorkflowLinkInputError, match="title"):
        normalize_title(value)


def test_title_accepts_200_code_points_and_rejects_201() -> None:
    assert normalize_title("t" * MAX_TITLE_LENGTH) == "t" * 200

    with pytest.raises(WorkflowLinkInputError, match="200"):
        normalize_title("t" * (MAX_TITLE_LENGTH + 1))


def test_url_accepts_2048_code_points_and_rejects_2049() -> None:
    prefix = "http://localhost/"
    maximum = prefix + ("p" * (MAX_URL_LENGTH - len(prefix)))
    oversized = maximum + "p"

    assert len(maximum) == 2_048
    assert normalize_url(maximum) == maximum
    with pytest.raises(WorkflowLinkInputError, match="2048"):
        normalize_url(oversized)


def test_description_accepts_5000_code_points_and_rejects_5001() -> None:
    assert normalize_description("d" * MAX_DESCRIPTION_LENGTH) == "d" * 5_000

    with pytest.raises(WorkflowLinkInputError, match="5000"):
        normalize_description("d" * (MAX_DESCRIPTION_LENGTH + 1))


def test_search_normalizes_empty_and_enforces_200_code_points() -> None:
    assert normalize_search(None) is None
    assert normalize_search("") is None
    assert normalize_search(" \n ") is None
    assert normalize_search("  Local Flows  ") == "Local Flows"
    assert normalize_search("q" * MAX_QUERY_LENGTH) == "q" * 200

    with pytest.raises(WorkflowLinkInputError, match="query"):
        normalize_search("q" * (MAX_QUERY_LENGTH + 1))


def test_dns_label_accepts_63_ascii_characters_and_rejects_64() -> None:
    label_63 = "a" * 63

    assert normalize_url(f"http://{label_63}.example/path") == (f"http://{label_63}.example/path")
    with pytest.raises(WorkflowLinkInputError, match="URL"):
        normalize_url(f"http://{'a' * 64}.example/path")


def test_dns_host_accepts_253_ascii_characters_and_rejects_254() -> None:
    host_253 = ".".join(("a" * 63, "b" * 63, "c" * 63, "d" * 61))
    host_254 = ".".join(("a" * 63, "b" * 63, "c" * 63, "d" * 62))

    assert len(host_253) == 253
    assert len(host_254) == 254
    assert normalize_url(f"http://{host_253}/path") == f"http://{host_253}/path"
    with pytest.raises(WorkflowLinkInputError, match="URL"):
        normalize_url(f"http://{host_254}/path")


@pytest.mark.parametrize(
    "label",
    [
        "xn--bcher-kva",
        "XN--BCHER-KVA",
        "xn--caf-dma",
        "xn--fa-hia",
        "XN--FA-HIA",
        "xn--zca",
        "XN--ZCA",
        "xn--mgbh0fb",
        "xn--fsqu00a",
    ],
)
def test_browser_valid_ascii_punycode_is_accepted(label: str) -> None:
    value = f"https://{label}.example/path"

    assert normalize_url(value) == value


@pytest.mark.parametrize(
    "label",
    ["xn--a", "xn--0", "xn--abc", "XN--A", "Xn--0", "XN--ABC", "xn--00b"],
)
def test_invalid_punycode_is_rejected_without_reflecting_the_value(label: str) -> None:
    value = f"http://{label}.example/path"

    with pytest.raises(WorkflowLinkInputError, match="URL") as error:
        normalize_url(value)

    assert label not in error.value.message


@pytest.mark.parametrize("label", ["xn--v43d", "xn--oh5h"])
def test_browser_valid_backend_invalid_ace_is_conservatively_rejected_per_label(
    label: str,
) -> None:
    candidate = httpx.URL(f"http://{label}/")

    assert candidate.raw_host.decode("ascii") == label
    assert any(ord(character) > 127 for character in candidate.host)
    assert any(unicodedata.ucd_3_2_0.category(character) == "Cn" for character in candidate.host)
    with pytest.raises(WorkflowLinkInputError, match="URL"):
        normalize_url(f"http://{label}.example/path")


@pytest.mark.parametrize(
    "label",
    ["xn--kybrm", "xn--kwb3uafp", "xn--gzblqq6v", "xn--fr0n4i", "xn--dxbxr6t"],
)
def test_httpx_valid_browser_invalid_ace_is_rejected_per_label(label: str) -> None:
    candidate = httpx.URL(f"http://{label}/")

    assert candidate.raw_host.decode("ascii") == label
    assert any(unicodedata.ucd_3_2_0.category(character) == "Cn" for character in candidate.host)
    with pytest.raises(WorkflowLinkInputError, match="URL"):
        normalize_url(f"http://{label}.example/path")


def test_embedded_browser_mismatch_is_rejected_by_its_individual_ace_label() -> None:
    with pytest.raises(WorkflowLinkInputError, match="URL"):
        normalize_url("http://prefix.xn--kybrm.example/path")


@pytest.mark.parametrize(
    "value",
    [
        "http://0.0.0.0/path",
        "http://127.0.0.1/path",
        "http://192.168.1.20/path",
        "http://255.255.255.255/path",
    ],
)
def test_canonical_ipv4_spelling_is_accepted(value: str) -> None:
    assert normalize_url(value) == value


@pytest.mark.parametrize(
    "value",
    [
        "http://127.1/path",
        "http://127.000.000.001/path",
        "http://256.0.0.1/path",
        "http://1.2.3/path",
        "http://1.2.3.4.5/path",
    ],
)
def test_noncanonical_or_invalid_numeric_ipv4_spelling_is_rejected(value: str) -> None:
    with pytest.raises(WorkflowLinkInputError, match="URL"):
        normalize_url(value)


@pytest.mark.parametrize(
    "host",
    [
        "0x7f000001",
        "0x7f.0.0.1",
        "127.0.0x1.1",
        "example.1",
        "example.0001",
        "example.0x1",
        "example.0X",
    ],
)
def test_whatwg_numeric_host_candidates_are_rejected(host: str) -> None:
    with pytest.raises(WorkflowLinkInputError, match="URL"):
        normalize_url(f"http://{host}/path")


@pytest.mark.parametrize("host", ["dead.beef", "service.1a", "0xfeed.example"])
def test_nonnumeric_dns_labels_that_look_hexadecimal_remain_valid(host: str) -> None:
    value = f"http://{host}/path"

    assert normalize_url(value) == value


@pytest.mark.parametrize(
    "value",
    [
        "http://[::1]/path",
        "https://[2001:db8::1]:443/path",
        "http://[0:0:0:0:0:0:0:1]/path",
    ],
)
def test_bracketed_ipv6_without_zone_is_accepted(value: str) -> None:
    assert normalize_url(value) == value


@pytest.mark.parametrize(
    "value",
    [
        "http://::1/path",
        "http://[::1/path",
        "http://::1]/path",
        "http://[::1]extra/path",
        "http://[fe80::1%25eth0]/path",
        "http://[not-ipv6]/path",
    ],
)
def test_ipv6_requires_well_formed_brackets_and_no_zone(value: str) -> None:
    with pytest.raises(WorkflowLinkInputError, match="URL"):
        normalize_url(value)


@pytest.mark.parametrize("port", [1, 65_535])
def test_port_boundaries_are_accepted(port: int) -> None:
    value = f"http://localhost:{port}/path"

    assert normalize_url(value) == value


@pytest.mark.parametrize(
    "value",
    [
        "http://localhost:0/path",
        "http://localhost:65536/path",
        "http://localhost:/path",
        "http://localhost:+80/path",
        "http://localhost: 80/path",
        "http://localhost:abc/path",
        "http://localhost:80:90/path",
    ],
)
def test_invalid_ports_are_rejected(value: str) -> None:
    with pytest.raises(WorkflowLinkInputError, match="URL"):
        normalize_url(value)


@pytest.mark.parametrize(
    "value",
    [
        "http://localhost/path\nsegment",
        "http://localhost/path\x00segment",
        "http://localhost/path\x7fsegment",
        "http://localhost/path\u200bsegment",
        "http://localhost/path\u2060segment",
    ],
)
def test_remaining_whitespace_control_and_format_characters_are_rejected(value: str) -> None:
    with pytest.raises(WorkflowLinkInputError, match="URL"):
        normalize_url(value)


@pytest.mark.parametrize(
    "value",
    [
        "http:///path",
        "http://?query",
        "http://#fragment",
        "http://:80/path",
        "http://-leading.example/path",
        "http://trailing-.example/path",
        "http://under_score.example/path",
        "http://double..dot/path",
        "http://[::1]:/path",
        "http://[::1]:abc/path",
        "http://localhost%2fexample/path",
        "http://localhost\\path",
    ],
)
def test_malformed_authority_syntax_is_rejected(value: str) -> None:
    with pytest.raises(WorkflowLinkInputError, match="URL"):
        normalize_url(value)


@pytest.mark.parametrize("value", [None, 42, [], {}])
def test_non_string_values_fail_with_field_oriented_errors(value: object) -> None:
    with pytest.raises(WorkflowLinkInputError) as error:
        normalize_url(value)  # type: ignore[arg-type]

    assert error.value.field == "url"
    assert "URL" in error.value.message


def test_preview_collapses_whitespace_before_truncating() -> None:
    assert description_preview("one\n\n two") == "one two"
    assert description_preview("x" * 160) == "x" * 160
    assert description_preview("x" * 161) == ("x" * 160) + "…"

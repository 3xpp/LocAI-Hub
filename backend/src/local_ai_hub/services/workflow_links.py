"""Pure normalization helpers for local workflow-link records."""

import ipaddress
import re
import unicodedata
from typing import Never
from urllib.parse import SplitResult, urlsplit

import httpx

from local_ai_hub.services.validation import InputValidationError

MAX_TITLE_LENGTH = 200
MAX_URL_LENGTH = 2_048
MAX_DESCRIPTION_LENGTH = 5_000
MAX_QUERY_LENGTH = 200
MAX_PREVIEW_LENGTH = 160

WorkflowLinkInputError = InputValidationError

_HTTP_PREFIX = re.compile(r"https?://", re.IGNORECASE)
_DNS_LABEL = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?")
_WHATWG_NUMERIC_LABEL = re.compile(r"(?:[0-9]+|0[xX][0-9A-Fa-f]*)")
_INVALID_URL_MESSAGE = "URL must be an absolute HTTP(S) address with a valid host and port"


def normalize_title(value: str) -> str:
    """Trim a workflow-link title and enforce its length contract."""

    if not isinstance(value, str):
        raise WorkflowLinkInputError("title", "must be a string")
    normalized = value.strip()
    if not normalized:
        raise WorkflowLinkInputError("title", "must not be empty")
    if len(normalized) > MAX_TITLE_LENGTH:
        raise WorkflowLinkInputError("title", "must be at most 200 characters")
    return normalized


def normalize_description(value: str) -> str:
    """Trim optional description edges while preserving internal text."""

    if not isinstance(value, str):
        raise WorkflowLinkInputError("description", "must be a string")
    normalized = value.strip()
    if len(normalized) > MAX_DESCRIPTION_LENGTH:
        raise WorkflowLinkInputError("description", "must be at most 5000 characters")
    return normalized


def normalize_search(value: str | None) -> str | None:
    """Trim an optional query and map an empty query to no filter."""

    if value is None:
        return None
    if not isinstance(value, str):
        raise WorkflowLinkInputError("query", "must be a string")
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > MAX_QUERY_LENGTH:
        raise WorkflowLinkInputError("query", "must be at most 200 characters")
    return normalized


def _raise_invalid_url() -> Never:
    raise WorkflowLinkInputError("url", _INVALID_URL_MESSAGE)


def _raw_authority(value: str, prefix_end: int) -> str:
    remainder = value[prefix_end:]
    boundary = min(
        (position for delimiter in "/?#" if (position := remainder.find(delimiter)) >= 0),
        default=len(remainder),
    )
    authority = remainder[:boundary]
    if not authority or "@" in authority or "%" in authority:
        _raise_invalid_url()
    return authority


def _validate_port(raw_port: str | None, parsed: SplitResult) -> None:
    if raw_port is None:
        try:
            parsed_port = parsed.port
        except ValueError:
            _raise_invalid_url()
        if parsed_port is not None:
            _raise_invalid_url()
        return

    if not raw_port or not raw_port.isascii() or not raw_port.isdigit():
        _raise_invalid_url()
    port = int(raw_port)
    if not 1 <= port <= 65_535:
        _raise_invalid_url()
    try:
        if parsed.port != port:
            _raise_invalid_url()
    except ValueError:
        _raise_invalid_url()


def _validate_ipv6_authority(authority: str, parsed: SplitResult) -> None:
    closing_bracket = authority.find("]")
    if closing_bracket <= 1:
        _raise_invalid_url()

    raw_host = authority[1:closing_bracket]
    remainder = authority[closing_bracket + 1 :]
    if remainder:
        if not remainder.startswith(":") or ":" in remainder[1:]:
            _raise_invalid_url()
        raw_port: str | None = remainder[1:]
    else:
        raw_port = None

    try:
        address = ipaddress.IPv6Address(raw_host)
        parsed_host = parsed.hostname
        if parsed_host is None or ipaddress.IPv6Address(parsed_host) != address:
            _raise_invalid_url()
    except ValueError:
        _raise_invalid_url()
    _validate_port(raw_port, parsed)


def _is_valid_ascii_punycode_label(label: str) -> bool:
    if not label.casefold().startswith("xn--"):
        return True
    try:
        candidate = httpx.URL(f"http://{label}/")
        decoded = candidate.host
        normalized_label = candidate.raw_host.decode("ascii")
        canonical_label = "xn--" + decoded.encode("punycode").decode("ascii")
    except (httpx.InvalidURL, UnicodeError):
        return False
    return (
        normalized_label.casefold() == label.casefold()
        and any(not character.isascii() for character in decoded)
        and canonical_label.casefold() == label.casefold()
        and all(unicodedata.ucd_3_2_0.category(character) != "Cn" for character in decoded)
        and unicodedata.ucd_3_2_0.normalize("NFC", decoded) == decoded
    )


def _validate_dns_or_ipv4_authority(authority: str, parsed: SplitResult) -> None:
    if "[" in authority or "]" in authority or authority.count(":") > 1:
        _raise_invalid_url()

    if ":" in authority:
        raw_host, raw_port = authority.rsplit(":", 1)
    else:
        raw_host = authority
        raw_port = None

    try:
        parsed_host = parsed.hostname
    except ValueError:
        _raise_invalid_url()
    if (
        not raw_host
        or not raw_host.isascii()
        or parsed_host is None
        or parsed_host.lower() != raw_host.lower()
    ):
        _raise_invalid_url()

    if all(character in "0123456789." for character in raw_host):
        try:
            if str(ipaddress.IPv4Address(raw_host)) != raw_host:
                _raise_invalid_url()
        except ipaddress.AddressValueError:
            _raise_invalid_url()
    else:
        labels = raw_host.split(".")
        if len(raw_host) > 253 or any(_DNS_LABEL.fullmatch(label) is None for label in labels):
            _raise_invalid_url()
        if any(not _is_valid_ascii_punycode_label(label) for label in labels):
            _raise_invalid_url()
        if _WHATWG_NUMERIC_LABEL.fullmatch(labels[-1]) is not None:
            _raise_invalid_url()

    _validate_port(raw_port, parsed)


def normalize_url(value: str) -> str:
    """Validate and preserve one absolute HTTP(S) workflow destination."""

    if not isinstance(value, str):
        raise WorkflowLinkInputError("url", "URL must be a string")
    normalized = value.strip()
    if not normalized:
        raise WorkflowLinkInputError("url", "URL must not be empty")
    if len(normalized) > MAX_URL_LENGTH:
        raise WorkflowLinkInputError("url", "URL must be at most 2048 characters")
    if "\\" in normalized or any(
        character.isspace() or unicodedata.category(character).startswith("C")
        for character in normalized
    ):
        _raise_invalid_url()

    prefix = _HTTP_PREFIX.match(normalized)
    if prefix is None:
        _raise_invalid_url()
    authority = _raw_authority(normalized, prefix.end())

    try:
        parsed = urlsplit(normalized)
    except ValueError:
        _raise_invalid_url()
    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not parsed.netloc
        or parsed.netloc != authority
        or parsed.username is not None
        or parsed.password is not None
    ):
        _raise_invalid_url()

    if authority.startswith("["):
        _validate_ipv6_authority(authority, parsed)
    else:
        _validate_dns_or_ipv4_authority(authority, parsed)
    return normalized


def description_preview(value: str) -> str:
    """Collapse a description to one line and truncate its text portion."""

    collapsed = " ".join(value.split())
    if len(collapsed) <= MAX_PREVIEW_LENGTH:
        return collapsed
    return collapsed[:MAX_PREVIEW_LENGTH] + "…"

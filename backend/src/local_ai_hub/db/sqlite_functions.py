"""Deterministic SQLite text functions used by prompt queries."""

import sqlite3

from sqlalchemy import Engine, event

from local_ai_hub.services.prompts import decode_tags, encode_tags

UNICODE_CASEFOLD_FUNCTION = "local_ai_hub_casefold"
CANONICAL_PROMPT_TAGS_FUNCTION = "local_ai_hub_prompt_tags"


def _unicode_casefold(value: object) -> str:
    """Return a Unicode-aware case-folded SQLite text value."""

    if not isinstance(value, str):
        return ""
    return value.casefold()


def _canonical_prompt_tags(value: object) -> str:
    """Return the canonical valid subset of a stored prompt tag string."""

    if not isinstance(value, str):
        return ""
    return encode_tags(decode_tags(value))


def register_sqlite_functions(engine: Engine) -> None:
    """Register local prompt text helpers on every connection for one SQLite engine."""

    if engine.dialect.name != "sqlite":
        return

    def configure_connection(dbapi_connection: object, _connection_record: object) -> None:
        if not isinstance(dbapi_connection, sqlite3.Connection):
            return
        dbapi_connection.create_function(
            UNICODE_CASEFOLD_FUNCTION,
            1,
            _unicode_casefold,
            deterministic=True,
        )
        dbapi_connection.create_function(
            CANONICAL_PROMPT_TAGS_FUNCTION,
            1,
            _canonical_prompt_tags,
            deterministic=True,
        )

    event.listen(engine, "connect", configure_connection)

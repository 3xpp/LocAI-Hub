"""Uvicorn access-log filtering for sensitive workflow query values."""

import logging

UVICORN_ACCESS_LOGGER = "uvicorn.access"
_FILTER_MARKER = "_local_ai_hub_query_redaction_filter"


class SafeAccessLogFilter(logging.Filter):
    """Replace the complete request query before Uvicorn formats a record."""

    _local_ai_hub_query_redaction_filter = True

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if not isinstance(args, tuple):
            return True

        safe_args = list(args)
        if len(safe_args) >= 3 and isinstance(safe_args[2], str):
            target = safe_args[2]
            path, separator, _query = target.partition("?")
            if separator:
                safe_args[2] = f"{path}?<redacted>"
        record.args = tuple(safe_args)
        return True


def install_safe_access_log_filter() -> None:
    """Install exactly one project query-redaction filter on Uvicorn."""

    logger = logging.getLogger(UVICORN_ACCESS_LOGGER)
    if any(getattr(item, _FILTER_MARKER, False) for item in logger.filters):
        return
    logger.addFilter(SafeAccessLogFilter())

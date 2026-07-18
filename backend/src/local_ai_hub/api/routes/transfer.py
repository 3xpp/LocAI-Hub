"""Safe import and export routes for local registry data."""

from contextlib import suppress
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from local_ai_hub.api.transfer_http import (
    TransferHttpProblem,
    fixed_transfer_error_response,
    read_transfer_body,
    transfer_contract_error_response,
    transfer_http_problem_response,
    transfer_json_response,
    transfer_model_response,
)
from local_ai_hub.api.transfer_schemas import (
    TransferContractError,
    TransferCountsResponse,
    TransferImportResponse,
    TransferPreviewResponse,
    TransferWarningResponse,
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
    FORMAT_VERSION,
    MAX_BUNDLE_BYTES,
    MAX_BUNDLE_RECORDS,
    NormalizedTransferBundle,
    PortableRecord,
    TransferCounts,
    TransferPreview,
    build_preview,
    project_stored_records,
    serialize_bundle,
    utc_transfer_timestamp,
)

router = APIRouter(tags=["transfer"])

DatabaseSession = Annotated[Session, Depends(get_db)]


def _counts_response(counts: TransferCounts) -> TransferCountsResponse:
    return TransferCountsResponse(
        total=counts.total,
        prompts=counts.prompts,
        workflow_links=counts.workflow_links,
    )


def _preview_response(preview: TransferPreview) -> TransferPreviewResponse:
    return TransferPreviewResponse(
        valid=True,
        importable=preview.counts.total > 0,
        format_version=FORMAT_VERSION,
        counts=_counts_response(preview.counts),
        duplicates=_counts_response(preview.duplicates),
        warnings=[
            TransferWarningResponse(code=warning.code, message=warning.message)
            for warning in preview.warnings
        ],
    )


def _existing_records(session: Session) -> tuple[PortableRecord, ...]:
    rows = list_transfer_rows(session)
    return project_stored_records(rows.prompts, rows.workflow_links)


def _operation_failure(
    session: Session,
    *,
    code: str,
    message: str,
) -> Response:
    with suppress(Exception):
        session.rollback()
    return fixed_transfer_error_response(
        status_code=500,
        code=code,
        message=message,
    )


def _export_too_large() -> Response:
    return fixed_transfer_error_response(
        status_code=413,
        code="export_too_large",
        message="Export is too large.",
    )


@router.get("/export")
def export_bundle(session: DatabaseSession) -> Response:
    """Download one deterministic version 1 bundle of local registry data."""

    try:
        if count_transfer_rows(session) > MAX_BUNDLE_RECORDS:
            return _export_too_large()

        rows = list_transfer_rows(session)
        if rows.total > MAX_BUNDLE_RECORDS:
            return _export_too_large()
        records = project_stored_records(rows.prompts, rows.workflow_links)

        now = datetime.now(UTC)
        body = serialize_bundle(
            NormalizedTransferBundle(
                exported_at=utc_transfer_timestamp(now),
                records=records,
            )
        )
        if len(body) > MAX_BUNDLE_BYTES:
            return _export_too_large()

        filename = f"local-ai-workflow-hub-{now.strftime('%Y%m%dT%H%M%SZ')}.json"
        return transfer_json_response(
            body,
            status_code=200,
            content_disposition=f'attachment; filename="{filename}"',
        )
    except Exception:
        return _operation_failure(
            session,
            code="export_failed",
            message="Export failed.",
        )


@router.post("/import/preview")
async def preview_import(request: Request, session: DatabaseSession) -> Response:
    """Validate and summarize a bundle without changing stored records."""

    try:
        body = await read_transfer_body(request)
        bundle = parse_transfer_bundle(decode_transfer_json(body))
        preview = build_preview(bundle.records, _existing_records(session))
        return transfer_model_response(_preview_response(preview), status_code=200)
    except TransferHttpProblem as error:
        return transfer_http_problem_response(error)
    except TransferContractError as error:
        return transfer_contract_error_response(error)
    except Exception:
        return _operation_failure(
            session,
            code="preview_failed",
            message="Import preview failed.",
        )


@router.post("/import", status_code=201)
async def commit_import(request: Request, session: DatabaseSession) -> Response:
    """Atomically append every record from one independently validated bundle."""

    try:
        body = await read_transfer_body(request)
        bundle = parse_transfer_bundle(decode_transfer_json(body))
        if not bundle.records:
            return fixed_transfer_error_response(
                status_code=422,
                code="empty_bundle",
                message="Bundle contains no records.",
            )

        preview = build_preview(bundle.records, _existing_records(session))
        append_transfer_records(session, bundle.records)
        result = TransferImportResponse(
            imported=_counts_response(preview.counts),
            duplicates_imported=_counts_response(preview.duplicates),
        )
        return transfer_model_response(result, status_code=201)
    except TransferHttpProblem as error:
        return transfer_http_problem_response(error)
    except TransferContractError as error:
        return transfer_contract_error_response(error)
    except Exception:
        return _operation_failure(
            session,
            code="import_failed",
            message="Import failed.",
        )

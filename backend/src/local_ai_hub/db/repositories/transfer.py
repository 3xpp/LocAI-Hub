"""Deterministic reads and atomic append persistence for registry transfers."""

from collections.abc import Sequence
from contextlib import suppress
from dataclasses import dataclass

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
    """Every persisted registry row in deterministic table and identifier order."""

    prompts: tuple[Prompt, ...]
    workflow_links: tuple[WorkflowLink, ...]

    @property
    def total(self) -> int:
        """Return the combined row count."""

        return len(self.prompts) + len(self.workflow_links)


def count_transfer_rows(session: Session) -> int:
    """Count all portable registry rows without mutating the session."""

    prompt_count = session.scalar(select(func.count()).select_from(Prompt)) or 0
    workflow_count = session.scalar(select(func.count()).select_from(WorkflowLink)) or 0
    return prompt_count + workflow_count


def list_transfer_rows(session: Session) -> StoredTransferRows:
    """Load Prompts first, then Workflow Links, with ascending local identifiers."""

    prompts = tuple(session.scalars(select(Prompt).order_by(Prompt.id.asc())).all())
    workflow_links = tuple(
        session.scalars(select(WorkflowLink).order_by(WorkflowLink.id.asc())).all()
    )
    return StoredTransferRows(prompts=prompts, workflow_links=workflow_links)


def append_transfer_records(
    session: Session,
    records: Sequence[PortableRecord],
) -> None:
    """Append every prevalidated record using exactly one database commit."""

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
        elif isinstance(record, PortableWorkflowLink):
            models.append(
                WorkflowLink(
                    title=record.title,
                    url=record.url,
                    description=record.description,
                    tags=encode_tags(record.tags),
                )
            )
        else:
            raise TypeError("unsupported portable record")

    try:
        session.add_all(models)
        session.commit()
    except Exception:
        with suppress(Exception):
            session.rollback()
        raise

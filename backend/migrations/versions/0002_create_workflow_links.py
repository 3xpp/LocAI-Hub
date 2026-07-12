"""Create the workflow links table.

Revision ID: 0002_create_workflow_links
Revises: 0001_create_prompts
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_create_workflow_links"
down_revision: str | None = "0001_create_prompts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the workflow links table."""

    op.create_table(
        "workflow_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column(
            "description",
            sa.Text(),
            server_default=sa.text("''"),
            nullable=False,
        ),
        sa.Column(
            "tags",
            sa.Text(),
            server_default=sa.text("''"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Drop the workflow links table."""

    op.drop_table("workflow_links")

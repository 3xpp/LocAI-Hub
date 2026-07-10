from datetime import UTC

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from local_ai_hub.db.models import Base, Prompt


def test_prompt_can_be_persisted() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        prompt = Prompt(title="Summarize", content="Summarize this text.", tags="writing,local")
        session.add(prompt)
        session.commit()
        prompt_id = prompt.id

    with Session(engine) as session:
        stored = session.get(Prompt, prompt_id)

        assert stored is not None
        assert stored.title == "Summarize"
        assert stored.tags == "writing,local"
        assert stored.created_at.tzinfo is UTC
        assert stored.updated_at.tzinfo is UTC
        original_updated_at = stored.updated_at

        stored.content = "Summarize this local text."
        session.commit()

    with Session(engine) as session:
        updated = session.get(Prompt, prompt_id)

        assert updated is not None
        assert updated.created_at.tzinfo is UTC
        assert updated.updated_at.tzinfo is UTC
        assert updated.updated_at > original_updated_at

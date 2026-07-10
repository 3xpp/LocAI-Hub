"""Process-environment configuration with local-only defaults."""

import os
from dataclasses import dataclass

DEFAULT_DATABASE_URL = "sqlite:///./local-ai-hub.db"
DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"


@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime settings used by backend services."""

    database_url: str = DEFAULT_DATABASE_URL
    ollama_base_url: str = DEFAULT_OLLAMA_BASE_URL

    @classmethod
    def from_env(cls) -> "Settings":
        """Build settings from the process environment without loading secret files."""

        return cls(
            database_url=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
            ollama_base_url=os.environ.get("OLLAMA_BASE_URL", DEFAULT_OLLAMA_BASE_URL).rstrip("/"),
        )


def get_settings() -> Settings:
    """Return settings for the current process environment."""

    return Settings.from_env()

"""Process-environment configuration with local-only defaults."""

import os
from dataclasses import dataclass, field

DEFAULT_DATABASE_URL = "sqlite:///./local-ai-hub.db"
DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"


@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime settings used by backend services."""

    database_url: str = DEFAULT_DATABASE_URL
    ollama_base_url: str = DEFAULT_OLLAMA_BASE_URL
    n8n_base_url: str | None = field(default=None, repr=False)
    n8n_api_key: str | None = field(default=None, repr=False)

    @classmethod
    def from_env(cls) -> "Settings":
        """Build settings from the process environment without loading secret files."""

        raw_n8n_base_url = os.environ.get("N8N_BASE_URL")
        raw_n8n_api_key = os.environ.get("N8N_API_KEY")
        return cls(
            database_url=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
            ollama_base_url=os.environ.get(
                "OLLAMA_BASE_URL",
                DEFAULT_OLLAMA_BASE_URL,
            ).rstrip("/"),
            n8n_base_url=(
                None if raw_n8n_base_url is None or raw_n8n_base_url == "" else raw_n8n_base_url
            ),
            n8n_api_key=(
                None if raw_n8n_api_key is None or raw_n8n_api_key == "" else raw_n8n_api_key
            ),
        )


def get_settings() -> Settings:
    """Return settings for the current process environment."""

    return Settings.from_env()

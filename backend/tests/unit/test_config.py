from pytest import MonkeyPatch

from local_ai_hub.config import Settings


def test_settings_read_process_environment(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./custom.db")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama.test/")

    settings = Settings.from_env()

    assert settings.database_url == "sqlite:///./custom.db"
    assert settings.ollama_base_url == "http://ollama.test"

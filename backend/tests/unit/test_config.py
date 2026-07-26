from pytest import MonkeyPatch

from local_ai_hub.config import Settings


def test_settings_read_process_environment(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./custom.db")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama.test/")
    monkeypatch.setenv("N8N_BASE_URL", "http://n8n.test/")
    monkeypatch.setenv("N8N_API_KEY", "synthetic-key")

    settings = Settings.from_env()

    assert settings.database_url == "sqlite:///./custom.db"
    assert settings.ollama_base_url == "http://ollama.test"
    assert settings.n8n_base_url == "http://n8n.test/"
    assert settings.n8n_api_key == "synthetic-key"


def test_settings_treats_missing_n8n_base_url_as_unconfigured(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.delenv("N8N_BASE_URL", raising=False)
    assert Settings.from_env().n8n_base_url is None


def test_settings_treats_exact_empty_n8n_base_url_as_unconfigured(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.setenv("N8N_BASE_URL", "")
    assert Settings.from_env().n8n_base_url is None


def test_settings_preserves_non_empty_n8n_value_for_client_validation(
    monkeypatch: MonkeyPatch,
) -> None:
    marker = "  http://n8n.test/  "
    monkeypatch.setenv("N8N_BASE_URL", marker)
    settings = Settings.from_env()
    assert settings.n8n_base_url == marker
    assert marker not in repr(settings)


def test_settings_treats_missing_n8n_api_key_as_unconfigured(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.delenv("N8N_API_KEY", raising=False)
    assert Settings.from_env().n8n_api_key is None


def test_settings_treats_exact_empty_n8n_api_key_as_unconfigured(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.setenv("N8N_API_KEY", "")
    assert Settings.from_env().n8n_api_key is None


def test_settings_preserves_non_empty_n8n_key_without_repr_disclosure(
    monkeypatch: MonkeyPatch,
) -> None:
    marker = "phase2b-Key_MARKER-7xQ"
    monkeypatch.setenv("N8N_API_KEY", marker)

    settings = Settings.from_env()

    assert settings.n8n_api_key == marker
    assert marker not in repr(settings)

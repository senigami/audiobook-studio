import pytest
from pathlib import Path
from app.engines.registry import load_engine_registry

@pytest.fixture(autouse=True)
def _disable_voxtral_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("plugins.tts_voxtral.plugin.studio.app_adapter.resolve_mistral_api_key", lambda: None)
    monkeypatch.setattr("plugins.tts_xtts.plugin.studio.app_adapter.XTTS_ENV_ACTIVATE", Path("/nonexistent/activate"))
    monkeypatch.setattr("plugins.tts_xtts.plugin.studio.app_adapter.XTTS_ENV_PYTHON", Path("/nonexistent/python"))
    load_engine_registry.cache_clear()
    yield
    load_engine_registry.cache_clear()

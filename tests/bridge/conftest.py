import importlib
import pytest
from pathlib import Path
from app.engines.registry import load_engine_registry

@pytest.fixture(autouse=True)
def _disable_voxtral_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    # Import the modules directly (rather than using pytest's dotted-string
    # setattr form) so this doesn't depend on `plugins.tts_voxtral`/`plugins.tts_xtts`
    # already being bound as attributes on the real `plugins` package. Real plugin
    # discovery (e.g. app.jobs.registry.initialize_default_handlers, exercised for
    # real by tests/core/test_boot.py) can register synthetic sys.modules entries
    # for these submodules without ever binding the attribute on the parent package,
    # which breaks dotted-string attribute-chain resolution for later tests.
    voxtral_app_adapter = importlib.import_module("tts_engines.tts_voxtral.plugin.studio.app_adapter")
    xtts_app_adapter = importlib.import_module("tts_engines.tts_xtts.plugin.studio.app_adapter")
    monkeypatch.setattr(voxtral_app_adapter, "resolve_mistral_api_key", lambda: None)
    monkeypatch.setattr(xtts_app_adapter, "XTTS_ENV_ACTIVATE", Path("/nonexistent/activate"))
    monkeypatch.setattr(xtts_app_adapter, "XTTS_ENV_PYTHON", Path("/nonexistent/python"))
    load_engine_registry.cache_clear()
    yield
    load_engine_registry.cache_clear()

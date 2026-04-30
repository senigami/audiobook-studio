import pytest
from app.engines.bridge import create_voice_bridge
from app.engines.registry import load_engine_registry
from app.engines.errors import EngineRequestError

@pytest.fixture(autouse=True)
def force_local_path(monkeypatch):
    """Ensure these tests use the local in-process path."""
    monkeypatch.setenv("USE_TTS_SERVER", "0")
    monkeypatch.setenv("USE_STUDIO_ORCHESTRATOR", "0")
    if hasattr(load_engine_registry, "cache_clear"):
        load_engine_registry.cache_clear()

    import app.core.feature_flags
    monkeypatch.setattr("app.core.feature_flags.use_tts_server", lambda: False)
    monkeypatch.setattr("app.core.feature_flags.use_studio_orchestrator", lambda: False)
    yield

def test_engine_registry_loads_builtin_adapters(monkeypatch) -> None:
    monkeypatch.setenv("USE_TTS_SERVER", "0")
    load_engine_registry.cache_clear()
    registry = load_engine_registry()

    assert set(registry) == {"xtts", "voxtral"}

    xtts = registry["xtts"]
    assert xtts.manifest.display_name == "XTTS"
    assert xtts.manifest.module_path == "app.engines.voice.xtts.engine"
    assert xtts.health.available is False
    assert xtts.health.ready is False
    assert xtts.health.status == "needs_setup"

def test_voice_bridge_describes_registry(monkeypatch) -> None:
    monkeypatch.setenv("USE_TTS_SERVER", "0")
    load_engine_registry.cache_clear()
    bridge = create_voice_bridge()

    registry_summary = bridge.describe_registry()

    assert {entry["manifest"]["engine_id"] for entry in registry_summary} == {"xtts", "voxtral"}
    assert all(entry["health"]["available"] is False for entry in registry_summary)
    assert {entry["health"]["status"] for entry in registry_summary} == {"needs_setup", "unavailable"}

def test_voice_bridge_rejects_unknown_engine() -> None:
    bridge = create_voice_bridge()

    with pytest.raises(EngineRequestError, match="Unknown voice engine"):
        bridge.synthesize({"engine_id": "unknown", "text": "hello"})

import pytest
from app.engines.bridge import create_voice_bridge
from app.engines.errors import EngineNotReadyError, EngineUnavailableError
from app.engines.models import EngineHealthModel, EngineManifestModel, EngineRegistrationModel
from app.engines.registry import load_engine_registry

def test_voice_bridge_rejects_unavailable_engine_before_routing() -> None:
    bridge = create_voice_bridge()

    with pytest.raises(EngineUnavailableError, match="is unavailable"):
        bridge.preview({"engine_id": "xtts", "text": "hello"})

def test_voice_bridge_rejects_registered_engine_that_is_not_ready() -> None:
    class ReadyCheckEngine:
        def validate_request(self, request: dict[str, object]) -> None:
            raise AssertionError("validate_request should not run when engine is not ready")

        def preview(self, request: dict[str, object]) -> dict[str, object]:
            raise AssertionError("preview should not run when engine is not ready")

    manifest = EngineManifestModel(
        engine_id="test",
        display_name="Test Engine",
        phase="phase-3",
        module_path="tests.test_engine",
    )
    registration = EngineRegistrationModel(
        manifest=manifest,
        engine=ReadyCheckEngine(),
        health=EngineHealthModel(
            engine_id="test",
            available=True,
            ready=False,
            status="warming",
            message="still starting",
        ),
    )
    bridge = create_voice_bridge()
    bridge.registry_loader = lambda: {"test": registration}

    with pytest.raises(EngineNotReadyError, match="is not ready"):
        bridge.preview({"engine_id": "test", "text": "hello"})

def test_engine_registry_refreshes_voxtral_health_without_cache_clear(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.engines.voice.voxtral.engine.resolve_mistral_api_key", lambda: None)
    registry = load_engine_registry()
    assert registry["voxtral"].health.available is False

    monkeypatch.setattr("app.engines.voice.voxtral.engine.resolve_mistral_api_key", lambda: "token")
    refreshed = load_engine_registry()

    assert refreshed["voxtral"].health.available is True
    assert refreshed["voxtral"].health.ready is True
    assert refreshed["voxtral"].health.status == "ready"

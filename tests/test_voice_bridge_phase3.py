from __future__ import annotations

from pathlib import Path

import pytest

from app.engines.errors import EngineNotReadyError, EngineRequestError, EngineUnavailableError
from app.engines.bridge import create_voice_bridge
from app.engines.models import EngineHealthModel, EngineManifestModel, EngineRegistrationModel
from app.engines.registry import load_engine_registry


@pytest.fixture(autouse=True)
def _disable_voxtral_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.engines.voice.voxtral.engine.resolve_mistral_api_key", lambda: None)
    load_engine_registry.cache_clear()
    yield
    load_engine_registry.cache_clear()


def test_engine_registry_loads_builtin_adapters() -> None:
    registry = load_engine_registry()

    assert set(registry) == {"xtts", "voxtral"}

    xtts = registry["xtts"]
    assert xtts.manifest.display_name == "XTTS"
    assert xtts.manifest.module_path == "app.engines.voice.xtts.engine"
    assert xtts.health.available is False
    assert xtts.health.ready is False
    assert xtts.health.status == "scaffold"


def test_voice_bridge_describes_registry() -> None:
    bridge = create_voice_bridge()

    registry_summary = bridge.describe_registry()

    assert {entry["manifest"]["engine_id"] for entry in registry_summary} == {"xtts", "voxtral"}
    assert all(entry["health"]["available"] is False for entry in registry_summary)
    assert {entry["health"]["status"] for entry in registry_summary} == {"scaffold", "unavailable"}


def test_voice_bridge_rejects_unknown_engine() -> None:
    bridge = create_voice_bridge()

    with pytest.raises(EngineRequestError, match="Unknown voice engine"):
        bridge.synthesize({"engine_id": "unknown", "text": "hello"})


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


def test_voice_bridge_routes_voxtral_preview_when_ready(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.engines.voice.voxtral.engine.resolve_mistral_api_key", lambda: "token")
    load_engine_registry.cache_clear()

    def fake_voxtral_generate(*, text, out_wav, profile_name, voice_id=None, model=None, reference_sample=None):
        assert text == "hello"
        assert profile_name == "VoiceA"
        assert voice_id == "asset-1"
        assert model is None or isinstance(model, str)
        assert reference_sample is None
        out_wav.write_text("preview audio")
        return 0

    monkeypatch.setattr("app.engines.voice.voxtral.engine.voxtral_generate", fake_voxtral_generate)

    bridge = create_voice_bridge()
    response = bridge.preview(
        {
            "engine_id": "voxtral",
            "voice_profile_id": "VoiceA",
            "script_text": "hello",
            "voice_asset_id": "asset-1",
            "output_format": "wav",
        }
    )

    assert response["status"] == "ok"
    assert response["engine_id"] == "voxtral"
    assert response["ephemeral"] is True
    assert response["preview_request"]["voice_asset_id"] == "asset-1"
    assert Path(response["audio_path"]).exists()


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


def test_voice_bridge_rejects_non_wav_voxtral_preview(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.engines.voice.voxtral.engine.resolve_mistral_api_key", lambda: "token")

    bridge = create_voice_bridge()

    with pytest.raises(EngineRequestError, match="output_format='wav' only"):
        bridge.preview(
            {
                "engine_id": "voxtral",
                "voice_profile_id": "VoiceA",
                "script_text": "hello",
                "output_format": "mp3",
            }
        )

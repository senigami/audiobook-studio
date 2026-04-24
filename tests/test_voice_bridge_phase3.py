from __future__ import annotations

from pathlib import Path

import pytest

from app.engines.errors import EngineNotReadyError, EngineRequestError, EngineUnavailableError
from app.engines.bridge import create_voice_bridge
from app.engines.models import EngineHealthModel, EngineManifestModel, EngineRegistrationModel
from app.engines.registry import load_engine_registry
from app.engines.voice.xtts.engine import XttsVoiceEngine


@pytest.fixture(autouse=True)
def _disable_voxtral_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.engines.voice.voxtral.engine.resolve_mistral_api_key", lambda: None)
    monkeypatch.setattr("app.engines.voice.xtts.engine.XTTS_ENV_ACTIVATE", Path("/nonexistent/activate"))
    monkeypatch.setattr("app.engines.voice.xtts.engine.XTTS_ENV_PYTHON", Path("/nonexistent/python"))
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
    from app.state import get_settings  # noqa: PLC0415
    original_settings = get_settings()
    monkeypatch.setattr("app.state.get_settings", lambda: {**original_settings, "voxtral_enabled": True, "enabled_plugins": {"voxtral": True}})
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


def test_voice_bridge_routes_voxtral_synthesize_when_ready(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr("app.engines.voice.voxtral.engine.resolve_mistral_api_key", lambda: "token")
    from app.state import get_settings  # noqa: PLC0415
    original_settings = get_settings()
    monkeypatch.setattr("app.state.get_settings", lambda: {**original_settings, "voxtral_enabled": True, "enabled_plugins": {"voxtral": True}})
    load_engine_registry.cache_clear()

    output_path = tmp_path / "sample.wav"

    def fake_legacy_voxtral_generate(
        *,
        text,
        out_wav,
        on_output,
        cancel_check,
        profile_name,
        voice_id=None,
        model=None,
        reference_sample=None,
    ):
        assert text == "hello"
        assert out_wav == output_path
        assert profile_name == "VoiceA"
        assert voice_id == "asset-1"
        on_output("voxtral line")
        assert cancel_check() is False
        out_wav.write_text("synthesis audio")
        return 0

    monkeypatch.setattr("app.engines_voxtral.voxtral_generate", fake_legacy_voxtral_generate)

    bridge = create_voice_bridge()
    response = bridge.synthesize(
        {
            "engine_id": "voxtral",
            "voice_profile_id": "VoiceA",
            "script_text": "hello",
            "voice_asset_id": "asset-1",
            "output_path": str(output_path),
            "output_format": "wav",
            "request_fingerprint": "fp-123",
        }
    )

    assert response["status"] == "ok"
    assert response["bridge"] == "voice-synthesis-bridge"
    assert response["ephemeral"] is False
    assert response["request_fingerprint"] == "fp-123"
    assert Path(response["audio_path"]).exists()


def test_voice_bridge_preserves_voxtral_reference_sample_for_synthesis(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr("app.engines.voice.voxtral.engine.resolve_mistral_api_key", lambda: "token")
    from app.state import get_settings  # noqa: PLC0415
    original_settings = get_settings()
    monkeypatch.setattr("app.state.get_settings", lambda: {**original_settings, "voxtral_enabled": True, "enabled_plugins": {"voxtral": True}})
    load_engine_registry.cache_clear()

    output_path = tmp_path / "sample.wav"

    def fake_legacy_voxtral_generate(
        *,
        text,
        out_wav,
        on_output,
        cancel_check,
        profile_name,
        voice_id=None,
        model=None,
        reference_sample=None,
    ):
        assert text == "hello"
        assert reference_sample == "stored-reference.wav"
        out_wav.write_text("synthesis audio")
        return 0

    monkeypatch.setattr("app.engines_voxtral.voxtral_generate", fake_legacy_voxtral_generate)

    bridge = create_voice_bridge()
    response = bridge.synthesize(
        {
            "engine_id": "voxtral",
            "voice_profile_id": "VoiceA",
            "script_text": "hello",
            "output_path": str(output_path),
            "output_format": "wav",
            "reference_sample": "stored-reference.wav",
        }
    )

    assert response["status"] == "ok"
    assert response["synthesis_request"]["reference_sample"] == "stored-reference.wav"


def test_voice_bridge_routes_voxtral_mp3_synthesize_when_ready(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr("app.engines.voice.voxtral.engine.resolve_mistral_api_key", lambda: "token")
    from app.state import get_settings  # noqa: PLC0415
    original_settings = get_settings()
    monkeypatch.setattr("app.state.get_settings", lambda: {**original_settings, "voxtral_enabled": True, "enabled_plugins": {"voxtral": True}})
    load_engine_registry.cache_clear()

    output_path = tmp_path / "sample.mp3"
    callback_events: list[str] = []

    def fake_voxtral_generate(
        *,
        text,
        out_wav,
        on_output,
        cancel_check,
        profile_name,
        voice_id=None,
        model=None,
        reference_sample=None,
    ):
        assert text == "hello"
        assert out_wav.suffix == ".wav"
        assert out_wav != output_path
        on_output("voxtral line")
        assert cancel_check() is False
        out_wav.write_text("synthesis audio")
        return 0

    def fake_wav_to_mp3(in_wav, out_mp3, on_output=None, cancel_check=None):
        assert in_wav.suffix == ".wav"
        assert out_mp3 == output_path
        on_output("mp3 line")
        assert cancel_check() is False
        out_mp3.write_text("mp3 audio")
        return 0

    monkeypatch.setattr("app.engines.voice.voxtral.engine.voxtral_generate", fake_voxtral_generate)
    monkeypatch.setattr("app.engines.voice.voxtral.engine.wav_to_mp3", fake_wav_to_mp3)

    bridge = create_voice_bridge()
    response = bridge.synthesize(
        {
            "engine_id": "voxtral",
            "voice_profile_id": "VoiceA",
            "script_text": "hello",
            "voice_asset_id": "asset-1",
            "output_path": str(output_path),
            "output_format": "mp3",
            "on_output": callback_events.append,
            "cancel_check": lambda: False,
        }
    )

    assert response["status"] == "ok"
    assert response["audio_format"] == "mp3"
    assert Path(response["audio_path"]).exists()
    assert callback_events == ["voxtral line", "mp3 line"]


def test_voice_bridge_routes_xtts_preview_when_ready(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    reference_audio = tmp_path / "reference.wav"
    reference_audio.write_bytes(b"wav data")

    def fake_xtts_generate(
        *,
        text,
        out_wav,
        safe_mode,
        on_output,
        cancel_check,
        speaker_wav=None,
        speed=1.0,
        voice_profile_dir=None,
    ):
        assert text == "hello"
        assert safe_mode is True
        assert speaker_wav == str(reference_audio)
        assert voice_profile_dir is None
        out_wav.write_text("preview audio")
        return 0

    monkeypatch.setattr("app.engines.voice.xtts.engine.xtts_generate", fake_xtts_generate)

    manifest = EngineManifestModel(
        engine_id="xtts",
        display_name="XTTS",
        phase="phase-3",
        module_path="app.engines.voice.xtts.engine",
    )
    engine = XttsVoiceEngine(manifest=manifest)
    registration = EngineRegistrationModel(
        manifest=manifest,
        engine=engine,
        health=EngineHealthModel(
            engine_id="xtts",
            available=True,
            ready=True,
            status="ready",
            message="ready",
        ),
    )

    bridge = create_voice_bridge()
    bridge.registry_loader = lambda: {"xtts": registration}

    response = bridge.preview(
        {
            "engine_id": "xtts",
            "voice_profile_id": "VoiceA",
            "script_text": "hello",
            "reference_audio_path": str(reference_audio),
            "output_format": "wav",
        }
    )

    assert response["status"] == "ok"
    assert response["engine_id"] == "xtts"
    assert response["ephemeral"] is True
    assert response["preview_request"]["reference_audio_path"] == str(reference_audio)
    assert Path(response["audio_path"]).exists()


def test_voice_bridge_routes_xtts_synthesize_when_ready(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    reference_audio = tmp_path / "reference.wav"
    reference_audio.write_bytes(b"wav data")
    output_path = tmp_path / "sample.wav"

    def fake_xtts_generate(
        *,
        text,
        out_wav,
        safe_mode,
        on_output,
        cancel_check,
        speaker_wav=None,
        speed=1.0,
        voice_profile_dir=None,
    ):
        assert text == "hello"
        assert out_wav == output_path
        assert safe_mode is True
        assert speaker_wav == str(reference_audio)
        assert voice_profile_dir is None
        out_wav.write_text("synthesis audio")
        return 0

    monkeypatch.setattr("app.engines.voice.xtts.engine.xtts_generate", fake_xtts_generate)

    manifest = EngineManifestModel(
        engine_id="xtts",
        display_name="XTTS",
        phase="phase-3",
        module_path="app.engines.voice.xtts.engine",
    )
    engine = XttsVoiceEngine(manifest=manifest)
    registration = EngineRegistrationModel(
        manifest=manifest,
        engine=engine,
        health=EngineHealthModel(
            engine_id="xtts",
            available=True,
            ready=True,
            status="ready",
            message="ready",
        ),
    )

    bridge = create_voice_bridge()
    bridge.registry_loader = lambda: {"xtts": registration}

    response = bridge.synthesize(
        {
            "engine_id": "xtts",
            "voice_profile_id": "VoiceA",
            "script_text": "hello",
            "reference_audio_path": str(reference_audio),
            "output_path": str(output_path),
            "output_format": "wav",
            "request_fingerprint": "fp-456",
        }
    )

    assert response["status"] == "ok"
    assert response["bridge"] == "voice-synthesis-bridge"
    assert response["ephemeral"] is False
    assert response["request_fingerprint"] == "fp-456"
    assert Path(response["audio_path"]).exists()


def test_voice_bridge_routes_xtts_preview_with_legacy_profile_resolution(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolved_profile_dir = Path("/tmp/VoiceA - Variant")

    def fake_xtts_generate(
        *,
        text,
        out_wav,
        safe_mode,
        on_output,
        cancel_check,
        speaker_wav=None,
        speed=1.0,
        voice_profile_dir=None,
    ):
        assert text == "hello"
        assert speaker_wav == "/tmp/ref.wav"
        assert voice_profile_dir == resolved_profile_dir
        out_wav.write_text("preview audio")
        return 0

    monkeypatch.setattr(
        "app.engines.voice.xtts.engine.resolve_xtts_preview_inputs",
        lambda profile_name_or_id: ("/tmp/ref.wav", resolved_profile_dir),
    )
    monkeypatch.setattr("app.engines.voice.xtts.engine.xtts_generate", fake_xtts_generate)

    manifest = EngineManifestModel(
        engine_id="xtts",
        display_name="XTTS",
        phase="phase-3",
        module_path="app.engines.voice.xtts.engine",
    )
    engine = XttsVoiceEngine(manifest=manifest)
    registration = EngineRegistrationModel(
        manifest=manifest,
        engine=engine,
        health=EngineHealthModel(
            engine_id="xtts",
            available=True,
            ready=True,
            status="ready",
            message="ready",
        ),
    )

    bridge = create_voice_bridge()
    bridge.registry_loader = lambda: {"xtts": registration}

    response = bridge.preview(
        {
            "engine_id": "xtts",
            "voice_profile_id": "VoiceA",
            "script_text": "hello",
            "output_format": "wav",
        }
    )

    assert response["status"] == "ok"
    assert response["engine_id"] == "xtts"
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
    from app.state import get_settings  # noqa: PLC0415
    original_settings = get_settings()
    monkeypatch.setattr("app.state.get_settings", lambda: {**original_settings, "voxtral_enabled": True, "enabled_plugins": {"voxtral": True}})

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

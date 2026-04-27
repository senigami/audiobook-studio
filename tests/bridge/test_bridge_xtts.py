import pytest
from pathlib import Path
from app.engines.bridge import create_voice_bridge
from app.engines.models import EngineHealthModel, EngineManifestModel, EngineRegistrationModel
from app.engines.voice.xtts.engine import XttsVoiceEngine

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

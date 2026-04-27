import pytest
from pathlib import Path
from app.engines.bridge import create_voice_bridge
from app.engines.registry import load_engine_registry
from app.engines.errors import EngineRequestError

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

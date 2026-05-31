from __future__ import annotations

from pathlib import Path

from app.engines.models import EngineManifestModel
from plugins.tts_xtts.plugin.studio.app_adapter import XttsVoiceEngine


def test_xtts_app_adapter_synthesize_reports_duration_sec(tmp_path, monkeypatch):
    engine = XttsVoiceEngine(
        manifest=EngineManifestModel(
            engine_id="xtts",
            display_name="XTTS",
            phase="test",
            module_path="plugins.tts_xtts.interface",
        )
    )
    output_path = tmp_path / "chapter.wav"

    monkeypatch.setattr(
        "plugins.tts_xtts.plugin.studio.app_adapter.resolve_voice_preview_inputs",
        lambda _profile_id: ("speaker.wav", tmp_path),
    )

    def fake_generate_script(
        *,
        script_json_path: Path,
        out_wav: Path,
        on_output,
        cancel_check,
        speed: float,
        task_id: str | None = None,
    ) -> int:
        assert script_json_path.exists()
        out_wav.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")
        return 0

    monkeypatch.setattr(
        "plugins.tts_xtts.plugin.studio.app_adapter.xtts_generate_script",
        fake_generate_script,
    )

    result = engine.synthesize(
        {
            "engine_id": "xtts",
            "voice_profile_id": "voice-a",
            "script_text": "",
            "script": [{"text": "Hello world", "save_path": str(tmp_path / "part.wav")}],
            "output_path": str(output_path),
            "output_format": "wav",
            "task_id": "job-duration-contract",
        }
    )

    assert result["status"] == "ok"
    assert result["audio_path"] == str(output_path)
    assert result["duration_sec"] > 0

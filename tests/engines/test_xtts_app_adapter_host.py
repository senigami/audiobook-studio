from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

from app.engines.models import EngineManifestModel
from tts_engines.tts_xtts.plugin.studio.app_adapter import XttsVoiceEngine


def test_xtts_app_adapter_synthesize_reports_duration_sec(tmp_path, monkeypatch):
    engine = XttsVoiceEngine(
        manifest=EngineManifestModel(
            engine_id="xtts",
            display_name="XTTS",
            phase="test",
            module_path="tts_engines.tts_xtts.interface",
        )
    )
    output_path = tmp_path / "chapter.wav"

    mock_ctx = MagicMock()
    mock_ctx.resolve_voice_preview_inputs.return_value = {
        "voice_ref": "speaker.wav",
        "voice_profile_dir": str(tmp_path),
    }
    monkeypatch.setattr(
        "tts_engines.tts_xtts.plugin.studio.app_adapter._get_ctx",
        lambda: mock_ctx,
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
        "tts_engines.tts_xtts.plugin.studio.app_adapter.xtts_generate_script",
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


def _make_engine() -> XttsVoiceEngine:
    return XttsVoiceEngine(
        manifest=EngineManifestModel(
            engine_id="xtts",
            display_name="XTTS",
            phase="test",
            module_path="tts_engines.tts_xtts.interface",
        )
    )


def test_describe_health_delegates_to_xtts_env_ready_when_ready(monkeypatch):
    """describe_health() must reflect the real external-env check (BUG 1's
    xtts_env_ready()), not the stale placeholder that checked a `.venv`
    folder inside the plugin's own directory (never created by any real
    provisioning path) and treated requirements.txt existing as
    "dependencies satisfied".
    """
    monkeypatch.setattr(
        "tts_engines.tts_xtts.plugin.core.implementation.xtts_env_ready",
        lambda: (True, "OK"),
    )

    health = _make_engine().describe_health()

    assert health.available is True
    assert health.ready is True
    assert health.status == "ready"
    assert health.message is None
    assert health.dependencies_satisfied is True
    assert health.missing_dependencies == []


def test_describe_health_reports_needs_setup_from_xtts_env_ready(monkeypatch):
    monkeypatch.setattr(
        "tts_engines.tts_xtts.plugin.core.implementation.xtts_env_ready",
        lambda: (False, "XTTS dependencies not found in the xtts-env. Run ./run.sh (or ./run.ps1) to provision it."),
    )

    health = _make_engine().describe_health()

    assert health.available is False
    assert health.ready is False
    assert health.status == "needs_setup"
    assert health.message == (
        "XTTS dependencies not found in the xtts-env. Run ./run.sh (or ./run.ps1) to provision it."
    )
    assert health.dependencies_satisfied is False


def test_describe_health_message_never_mentions_install_deps(monkeypatch):
    """Regression guard: the setup message must never reference the
    'Install Deps' button, since POST /engines/xtts/install refuses (400)
    for this engine (dependency_check: "external", BUG 1 fix) -- pointing
    users at it would be a dead end.
    """
    monkeypatch.setattr(
        "tts_engines.tts_xtts.plugin.core.implementation.xtts_env_ready",
        lambda: (False, "not ready"),
    )

    health = _make_engine().describe_health()

    assert health.message is not None
    assert "Install Deps" not in health.message

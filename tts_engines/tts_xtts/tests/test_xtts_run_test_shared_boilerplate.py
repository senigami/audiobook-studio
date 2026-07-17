"""Tests for XttsPlugin.run_test() delegating to the shared BaseVoiceEngine.run_test() (PL-3).

Before PL-3, run_test() implemented its own ~25-line asset-resolution + synth-test flow inline.
After PL-3, it is a one-liner delegating to the shared base implementation. These tests exercise
the real XttsPlugin.run_test() end to end (mocking only synthesize(), the actual TTS engine
boundary — R2) to prove the migration preserved behavior: asset search order, manifest test_text
override, default text fallback, and the "no assets found" failure path.

The real tts_engines/tts_xtts/plugin/assets/ folder is a live, shared location (populated by actual
engine usage) and must never be read or written by tests — instead we patch
app.engines.voice.base.inspect.getfile so BaseVoiceEngine.run_test()'s plugin_dir resolution
(parents[2] of the concrete engine class's file) points at an isolated tmp_path with its own fake
<root>/plugin/server/engine.py layout, mirroring the real tts_engines/tts_xtts/plugin/server/engine.py
directory depth.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from app.engines.voice.sdk import TTSResult, VerificationResult
from tts_engines.tts_xtts.plugin.server.engine import XttsPlugin


def _make_isolated_plugin_dir(tmp_path: Path) -> Path:
    """Build a fake <plugin_root>/plugin/server/engine.py path so
    inspect.getfile(type(self))'s parents[2] resolves plugin_dir to an isolated
    tmp_path plugin root — mirroring the real tts_engines/tts_xtts/plugin/server/engine.py
    layout (engine.py -> server -> plugin -> tts_xtts)."""
    plugin_root = tmp_path / "fake_plugin"
    server_dir = plugin_root / "plugin" / "server"
    server_dir.mkdir(parents=True)
    fake_engine_file = server_dir / "engine.py"
    fake_engine_file.write_text("# fake\n", encoding="utf-8")
    return plugin_root


def test_run_test_uses_first_matching_asset_in_search_order(tmp_path):
    """run_test() picks the first existing file from ['latent.pth', 'voice.wav', 'sample.wav']."""
    plugin_root = _make_isolated_plugin_dir(tmp_path)
    assets_dir = plugin_root / "assets"
    assets_dir.mkdir()
    # latent.pth is absent; voice.wav should be picked over sample.wav.
    voice_wav = assets_dir / "voice.wav"
    voice_wav.write_bytes(b"fake")
    (assets_dir / "sample.wav").write_bytes(b"fake")

    plugin = XttsPlugin()
    captured_voice_ref = {}

    def fake_synthesize(req):
        captured_voice_ref["voice_ref"] = req.voice_ref
        Path(req.output_path).write_bytes(b"ok")
        return TTSResult(ok=True, output_path=req.output_path)

    with patch("app.engines.voice.base.inspect.getfile", return_value=str(plugin_root / "plugin" / "server" / "engine.py")), \
         patch.object(plugin, "check_env", return_value=(True, "OK")), \
         patch.object(plugin, "synthesize", side_effect=fake_synthesize):
        result = plugin.run_test()

    assert isinstance(result, VerificationResult)
    assert result.ok is True
    assert captured_voice_ref["voice_ref"] == str(voice_wav)


def test_run_test_fails_when_no_assets_present(tmp_path):
    """run_test() reports failure when none of the candidate assets exist."""
    plugin_root = _make_isolated_plugin_dir(tmp_path)
    plugin = XttsPlugin()

    with patch("app.engines.voice.base.inspect.getfile", return_value=str(plugin_root / "plugin" / "server" / "engine.py")), \
         patch.object(plugin, "check_env", return_value=(True, "OK")):
        result = plugin.run_test()

    assert result.ok is False
    assert "No test assets found" in result.message


def test_run_test_uses_manifest_test_text_when_present(tmp_path):
    """run_test() reads test_text from manifest.json when present, else falls back to default_text."""
    plugin_root = _make_isolated_plugin_dir(tmp_path)
    assets_dir = plugin_root / "assets"
    assets_dir.mkdir()
    (assets_dir / "voice.wav").write_bytes(b"fake")
    (plugin_root / "manifest.json").write_text(
        json.dumps({"test_text": "Custom manifest test text."}), encoding="utf-8"
    )

    plugin = XttsPlugin()
    captured_text = {}

    def fake_synthesize(req):
        captured_text["text"] = req.text
        Path(req.output_path).write_bytes(b"ok")
        return TTSResult(ok=True, output_path=req.output_path)

    with patch("app.engines.voice.base.inspect.getfile", return_value=str(plugin_root / "plugin" / "server" / "engine.py")), \
         patch.object(plugin, "check_env", return_value=(True, "OK")), \
         patch.object(plugin, "synthesize", side_effect=fake_synthesize):
        result = plugin.run_test()

    assert result.ok is True
    assert captured_text["text"] == "Custom manifest test text."


def test_run_test_falls_back_to_default_text_without_manifest(tmp_path):
    """run_test() uses the plugin-supplied default_text when manifest.json is absent."""
    plugin_root = _make_isolated_plugin_dir(tmp_path)
    assets_dir = plugin_root / "assets"
    assets_dir.mkdir()
    (assets_dir / "sample.wav").write_bytes(b"fake")
    # No manifest.json written.

    plugin = XttsPlugin()
    captured_text = {}

    def fake_synthesize(req):
        captured_text["text"] = req.text
        Path(req.output_path).write_bytes(b"ok")
        return TTSResult(ok=True, output_path=req.output_path)

    with patch("app.engines.voice.base.inspect.getfile", return_value=str(plugin_root / "plugin" / "server" / "engine.py")), \
         patch.object(plugin, "check_env", return_value=(True, "OK")), \
         patch.object(plugin, "synthesize", side_effect=fake_synthesize):
        result = plugin.run_test()

    assert result.ok is True
    assert captured_text["text"] == "This is an internal XTTS verification test."


def test_run_test_reports_check_env_failure_without_touching_assets(tmp_path):
    """run_test() short-circuits on a failing check_env() and never calls synthesize()."""
    plugin_root = _make_isolated_plugin_dir(tmp_path)
    plugin = XttsPlugin()

    with patch("app.engines.voice.base.inspect.getfile", return_value=str(plugin_root / "plugin" / "server" / "engine.py")), \
         patch.object(plugin, "check_env", return_value=(False, "environment missing")), \
         patch.object(plugin, "synthesize") as mock_synthesize:
        result = plugin.run_test()

    assert result.ok is False
    assert result.message == "environment missing"
    mock_synthesize.assert_not_called()

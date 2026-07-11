"""Tests for VoxtralPlugin.run_test() delegating to the shared BaseVoiceEngine.run_test() (PL-3).

Mirrors plugins/tts_xtts/tests/test_run_test_shared_boilerplate.py. Voxtral's run_test() differs
from XTTS's in one load-bearing way: it accepts a settings dict and threads it into both
check_env(settings=...) and the TTSRequest — this is exactly what
app.tts_server.verification._accepts_settings() introspects on the *subclass*'s run_test
signature to decide whether to call run_test(settings=...) or run_test(). These tests confirm
settings threading survived the move into BaseVoiceEngine.run_test().
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from app.engines.voice.sdk import TTSResult, VerificationResult
from plugins.tts_voxtral.plugin.server.engine import VoxtralPlugin


def _make_isolated_plugin_dir(tmp_path: Path) -> Path:
    """Build a fake <plugin_root>/plugin/server/engine.py path mirroring the real
    plugins/tts_voxtral/plugin/server/engine.py depth (engine.py -> server -> plugin -> root)."""
    plugin_root = tmp_path / "fake_plugin"
    server_dir = plugin_root / "plugin" / "server"
    server_dir.mkdir(parents=True)
    (server_dir / "engine.py").write_text("# fake\n", encoding="utf-8")
    return plugin_root


def _patch_getfile(plugin_root: Path):
    return patch(
        "app.engines.voice.base.inspect.getfile",
        return_value=str(plugin_root / "plugin" / "server" / "engine.py"),
    )


def test_run_test_threads_settings_into_check_env_and_request(tmp_path):
    """run_test(settings=...) forwards settings to check_env(settings=...) and TTSRequest.settings."""
    plugin_root = _make_isolated_plugin_dir(tmp_path)
    assets_dir = plugin_root / "assets"
    assets_dir.mkdir()
    (assets_dir / "voice.wav").write_bytes(b"fake")

    plugin = VoxtralPlugin()
    captured = {}

    def fake_check_env(*, settings=None):
        captured["check_env_settings"] = settings
        return True, "OK"

    def fake_synthesize(req):
        captured["request_settings"] = req.settings
        Path(req.output_path).write_bytes(b"ok")
        return TTSResult(ok=True, output_path=req.output_path)

    with _patch_getfile(plugin_root), \
         patch.object(plugin, "check_env", side_effect=fake_check_env), \
         patch.object(plugin, "synthesize", side_effect=fake_synthesize):
        result = plugin.run_test(settings={"mistral_api_key": "test-key"})

    assert isinstance(result, VerificationResult)
    assert result.ok is True
    assert captured["check_env_settings"] == {"mistral_api_key": "test-key"}
    assert captured["request_settings"] == {"mistral_api_key": "test-key"}


def test_run_test_defaults_settings_to_empty_dict_when_omitted(tmp_path):
    """run_test() with no settings arg still calls check_env with settings={} (not None)."""
    plugin_root = _make_isolated_plugin_dir(tmp_path)
    assets_dir = plugin_root / "assets"
    assets_dir.mkdir()
    (assets_dir / "voice.mp3").write_bytes(b"fake")

    plugin = VoxtralPlugin()
    captured = {}

    def fake_check_env(*, settings=None):
        captured["check_env_settings"] = settings
        return True, "OK"

    def fake_synthesize(req):
        Path(req.output_path).write_bytes(b"ok")
        return TTSResult(ok=True, output_path=req.output_path)

    with _patch_getfile(plugin_root), \
         patch.object(plugin, "check_env", side_effect=fake_check_env), \
         patch.object(plugin, "synthesize", side_effect=fake_synthesize):
        result = plugin.run_test()

    assert result.ok is True
    assert captured["check_env_settings"] == {}


def test_run_test_asset_search_order_prefers_wav_over_mp3(tmp_path):
    """run_test() picks the first match from ['voice.wav', 'voice.mp3', 'sample.wav', 'sample.mp3']."""
    plugin_root = _make_isolated_plugin_dir(tmp_path)
    assets_dir = plugin_root / "assets"
    assets_dir.mkdir()
    (assets_dir / "voice.mp3").write_bytes(b"fake")
    voice_wav = assets_dir / "voice.wav"
    voice_wav.write_bytes(b"fake")

    plugin = VoxtralPlugin()
    captured = {}

    def fake_synthesize(req):
        captured["voice_ref"] = req.voice_ref
        Path(req.output_path).write_bytes(b"ok")
        return TTSResult(ok=True, output_path=req.output_path)

    with _patch_getfile(plugin_root), \
         patch.object(plugin, "check_env", return_value=(True, "OK")), \
         patch.object(plugin, "synthesize", side_effect=fake_synthesize):
        result = plugin.run_test()

    assert result.ok is True
    assert captured["voice_ref"] == str(voice_wav)


def test_run_test_uses_manifest_test_text_when_present(tmp_path):
    """run_test() reads test_text from manifest.json when present."""
    plugin_root = _make_isolated_plugin_dir(tmp_path)
    assets_dir = plugin_root / "assets"
    assets_dir.mkdir()
    (assets_dir / "sample.wav").write_bytes(b"fake")
    (plugin_root / "manifest.json").write_text(
        json.dumps({"test_text": "Custom Voxtral manifest text."}), encoding="utf-8"
    )

    plugin = VoxtralPlugin()
    captured = {}

    def fake_synthesize(req):
        captured["text"] = req.text
        Path(req.output_path).write_bytes(b"ok")
        return TTSResult(ok=True, output_path=req.output_path)

    with _patch_getfile(plugin_root), \
         patch.object(plugin, "check_env", return_value=(True, "OK")), \
         patch.object(plugin, "synthesize", side_effect=fake_synthesize):
        result = plugin.run_test()

    assert result.ok is True
    assert captured["text"] == "Custom Voxtral manifest text."


def test_run_test_falls_back_to_default_text_without_manifest(tmp_path):
    """run_test() falls back to the Voxtral-specific default_text when manifest.json is absent."""
    plugin_root = _make_isolated_plugin_dir(tmp_path)
    assets_dir = plugin_root / "assets"
    assets_dir.mkdir()
    (assets_dir / "sample.mp3").write_bytes(b"fake")

    plugin = VoxtralPlugin()
    captured = {}

    def fake_synthesize(req):
        captured["text"] = req.text
        Path(req.output_path).write_bytes(b"ok")
        return TTSResult(ok=True, output_path=req.output_path)

    with _patch_getfile(plugin_root), \
         patch.object(plugin, "check_env", return_value=(True, "OK")), \
         patch.object(plugin, "synthesize", side_effect=fake_synthesize):
        result = plugin.run_test()

    assert result.ok is True
    assert captured["text"] == "This is an internal Voxtral verification test."


def test_run_test_fails_when_no_assets_present(tmp_path):
    """run_test() reports failure when none of the candidate assets exist."""
    plugin_root = _make_isolated_plugin_dir(tmp_path)
    plugin = VoxtralPlugin()

    with _patch_getfile(plugin_root), \
         patch.object(plugin, "check_env", return_value=(True, "OK")):
        result = plugin.run_test()

    assert result.ok is False
    assert "No test assets found" in result.message


def test_run_test_reports_check_env_failure_without_touching_assets(tmp_path):
    """run_test() short-circuits on a failing check_env() and never calls synthesize()."""
    plugin_root = _make_isolated_plugin_dir(tmp_path)
    plugin = VoxtralPlugin()

    with _patch_getfile(plugin_root), \
         patch.object(plugin, "check_env", return_value=(False, "Voxtral requires a Mistral API key.")), \
         patch.object(plugin, "synthesize") as mock_synthesize:
        result = plugin.run_test()

    assert result.ok is False
    assert result.message == "Voxtral requires a Mistral API key."
    mock_synthesize.assert_not_called()

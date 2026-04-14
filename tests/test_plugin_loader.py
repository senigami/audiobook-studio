"""Tests for the TTS Server plugin loader."""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest

from app.tts_server.plugin_loader import (
    PluginLoadError,
    discover_plugins,
    _PLUGIN_FOLDER_RE,
)


# ---------------------------------------------------------------------------
# Folder name validation regex
# ---------------------------------------------------------------------------

class TestFolderNameRegex:
    def test_valid_names(self):
        valid = ["tts_xtts", "tts_voxtral", "tts_ab", "tts_a12345678901234"]
        for name in valid:
            assert _PLUGIN_FOLDER_RE.match(name), f"Expected {name!r} to match"

    def test_invalid_names(self):
        invalid = [
            "xtts",
            "tts_",
            "tts_A",
            "tts_a_b",
            "tts_0invalid",
            "TTS_xtts",
            "tts_toolongnamethatexceedsmax",  # >15 chars after tts_
        ]
        for name in invalid:
            assert not _PLUGIN_FOLDER_RE.match(name), f"Expected {name!r} NOT to match"


# ---------------------------------------------------------------------------
# Manifest-based discovery
# ---------------------------------------------------------------------------

def _make_plugin_dir(tmp_path: Path, folder_name: str, manifest: dict, engine_src: str = "") -> Path:
    """Helper to create a plugin directory with a manifest."""
    plugin_dir = tmp_path / folder_name
    plugin_dir.mkdir()
    (plugin_dir / "manifest.json").write_text(
        json.dumps(manifest), encoding="utf-8"
    )
    if engine_src:
        (plugin_dir / "engine.py").write_text(
            textwrap.dedent(engine_src), encoding="utf-8"
        )
    return plugin_dir


def _minimal_manifest(engine_id="mock", entry_class="engine:MockEngine"):
    return {
        "engine_id": engine_id,
        "display_name": "Mock Engine",
        "entry_class": entry_class,
        "capabilities": ["synthesis"],
    }


def _mock_engine_src():
    return """
from app.engines.voice.sdk import TTSRequest, TTSResult
from app.engines.voice.base import StudioTTSEngine

class MockEngine(StudioTTSEngine):
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
    def settings_schema(self): return {}
"""


class TestDiscoverPlugins:
    def test_empty_plugins_dir(self, tmp_path):
        result = discover_plugins(tmp_path)
        assert result == []

    def test_missing_plugins_dir(self, tmp_path):
        result = discover_plugins(tmp_path / "nonexistent")
        assert result == []

    def test_non_plugin_folder_skipped(self, tmp_path):
        (tmp_path / "not_a_plugin").mkdir()
        result = discover_plugins(tmp_path)
        assert result == []

    def test_valid_plugin_loaded(self, tmp_path):
        _make_plugin_dir(
            tmp_path, "tts_mock",
            _minimal_manifest("mock"),
            _mock_engine_src(),
        )
        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "mock"

    def test_missing_manifest_skipped(self, tmp_path):
        plugin_dir = tmp_path / "tts_nomani"
        plugin_dir.mkdir()
        # No manifest.json
        result = discover_plugins(tmp_path)
        assert result == []

    def test_malformed_manifest_json_skipped(self, tmp_path):
        plugin_dir = tmp_path / "tts_bad"
        plugin_dir.mkdir()
        (plugin_dir / "manifest.json").write_text("NOT JSON", encoding="utf-8")
        result = discover_plugins(tmp_path)
        assert result == []

    def test_duplicate_engine_id_second_skipped(self, tmp_path):
        for folder in ["tts_first", "tts_second"]:
            _make_plugin_dir(
                tmp_path, folder,
                _minimal_manifest("same"),  # same engine_id!
                _mock_engine_src(),
            )
        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "same"

    def test_bad_plugin_does_not_block_good_plugin(self, tmp_path):
        # First plugin: bad manifest
        (tmp_path / "tts_bad").mkdir()
        (tmp_path / "tts_bad" / "manifest.json").write_text(
            json.dumps({"engine_id": "bad"}),  # missing required fields
            encoding="utf-8",
        )
        # Second plugin: good
        _make_plugin_dir(
            tmp_path, "tts_good",
            _minimal_manifest("good"),
            _mock_engine_src(),
        )
        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "good"


class TestManifestValidation:
    def test_missing_engine_id_raises(self, tmp_path):
        manifest = _minimal_manifest()
        del manifest["engine_id"]
        _make_plugin_dir(tmp_path, "tts_test", manifest)
        result = discover_plugins(tmp_path)
        assert result == []

    def test_missing_capabilities_raises(self, tmp_path):
        manifest = _minimal_manifest()
        del manifest["capabilities"]
        _make_plugin_dir(tmp_path, "tts_test", manifest)
        result = discover_plugins(tmp_path)
        assert result == []

    def test_synthesis_not_in_capabilities_raises(self, tmp_path):
        manifest = _minimal_manifest()
        manifest["capabilities"] = ["preview"]
        _make_plugin_dir(tmp_path, "tts_test", manifest)
        result = discover_plugins(tmp_path)
        assert result == []

    def test_invalid_engine_id_format_raises(self, tmp_path):
        manifest = _minimal_manifest("INVALID_ID")
        _make_plugin_dir(tmp_path, "tts_test", manifest)
        result = discover_plugins(tmp_path)
        assert result == []

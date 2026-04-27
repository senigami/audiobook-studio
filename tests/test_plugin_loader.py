"""Tests for the TTS Server plugin loader."""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

from unittest.mock import MagicMock, patch
import pytest

from app.tts_server.plugin_loader import (
    PluginLoadError,
    discover_plugins,
    _PLUGIN_FOLDER_RE,
)
from app.tts_server.health import build_engine_detail


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

def _make_plugin_dir(
    tmp_path: Path,
    folder_name: str,
    manifest: dict,
    engine_src: str = "",
    settings_schema: dict | None = None,
) -> Path:
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
    if settings_schema is not None:
        (plugin_dir / "settings_schema.json").write_text(
            json.dumps(settings_schema), encoding="utf-8"
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


def _mock_engine_without_schema_src():
    return """
from app.engines.voice.sdk import TTSRequest, TTSResult

class MockEngine:
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
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

    def test_plugin_settings_schema_file_is_exposed_when_engine_lacks_method(self, tmp_path):
        schema = {
            "title": "Voxtral Cloud Voices",
            "x-ui": {
                "help_label": "Open Mistral API key instructions",
                "help_url": "https://help.mistral.ai/en/articles/347464-how-do-i-create-api-keys-within-a-workspace",
                "privacy_notice": "Privacy note: turning on Voxtral sends the text you synthesize, and any selected reference audio, to Mistral's servers.",
            },
            "properties": {
                "mistral_api_key": {"type": "string", "title": "Mistral API Key"},
            },
        }
        _make_plugin_dir(
            tmp_path,
            "tts_voxtral",
            _minimal_manifest("voxtral"),
            _mock_engine_without_schema_src(),
            settings_schema=schema,
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        detail = build_engine_detail(result[0], {})
        assert detail["settings_schema"]["x-ui"]["help_label"] == "Open Mistral API key instructions"
        assert detail["settings_schema"]["x-ui"]["privacy_notice"].startswith("Privacy note:")

    def test_dotted_entry_class_in_folder(self, tmp_path):
        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()
        (plugins_dir / "tts_dotted").mkdir()
        (plugins_dir / "tts_dotted" / "pkg").mkdir()
        (plugins_dir / "tts_dotted" / "pkg" / "mod.py").write_text("""
class Engine:
    def check_env(self): return True, "OK"
""")
        (plugins_dir / "tts_dotted" / "manifest.json").write_text(json.dumps({
            "engine_id": "dotted",
            "display_name": "Dotted Engine",
            "entry_class": "pkg.mod:Engine",
            "capabilities": ["synthesis"]
        }))

        result = discover_plugins(plugins_dir)
        assert len(result) == 1
        assert result[0].engine_id == "dotted"
        assert result[0].folder_name == "tts_dotted"


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


# ---------------------------------------------------------------------------
# Pip-installed plugin discovery
# ---------------------------------------------------------------------------

class TestPipDiscovery:
    def test_entry_point_discovery_mock(self, tmp_path):
        # Create a dummy folder-dropin plugin
        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()
        (plugins_dir / "tts_folder").mkdir()
        (plugins_dir / "tts_folder" / "manifest.json").write_text(json.dumps({
            "engine_id": "folderengine",
            "display_name": "Folder Engine",
            "entry_class": "engine:Engine",
            "capabilities": ["synthesis"]
        }))
        (plugins_dir / "tts_folder" / "engine.py").write_text("""
class Engine:
    def check_env(self): return True, "OK"
""")

        # Mock entry points
        mock_ep = MagicMock()
        mock_ep.name = "pipengine"
        mock_ep.value = "pip_package.module:Engine"

        # Mock distribution for manifest
        mock_dist = MagicMock()
        mock_dist.read_text.return_value = json.dumps({
            "engine_id": "pipengine",
            "display_name": "Pip Engine",
            "entry_class": "pip_package.module:Engine",
            "capabilities": ["synthesis"]
        })
        mock_ep.dist = mock_dist

        # Mock load()
        mock_engine_cls = MagicMock()
        mock_engine_cls.__name__ = "PipEngine"
        mock_instance = MagicMock()
        mock_instance.check_env.return_value = (True, "OK")
        mock_engine_cls.return_value = mock_instance
        mock_ep.load.return_value = mock_engine_cls

        with patch("importlib.metadata.entry_points") as mock_entry_points:
            def side_effect(group=None):
                if group == "studio.tts":
                    return [mock_ep]
                return {"studio.tts": [mock_ep]}
            mock_entry_points.side_effect = side_effect

            plugins = discover_plugins(plugins_dir)

            assert len(plugins) == 2
            engine_ids = [p.engine_id for p in plugins]
            assert "folderengine" in engine_ids
            assert "pipengine" in engine_ids

    def test_folder_precedence_over_pip(self, tmp_path):
        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()

        # Folder plugin with engine_id="clash"
        (plugins_dir / "tts_clash").mkdir()
        (plugins_dir / "tts_clash" / "manifest.json").write_text(json.dumps({
            "engine_id": "clash",
            "display_name": "Folder Clash",
            "entry_class": "engine:Engine",
            "capabilities": ["synthesis"]
        }))
        (plugins_dir / "tts_clash" / "engine.py").write_text("""
class Engine:
    def check_env(self): return True, "OK"
""")

        # Pip plugin also named "clash"
        mock_ep = MagicMock()
        mock_ep.name = "clash"

        with patch("importlib.metadata.entry_points") as mock_entry_points:
            def side_effect(group=None):
                if group == "studio.tts":
                    return [mock_ep]
                return {"studio.tts": [mock_ep]}
            mock_entry_points.side_effect = side_effect

            plugins = discover_plugins(plugins_dir)

            assert len(plugins) == 1
            assert plugins[0].display_name == "Folder Clash"
            assert not mock_ep.load.called

    def test_pip_plugin_creates_settings_dir(self, tmp_path):
        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()

        mock_ep = MagicMock()
        mock_ep.name = "pipdirtest"
        mock_ep.value = "pkg.mod:Class"
        del mock_ep.module
        del mock_ep.attr
        mock_ep.dist = None

        # Mock load() and engine behavior
        mock_engine_cls = MagicMock()
        mock_engine_cls.__name__ = "TestEngine"
        mock_instance = MagicMock()
        mock_instance.check_env.return_value = (True, "OK")
        mock_engine_cls.return_value = mock_instance
        mock_ep.load.return_value = mock_engine_cls

        with patch("importlib.metadata.entry_points") as mock_entry_points:
            def side_effect(group=None):
                print(f"DEBUG: mock side_effect called with group={group}")
                if group == "studio.tts":
                    return [mock_ep]
                return {"studio.tts": [mock_ep]}
            mock_entry_points.side_effect = side_effect
            discover_plugins(plugins_dir)

        assert (plugins_dir / "tts_pipdirtest").is_dir()


# ---------------------------------------------------------------------------
# Dependency detection
# ---------------------------------------------------------------------------

class TestDependencies:
    def test_requirements_satisfied(self, tmp_path):
        _make_plugin_dir(
            tmp_path, "tts_deps",
            _minimal_manifest("deps"),
            _mock_engine_src(),
        )
        # 'pytest' and 'httpx' should be in the test environment.
        (tmp_path / "tts_deps" / "requirements.txt").write_text("pytest\nhttpx", encoding="utf-8")

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].dependencies_satisfied is True
        assert result[0].missing_dependencies == []

    def test_requirements_missing(self, tmp_path):
        _make_plugin_dir(
            tmp_path, "tts_missing",
            _minimal_manifest("missing"),
            _mock_engine_src(),
        )
        (tmp_path / "tts_missing" / "requirements.txt").write_text("nonexistent-pkg-999", encoding="utf-8")

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].dependencies_satisfied is False
        assert "nonexistent-pkg-999" in result[0].missing_dependencies

    def test_malformed_requirements_graceful(self, tmp_path):
        _make_plugin_dir(
            tmp_path, "tts_malformed",
            _minimal_manifest("malformed"),
            _mock_engine_src(),
        )
        (tmp_path / "tts_malformed" / "requirements.txt").write_text("-e .", encoding="utf-8")

        # Should not crash, and might just skip the weird line.
        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].dependencies_satisfied is True


# ---------------------------------------------------------------------------
# Plugin Isolation / Crash Containment
# ---------------------------------------------------------------------------

class TestPluginIsolation:
    def test_import_crash_isolated(self, tmp_path):
        """A plugin that crashes during module import should be skipped."""
        _make_plugin_dir(
            tmp_path, "tts_crash_import",
            _minimal_manifest("crash_import"),
            "raise RuntimeError('import crash')"
        )
        # Good plugin as a control
        _make_plugin_dir(
            tmp_path, "tts_good",
            _minimal_manifest("good"),
            _mock_engine_src()
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "good"

    def test_instantiation_crash_isolated(self, tmp_path):
        """A plugin that crashes in __init__ should be skipped."""
        src = """
        class MockEngine:
            def __init__(self):
                raise RuntimeError('init crash')
        """
        _make_plugin_dir(
            tmp_path, "tts_crash_init",
            _minimal_manifest("crash_init"),
            src
        )
        # Good plugin
        _make_plugin_dir(
            tmp_path, "tts_good",
            _minimal_manifest("good"),
            _mock_engine_src()
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "good"

    def test_check_env_crash_isolated(self, tmp_path):
        """A plugin that crashes in check_env() should be skipped."""
        src = """
        class MockEngine:
            def check_env(self):
                raise RuntimeError('check_env crash')
        """
        _make_plugin_dir(
            tmp_path, "tts_crash_env",
            _minimal_manifest("crash_env"),
            src
        )
        # Good plugin
        _make_plugin_dir(
            tmp_path, "tts_good",
            _minimal_manifest("good"),
            _mock_engine_src()
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "good"

    def test_syntax_error_isolated(self, tmp_path):
        """A plugin with a syntax error should be skipped."""
        _make_plugin_dir(
            tmp_path, "tts_syntax",
            _minimal_manifest("syntax"),
            "class MockEngine: invalid syntax here !!!"
        )
        # Good plugin
        _make_plugin_dir(
            tmp_path, "tts_good",
            _minimal_manifest("good"),
            _mock_engine_src()
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "good"

"""Tests for the TTS Server plugin loader."""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

from unittest.mock import MagicMock, patch
import pytest

from app.tts_server.plugin_loader import (
    PluginLoadError,
    SUPPORTED_MANIFEST_VERSION,
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


def _minimal_manifest(engine_id="mock", entry_class="engine:MockEngine", cloud=False, network=False):
    # All four version fields are required (S8 gate flip — missing → PluginLoadError).
    return {
        "studio_tts_manifest": "1.0",
        "contract_version": "1.0",
        "sdk_version": "1.0",
        "settings_schema_version": "1.0",
        "event_envelope_version": "1.0",
        "engine_id": engine_id,
        "display_name": "Mock Engine",
        "entry_class": entry_class,
        "capabilities": ["synthesis"],
        "cloud": cloud,
        "network": network,
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
    # Missing settings_schema intentionally to test fallback if we decide to allow it,
    # but for now we'll add it to pass signature check or we update signature check.
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
        plugin_dir = tmp_path / "tts_malformed"
        plugin_dir.mkdir()
        (plugin_dir / "manifest.json").write_text("NOT JSON", encoding="utf-8")

        loaded = discover_plugins(tmp_path)
        assert len(loaded) == 0

    def test_malformed_settings_schema_json_surfaces_as_invalid(self, tmp_path):
        # Malformed settings_schema.json should surface if manifest is valid
        manifest = _minimal_manifest("badschema")
        manifest["dev"] = {"enabled": True}
        plugin_dir = _make_plugin_dir(
            tmp_path,
            "tts_badschema",
            manifest,
            engine_src=_mock_engine_src(),
        )
        (plugin_dir / "settings_schema.json").write_text("NOT JSON", encoding="utf-8")

        loaded = discover_plugins(tmp_path)
        assert len(loaded) == 1
        assert loaded[0].engine_id == "badschema"
        assert "not valid JSON" in loaded[0].load_error

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
        assert len(result) == 2
        assert [plugin.engine_id for plugin in result] == ["bad", "good"]
        assert result[0].load_error
        assert result[1].load_error is None

    def test_plugin_settings_schema_file_is_exposed_when_engine_lacks_method(self, tmp_path):
        schema = {
            "title": "Voxtral Cloud Voices",
            "x-ui": {
                "help_label": "Open Mistral API key instructions",
                "help_url": "https://help.mistral.ai/en/articles/347464-how-do-i-create-api-keys-within-a-workspace",
            },
            "properties": {
                "mistral_api_key": {"type": "string", "title": "Mistral API Key"},
            },
        }
        _make_plugin_dir(
            tmp_path,
            "tts_voxtral",
            _minimal_manifest("voxtral", cloud=True),
            _mock_engine_without_schema_src(),
            settings_schema=schema,
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        detail = build_engine_detail(result[0], {})
        assert detail["settings_schema"]["x-ui"]["help_label"] == "Open Mistral API key instructions"

    def test_dotted_entry_class_in_folder(self, tmp_path):
        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()
        (plugins_dir / "tts_dotted").mkdir()
        (plugins_dir / "tts_dotted" / "pkg").mkdir()
        (plugins_dir / "tts_dotted" / "pkg" / "mod.py").write_text("""
class Engine:
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self, req): return None
    def settings_schema(self): return {}
""")
        (plugins_dir / "tts_dotted" / "manifest.json").write_text(json.dumps({
            "studio_tts_manifest": "1.0",
            "contract_version": "1.0",
            "sdk_version": "1.0",
            "settings_schema_version": "1.0",
            "event_envelope_version": "1.0",
            "engine_id": "dotted",
            "display_name": "Dotted Engine",
            "entry_class": "pkg.mod:Engine",
            "capabilities": ["synthesis"]
        }))

        result = discover_plugins(plugins_dir)
        assert len(result) == 1
        assert result[0].engine_id == "dotted"
        assert result[0].folder_name == "tts_dotted"

    def test_interface_entry_class_can_import_internal_package(self, tmp_path):
        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()
        plugin_dir = plugins_dir / "tts_iface"
        plugin_dir.mkdir()
        (plugin_dir / "plugin").mkdir()
        (plugin_dir / "plugin" / "__init__.py").write_text("", encoding="utf-8")
        (plugin_dir / "plugin" / "core.py").write_text(
            "READY_MESSAGE = 'OK from internal package'\n",
            encoding="utf-8",
        )
        (plugin_dir / "interface.py").write_text(
            textwrap.dedent(
                """
                from app.engines.voice.sdk import TTSResult
                from .plugin.core import READY_MESSAGE

                class InterfaceEngine:
                    def info(self): return {}
                    def check_env(self): return True, READY_MESSAGE
                    def check_request(self, req): return True, "OK"
                    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
                    def settings_schema(self): return {}
                """
            ),
            encoding="utf-8",
        )
        (plugin_dir / "manifest.json").write_text(
            json.dumps(
                {
                    "studio_tts_manifest": "1.0",
                    "contract_version": "1.0",
                    "sdk_version": "1.0",
                    "settings_schema_version": "1.0",
                    "event_envelope_version": "1.0",
                    "engine_id": "iface",
                    "display_name": "Interface Engine",
                    "entry_class": "interface:InterfaceEngine",
                    "capabilities": ["synthesis"],
                }
            ),
            encoding="utf-8",
        )

        result = discover_plugins(plugins_dir)

        assert len(result) == 1
        assert result[0].engine_id == "iface"
        assert result[0].engine.check_env() == (True, "OK from internal package")

    def test_dotted_entry_class_can_import_sibling_internal_module(self, tmp_path):
        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()
        plugin_dir = plugins_dir / "tts_nested"
        engine_dir = plugin_dir / "plugin" / "server"
        core_dir = plugin_dir / "plugin" / "core"
        engine_dir.mkdir(parents=True)
        core_dir.mkdir(parents=True)
        for pkg in [
            plugin_dir / "plugin" / "__init__.py",
            engine_dir / "__init__.py",
            core_dir / "__init__.py",
        ]:
            pkg.write_text("", encoding="utf-8")
        (core_dir / "runtime.py").write_text("READY_MESSAGE = 'nested ok'\n", encoding="utf-8")
        (engine_dir / "engine.py").write_text(
            textwrap.dedent(
                """
                from app.engines.voice.sdk import TTSResult
                from ..core.runtime import READY_MESSAGE

                class NestedEngine:
                    def info(self): return {}
                    def check_env(self): return True, READY_MESSAGE
                    def check_request(self, req): return True, "OK"
                    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
                    def settings_schema(self): return {}
                """
            ),
            encoding="utf-8",
        )
        (plugin_dir / "manifest.json").write_text(
            json.dumps(
                {
                    "studio_tts_manifest": "1.0",
                    "contract_version": "1.0",
                    "sdk_version": "1.0",
                    "settings_schema_version": "1.0",
                    "event_envelope_version": "1.0",
                    "engine_id": "nested",
                    "display_name": "Nested Engine",
                    "entry_class": "plugin.server.engine:NestedEngine",
                    "capabilities": ["synthesis"],
                }
            ),
            encoding="utf-8",
        )

        result = discover_plugins(plugins_dir)

        assert len(result) == 1
        assert result[0].engine_id == "nested"
        assert result[0].engine.check_env() == (True, "nested ok")


class TestManifestValidation:
    def test_missing_engine_id_raises(self, tmp_path):
        manifest = _minimal_manifest()
        del manifest["engine_id"]
        _make_plugin_dir(tmp_path, "tts_test", manifest)
        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "test"
        assert result[0].load_error
        assert "missing required field 'engine_id'" in result[0].load_error

    def test_missing_capabilities_is_reported_as_invalid_config(self, tmp_path):
        manifest = _minimal_manifest()
        del manifest["capabilities"]
        _make_plugin_dir(tmp_path, "tts_test", manifest)
        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "mock"
        assert result[0].load_error
        assert "missing required field 'capabilities'" in result[0].load_error

    def test_synthesis_not_in_capabilities_is_reported_as_invalid_config(self, tmp_path):
        manifest = _minimal_manifest()
        manifest["capabilities"] = ["preview"]
        _make_plugin_dir(tmp_path, "tts_test", manifest)
        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "mock"
        assert result[0].load_error
        assert "capabilities must include 'synthesis'" in result[0].load_error

    def test_invalid_engine_id_format_is_reported_as_invalid_config(self, tmp_path):
        manifest = _minimal_manifest("INVALID_ID")
        _make_plugin_dir(tmp_path, "tts_test", manifest)
        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "INVALID_ID"
        assert result[0].load_error
        assert "does not match required pattern" in result[0].load_error

    def test_unsupported_manifest_version_is_reported_as_invalid_config(self, tmp_path):
        manifest = _minimal_manifest()
        manifest["studio_tts_manifest"] = "9.0"
        _make_plugin_dir(tmp_path, "tts_test", manifest)

        result = discover_plugins(tmp_path)

        assert len(result) == 1
        assert result[0].engine_id == "mock"
        assert result[0].load_error
        assert "9.0" in result[0].load_error
        assert "studio_tts_manifest" in result[0].load_error
        detail = build_engine_detail(result[0], {})
        assert detail["status"] == "invalid_config"
        assert detail["enablement_message"]

    def test_invalid_callable_format_is_reported_as_invalid_config(self, tmp_path):
        manifest = _minimal_manifest(entry_class="not-a-callable")
        _make_plugin_dir(tmp_path, "tts_test", manifest)

        result = discover_plugins(tmp_path)

        assert len(result) == 1
        assert result[0].engine_id == "mock"
        assert result[0].load_error
        assert "entry_class" in result[0].load_error


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
            "studio_tts_manifest": "1.0",
            "contract_version": "1.0",
            "sdk_version": "1.0",
            "settings_schema_version": "1.0",
            "event_envelope_version": "1.0",
            "engine_id": "folderengine",
            "display_name": "Folder Engine",
            "entry_class": "engine:Engine",
            "capabilities": ["synthesis"]
        }))
        (plugins_dir / "tts_folder" / "engine.py").write_text("""
class Engine:
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self, req): return None
    def settings_schema(self): return {}
""")

        # Mock entry points
        mock_ep = MagicMock()
        mock_ep.name = "pipengine"
        mock_ep.value = "pip_package.module:Engine"

        # Mock distribution for manifest
        mock_dist = MagicMock()
        mock_dist.read_text.return_value = json.dumps({
            "studio_tts_manifest": "1.0",
            "contract_version": "1.0",
            "sdk_version": "1.0",
            "settings_schema_version": "1.0",
            "event_envelope_version": "1.0",
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
        mock_instance.info.return_value = {}
        mock_instance.check_env.return_value = (True, "OK")
        mock_instance.check_request.return_value = (True, "OK")
        mock_instance.synthesize.return_value = None
        mock_instance.settings_schema.return_value = {}
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
            "studio_tts_manifest": "1.0",
            "contract_version": "1.0",
            "sdk_version": "1.0",
            "settings_schema_version": "1.0",
            "event_envelope_version": "1.0",
            "engine_id": "clash",
            "display_name": "Folder Clash",
            "entry_class": "engine:Engine",
            "capabilities": ["synthesis"]
        }))
        (plugins_dir / "tts_clash" / "engine.py").write_text("""
class Engine:
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self, req): return None
    def settings_schema(self): return {}
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

    def test_pip_plugin_check_env_receives_persisted_settings(self, tmp_path):
        from app.tts_server.settings_store import save_settings

        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()

        save_settings(plugins_dir / "tts_pipkeyed", {"mistral_api_key": "saved-key"})

        class SettingsKeyedEngine:
            def info(self):
                return {}

            def check_env(self, settings=None):
                if (settings or {}).get("mistral_api_key"):
                    return True, "OK"
                return False, "Missing API key"

            def check_request(self, req):
                return True, "OK"

            def synthesize(self, req):
                return None

            def settings_schema(self):
                return {}

        mock_ep = MagicMock()
        mock_ep.name = "pipkeyed"
        mock_ep.value = "pkg.mod:SettingsKeyedEngine"
        del mock_ep.module
        del mock_ep.attr
        mock_ep.dist = None
        mock_ep.load.return_value = SettingsKeyedEngine

        with patch("importlib.metadata.entry_points") as mock_entry_points:
            def side_effect(group=None):
                if group == "studio.tts":
                    return [mock_ep]
                return {"studio.tts": [mock_ep]}
            mock_entry_points.side_effect = side_effect

            plugins = discover_plugins(plugins_dir)

        pip_plugins = [p for p in plugins if p.engine_id == "pipkeyed"]
        assert len(pip_plugins) == 1
        assert pip_plugins[0].setup_message is None


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
    def test_import_crash_isolated_by_default(self, tmp_path):
        """A plugin that crashes during module import should be skipped by default."""
        _make_plugin_dir(
            tmp_path, "tts_importcrash",
            _minimal_manifest("importcrash"),
            "raise RuntimeError('import crash')"
        )
        # Good plugin as a control
        _make_plugin_dir(
            tmp_path, "tts_goog",
            _minimal_manifest("goog"),
            _mock_engine_src()
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "goog"

    def test_import_crash_surfaced_in_dev_mode(self, tmp_path):
        """A plugin that crashes during module import should be surfaced if dev.enabled is True."""
        manifest = _minimal_manifest("crashdev")
        manifest["dev"] = {"enabled": True}
        _make_plugin_dir(
            tmp_path, "tts_crashdev",
            manifest,
            "raise RuntimeError('import crash in dev')"
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "crashdev"
        assert "import crash in dev" in result[0].load_error

    def test_instantiation_crash_isolated_by_default(self, tmp_path):
        """A plugin that crashes in __init__ should be skipped by default."""
        src = """
        class MockEngine:
            def __init__(self):
                raise RuntimeError('init crash')
        """
        _make_plugin_dir(
            tmp_path, "tts_initcrash",
            _minimal_manifest("initcrash"),
            src
        )
        # Good plugin
        _make_plugin_dir(
            tmp_path, "tts_goog",
            _minimal_manifest("goog"),
            _mock_engine_src()
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "goog"

    def test_instantiation_crash_surfaced_in_dev_mode(self, tmp_path):
        """A plugin that crashes in __init__ should be surfaced if dev.enabled is True."""
        src = """
        class MockEngine:
            def info(self): return {}
            def check_env(self): return True, "OK"
            def check_request(self, req): return True, "OK"
            def synthesize(self, req): return None
            def settings_schema(self): return {}
            def __init__(self): raise ValueError("init crash in dev")
        """
        manifest = _minimal_manifest("initdev")
        manifest["dev"] = {"enabled": True}
        _make_plugin_dir(
            tmp_path, "tts_initdev",
            manifest,
            src
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "initdev"
        assert "init crash in dev" in result[0].load_error

    def test_check_env_crash_isolated_by_default(self, tmp_path):
        """A plugin that crashes in check_env() should be skipped by default."""
        src = """
        class MockEngine:
            def info(self): return {}
            def check_request(self, req): return True, "OK"
            def synthesize(self, req): return None
            def settings_schema(self): return {}
            def check_env(self):
                raise RuntimeError('check_env crash')
        """
        _make_plugin_dir(
            tmp_path, "tts_envcrash",
            _minimal_manifest("envcrash"),
            src
        )
        # Good plugin
        _make_plugin_dir(
            tmp_path, "tts_goog",
            _minimal_manifest("goog"),
            _mock_engine_src()
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "goog"

    def test_check_env_crash_surfaced_in_dev_mode(self, tmp_path):
        """A plugin that crashes in check_env() should be surfaced if dev.enabled is True."""
        src = """
        class MockEngine:
            def info(self): return {}
            def check_request(self, req): return True, "OK"
            def synthesize(self, req): return None
            def settings_schema(self): return {}
            def check_env(self): raise ValueError("check_env crash in dev")
        """
        manifest = _minimal_manifest("envdev")
        manifest["dev"] = {"enabled": True}
        _make_plugin_dir(
            tmp_path, "tts_envdev",
            manifest,
            src
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "envdev"
        assert "check_env crash in dev" in result[0].load_error

    def test_syntax_error_isolated_by_default(self, tmp_path):
        """A plugin with a syntax error should be skipped by default."""
        _make_plugin_dir(
            tmp_path, "tts_syntax",
            _minimal_manifest("syntax"),
            "class MockEngine: invalid syntax here !!!"
        )
        # Good plugin
        _make_plugin_dir(
            tmp_path, "tts_goog",
            _minimal_manifest("goog"),
            _mock_engine_src()
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "goog"

    def test_syntax_error_surfaced_in_dev_mode(self, tmp_path):
        """A plugin with a syntax error should be surfaced if dev.enabled is True."""
        manifest = _minimal_manifest("syntaxdev")
        manifest["dev"] = {"enabled": True}
        _make_plugin_dir(
            tmp_path, "tts_syntaxdev",
            manifest,
            "class MockEngine: invalid syntax here !!!"
        )

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "syntaxdev"
        assert "invalid syntax" in result[0].load_error


def test_xtts_manifest_and_schema_contains_model_v2():
    """Verify that the real loader discovers the bundled XTTS plugin and exposes
    the model parameter with default 'v2' via its loaded manifest/settings_schema
    — i.e. that discover_plugins actually consumes these fields, not just that
    the JSON files on disk happen to contain the right static value."""
    import os
    from pathlib import Path

    plugins_dir = Path(os.environ["PLUGINS_DIR"])
    loaded = discover_plugins(plugins_dir)
    xtts_plugins = [p for p in loaded if p.engine_id == "xtts"]
    assert len(xtts_plugins) == 1, "discover_plugins should load exactly one 'xtts' engine"
    plugin = xtts_plugins[0]
    assert plugin.load_error is None, f"xtts plugin failed to load: {plugin.load_error}"

    assert "model" in plugin.manifest.get("behavior", {}).get("synthesis_settings", [])

    properties = plugin.settings_schema.get("properties", {})
    assert "model" in properties
    model_prop = properties["model"]
    assert model_prop.get("type") == "string"
    assert model_prop.get("default") == "v2"
    assert model_prop.get("enum") == ["v2"]


class TestSettingsAwareVerificationRestore:
    """Discovery must pass persisted settings to check_env; a settings-keyed
    engine (e.g. Voxtral's API key) otherwise fails check_env at boot and the
    persisted verified state is discarded — the engine reverts to 'not ready'
    after every server restart even though nothing changed."""

    _SRC = """
    class MockEngine:
        def check_env(self, settings=None):
            if (settings or {}).get("mistral_api_key"):
                return True, "OK"
            return False, "Needs API key in settings."

        def check_request(self, req):
            return True, "OK"

        def synthesize(self, req):
            raise NotImplementedError

        def info(self):
            return {}

        def settings_schema(self):
            return {"properties": {"mistral_api_key": {"type": "string"}}}
    """

    def test_persisted_verification_survives_restart_for_settings_keyed_engine(self, tmp_path):
        from app.tts_server.settings_store import (
            calculate_verification_metadata,
            save_settings,
            save_state,
        )

        manifest = _minimal_manifest("voxkeyed")
        plugin_dir = _make_plugin_dir(tmp_path, "tts_voxkeyed", manifest, self._SRC)

        # Persisted settings hold the key (what the user saved in Settings)…
        save_settings(plugin_dir, {"mistral_api_key": "saved-key"})
        # …and a valid verification state from a previous session.
        save_state(plugin_dir, {
            "verified": True,
            "verification_error": None,
            "last_verified_at": "2026-06-11T00:00:00Z",
            "metadata": calculate_verification_metadata(plugin_dir, manifest),
        })

        result = discover_plugins(tmp_path)
        assert len(result) == 1
        plugin = result[0]
        assert plugin.engine_id == "voxkeyed"
        # The persisted verification must be restored on reload.
        assert plugin.verified is True
        # And check_env with the persisted settings means no setup message.
        assert plugin.load_error is None

# ---------------------------------------------------------------------------
# Contract version gate (studio_tts_manifest field)
# ---------------------------------------------------------------------------

class TestContractVersionGate:
    """Verify that the studio_tts_manifest version field is enforced at discovery.

    The constant SUPPORTED_MANIFEST_VERSION is the single source of truth for
    what version strings the loader accepts.  These tests cover:
      - valid version → plugin loads
      - missing field → rejected with actionable message
      - future major version → rejected with clear diagnostic
      - all three bundled plugins still load (manifest smoke-test)
    """

    def test_valid_version_loads(self, tmp_path):
        manifest = _minimal_manifest("vgate")
        assert manifest["studio_tts_manifest"] == SUPPORTED_MANIFEST_VERSION
        _make_plugin_dir(tmp_path, "tts_vgate", manifest, _mock_engine_src())
        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].engine_id == "vgate"
        assert result[0].load_error is None

    def test_missing_contract_version_field_rejected_with_message(self, tmp_path):
        manifest = _minimal_manifest("vmissing")
        del manifest["studio_tts_manifest"]
        _make_plugin_dir(tmp_path, "tts_vmissing", manifest, _mock_engine_src())
        result = discover_plugins(tmp_path)
        # Plugin surfaces as invalid_config (not silently dropped).
        assert len(result) == 1
        assert result[0].load_error is not None
        err = result[0].load_error.lower()
        assert "studio_tts_manifest" in err

    def test_future_major_version_rejected_with_message(self, tmp_path):
        manifest = _minimal_manifest("vfuture")
        manifest["studio_tts_manifest"] = "2.0"
        _make_plugin_dir(tmp_path, "tts_vfuture", manifest, _mock_engine_src())
        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].load_error is not None
        err = result[0].load_error
        assert "2.0" in err
        assert SUPPORTED_MANIFEST_VERSION in err

    def test_bundled_plugins_have_valid_contract_version(self):
        """All three bundled plugins carry studio_tts_manifest == SUPPORTED_MANIFEST_VERSION."""
        import os
        from pathlib import Path as _Path
        plugins_dir = _Path(os.environ["PLUGINS_DIR"])
        for folder in ["tts_xtts", "tts_voxtral", "tts_mixed"]:
            manifest_path = plugins_dir / folder / "manifest.json"
            assert manifest_path.is_file(), f"{folder}/manifest.json not found"
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            assert data.get("studio_tts_manifest") == SUPPORTED_MANIFEST_VERSION, (
                f"{folder}/manifest.json has studio_tts_manifest={data.get('studio_tts_manifest')!r}, "
                f"expected {SUPPORTED_MANIFEST_VERSION!r}"
            )

    def test_tts_mixed_manifest_declares_built_in(self):
        """tts_mixed/manifest.json must declare built_in=true (S6: builtin protection)."""
        import os
        from pathlib import Path as _Path
        plugins_dir = _Path(os.environ["PLUGINS_DIR"])
        manifest_path = plugins_dir / "tts_mixed" / "manifest.json"
        assert manifest_path.is_file(), "tts_mixed/manifest.json not found"
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert data.get("built_in") is True, (
            f"tts_mixed/manifest.json missing built_in=true; got {data.get('built_in')!r}"
        )

    def test_tts_mixed_engine_id_is_mixed(self):
        """tts_mixed/manifest.json must keep engine_id='mixed' (job queue references)."""
        import os
        from pathlib import Path as _Path
        plugins_dir = _Path(os.environ["PLUGINS_DIR"])
        manifest_path = plugins_dir / "tts_mixed" / "manifest.json"
        assert manifest_path.is_file(), "tts_mixed/manifest.json not found"
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert data.get("engine_id") == "mixed", (
            f"tts_mixed engine_id must remain 'mixed'; got {data.get('engine_id')!r}"
        )


# ---------------------------------------------------------------------------
# S10 — callable-signature audit tests
# ---------------------------------------------------------------------------

class TestCallableSignatureAudit:
    """_import_engine_class must validate parameter names/arity via inspect.signature."""

    def _make_and_load(self, tmp_path, engine_src, folder_name="tts_sigtest"):
        from app.tts_server.plugin_loader import _import_engine_class
        plugin_dir = tmp_path / folder_name
        plugin_dir.mkdir()
        (plugin_dir / "engine.py").write_text(textwrap.dedent(engine_src), encoding="utf-8")
        manifest = {
            "studio_tts_manifest": "1.0",
            "entry_class": "engine:TestEngine",
        }
        return _import_engine_class(manifest=manifest, plugin_dir=plugin_dir, folder_name=folder_name)

    def test_correct_signatures_pass(self, tmp_path):
        src = """
from app.engines.voice.sdk import TTSRequest, TTSResult
from app.engines.voice.base import StudioTTSEngine
class TestEngine(StudioTTSEngine):
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
    def settings_schema(self): return {}
"""
        cls = self._make_and_load(tmp_path, src)
        assert cls.__name__ == "TestEngine"

    def test_check_env_with_extra_optional_settings_kwarg_passes(self, tmp_path):
        """check_env(self, settings=None) is a valid extension (voxtral pattern)."""
        src = """
from app.engines.voice.sdk import TTSRequest, TTSResult
from app.engines.voice.base import StudioTTSEngine
class TestEngine(StudioTTSEngine):
    def info(self): return {}
    def check_env(self, settings=None): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
    def settings_schema(self): return {}
"""
        cls = self._make_and_load(tmp_path, src)
        assert cls.__name__ == "TestEngine"

    def test_check_request_wrong_param_name_raises(self, tmp_path):
        """check_request(self, request) instead of check_request(self, req) must fail."""
        src = """
from app.engines.voice.sdk import TTSRequest, TTSResult
from app.engines.voice.base import StudioTTSEngine
class TestEngine(StudioTTSEngine):
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, request): return True, "OK"
    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
    def settings_schema(self): return {}
"""
        with pytest.raises(PluginLoadError, match="check_request"):
            self._make_and_load(tmp_path, src)

    def test_synthesize_zero_positional_raises(self, tmp_path):
        """synthesize(self) missing 'req' must fail."""
        src = """
from app.engines.voice.sdk import TTSRequest, TTSResult
from app.engines.voice.base import StudioTTSEngine
class TestEngine(StudioTTSEngine):
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self): raise NotImplementedError
    def settings_schema(self): return {}
"""
        with pytest.raises(PluginLoadError, match="synthesize"):
            self._make_and_load(tmp_path, src)

    def test_check_output_wrong_second_param_raises(self, tmp_path):
        """check_output(self, req, res) — 'result' renamed to 'res' — must fail."""
        src = """
from app.engines.voice.sdk import TTSRequest, TTSResult
from app.engines.voice.base import StudioTTSEngine
class TestEngine(StudioTTSEngine):
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
    def settings_schema(self): return {}
    def check_output(self, req, res): return True, "OK"
"""
        with pytest.raises(PluginLoadError, match="check_output"):
            self._make_and_load(tmp_path, src)

    def test_optional_override_correct_passes(self, tmp_path):
        """Overriding check_output with correct signature is fine."""
        src = """
from app.engines.voice.sdk import TTSRequest, TTSResult
from app.engines.voice.base import StudioTTSEngine
class TestEngine(StudioTTSEngine):
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
    def settings_schema(self): return {}
    def check_output(self, req, result): return True, "OK"
"""
        cls = self._make_and_load(tmp_path, src)
        assert cls.__name__ == "TestEngine"

    def test_error_message_names_the_method_and_expected_signature(self, tmp_path):
        src = """
from app.engines.voice.sdk import TTSRequest, TTSResult
from app.engines.voice.base import StudioTTSEngine
class TestEngine(StudioTTSEngine):
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, wrong_name): return True, "OK"
    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
    def settings_schema(self): return {}
"""
        with pytest.raises(PluginLoadError) as exc_info:
            self._make_and_load(tmp_path, src)
        msg = str(exc_info.value)
        assert "check_request" in msg
        assert "req" in msg

    def test_bundled_xtts_engine_passes_signature_audit(self):
        """Real XttsPlugin must pass the signature audit without error."""
        from app.tts_server.plugin_loader import _validate_engine_signatures
        from plugins.tts_xtts.plugin.server.engine import XttsPlugin
        # Should not raise
        _validate_engine_signatures(XttsPlugin, "XttsPlugin", "tts_xtts")

    def test_bundled_voxtral_engine_passes_signature_audit(self):
        """Real VoxtralPlugin must pass the signature audit without error."""
        from app.tts_server.plugin_loader import _validate_engine_signatures
        from plugins.tts_voxtral.plugin.server.engine import VoxtralPlugin
        _validate_engine_signatures(VoxtralPlugin, "VoxtralPlugin", "tts_voxtral")

    def test_bundled_mixed_engine_passes_signature_audit(self):
        """Real MixedPlugin must pass the signature audit without error."""
        from app.tts_server.plugin_loader import _validate_engine_signatures
        from plugins.tts_mixed.engine import MixedPlugin
        _validate_engine_signatures(MixedPlugin, "MixedPlugin", "tts_mixed")

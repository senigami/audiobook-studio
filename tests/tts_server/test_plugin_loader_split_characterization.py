"""Characterization tests for the plugin_loader.py -> plugin_manifest.py split.

Written BEFORE the split (Task 001 of simplification-005) to pin down the
current observable behavior of ``discover_plugins``, ``_load_plugin``,
``_validate_manifest``, and ``_import_engine_class``. These must pass
identically before and after the functions are moved: the manifest-parsing
functions (``_load_manifest``, ``_validate_manifest``, ``_load_optional_json``,
``_check_dependencies``, ``get_manifest_max_concurrent_workers``) move into
``app/tts_server/plugin_manifest.py``; everything else (including
``discover_plugins``, ``_load_plugin``, ``_import_engine_class``) stays in
``app/tts_server/plugin_loader.py``.

Per R2 (mock boundaries only): no mocking of the loader/manifest modules
themselves here — only real files under tmp_path.
"""

from __future__ import annotations

import json
import textwrap

import pytest

from app.tts_server.plugin_loader import (
    PluginLoadError,
    discover_plugins,
    _import_engine_class,
    _load_plugin,
    _validate_manifest,
)


def _minimal_manifest(engine_id="charmock", entry_class="engine:CharMockEngine"):
    return {
        "studio_tts_manifest": "1.0",
        "contract_version": "1.0",
        "sdk_version": "1.0",
        "settings_schema_version": "1.0",
        "event_envelope_version": "1.0",
        "engine_id": engine_id,
        "display_name": "Characterization Mock Engine",
        "entry_class": entry_class,
        "capabilities": ["synthesis"],
    }


_ENGINE_SRC = """
from app.engines.voice.sdk import TTSResult

class CharMockEngine:
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
    def settings_schema(self): return {}
"""


def _make_plugin_dir(tmp_path, folder_name, manifest, engine_src=_ENGINE_SRC):
    plugin_dir = tmp_path / folder_name
    plugin_dir.mkdir()
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    if engine_src:
        (plugin_dir / "engine.py").write_text(textwrap.dedent(engine_src), encoding="utf-8")
    return plugin_dir


# ---------------------------------------------------------------------------
# discover_plugins
# ---------------------------------------------------------------------------


class TestDiscoverPluginsCharacterization:
    def test_discovers_valid_plugin(self, tmp_path):
        _make_plugin_dir(tmp_path, "tts_charmock", _minimal_manifest())
        result = discover_plugins(tmp_path)
        assert len(result) == 1
        plugin = result[0]
        assert plugin.engine_id == "charmock"
        assert plugin.load_error is None
        assert plugin.verified is False
        assert plugin.dependencies_satisfied is True

    def test_empty_dir_returns_empty_list(self, tmp_path):
        assert discover_plugins(tmp_path) == []

    def test_invalid_manifest_surfaces_as_load_error_entry(self, tmp_path):
        manifest = _minimal_manifest()
        del manifest["capabilities"]
        _make_plugin_dir(tmp_path, "tts_charmock", manifest)
        result = discover_plugins(tmp_path)
        assert len(result) == 1
        assert result[0].load_error is not None
        assert "capabilities" in result[0].load_error


# ---------------------------------------------------------------------------
# _load_plugin
# ---------------------------------------------------------------------------


class TestLoadPluginCharacterization:
    def test_loads_engine_and_populates_metadata(self, tmp_path):
        plugin_dir = _make_plugin_dir(tmp_path, "tts_charmock", _minimal_manifest())
        plugin = _load_plugin(plugin_dir=plugin_dir, folder_name="tts_charmock")
        assert plugin.engine_id == "charmock"
        assert plugin.engine is not None
        assert plugin.dependencies_satisfied is True
        assert plugin.missing_dependencies == []

    def test_missing_manifest_raises_plugin_load_error(self, tmp_path):
        plugin_dir = tmp_path / "tts_nomani"
        plugin_dir.mkdir()
        with pytest.raises(PluginLoadError, match="manifest.json not found"):
            _load_plugin(plugin_dir=plugin_dir, folder_name="tts_nomani")

    def test_invalid_manifest_raises_plugin_load_error(self, tmp_path):
        manifest = _minimal_manifest()
        del manifest["engine_id"]
        plugin_dir = _make_plugin_dir(tmp_path, "tts_charmock", manifest)
        with pytest.raises(PluginLoadError, match="engine_id"):
            _load_plugin(plugin_dir=plugin_dir, folder_name="tts_charmock")

    def test_missing_dependencies_surface_on_loaded_plugin(self, tmp_path):
        plugin_dir = _make_plugin_dir(tmp_path, "tts_charmock", _minimal_manifest())
        (plugin_dir / "requirements.txt").write_text("nonexistent-pkg-999", encoding="utf-8")
        plugin = _load_plugin(plugin_dir=plugin_dir, folder_name="tts_charmock")
        assert plugin.dependencies_satisfied is False
        assert "nonexistent-pkg-999" in plugin.missing_dependencies


# ---------------------------------------------------------------------------
# _validate_manifest
# ---------------------------------------------------------------------------


class TestValidateManifestCharacterization:
    def test_valid_manifest_does_not_raise(self):
        _validate_manifest(manifest=_minimal_manifest(), folder_name="tts_charmock")

    def test_missing_required_field_raises(self):
        manifest = _minimal_manifest()
        del manifest["display_name"]
        with pytest.raises(PluginLoadError, match="display_name"):
            _validate_manifest(manifest=manifest, folder_name="tts_charmock")

    def test_unsupported_manifest_version_raises(self):
        manifest = _minimal_manifest()
        manifest["studio_tts_manifest"] = "9.9"
        with pytest.raises(PluginLoadError, match="studio_tts_manifest"):
            _validate_manifest(manifest=manifest, folder_name="tts_charmock")

    def test_invalid_engine_id_pattern_raises(self):
        manifest = _minimal_manifest(engine_id="INVALID")
        with pytest.raises(PluginLoadError, match="engine_id"):
            _validate_manifest(manifest=manifest, folder_name="tts_charmock")

    def test_invalid_entry_class_format_raises(self):
        manifest = _minimal_manifest(entry_class="not-a-callable")
        with pytest.raises(PluginLoadError, match="entry_class"):
            _validate_manifest(manifest=manifest, folder_name="tts_charmock")

    def test_missing_synthesis_capability_raises(self):
        manifest = _minimal_manifest()
        manifest["capabilities"] = ["preview"]
        with pytest.raises(PluginLoadError, match="synthesis"):
            _validate_manifest(manifest=manifest, folder_name="tts_charmock")

    def test_missing_version_field_raises(self):
        manifest = _minimal_manifest()
        del manifest["contract_version"]
        with pytest.raises(PluginLoadError, match="contract_version"):
            _validate_manifest(manifest=manifest, folder_name="tts_charmock")

    def test_invalid_max_concurrent_workers_raises(self):
        manifest = _minimal_manifest()
        manifest["behavior"] = {"max_concurrent_workers": 0}
        with pytest.raises(PluginLoadError, match="max_concurrent_workers"):
            _validate_manifest(manifest=manifest, folder_name="tts_charmock")


# ---------------------------------------------------------------------------
# _import_engine_class
# ---------------------------------------------------------------------------


class TestImportEngineClassCharacterization:
    def test_imports_class_from_simple_module(self, tmp_path):
        plugin_dir = _make_plugin_dir(tmp_path, "tts_charmock", _minimal_manifest())
        manifest = _minimal_manifest()
        cls = _import_engine_class(manifest=manifest, plugin_dir=plugin_dir, folder_name="tts_charmock")
        assert cls.__name__ == "CharMockEngine"

    def test_missing_module_file_raises(self, tmp_path):
        plugin_dir = tmp_path / "tts_charmock"
        plugin_dir.mkdir()
        manifest = _minimal_manifest()
        with pytest.raises(PluginLoadError, match="not found"):
            _import_engine_class(manifest=manifest, plugin_dir=plugin_dir, folder_name="tts_charmock")

    def test_missing_class_in_module_raises(self, tmp_path):
        plugin_dir = _make_plugin_dir(
            tmp_path, "tts_charmock", _minimal_manifest(entry_class="engine:NoSuchClass"),
            engine_src=_ENGINE_SRC,
        )
        manifest = _minimal_manifest(entry_class="engine:NoSuchClass")
        with pytest.raises(PluginLoadError, match="NoSuchClass"):
            _import_engine_class(manifest=manifest, plugin_dir=plugin_dir, folder_name="tts_charmock")

    def test_registers_module_in_sys_modules(self, tmp_path):
        import sys

        plugin_dir = _make_plugin_dir(tmp_path, "tts_charmock", _minimal_manifest())
        manifest = _minimal_manifest()
        _import_engine_class(manifest=manifest, plugin_dir=plugin_dir, folder_name="tts_charmock")
        assert "_tts_plugin_tts_charmock.engine" in sys.modules

"""BUG 1 fix: optional manifest ``dependency_check: "external"``.

XTTS's inference deps (torch, coqui-tts, ...) are installed into a separate,
plugin-managed environment (``~/xtts-env`` by default) by ``run.sh`` -- never
into the server's own venv. Before this fix, ``_check_dependencies`` checked
``requirements.txt`` against the *server* interpreter regardless, so xtts
was permanently reported ``needs_setup`` even on a fully-provisioned install.
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest

from app.tts_server.plugin_loader import PluginLoadError, _load_plugin, _validate_manifest

REPO_ROOT = Path(__file__).parents[2]


def _minimal_manifest(**overrides) -> dict:
    manifest = {
        "studio_tts_manifest": "1.0",
        "contract_version": "1.0",
        "sdk_version": "1.0",
        "settings_schema_version": "1.0",
        "event_envelope_version": "1.0",
        "engine_id": "demo",
        "display_name": "Demo",
        "entry_class": "engine:DemoEngine",
        "capabilities": ["synthesis"],
    }
    manifest.update(overrides)
    return manifest


_ENGINE_SRC = """
from app.engines.voice.sdk import TTSResult

class DemoEngine:
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
    def settings_schema(self): return {}
"""


def _make_plugin_dir(tmp_path: Path, folder_name: str, manifest: dict, requirements_txt: str) -> Path:
    plugin_dir = tmp_path / folder_name
    plugin_dir.mkdir()
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (plugin_dir / "engine.py").write_text(textwrap.dedent(_ENGINE_SRC), encoding="utf-8")
    (plugin_dir / "requirements.txt").write_text(requirements_txt, encoding="utf-8")
    return plugin_dir


class TestDependencyCheckFieldValidation:
    def test_absent_dependency_check_is_valid(self):
        _validate_manifest(manifest=_minimal_manifest(), folder_name="tts_demo")

    def test_external_dependency_check_is_valid(self):
        manifest = _minimal_manifest(dependency_check="external")
        _validate_manifest(manifest=manifest, folder_name="tts_demo")

    def test_explicit_bundled_dependency_check_is_valid(self):
        """Writing the default explicitly is accepted as a no-op, matching
        the spec's naming of "bundled" as the absent-field default."""
        manifest = _minimal_manifest(dependency_check="bundled")
        _validate_manifest(manifest=manifest, folder_name="tts_demo")

    def test_unknown_dependency_check_value_rejected(self):
        manifest = _minimal_manifest(dependency_check="mostly-external")
        with pytest.raises(PluginLoadError, match="dependency_check"):
            _validate_manifest(manifest=manifest, folder_name="tts_demo")


class TestXttsManifestDeclaresExternalDependencyCheck:
    def test_xtts_manifest_opts_out_of_server_venv_dependency_check(self):
        manifest = json.loads(
            (REPO_ROOT / "tts_engines" / "tts_xtts" / "manifest.json").read_text(encoding="utf-8")
        )
        assert manifest.get("dependency_check") == "external"


class TestLoaderSkipsCheckForExternalEnvPlugins:
    """End-to-end through the real ``_load_plugin`` load path (R2: no mocking
    of plugin_loader/plugin_manifest internals — only real files under
    tmp_path)."""

    _MISSING_REQUIREMENTS = "definitely-not-a-real-installed-package==999\n"

    def test_without_opt_out_missing_deps_gate_needs_setup(self, tmp_path):
        plugin_dir = _make_plugin_dir(
            tmp_path, "tts_demo", _minimal_manifest(), self._MISSING_REQUIREMENTS
        )
        plugin = _load_plugin(plugin_dir=plugin_dir, folder_name="tts_demo")
        assert plugin.dependencies_satisfied is False
        assert "definitely-not-a-real-installed-package" in plugin.missing_dependencies

    def test_external_opt_out_reports_satisfied_despite_missing_requirements(self, tmp_path):
        manifest = _minimal_manifest(dependency_check="external")
        plugin_dir = _make_plugin_dir(tmp_path, "tts_demo", manifest, self._MISSING_REQUIREMENTS)
        plugin = _load_plugin(plugin_dir=plugin_dir, folder_name="tts_demo")
        assert plugin.dependencies_satisfied is True
        assert plugin.missing_dependencies == []

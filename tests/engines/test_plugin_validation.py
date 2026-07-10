"""Tests for app.tts_server.plugin_validation (S2 — AST import gate)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.tts_server.plugin_validation import (
    StudioHandlerImportError,
    check_studio_handler_imports,
    validate_studio_handlers,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TEMPLATE_PLUGIN_DIR = Path(__file__).parents[2] / "docs" / "plugin-sdk" / "plugin-template"


def _make_studio_handler(tmp_path: Path, source: str) -> Path:
    """Write source into tmp_path/plugin/studio/handler.py and return plugin root."""
    studio = tmp_path / "plugin" / "studio"
    studio.mkdir(parents=True)
    (studio / "handler.py").write_text(source, encoding="utf-8")
    return tmp_path


# ---------------------------------------------------------------------------
# Template manifest carries all four version fields
# ---------------------------------------------------------------------------

class TestTemplateManifest:
    def test_template_manifest_has_version_fields(self):
        """Route the check through the real manifest validator (not a hand-rolled
        field-by-field re-check) so this actually proves the shipped template
        satisfies the contract the loader enforces on every plugin."""
        from app.tts_server.plugin_loader import _validate_manifest

        manifest = json.loads((TEMPLATE_PLUGIN_DIR / "manifest.json").read_text())
        # Must not raise PluginLoadError — the real S8 version-field gate (and
        # every other required-field check) is satisfied by the shipped template.
        _validate_manifest(manifest=manifest, folder_name="tts_template")


# ---------------------------------------------------------------------------
# AST gate: clean files
# ---------------------------------------------------------------------------

class TestASTGateClean:
    def test_no_studio_dir_is_clean(self, tmp_path: Path):
        """Plugin with no plugin/studio/ directory yields no violations."""
        violations = check_studio_handler_imports(tmp_path)
        assert violations == []

    def test_template_handler_is_clean(self):
        """The shipped template studio handler must pass the AST gate."""
        violations = check_studio_handler_imports(TEMPLATE_PLUGIN_DIR)
        assert violations == [], f"Template handler has violations: {violations}"

    def test_sdk_import_is_allowed(self, tmp_path: Path):
        source = (
            "from studio_plugin_sdk import StudioPluginContext, JobSpec, JobResult\n"
            "import studio_plugin_sdk\n"
            "\ndef handle_job(ctx, job):\n    return None\n"
        )
        plugin_dir = _make_studio_handler(tmp_path, source)
        violations = check_studio_handler_imports(plugin_dir)
        assert violations == []

    def test_stdlib_imports_are_allowed(self, tmp_path: Path):
        source = (
            "import os\nimport pathlib\nfrom pathlib import Path\n"
            "\ndef handle_job(ctx, job):\n    return None\n"
        )
        plugin_dir = _make_studio_handler(tmp_path, source)
        violations = check_studio_handler_imports(plugin_dir)
        assert violations == []


# ---------------------------------------------------------------------------
# AST gate: forbidden imports
# ---------------------------------------------------------------------------

class TestASTGateForbidden:
    def test_import_app_rejected(self, tmp_path: Path):
        source = "import app\n\ndef handle_job(ctx, job):\n    return None\n"
        plugin_dir = _make_studio_handler(tmp_path, source)
        violations = check_studio_handler_imports(plugin_dir)
        assert len(violations) == 1
        assert "import app" in violations[0]

    def test_from_app_submodule_rejected(self, tmp_path: Path):
        source = (
            "from app.db.state import get_jobs\n"
            "\ndef handle_job(ctx, job):\n    return None\n"
        )
        plugin_dir = _make_studio_handler(tmp_path, source)
        violations = check_studio_handler_imports(plugin_dir)
        assert len(violations) == 1
        assert "app.db.state" in violations[0]

    def test_multiple_violations_all_reported(self, tmp_path: Path):
        source = (
            "import app\n"
            "from app.engines.bridge import VoiceBridge\n"
            "\ndef handle_job(ctx, job):\n    return None\n"
        )
        plugin_dir = _make_studio_handler(tmp_path, source)
        violations = check_studio_handler_imports(plugin_dir)
        assert len(violations) == 2

    def test_validate_raises_by_default(self, tmp_path: Path):
        source = "from app.core import config\n\ndef handle_job(ctx, job):\n    return None\n"
        plugin_dir = _make_studio_handler(tmp_path, source)
        with pytest.raises(StudioHandlerImportError):
            validate_studio_handlers(plugin_dir, raise_on_violation=True)

    def test_validate_no_raise_returns_violations(self, tmp_path: Path):
        source = "import app\n\ndef handle_job(ctx, job):\n    return None\n"
        plugin_dir = _make_studio_handler(tmp_path, source)
        violations = validate_studio_handlers(plugin_dir, raise_on_violation=False)
        assert violations
        assert "import app" in violations[0]

    def test_import_app_submodule_directly_rejected(self, tmp_path: Path):
        """``import app.db.state`` (not from-form) is also forbidden."""
        source = (
            "import app.db.state\n"
            "\ndef handle_job(ctx, job):\n    return None\n"
        )
        plugin_dir = _make_studio_handler(tmp_path, source)
        violations = check_studio_handler_imports(plugin_dir)
        assert len(violations) == 1
        assert "app.db.state" in violations[0]


# ---------------------------------------------------------------------------
# AST gate: module_level_only mode (S8 load-time enforcement)
# ---------------------------------------------------------------------------

class TestASTGateModuleLevelOnly:
    """module_level_only=True skips function-body imports (S4-S6 residue)."""

    def test_function_body_import_tolerated(self, tmp_path: Path):
        """Function-body app.* import is not flagged in module_level_only mode."""
        source = (
            "def handle_job(ctx, job):\n"
            "    from app.db.state import get_jobs\n"
            "    return None\n"
        )
        plugin_dir = _make_studio_handler(tmp_path, source)
        violations = check_studio_handler_imports(plugin_dir, module_level_only=True)
        assert violations == []

    def test_module_level_import_still_flagged(self, tmp_path: Path):
        """Module-level app.* import IS flagged even in module_level_only mode."""
        source = (
            "from app.db.state import get_jobs\n"
            "\ndef handle_job(ctx, job):\n    return None\n"
        )
        plugin_dir = _make_studio_handler(tmp_path, source)
        violations = check_studio_handler_imports(plugin_dir, module_level_only=True)
        assert len(violations) == 1
        assert "app.db.state" in violations[0]

    def test_strict_mode_catches_function_body(self, tmp_path: Path):
        """Strict mode (module_level_only=False) still catches function-body imports."""
        source = (
            "def handle_job(ctx, job):\n"
            "    from app.db.state import get_jobs\n"
            "    return None\n"
        )
        plugin_dir = _make_studio_handler(tmp_path, source)
        violations = check_studio_handler_imports(plugin_dir, module_level_only=False)
        assert len(violations) == 1


# ---------------------------------------------------------------------------
# AST gate: app_adapter.py exclusion
# ---------------------------------------------------------------------------

class TestASTGateAdapterExclusion:
    """Files named app_adapter.py and adapter.py are excluded from the gate."""

    def _make_adapter_file(self, tmp_path: Path, filename: str, source: str) -> Path:
        studio = tmp_path / "plugin" / "studio"
        studio.mkdir(parents=True, exist_ok=True)
        (studio / filename).write_text(source, encoding="utf-8")
        return tmp_path

    def test_app_adapter_module_level_import_skipped(self, tmp_path: Path):
        """app_adapter.py with module-level app.* import is not flagged."""
        source = "from app.engines.voice.base import StudioTTSEngine\n"
        plugin_dir = self._make_adapter_file(tmp_path, "app_adapter.py", source)
        violations = check_studio_handler_imports(plugin_dir, module_level_only=True)
        assert violations == []

    def test_adapter_module_level_import_skipped(self, tmp_path: Path):
        """adapter.py with module-level app.* import is not flagged."""
        source = "from app.db.models import Job\n"
        plugin_dir = self._make_adapter_file(tmp_path, "adapter.py", source)
        violations = check_studio_handler_imports(plugin_dir, module_level_only=True)
        assert violations == []

    def test_handler_py_alongside_adapter_still_checked(self, tmp_path: Path):
        """handler.py in same directory is still checked even when adapter.py exists."""
        studio = tmp_path / "plugin" / "studio"
        studio.mkdir(parents=True)
        (studio / "adapter.py").write_text("from app.db.models import Job\n", encoding="utf-8")
        (studio / "handler.py").write_text(
            "from app.db.state import get_jobs\n\ndef handle_job(ctx, job):\n    return None\n",
            encoding="utf-8",
        )
        violations = check_studio_handler_imports(tmp_path, module_level_only=True)
        assert len(violations) == 1
        assert "handler.py" in violations[0]

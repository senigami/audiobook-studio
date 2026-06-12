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

TEMPLATE_PLUGIN_DIR = Path(__file__).parents[2] / "docs" / "plugin-template"


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
        manifest = json.loads((TEMPLATE_PLUGIN_DIR / "manifest.json").read_text())
        for field in ("contract_version", "sdk_version", "settings_schema_version", "event_envelope_version"):
            assert field in manifest, f"manifest.json missing '{field}'"
            assert manifest[field] == "1.0", f"manifest.json {field} should be '1.0'"


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

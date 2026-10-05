"""S6 acceptance tests: tts_mixed handler is app-import-free at module level.

Tests:
- Import cleanliness: handler must have zero top-level ``from app.`` or
  ``import app.`` statements at module body level.
- Smoke: the module imports cleanly (no ImportError at load time).
- Builtin flag: manifest declares ``built_in`` = true.
- Ctx factory: _get_ctx() builds a StudioPluginContext without error.
"""
from __future__ import annotations

import ast
import importlib
import json
import sys
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Ensure studio_plugin_sdk alias is registered before importing target modules.
# In production the plugin_loader registers this; in tests we do it here.
# ---------------------------------------------------------------------------

import app.studio_plugin_sdk as _sdk_pkg  # noqa: E402
import sys as _sys
_sys.modules.setdefault("studio_plugin_sdk", _sdk_pkg)
import app.studio_plugin_sdk.errors as _sdk_errors  # noqa: E402
_sys.modules.setdefault("studio_plugin_sdk.errors", _sdk_errors)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_PLUGIN_DIR = Path(__file__).parent.parent
_HANDLER_FILE = _PLUGIN_DIR / "handler.py"
_MANIFEST_FILE = _PLUGIN_DIR / "manifest.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _module_body_app_imports(path: Path) -> list[str]:
    """Return only module-body (non-function, non-class) app imports."""
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    hits = []
    for node in tree.body:  # module top-level statements only
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if module.startswith("app.") or module == "app":
                hits.append(f"L{node.lineno}: from {module} import ...")
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("app.") or alias.name == "app":
                    hits.append(f"L{node.lineno}: import {alias.name}")
    return hits


# ---------------------------------------------------------------------------
# Tests: import cleanliness
# ---------------------------------------------------------------------------

def test_no_top_level_app_imports() -> None:
    """handler.py must have zero module-body app.* import lines (S6 contract)."""
    assert _HANDLER_FILE.is_file(), f"handler.py not found: {_HANDLER_FILE}"
    hits = _module_body_app_imports(_HANDLER_FILE)
    assert hits == [], (
        "handler.py has top-level app.* imports (S6 violation):\n"
        + "\n".join(hits)
    )


# ---------------------------------------------------------------------------
# Tests: smoke import
# ---------------------------------------------------------------------------

def test_handler_importable() -> None:
    """handler.py must import without raising ImportError."""
    fqn = "tts_engines.tts_mixed.handler"
    sys.modules.pop(fqn, None)
    try:
        mod = importlib.import_module(fqn)
    except ImportError as exc:
        pytest.fail(f"handler raised ImportError: {exc}")
    assert mod is not None


# ---------------------------------------------------------------------------
# Tests: builtin flag in manifest
# ---------------------------------------------------------------------------

def test_manifest_built_in_flag() -> None:
    """manifest.json must declare ``built_in: true`` (S6 requirement)."""
    assert _MANIFEST_FILE.is_file(), f"manifest.json not found: {_MANIFEST_FILE}"
    data = json.loads(_MANIFEST_FILE.read_text(encoding="utf-8"))
    assert data.get("built_in") is True, (
        f"manifest.json missing or incorrect built_in flag: got {data.get('built_in')!r}"
    )


def test_manifest_engine_id_unchanged() -> None:
    """engine_id must remain 'mixed' (renaming the folder must not change the engine id)."""
    data = json.loads(_MANIFEST_FILE.read_text(encoding="utf-8"))
    assert data.get("engine_id") == "mixed", (
        f"engine_id changed unexpectedly: {data.get('engine_id')!r}"
    )


# ---------------------------------------------------------------------------
# Tests: ctx factory
# ---------------------------------------------------------------------------

def test_get_ctx_builds() -> None:
    """_get_ctx() must return a StudioPluginContext without error."""
    fqn = "tts_engines.tts_mixed.handler"
    mod = importlib.import_module(fqn)
    get_ctx = getattr(mod, "_get_ctx", None)
    if get_ctx is None:
        pytest.skip("handler has no _get_ctx")
    ctx = get_ctx()
    from studio_plugin_sdk import StudioPluginContext
    assert isinstance(ctx, StudioPluginContext), (
        f"_get_ctx() returned {type(ctx)}, expected StudioPluginContext"
    )

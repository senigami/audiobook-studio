"""S4 acceptance tests: tts_xtts studio handlers are app-import-free.

Tests:
- Import cleanliness: handler/bake/segments/standard_handler/voice_adapter
  must have zero top-level ``from app.`` or ``import app.`` statements.
- Smoke: each module imports cleanly (no ImportError at load time).
- Ctx factory: _get_ctx() builds a StudioPluginContext without error.
"""
from __future__ import annotations

import ast
import importlib
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
# Also register the errors sub-module
import app.studio_plugin_sdk.errors as _sdk_errors  # noqa: E402
_sys.modules.setdefault("studio_plugin_sdk.errors", _sdk_errors)

# ---------------------------------------------------------------------------
# File list under test
# ---------------------------------------------------------------------------

_STUDIO_DIR = Path(__file__).parent.parent / "plugin" / "studio"

_TARGET_MODULES = [
    "handler",
    "bake",
    "segments",
    "standard_handler",
    "voice_adapter",
    "app_adapter",
]

# adapter.py is app-side glue — only audit it (document hits, do not fail)
_AUDIT_ONLY = ["adapter"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _top_level_app_imports(path: Path) -> list[str]:
    """Return lines with top-level ``from app.`` or ``import app.`` imports."""
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    hits = []
    for node in ast.walk(tree):
        # Only examine top-level imports (not inside function bodies)
        if not isinstance(node, (ast.Import, ast.ImportFrom)):
            continue
        # ast.walk visits nested nodes too; filter to module-level only via lineno heuristic
        # by checking node is a direct child of the module body
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if module.startswith("app.") or module == "app":
                hits.append(f"L{node.lineno}: from {module} import ...")
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("app.") or alias.name == "app":
                    hits.append(f"L{node.lineno}: import {alias.name}")
    return hits


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

@pytest.mark.parametrize("module_name", _TARGET_MODULES)
def test_no_top_level_app_imports(module_name: str) -> None:
    """Target handler modules must have zero module-body app.* import lines."""
    path = _STUDIO_DIR / f"{module_name}.py"
    assert path.is_file(), f"Expected file not found: {path}"
    hits = _module_body_app_imports(path)
    assert hits == [], (
        f"{module_name}.py has top-level app.* imports (S4 violation):\n"
        + "\n".join(hits)
    )


def test_adapter_app_imports_documented() -> None:
    """adapter.py is app-side glue — document its app.* imports but do not fail."""
    path = _STUDIO_DIR / "adapter.py"
    if not path.is_file():
        pytest.skip("adapter.py not present")
    hits = _module_body_app_imports(path)
    # This test always passes — it just documents the hits in the output.
    # (adapter.py is intentionally app-side and is excluded from S4 scope.)
    print(f"\nadapter.py documented app.* imports ({len(hits)}): {hits}")


# ---------------------------------------------------------------------------
# Tests: smoke import
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("module_name", _TARGET_MODULES)
def test_module_importable(module_name: str) -> None:
    """Each target module must import without raising ImportError."""
    fqn = f"tts_engines.tts_xtts.plugin.studio.{module_name}"
    # Remove any cached version to force a fresh import attempt
    sys.modules.pop(fqn, None)
    try:
        mod = importlib.import_module(fqn)
    except ImportError as exc:
        pytest.fail(f"{module_name} raised ImportError: {exc}")
    assert mod is not None


# ---------------------------------------------------------------------------
# Tests: ctx factory
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("module_name", _TARGET_MODULES)
def test_get_ctx_builds(module_name: str) -> None:
    """_get_ctx() must return a StudioPluginContext without error."""
    fqn = f"tts_engines.tts_xtts.plugin.studio.{module_name}"
    mod = importlib.import_module(fqn)
    get_ctx = getattr(mod, "_get_ctx", None)
    if get_ctx is None:
        pytest.skip(f"{module_name} has no _get_ctx (not a handler module)")
    ctx = get_ctx()
    # Reset singleton so later tests get a clean instance
    if hasattr(mod, "_ctx_instance"):
        mod._ctx_instance = None
    from studio_plugin_sdk import StudioPluginContext
    assert isinstance(ctx, StudioPluginContext), (
        f"_get_ctx() returned {type(ctx)}, expected StudioPluginContext"
    )

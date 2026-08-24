"""S4 acceptance tests: tts_xtts is app-import-free per the plan-010 boundary.

Confirmed boundary:
- ZERO ``app.*`` imports at ANY position in ``plugin/server/``, ``plugin/core/``,
  ``interface.py``, ``cli.py``.
- ZERO ``app.*`` imports at ANY position in ``plugin/studio/``'s five
  extraction targets, since issue #200 Stage B. The single exemption is
  ``app_adapter.py``'s guarded ``from app.studio_plugin_sdk import ...``,
  which Stage C removes; ``_STAGE_C_EXEMPT`` names it and a companion test
  fails if that exemption ever outlives the import.
- The older module-level-only rule still applies to the remaining
  ``plugin/studio/`` modules, where the sanctioned shapes are function-body
  imports, the ``try: ... except ImportError`` guard, and ``TYPE_CHECKING``
  blocks (which never execute at runtime).
- Smoke: each studio module imports cleanly (no ImportError at load time).
- Ctx factory: _get_ctx() builds a StudioPluginContext without error.
"""
from __future__ import annotations

import ast
import importlib
import sys
from pathlib import Path

import pytest

_PLUGIN_ROOT = Path(__file__).parent.parent
_STUDIO_DIR = _PLUGIN_ROOT / "plugin" / "studio"

_STUDIO_MODULES = sorted(p.stem for p in _STUDIO_DIR.glob("*.py") if p.name != "__init__.py")

# Files where NO app.* import may appear at ANY position (incl. function bodies).
_STRICT_FILES = sorted(
    [
        *(_PLUGIN_ROOT / "plugin" / "server").rglob("*.py"),
        *(_PLUGIN_ROOT / "plugin" / "core").rglob("*.py"),
        _PLUGIN_ROOT / "interface.py",
        _PLUGIN_ROOT / "cli.py",
    ]
)

_CTX_FACTORY_MODULES = ["handler", "bake", "segments", "standard_handler", "voice_adapter", "app_adapter", "adapter"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_app_import(node: ast.stmt) -> list[str]:
    hits: list[str] = []
    if isinstance(node, ast.ImportFrom):
        module = node.module or ""
        if module == "app" or module.startswith("app."):
            hits.append(f"L{node.lineno}: from {module} import ...")
    elif isinstance(node, ast.Import):
        for alias in node.names:
            if alias.name == "app" or alias.name.startswith("app."):
                hits.append(f"L{node.lineno}: import {alias.name}")
    return hits


def _all_app_imports(path: Path) -> list[str]:
    """app.* imports at ANY position (module body, functions, guards — everything)."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    hits: list[str] = []
    for node in ast.walk(tree):
        hits.extend(_is_app_import(node))
    return hits


def _all_app_imports_with_module(path: Path) -> list[tuple[str, str]]:
    """As ``_all_app_imports``, but pairs each hit with the app module it names.

    The module name is what the Stage C exemption keys off, so an exemption
    cannot accidentally cover a different app.* import in the same file.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    pairs: list[tuple[str, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if module == "app" or module.startswith("app."):
                pairs.append((module, f"L{node.lineno}: from {module} import ..."))
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "app" or alias.name.startswith("app."):
                    pairs.append((alias.name, f"L{node.lineno}: import {alias.name}"))
    return pairs


def _module_level_app_imports(path: Path) -> list[str]:
    """Module-level app.* imports, permitting only the sanctioned shapes.

    Allowed: imports inside function/class bodies, inside ``if TYPE_CHECKING:``
    blocks, and inside a module-level ``try:`` guarded by ``except ImportError``
    (the documented host-integration shape in app_adapter.py).
    """
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    hits: list[str] = []

    def _catches_import_error(handler: ast.ExceptHandler) -> bool:
        t = handler.type
        names = []
        if isinstance(t, ast.Name):
            names = [t.id]
        elif isinstance(t, ast.Tuple):
            names = [e.id for e in t.elts if isinstance(e, ast.Name)]
        return any(n in ("ImportError", "ModuleNotFoundError") for n in names)

    def visit(stmts: list[ast.stmt]) -> None:
        for node in stmts:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue  # function/class bodies are out of module-level scope
            if isinstance(node, ast.Try):
                if any(_catches_import_error(h) for h in node.handlers):
                    continue  # sanctioned try/except ImportError host-integration shape
                visit(node.body + node.orelse + node.finalbody)
                for h in node.handlers:
                    visit(h.body)
                continue
            if isinstance(node, ast.If):
                test_src = ast.dump(node.test)
                if "TYPE_CHECKING" in test_src:
                    continue  # never executes at runtime
                visit(node.body + node.orelse)
                continue
            if isinstance(node, (ast.With, ast.AsyncWith)):
                visit(node.body)
                continue
            hits.extend(_is_app_import(node))

    visit(tree.body)
    return hits


# ---------------------------------------------------------------------------
# Tests: import cleanliness
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("path", _STRICT_FILES, ids=lambda p: str(p.relative_to(_PLUGIN_ROOT)))
def test_server_core_interface_cli_zero_app_imports(path: Path) -> None:
    """server/, core/, interface.py, cli.py: zero app.* imports at ANY position."""
    assert path.is_file(), f"Expected file not found: {path}"
    hits = _all_app_imports(path)
    assert hits == [], (
        f"{path.relative_to(_PLUGIN_ROOT)} has app.* imports (S4 boundary violation):\n"
        + "\n".join(hits)
    )


@pytest.mark.parametrize("module_name", _STUDIO_MODULES)
def test_studio_no_module_level_app_imports(module_name: str) -> None:
    """plugin/studio: zero module-level app.* (guarded/function-body shapes only)."""
    path = _STUDIO_DIR / f"{module_name}.py"
    hits = _module_level_app_imports(path)
    assert hits == [], (
        f"{module_name}.py has module-level app.* imports (S4 violation):\n"
        + "\n".join(hits)
    )


# ---------------------------------------------------------------------------
# Tests: smoke import
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("module_name", _CTX_FACTORY_MODULES)
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

@pytest.mark.parametrize("module_name", _CTX_FACTORY_MODULES)
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


# ---------------------------------------------------------------------------
# Tests: issue #200 strict gate (function bodies included)
# ---------------------------------------------------------------------------

# The five plugin/studio modules that must reach zero app.* imports at ANY
# scope before tts_xtts can be extracted into its own repo (issue #189).
_EXTRACTION_TARGET_FILES = [
    "adapter.py",
    "bake.py",
    "segments.py",
    "app_adapter.py",
    "standard_handler.py",
]


# The single import Stage B deliberately leaves behind: app_adapter.py's guarded
# ``from app.studio_plugin_sdk import BaseVoiceEngine, ...``. Removing it needs a
# plugin-facing registration contract in the SDK rather than a re-export of the
# app-side base class, which is issue #200 Stage C and its own design decision.
# Scoped to the one module and the one symbol so any OTHER app.* import
# appearing in that file still fails the gate.
_STAGE_C_EXEMPT = {("app_adapter.py", "app.studio_plugin_sdk")}


def test_studio_zero_app_imports_at_any_scope() -> None:
    """plugin/studio extraction targets: zero app.* imports anywhere, function bodies included.

    The sibling ``test_studio_no_module_level_app_imports`` deliberately skips
    function and class bodies, which is why every one of those passed while 31
    app.* imports were live. Extraction needs the stricter rule; Stage B routed
    every one of them through the SDK context, leaving only the Stage C
    exemption above.
    """
    hits: list[str] = []
    for name in _EXTRACTION_TARGET_FILES:
        path = _STUDIO_DIR / name
        assert path.is_file(), f"Expected file not found: {path}"
        for module, hit in _all_app_imports_with_module(path):
            if (name, module) in _STAGE_C_EXEMPT:
                continue
            hits.append(f"{name} {hit}")

    assert hits == [], (
        f"{len(hits)} app.* import(s) remain in plugin/studio (issue #200 scope):\n"
        + "\n".join(hits)
    )


def test_stage_c_exemption_still_describes_a_real_import() -> None:
    """The exemption must not outlive the import it was written for.

    A stale entry in ``_STAGE_C_EXEMPT`` would silently widen the gate: once
    Stage C lands, this fails and the exemption gets deleted with it.
    """
    found = {
        (name, module)
        for name in _EXTRACTION_TARGET_FILES
        for module, _ in _all_app_imports_with_module(_STUDIO_DIR / name)
    }
    stale = _STAGE_C_EXEMPT - found
    assert stale == set(), f"_STAGE_C_EXEMPT names import(s) that no longer exist: {sorted(stale)}"

"""SDK cleanliness gate (plan 010): studio_plugin_sdk/ must not depend on app.*.

Confirmed boundary (mastermind 010, Checkpoint 2):
- ZERO module-level ``app.*`` imports anywhere in ``studio_plugin_sdk/``.
- ZERO ``app.*`` imports of ANY kind (including function bodies) outside
  ``context.py``. ``context.py`` is the host-implemented context: its lazy
  function-body ``from app...`` imports only execute inside the Studio host
  process, so they are the single sanctioned exception.
"""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

_SDK_DIR = Path(__file__).resolve().parents[2] / "studio_plugin_sdk"
_SDK_FILES = sorted(_SDK_DIR.glob("*.py"))
_CONTEXT_EXCEPTION = "context.py"


def _is_app_import(node: ast.AST) -> list[str]:
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
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    hits: list[str] = []
    for node in ast.walk(tree):
        hits.extend(_is_app_import(node))
    return hits


def _module_level_app_imports(path: Path) -> list[str]:
    """Module-level (non-function/class-body) app.* imports. No exemptions."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    hits: list[str] = []

    def visit(stmts: list[ast.stmt]) -> None:
        for node in stmts:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue
            for child_block in ("body", "orelse", "finalbody"):
                blk = getattr(node, child_block, None)
                if isinstance(blk, list):
                    visit(blk)
            for h in getattr(node, "handlers", []):
                visit(h.body)
            hits.extend(_is_app_import(node))

    visit(tree.body)
    return hits


def test_sdk_files_discovered() -> None:
    assert _SDK_DIR.is_dir(), f"SDK package not found: {_SDK_DIR}"
    assert len(_SDK_FILES) >= 8, f"Unexpectedly few SDK files: {[p.name for p in _SDK_FILES]}"


@pytest.mark.parametrize("path", _SDK_FILES, ids=lambda p: p.name)
def test_sdk_no_module_level_app_imports(path: Path) -> None:
    """Every SDK module: zero module-level app.* imports (no exemptions)."""
    hits = _module_level_app_imports(path)
    assert hits == [], (
        f"studio_plugin_sdk/{path.name} has module-level app.* imports:\n" + "\n".join(hits)
    )


@pytest.mark.parametrize(
    "path",
    [p for p in _SDK_FILES if p.name != _CONTEXT_EXCEPTION],
    ids=lambda p: p.name,
)
def test_sdk_no_app_imports_anywhere_outside_context(path: Path) -> None:
    """Outside context.py: zero app.* imports at ANY position, function bodies included."""
    hits = _all_app_imports(path)
    assert hits == [], (
        f"studio_plugin_sdk/{path.name} has app.* imports (only context.py "
        f"function bodies are sanctioned):\n" + "\n".join(hits)
    )

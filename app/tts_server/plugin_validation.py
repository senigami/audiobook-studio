"""AST-based validation for plugin studio handlers.

Provides ``check_studio_handler_imports`` which inspects every ``*.py`` under a
plugin's ``plugin/studio/`` directory and rejects any ``import app`` or
``from app ...`` statement.  Importing via ``studio_plugin_sdk`` is explicitly
allowed.

The function is exposed for use in tests and (eventually) in the loader itself.
Enforcement at load time is intentionally DEFERRED: bundled plugins (tts_xtts,
tts_voxtral) still use direct ``app.*`` imports until they are
migrated in S4–S6.  tts_mixed (renamed from synthesis_mixed in S6) is migrated.  Wire the call in ``_load_plugin`` when those slices land
(search for "S4" to find the right insertion point).
"""

from __future__ import annotations

import ast
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class StudioHandlerImportError(Exception):
    """Raised when a studio handler contains a forbidden ``app.*`` import."""


def check_studio_handler_imports(plugin_dir: Path) -> list[str]:
    """Inspect all ``*.py`` files under ``plugin/studio/`` for forbidden imports.

    A forbidden import is any ``import app`` or ``from app ...`` statement.
    Imports of ``studio_plugin_sdk`` (and its sub-modules) are allowed.

    Args:
        plugin_dir: Root directory of the plugin (contains ``manifest.json``).

    Returns:
        list[str]: Human-readable violation descriptions.  An empty list means
        the handler files are clean.

    Raises:
        StudioHandlerImportError: If any violations are found and ``raise_on_violation``
        is True (see ``validate_studio_handlers``).
    """
    studio_dir = plugin_dir / "plugin" / "studio"
    if not studio_dir.is_dir():
        # No studio handlers — nothing to check.
        return []

    violations: list[str] = []

    for py_file in sorted(studio_dir.rglob("*.py")):
        try:
            source = py_file.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(py_file))
        except SyntaxError as exc:
            # Unparseable files are not violations — the loader will catch them later.
            logger.debug("Skipping unparseable file %s: %s", py_file, exc)
            continue

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if _is_forbidden_import(alias.name):
                        violations.append(
                            f"{py_file.relative_to(plugin_dir)}:{node.lineno}: "
                            f"forbidden 'import {alias.name}' — use studio_plugin_sdk instead"
                        )

            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if _is_forbidden_from_import(module):
                    violations.append(
                        f"{py_file.relative_to(plugin_dir)}:{node.lineno}: "
                        f"forbidden 'from {module} import ...' — use studio_plugin_sdk instead"
                    )

    return violations


def validate_studio_handlers(plugin_dir: Path, *, raise_on_violation: bool = True) -> list[str]:
    """Wrapper that optionally raises ``StudioHandlerImportError`` on violations.

    Args:
        plugin_dir: Plugin root directory.
        raise_on_violation: When True (default), raise if any violations found.

    Returns:
        list[str]: Violation descriptions (empty if clean).

    Raises:
        StudioHandlerImportError: If violations are found and raise_on_violation is True.
    """
    violations = check_studio_handler_imports(plugin_dir)
    if violations and raise_on_violation:
        summary = "; ".join(violations)
        raise StudioHandlerImportError(
            f"Plugin at {plugin_dir} has forbidden app.* imports in studio handlers: {summary}"
        )
    return violations


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _is_forbidden_import(name: str) -> bool:
    """Return True if a bare ``import <name>`` is forbidden.

    Forbidden: top-level ``app`` or any ``app.*`` sub-module.
    Allowed: ``studio_plugin_sdk`` and everything else.
    """
    return name == "app" or name.startswith("app.")


def _is_forbidden_from_import(module: str) -> bool:
    """Return True if a ``from <module> import ...`` is forbidden.

    Forbidden: ``from app`` / ``from app.something``.
    Allowed: ``from studio_plugin_sdk``, ``from studio_plugin_sdk.something``.
    """
    return module == "app" or module.startswith("app.")

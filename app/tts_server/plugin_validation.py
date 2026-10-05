"""AST-based validation for plugin studio handlers.

Provides ``check_studio_handler_imports`` which inspects every ``*.py`` under a
plugin's ``plugin/studio/`` directory and rejects any ``import app`` or
``from app ...`` statement.  Importing via ``studio_plugin_sdk`` is explicitly
allowed.

Enforcement modes
-----------------
``module_level_only=True`` (S8 default, enforced at load):
    Only module-level (top-level) ``app.*`` imports are flagged.  Function-body
    ``app.*`` imports are skipped.  This tolerates the S4–S6 residue
    (function-body imports in bake/segments/standard_handler) until S9 lands
    and the dispatcher injects the context, at which point the test patch
    targets move to the context and this residue disappears.

``module_level_only=False`` (strict mode, default for standalone/template
    validation and S9's full flip):
    ALL ``app.*`` imports — module-level and function-body — are flagged.

Files named ``app_adapter.py`` or ``adapter.py`` are excluded from the check.
These are intentional app-bridge files that legitimately import from ``app.*``
at module level (they run in the Studio process, not in the TTS server
subprocess, and are loaded via ``app_adapter_module`` in the manifest).
"""

from __future__ import annotations

import ast
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Files under plugin/studio/ that are app-bridge code and are explicitly
# allowed to import from app.* at module level.
_ADAPTER_FILENAMES = frozenset({"app_adapter.py", "adapter.py"})


class StudioHandlerImportError(Exception):
    """Raised when a studio handler contains a forbidden ``app.*`` import."""


def check_studio_handler_imports(
    plugin_dir: Path,
    *,
    module_level_only: bool = False,
) -> list[str]:
    """Inspect all ``*.py`` files under ``plugin/studio/`` for forbidden imports.

    A forbidden import is any ``import app`` or ``from app ...`` statement
    (excluding ``app.studio_plugin_sdk`` which is allowed).

    Files named ``app_adapter.py`` or ``adapter.py`` are skipped — they are
    app-bridge files that legitimately import from ``app.*``.

    Args:
        plugin_dir: Root directory of the plugin (contains ``manifest.json``).
        module_level_only: When True, only top-level (module-scope) imports are
            checked; function-body imports are tolerated.  Use this mode at
            load time while S4–S6 function-body residue still exists (S8).
            When False (strict mode), all ``app.*`` imports are flagged.

    Returns:
        list[str]: Human-readable violation descriptions.  An empty list means
        the handler files are clean.
    """
    studio_dir = plugin_dir / "plugin" / "studio"
    if not studio_dir.is_dir():
        # No studio handlers — nothing to check.
        return []

    violations: list[str] = []

    for py_file in sorted(studio_dir.rglob("*.py")):
        # Skip app-bridge adapter files — they legitimately import app.* at
        # module level and run in the Studio process, not the TTS server.
        if py_file.name in _ADAPTER_FILENAMES:
            logger.debug("Skipping app-bridge adapter file: %s", py_file)
            continue

        try:
            source = py_file.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(py_file))
        except SyntaxError as exc:
            # Unparseable files are not violations — the loader will catch them later.
            logger.debug("Skipping unparseable file %s: %s", py_file, exc)
            continue

        if module_level_only:
            # Walk only top-level statements (direct children of the Module node).
            nodes_to_check = list(ast.iter_child_nodes(tree))
        else:
            nodes_to_check = list(ast.walk(tree))

        for node in nodes_to_check:
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


def validate_studio_handlers(
    plugin_dir: Path,
    *,
    raise_on_violation: bool = True,
    module_level_only: bool = False,
) -> list[str]:
    """Wrapper that optionally raises ``StudioHandlerImportError`` on violations.

    Args:
        plugin_dir: Plugin root directory.
        raise_on_violation: When True (default), raise if any violations found.
        module_level_only: Forwarded to ``check_studio_handler_imports``.

    Returns:
        list[str]: Violation descriptions (empty if clean).

    Raises:
        StudioHandlerImportError: If violations are found and raise_on_violation is True.
    """
    violations = check_studio_handler_imports(plugin_dir, module_level_only=module_level_only)
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

    Forbidden: top-level ``app`` or any ``app.*`` sub-module, EXCEPT
    ``app.studio_plugin_sdk`` (allowed — it's the SDK bridge path).
    Allowed: ``studio_plugin_sdk`` and everything else.
    """
    if name == "app":
        return True
    if name.startswith("app.studio_plugin_sdk"):
        return False
    return name.startswith("app.")


def _is_forbidden_from_import(module: str) -> bool:
    """Return True if a ``from <module> import ...`` is forbidden.

    Forbidden: ``from app`` / ``from app.something``, EXCEPT
    ``from app.studio_plugin_sdk...``.
    Allowed: ``from studio_plugin_sdk``, ``from studio_plugin_sdk.something``.
    """
    if module == "app":
        return True
    if module.startswith("app.studio_plugin_sdk"):
        return False
    return module.startswith("app.")

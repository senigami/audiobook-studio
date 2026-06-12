"""Shared plugin import utilities.

Provides ``ensure_plugin_package_hierarchy``, extracted from the duplicate
implementations that previously existed in both ``app.tts_server.plugin_loader``
and ``app.jobs.registry``.
"""

from __future__ import annotations

import sys
import types
from pathlib import Path


def ensure_plugin_package_hierarchy(
    *,
    package_name: str,
    plugin_dir: Path,
    module_parts: list[str],
) -> None:
    """Create isolated package modules for a plugin's internal imports.

    Registers synthetic ``types.ModuleType`` entries in ``sys.modules`` so that
    package-relative imports inside a dynamically loaded plugin module resolve
    correctly without colliding with other plugins or the host application.

    Args:
        package_name: Top-level package name to anchor the hierarchy under
            (e.g. ``"_tts_plugin_tts_xtts"`` or ``"plugins.tts_xtts"``).
        plugin_dir: Absolute path to the plugin folder.
        module_parts: Ordered list of sub-package path components between
            *package_name* and the leaf module (may be empty).
    """
    current_name = package_name
    current_path = plugin_dir
    if current_name not in sys.modules:
        module = types.ModuleType(current_name)
        module.__path__ = [str(current_path)]
        module.__file__ = str(current_path / "__init__.py")
        sys.modules[current_name] = module

    for part in module_parts:
        current_name = f"{current_name}.{part}"
        current_path = current_path / part
        if current_name in sys.modules:
            continue
        module = types.ModuleType(current_name)
        module.__path__ = [str(current_path)]
        module.__file__ = str(current_path / "__init__.py")
        sys.modules[current_name] = module

from __future__ import annotations

import os
import re
from pathlib import Path

FORBIDDEN_PATTERNS = [
    r"from app\.",
    r"import app\.",
]


def test_plugin_core_is_portable():
    """
    Ensures that code in plugin/core/ does not import from Studio-specific
    application modules. Plugin core logic should be portable and only
    depend on the plugin contract, common utilities, or external libraries.
    """
    root = Path(__file__).parents[2]
    plugins_dir = root / "plugins"

    violations = []

    for plugin_dir in plugins_dir.iterdir():
        if not plugin_dir.is_dir():
            continue

        core_dir = plugin_dir / "plugin" / "core"
        if not core_dir.exists():
            continue

        for py_file in core_dir.rglob("*.py"):
            content = py_file.read_text(encoding="utf-8")
            for i, line in enumerate(content.splitlines(), 1):
                stripped = line.strip()
                # Ignore comments
                if stripped.startswith("#"):
                    continue

                for pattern in FORBIDDEN_PATTERNS:
                    if re.search(pattern, stripped):
                        violations.append(f"{py_file.relative_to(root)}:L{i} -> {stripped}")

    if violations:
        header = "Architectural Violation: Portable plugin/core modules must not import Studio app internals.\n"
        header += "This ensures plugins can eventually be moved to standalone repositories.\n"
        header += "Move these imports to plugin/studio/ adapters and pass required data into core.\n"
        assert False, header + "\n".join(violations)

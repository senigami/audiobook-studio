#!/usr/bin/env python3
"""Standalone plugin manifest validator for CI.

Checks every bundled plugin (``tts_engines/tts_*/``) for:
  1. Required version fields (contract_version, sdk_version, settings_schema_version,
     event_envelope_version). All must be present. ``sdk_version`` is checked
     against the installed ``studio_plugin_sdk.SDK_VERSION`` (same major, at or
     below its minor); the rest must equal "1.0".
  2. Core manifest schema basics (studio_tts_manifest, engine_id, display_name,
     entry_class, capabilities).
  3. AST module-level import gate — no module-level ``app.*`` imports in
     ``plugin/studio/`` handler files (adapter files excluded).

Exit codes
----------
0 — all plugins pass
1 — one or more plugins have violations

Usage::

    python scripts/validate_plugin_manifests.py
    python scripts/validate_plugin_manifests.py --plugins-dir /path/to/tts_engines
    python scripts/validate_plugin_manifests.py --strict  # also check function-body imports

This script has no heavy dependencies and runs in the bare requirements.txt env.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path

# Run from anywhere: the repo root holds studio_plugin_sdk, whose SDK_VERSION is
# the reference for the sdk_version check below. Importing it has no side effects.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# ---------------------------------------------------------------------------
# Constants (kept in sync with app/tts_server/plugin_loader.py)
# ---------------------------------------------------------------------------

SUPPORTED_MANIFEST_VERSION = "1.0"

_VERSION_FIELDS: dict[str, str] = {
    "contract_version": "1.0",
    "settings_schema_version": "1.0",
    "event_envelope_version": "1.0",
}

_REQUIRED_FIELDS = [
    "studio_tts_manifest",
    "engine_id",
    "display_name",
    "entry_class",
    "capabilities",
]

_PLUGIN_FOLDER_RE = re.compile(r"^tts_[a-z][a-z0-9]{1,14}$")

# App-bridge files excluded from the AST gate (legitimately import app.*).
_ADAPTER_FILENAMES = frozenset({"app_adapter.py", "adapter.py"})


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _check_sdk_version(manifest: dict) -> list[str]:
    """Same-major, at-or-below-minor check against the installed SDK package."""
    from studio_plugin_sdk import SDK_VERSION

    value = manifest.get("sdk_version")
    if value is None:
        return [f"missing required version field 'sdk_version' (must be \"{SDK_VERSION}\" or an earlier minor)"]

    declared = str(value).strip()
    try:
        d_major, _, d_minor = declared.partition(".")
        i_major, _, i_minor = SDK_VERSION.partition(".")
        declared_parts = (int(d_major), int(d_minor))
        installed_parts = (int(i_major), int(i_minor))
    except ValueError:
        return [f"sdk_version={declared!r} is not a MAJOR.MINOR version (installed SDK is {SDK_VERSION})"]

    if declared_parts[0] != installed_parts[0] or declared_parts[1] > installed_parts[1]:
        return [f"sdk_version={declared!r} is incompatible with the installed studio_plugin_sdk {SDK_VERSION}"]
    return []


def _check_manifest_schema(manifest: dict, folder_name: str) -> list[str]:
    """Return a list of schema violations for the manifest dict."""
    errors: list[str] = []

    # Required fields.
    for field in _REQUIRED_FIELDS:
        if not manifest.get(field):
            errors.append(f"missing required field '{field}'")

    # studio_tts_manifest version value.
    mv = str(manifest.get("studio_tts_manifest", "")).strip()
    if mv and mv != SUPPORTED_MANIFEST_VERSION:
        errors.append(
            f"studio_tts_manifest={mv!r} — only {SUPPORTED_MANIFEST_VERSION!r} is supported"
        )

    # sdk_version is checked against the installed package, never a literal
    # (issue #200), matching app/tts_server/plugin_manifest.py.
    errors.extend(_check_sdk_version(manifest))

    # The remaining version fields are required with value "1.0".
    for vfield, expected in _VERSION_FIELDS.items():
        value = manifest.get(vfield)
        if value is None:
            errors.append(f"missing required version field '{vfield}' (must be \"{expected}\")")
        elif str(value).strip() != expected:
            errors.append(
                f"{vfield}={str(value).strip()!r} — only {expected!r} is supported"
            )

    # capabilities must include "synthesis".
    caps = manifest.get("capabilities", [])
    if isinstance(caps, list) and "synthesis" not in caps:
        errors.append("capabilities must include 'synthesis'")

    return errors


def _is_forbidden_import(name: str) -> bool:
    if name == "app":
        return True
    if name.startswith("app.studio_plugin_sdk"):
        return False
    return name.startswith("app.")


def _is_forbidden_from_import(module: str) -> bool:
    if module == "app":
        return True
    if module.startswith("app.studio_plugin_sdk"):
        return False
    return module.startswith("app.")


def _check_ast_imports(plugin_dir: Path, *, module_level_only: bool = False) -> list[str]:
    """Return AST import violations for plugin/studio/ handler files."""
    studio_dir = plugin_dir / "plugin" / "studio"
    if not studio_dir.is_dir():
        return []

    violations: list[str] = []
    for py_file in sorted(studio_dir.rglob("*.py")):
        if py_file.name in _ADAPTER_FILENAMES:
            continue
        try:
            source = py_file.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(py_file))
        except SyntaxError:
            continue

        nodes = (
            list(ast.iter_child_nodes(tree)) if module_level_only else list(ast.walk(tree))
        )
        for node in nodes:
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if _is_forbidden_import(alias.name):
                        violations.append(
                            f"  {py_file.relative_to(plugin_dir)}:{node.lineno}: "
                            f"module-level 'import {alias.name}'"
                        )
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if _is_forbidden_from_import(module):
                    violations.append(
                        f"  {py_file.relative_to(plugin_dir)}:{node.lineno}: "
                        f"module-level 'from {module} import ...'"
                    )
    return violations


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def validate_plugins(plugins_dir: Path, *, strict: bool = False) -> int:
    """Validate all plugins under plugins_dir.  Returns exit code (0/1)."""
    if not plugins_dir.is_dir():
        print(f"ERROR: plugins directory not found: {plugins_dir}", file=sys.stderr)
        return 1

    all_passed = True

    for entry in sorted(plugins_dir.iterdir()):
        if not entry.is_dir():
            continue
        if not _PLUGIN_FOLDER_RE.match(entry.name):
            continue

        folder_name = entry.name
        manifest_path = entry / "manifest.json"
        plugin_errors: list[str] = []

        # 1. Load manifest.
        if not manifest_path.is_file():
            print(f"FAIL [{folder_name}]: manifest.json not found")
            all_passed = False
            continue

        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"FAIL [{folder_name}]: manifest.json is not valid JSON: {exc}")
            all_passed = False
            continue

        # 2. Schema + version fields.
        plugin_errors.extend(_check_manifest_schema(manifest, folder_name))

        # 3. AST import gate.
        # CI uses strict=False (module_level_only=True) matching the load-time gate (S8).
        # --strict enables function-body checks too (S9 target).
        ast_violations = _check_ast_imports(entry, module_level_only=not strict)
        if ast_violations:
            plugin_errors.extend(ast_violations)

        if plugin_errors:
            all_passed = False
            print(f"FAIL [{folder_name}]:")
            for err in plugin_errors:
                print(f"  {err}")
        else:
            print(f"OK   [{folder_name}]")

    return 0 if all_passed else 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--plugins-dir",
        type=Path,
        default=Path(__file__).parents[1] / "tts_engines",
        help="Path to the tts_engines/ directory (default: repo root tts_engines/)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Also flag function-body app.* imports (S9 full flip target).",
    )
    args = parser.parse_args()
    sys.exit(validate_plugins(args.plugins_dir, strict=args.strict))


if __name__ == "__main__":
    main()

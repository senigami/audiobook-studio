"""Plugin manifest parsing and validation for the TTS Server.

Handles reading ``manifest.json``, validating its required/optional fields
against the loader's version and callable-format contracts, loading optional
JSON side-files (e.g. ``settings_schema.json``), checking a plugin's
``requirements.txt`` against installed packages, and reading the declared
``behavior.max_concurrent_workers`` cap.

Split out of ``app/tts_server/plugin_loader.py`` (matching the precedent set
by ``app/tts_server/plugin_staging.py``): this module owns the manifest
surface, ``plugin_loader.py`` owns instantiation/registry. ``PluginLoadError``
stays defined in ``plugin_loader.py`` and is imported back here.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Version fields added in S1.  Current supported values (one set per field).
# A follow-up slice (S8) will flip missing→error once the plugin template
# ships with these fields pre-populated.
# ---------------------------------------------------------------------------
_SUPPORTED_VERSION_FIELDS: dict[str, set[str]] = {
    "contract_version": {"1.0"},
    "sdk_version": {"1.0"},
    "settings_schema_version": {"1.0"},
    "event_envelope_version": {"1.0"},
}

# Regex for callable fields: "module:ClassName" or "package.module:function_name"
_CALLABLE_RE = re.compile(r"^[a-z_][a-z0-9_.]*:[A-Za-z_][A-Za-z0-9_]*$")

# The only manifest contract version this loader accepts.  Every plugin
# manifest must carry ``"studio_tts_manifest": SUPPORTED_MANIFEST_VERSION``.
SUPPORTED_MANIFEST_VERSION = "1.0"


def _load_manifest(*, plugin_dir: Path, folder_name: str) -> dict[str, Any]:
    """Read and parse the plugin's ``manifest.json``.

    Args:
        plugin_dir: Plugin folder path.
        folder_name: Validated folder name.

    Returns:
        dict[str, Any]: Parsed manifest.

    Raises:
        PluginLoadError: If the manifest is missing or not valid JSON.
    """
    manifest_path = plugin_dir / "manifest.json"

    # Containment check: the manifest path must stay inside the plugin folder.
    try:
        manifest_path.resolve().relative_to(plugin_dir.resolve())
    except ValueError as exc:
        raise PluginLoadError(
            f"manifest.json path escapes plugin directory: {manifest_path}"
        ) from exc

    if not manifest_path.is_file():
        raise PluginLoadError(
            f"manifest.json not found in plugin folder: {folder_name}"
        )

    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PluginLoadError(
            f"manifest.json is not valid JSON: {exc}"
        ) from exc


def _validate_manifest(*, manifest: dict[str, Any], folder_name: str) -> None:
    """Validate required manifest fields.

    Args:
        manifest: Parsed manifest dict.
        folder_name: Validated folder name for error messages.

    Raises:
        PluginLoadError: If required fields are missing or invalid.
    """
    required = ["studio_tts_manifest", "engine_id", "display_name", "entry_class", "capabilities"]
    for field_name in required:
        if not manifest.get(field_name):
            raise PluginLoadError(
                f"manifest.json missing required field '{field_name}' in {folder_name}"
            )

    manifest_version = str(manifest["studio_tts_manifest"]).strip()
    if manifest_version != SUPPORTED_MANIFEST_VERSION:
        raise PluginLoadError(
            f"Plugin '{folder_name}' declares studio_tts_manifest={manifest_version!r} "
            f"but this loader only supports {SUPPORTED_MANIFEST_VERSION!r}. "
            "Update the plugin manifest or install a compatible version of Studio."
        )

    engine_id = str(manifest["engine_id"]).strip()
    if not re.match(r"^[a-z][a-z0-9]{1,14}$", engine_id):
        raise PluginLoadError(
            f"engine_id {engine_id!r} does not match required pattern "
            f"^[a-z][a-z0-9]{{1,14}}$ in {folder_name}"
        )

    entry_class = str(manifest["entry_class"]).strip()
    if not _CALLABLE_RE.match(entry_class):
        raise PluginLoadError(
            f"entry_class {entry_class!r} must be in 'module:ClassName' format in {folder_name}"
        )

    # Validate optional app_adapter fields if present
    adapter_class = manifest.get("app_adapter_class")
    if adapter_class and not re.match(r"^[A-Za-z][A-Za-z0-9_]*$", str(adapter_class).strip()):
        raise PluginLoadError(
            f"app_adapter_class {adapter_class!r} must be a valid Python class name in {folder_name}"
        )

    adapter_module = manifest.get("app_adapter_module")
    if adapter_module and not re.match(r"^[a-z_][a-z0-9_.]*$", str(adapter_module).strip()):
        raise PluginLoadError(
            f"app_adapter_module {adapter_module!r} must be a valid Python module name in {folder_name}"
        )

    # Validate worker_logic callables if present
    worker_logic = manifest.get("worker_logic", {})
    if isinstance(worker_logic, dict):
        for eid, handler in worker_logic.get("engine_handlers", {}).items():
            if not _CALLABLE_RE.match(str(handler).strip()):
                raise PluginLoadError(
                    f"worker_logic engine_handler {eid!r} value {handler!r} has invalid format in {folder_name}"
                )
        for kind, handler in worker_logic.get("kind_handlers", {}).items():
            if not _CALLABLE_RE.match(str(handler).strip()):
                raise PluginLoadError(
                    f"worker_logic kind_handler {kind!r} value {handler!r} has invalid format in {folder_name}"
                )

    capabilities = manifest.get("capabilities", [])
    if "synthesis" not in capabilities:
        raise PluginLoadError(
            f"capabilities must include 'synthesis' in {folder_name}"
        )

    # ---------------------------------------------------------------------------
    # Version-field validation (S8 gate flip — was warn, now hard error).
    # All four contract version fields are REQUIRED.  A missing or unrecognised
    # value raises PluginLoadError so the problem is visible in the engine card
    # rather than silently degraded.  Strict mode (enforced since S8).
    # ---------------------------------------------------------------------------
    for vfield, supported in _SUPPORTED_VERSION_FIELDS.items():
        value = manifest.get(vfield)
        if value is None:
            raise PluginLoadError(
                f"Plugin '{folder_name}' manifest is missing required field '{vfield}'. "
                f"Add \"{vfield}\": \"{next(iter(supported))}\" to manifest.json."
            )
        str_value = str(value).strip()
        if str_value not in supported:
            raise PluginLoadError(
                f"Plugin '{folder_name}' declares {vfield}={str_value!r} "
                f"but this loader only supports {sorted(supported)}. "
                "Update the plugin manifest or install a compatible version of Studio."
            )

    # Validate optional behavior fields.
    behavior = manifest.get("behavior", {})
    if isinstance(behavior, dict):
        # Validate behavior.max_concurrent_workers (W-PAR task 001).
        mcw = behavior.get("max_concurrent_workers")
        if mcw is not None:
            if not isinstance(mcw, int) or isinstance(mcw, bool):
                raise PluginLoadError(
                    f"behavior.max_concurrent_workers must be an integer ≥ 1 in {folder_name}, "
                    f"got {mcw!r}"
                )
            if mcw < 1:
                raise PluginLoadError(
                    f"behavior.max_concurrent_workers must be ≥ 1 in {folder_name}, "
                    f"got {mcw!r}"
                )

        # W-PERF safe-foundation (task 004): optional export-layer capability
        # fields consumed by the (not-yet-built) export layer, task 011 --
        # not by the live render pipeline. Additive/optional; no manifest
        # version bump (see plugin-contract.md changelog).
        export_format = behavior.get("export_format")
        if export_format is not None:
            valid_export_formats = {
                "ssml_w3c", "ssml_azure", "elevenlabs_text", "ssml_polly", "plain_text",
            }
            if export_format not in valid_export_formats:
                raise PluginLoadError(
                    f"behavior.export_format must be one of {sorted(valid_export_formats)} "
                    f"in {folder_name}, got {export_format!r}"
                )

        for supports_field in (
            "supports_per_span_voice",
            "supports_emotion_style",
            "supports_prosody",
            "supports_break",
        ):
            value = behavior.get(supports_field)
            if value is not None and not isinstance(value, bool):
                raise PluginLoadError(
                    f"behavior.{supports_field} must be a boolean in {folder_name}, got {value!r}"
                )

        sanitize_cats = behavior.get("sanitize_categories")
        if sanitize_cats is not None:
            from app.utils.text.textops_cleaning import SANITIZE_CATEGORIES  # noqa: PLC0415
            valid_names = set(SANITIZE_CATEGORIES.keys())
            if not isinstance(sanitize_cats, list):
                raise PluginLoadError(
                    f"behavior.sanitize_categories must be a list in {folder_name}"
                )
            for cat in sanitize_cats:
                if cat not in valid_names:
                    raise PluginLoadError(
                        f"behavior.sanitize_categories contains unknown category "
                        f"{cat!r} in {folder_name}. "
                        f"Valid names: {sorted(valid_names)}"
                    )


def _load_optional_json(path: Path) -> dict[str, Any]:
    """Load JSON from ``path`` when present, otherwise return an empty dict."""
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PluginLoadError(
            f"{path.name} is not valid JSON: {exc}"
        ) from exc

    if not isinstance(data, dict):
        raise PluginLoadError(
            f"{path.name} must be a JSON dictionary (object) at the root."
        )
    return data


def _check_dependencies(plugin_dir: Path) -> tuple[bool, list[str]]:
    """Check whether all packages in requirements.txt are installed.

    Args:
        plugin_dir: Plugin folder path.

    Returns:
        tuple[bool, list[str]]: (satisfied, missing_list)
    """
    req_file = plugin_dir / "requirements.txt"
    if not req_file.is_file():
        return True, []

    missing = []
    import importlib.metadata  # noqa: PLC0415

    try:
        content = req_file.read_text(encoding="utf-8")
        for line in content.splitlines():
            line = line.strip()
            # Skip comments, empty lines, links, and pip flags.
            if not line or line.startswith(("#", "-", "http://", "https://")):
                continue

            if line.startswith("git+"):
                fragment = parse_qs(urlparse(line).fragment)
                pkg_name = (fragment.get("egg") or [""])[0].strip()
            elif " @ " in line:
                pkg_name = line.split(" @ ", 1)[0].strip()
            else:
                # Simple split to get package name before any specifiers.
                # Handles: pkg, pkg==1.0, pkg>=2.0, pkg[extra], pkg ; python_version > '3.7'
                pkg_name = re.split(r"[<>=!~;\[]", line)[0].strip()

            if not pkg_name:
                continue

            try:
                importlib.metadata.distribution(pkg_name)
            except importlib.metadata.PackageNotFoundError:
                missing.append(pkg_name)
    except Exception as exc:
        logger.warning(
            "Failed to parse requirements.txt in %s: %s", plugin_dir.name, exc
        )
        return True, []  # Fail safe

    return len(missing) == 0, missing


def get_manifest_max_concurrent_workers(manifest: dict[str, object]) -> int:
    """Return the ``behavior.max_concurrent_workers`` value from a manifest dict.

    Absent or None → 1 (safe default; backward compatible with manifests that
    predate W-PAR task 001).  Always returns an integer ≥ 1.

    Args:
        manifest: A parsed manifest dict (or any dict with a ``"behavior"`` key).

    Returns:
        int: The declared concurrency cap (≥ 1).
    """
    behavior = manifest.get("behavior", {})
    if not isinstance(behavior, dict):
        return 1
    mcw = behavior.get("max_concurrent_workers")
    if mcw is None:
        return 1
    try:
        val = int(mcw)
    except (TypeError, ValueError):
        return 1
    return max(1, val)


# ---------------------------------------------------------------------------
# PluginLoadError is defined in plugin_loader.py (which owns instantiation and
# re-exports the names above). This back-import is intentionally at the BOTTOM
# of the module, not the top: plugin_loader.py imports the functions above from
# this module, so a top-level import here would form a circular import that
# breaks whenever plugin_manifest is imported first (plugin_loader would try to
# read this module's names before they are defined). Importing at the bottom —
# after every function is defined, and since PluginLoadError is only referenced
# inside function bodies at call time — makes both import orders resolve.
# ---------------------------------------------------------------------------
from app.tts_server.plugin_loader import PluginLoadError  # noqa: E402

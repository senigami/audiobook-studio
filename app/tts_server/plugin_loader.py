"""Plugin loader for the TTS Server.

Scans ``plugins/tts_*/`` folders inside the Studio install root, validates
each plugin's manifest, imports the declared engine class, and runs
environment validation.

Path safety: plugin folder names are validated against a strict regex before
any filesystem access.  Paths derived from manifest fields are validated
before import.
"""

from __future__ import annotations

import importlib.util
import json
import logging
import re
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Matches tts_<name> where <name> is 2–15 lowercase alphanumeric characters.
_PLUGIN_FOLDER_RE = re.compile(r"^tts_[a-z][a-z0-9]{1,14}$")

# Regex for the entry_class field: "module:ClassName" or "package.module:ClassName"
_ENTRY_CLASS_RE = re.compile(r"^[a-z_][a-z0-9_.]*:[A-Za-z][A-Za-z0-9_]*$")


# Maximum seconds allowed for a plugin's __init__ / module load.
_IMPORT_TIMEOUT_SECONDS = 120


class PluginLoadError(Exception):
    """Raised when a plugin cannot be loaded due to a configuration error."""


class LoadedPlugin:
    """A successfully loaded plugin with its manifest and engine instance."""

    def __init__(
        self,
        *,
        folder_name: str,
        plugin_dir: Path,
        manifest: dict[str, Any],
        engine: Any,
        settings_schema: dict[str, Any] | None = None,
    ) -> None:
        self.folder_name = folder_name
        self.plugin_dir = plugin_dir
        self.manifest = manifest
        self.engine = engine
        self.settings_schema = settings_schema or {}
        self.verified: bool = False
        self.verification_error: str | None = None
        self.is_pip: bool = False
        self.dependencies_satisfied: bool = True
        self.missing_dependencies: list[str] = []
        self.setup_message: str | None = None

    @property
    def engine_id(self) -> str:
        return str(self.manifest.get("engine_id", ""))

    @property
    def display_name(self) -> str:
        return str(self.manifest.get("display_name", self.engine_id))

    @property
    def test_text(self) -> str:
        return str(self.manifest.get("test_text", "")) or "This is a verification test."


def discover_plugins(plugins_dir: Path) -> list[LoadedPlugin]:
    """Scan ``plugins/`` and load all valid plugin engines.

    Args:
        plugins_dir: Absolute path to the ``plugins/`` directory.

    Returns:
        list[LoadedPlugin]: Successfully loaded plugins.  Plugins that fail
        to load are skipped and logged as warnings — they do not block other
        plugins from loading.
    """
    if not plugins_dir.is_dir():
        logger.info("Plugins directory does not exist: %s", plugins_dir)
        return []

    loaded: list[LoadedPlugin] = []
    seen_engine_ids: dict[str, str] = {}

    for entry in sorted(plugins_dir.iterdir()):
        if not entry.is_dir():
            continue

        folder_name = entry.name

        # Reject folder names that don't match the naming convention.
        if not _PLUGIN_FOLDER_RE.match(folder_name):
            logger.debug("Skipping non-plugin folder: %s", folder_name)
            continue

        try:
            plugin = _load_plugin(plugin_dir=entry, folder_name=folder_name)
        except PluginLoadError as exc:
            logger.warning("Plugin %s failed to load: %s", folder_name, exc)
            continue
        except Exception:
            logger.exception(
                "Unexpected error loading plugin %s", folder_name
            )
            continue

        # Guard against duplicate engine_id.
        engine_id = plugin.engine_id
        if engine_id in seen_engine_ids:
            logger.warning(
                "Duplicate engine_id %r in %s (already registered by %s) — skipping",
                engine_id,
                folder_name,
                seen_engine_ids[engine_id],
            )
            continue

        seen_engine_ids[engine_id] = folder_name
        loaded.append(plugin)
        logger.info(
            "Loaded plugin %s (engine_id=%r)",
            folder_name,
            engine_id,
        )

    # 2. Discover plugins from pip entry points (group "studio.tts").
    from importlib.metadata import entry_points
    try:
        eps = entry_points(group="studio.tts")
    except TypeError:
        # Python 3.9 compatibility
        all_eps = entry_points()
        eps = all_eps.get("studio.tts", [])

    for ep in eps:
        engine_id = ep.name
        # Precedence: folder-dropin wins over pip package.
        if engine_id in seen_engine_ids:
            logger.debug(
                "Skipping pip plugin %r - folder plugin %s takes precedence",
                engine_id,
                seen_engine_ids[engine_id],
            )
            continue

        try:
            plugin = _load_pip_plugin(ep, plugins_dir)
            loaded.append(plugin)
            seen_engine_ids[engine_id] = f"pip:{ep.name}"
            logger.info("Loaded pip plugin %r (engine_id=%r)", ep.name, engine_id)
        except Exception as exc:
            logger.warning("Pip plugin %s failed to load: %s", ep.name, exc)

    return loaded


def _load_plugin(*, plugin_dir: Path, folder_name: str) -> LoadedPlugin:
    """Load and validate a single plugin folder.

    Args:
        plugin_dir: Absolute path to the plugin folder.
        folder_name: Validated folder name (already checked against regex).

    Returns:
        LoadedPlugin: Loaded plugin with manifest and engine instance.

    Raises:
        PluginLoadError: If any validation or import step fails.
    """
    # 1. Load manifest.
    manifest = _load_manifest(plugin_dir=plugin_dir, folder_name=folder_name)

    # 2. Validate manifest fields.
    _validate_manifest(manifest=manifest, folder_name=folder_name)

    # 3. Import engine class.
    engine_cls = _import_engine_class(
        manifest=manifest,
        plugin_dir=plugin_dir,
        folder_name=folder_name,
    )

    # 4. Instantiate engine.
    try:
        engine = engine_cls()
    except Exception as exc:
        raise PluginLoadError(
            f"Failed to instantiate {engine_cls.__name__}: {exc}"
        ) from exc

    # 5. Environment check.
    try:
        ok, msg = engine.check_env()
    except Exception as exc:
        raise PluginLoadError(
            f"check_env() raised an exception: {exc}"
        ) from exc

    # 5b. Check persisted verification state.
    from app.tts_server.settings_store import calculate_verification_metadata, load_state # noqa: PLC0415
    state = load_state(plugin_dir)
    verified = False
    if state.get("verified") and ok:
        # Check if metadata matches to avoid stale verification.
        current_metadata = calculate_verification_metadata(plugin_dir, manifest)
        persisted_metadata = state.get("metadata", {})
        if all(current_metadata.get(k) == persisted_metadata.get(k) for k in current_metadata):
            verified = True
            logger.info("Plugin %s has valid persisted verification.", folder_name)

    # Still return the plugin — it will show in Settings as "needs_setup".
    # 6. Dependency check (requirements.txt)
    deps_ok, missing = _check_dependencies(plugin_dir)
    setup_message = None
    if not ok:
        setup_message = str(msg or "Resolve engine setup before enabling this plugin.")
    if not deps_ok:
        dep_text = ", ".join(missing)
        dep_message = f"Missing dependencies: {dep_text}."
        setup_message = f"{setup_message} {dep_message}".strip() if setup_message else dep_message
    if not deps_ok:
        logger.warning(
            "Plugin %s has missing dependencies: %s (marking as needs_setup)",
            folder_name,
            ", ".join(missing),
        )

    settings_schema = _load_optional_json(plugin_dir / "settings_schema.json")

    plugin = LoadedPlugin(
        folder_name=folder_name,
        plugin_dir=plugin_dir,
        manifest=manifest,
        engine=engine,
        settings_schema=settings_schema,
    )
    plugin.verified = verified
    if state.get("verification_error") and not verified:
        plugin.verification_error = state.get("verification_error")
    plugin.dependencies_satisfied = deps_ok
    plugin.missing_dependencies = missing
    plugin.setup_message = setup_message
    return plugin


def _load_pip_plugin(ep: Any, plugins_dir: Path) -> LoadedPlugin:
    """Load a plugin discovered via pip entry point.

    Args:
        ep: The entry point object from importlib.metadata.
        plugins_dir: The global plugins directory (used for settings storage).

    Returns:
        LoadedPlugin: Successfully loaded plugin.
    """
    # 1. Load engine class.
    try:
        engine_cls = ep.load()
    except Exception as exc:
        raise PluginLoadError(f"Failed to load entry point {ep.name}: {exc}") from exc

    # 2. Instantiate engine.
    try:
        engine = engine_cls()
    except Exception as exc:
        raise PluginLoadError(
            f"Failed to instantiate {engine_cls.__name__} from {ep.name}: {exc}"
        ) from exc

    # 3. Get metadata.
    # We prioritize manifest.json from the package distribution if available.
    manifest = {}
    if hasattr(ep, "dist") and ep.dist:
        try:
            manifest_str = ep.dist.read_text("manifest.json")
            if manifest_str:
                manifest = json.loads(manifest_str)
        except Exception:
            logger.debug("No manifest.json found in distribution for %s", ep.name)

    # Fallback/Required fields synthesis if manifest is missing or partial.
    if not manifest.get("engine_id"):
        manifest["engine_id"] = ep.name
    if not manifest.get("display_name"):
        manifest["display_name"] = ep.name.title()
    if not manifest.get("entry_class"):
        if hasattr(ep, "module"):
            manifest["entry_class"] = f"{ep.module}:{ep.attr}"
        else:
            manifest["entry_class"] = ep.value
    if not manifest.get("capabilities"):
        manifest["capabilities"] = ["synthesis"]

    # Validate the result (same rules as folder plugins).
    _validate_manifest(manifest=manifest, folder_name=f"pip:{ep.name}")

    # 4. Environment check.
    try:
        ok, msg = engine.check_env()
    except Exception as exc:
        raise PluginLoadError(f"check_env() raised an exception: {exc}") from exc

    if not ok:
        logger.warning("Pip plugin %s check_env() failed: %s", ep.name, msg)

    # 5. Optional settings schema from distribution.
    settings_schema = {}
    if hasattr(ep, "dist") and ep.dist:
        try:
            schema_str = ep.dist.read_text("settings_schema.json")
            if schema_str:
                settings_schema = json.loads(schema_str)
        except Exception:
            pass

    # For pip plugins, we use a folder in plugins_dir for settings persistence.
    plugin_dir = plugins_dir / f"tts_{ep.name}"
    plugin_dir.mkdir(parents=True, exist_ok=True)

    # 6. Dependency check (from distribution if available)
    deps_ok = True
    missing = []
    if hasattr(ep, "dist") and ep.dist:
        try:
            content = ep.dist.read_text("requirements.txt")
            if content:
                # We can't use _check_dependencies directly as it takes a Path
                import importlib.metadata  # noqa: PLC0415
                for line in content.splitlines():
                    line = line.strip()
                    if not line or line.startswith(("#", "-", "http://", "https://")):
                        continue
                    pkg_name = re.split(r"[<>=!~;\[]", line)[0].strip()
                    if not pkg_name:
                        continue
                    try:
                        importlib.metadata.distribution(pkg_name)
                    except importlib.metadata.PackageNotFoundError:
                        missing.append(pkg_name)
                deps_ok = len(missing) == 0
        except Exception:
            pass

    setup_message = None
    if not ok:
        setup_message = str(msg or "Resolve engine setup before enabling this plugin.")
    if not deps_ok:
        dep_text = ", ".join(missing)
        dep_message = f"Missing dependencies: {dep_text}."
        setup_message = f"{setup_message} {dep_message}".strip() if setup_message else dep_message

    plugin = LoadedPlugin(
        folder_name=f"pip:{ep.name}",
        plugin_dir=plugin_dir,
        manifest=manifest,
        engine=engine,
        settings_schema=settings_schema,
    )
    plugin.is_pip = True
    plugin.dependencies_satisfied = deps_ok
    plugin.missing_dependencies = missing
    plugin.setup_message = setup_message
    return plugin


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
    required = ["engine_id", "display_name", "entry_class", "capabilities"]
    for field_name in required:
        if not manifest.get(field_name):
            raise PluginLoadError(
                f"manifest.json missing required field '{field_name}' in {folder_name}"
            )

    engine_id = str(manifest["engine_id"]).strip()
    if not re.match(r"^[a-z][a-z0-9]{1,14}$", engine_id):
        raise PluginLoadError(
            f"engine_id {engine_id!r} does not match required pattern "
            f"^[a-z][a-z0-9]{{1,14}}$ in {folder_name}"
        )

    entry_class = str(manifest["entry_class"]).strip()
    if not _ENTRY_CLASS_RE.match(entry_class):
        raise PluginLoadError(
            f"entry_class {entry_class!r} must be in 'module:ClassName' format in {folder_name}"
        )

    capabilities = manifest.get("capabilities", [])
    if "synthesis" not in capabilities:
        raise PluginLoadError(
            f"capabilities must include 'synthesis' in {folder_name}"
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
    return data if isinstance(data, dict) else {}


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
            # Skip comments, empty lines, and links/flags.
            if not line or line.startswith(("#", "-", "http://", "https://")):
                continue

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


def _import_engine_class(
    *,
    manifest: dict[str, Any],
    plugin_dir: Path,
    folder_name: str,
) -> type:
    """Import and return the engine class declared in the manifest.

    Args:
        manifest: Parsed manifest dict.
        plugin_dir: Plugin folder path.
        folder_name: Validated folder name for error messages.

    Returns:
        type: The engine class.

    Raises:
        PluginLoadError: If the module cannot be imported or the class is not found.
    """
    entry_class = str(manifest["entry_class"]).strip()
    module_name, class_name = entry_class.split(":", 1)
    module_name = module_name.strip()

    # Build the module file path. Support dotted module names for submodules.
    if not re.match(r"^[a-z_][a-z0-9_.]*$", module_name):
        raise PluginLoadError(
            f"entry_class module name {module_name!r} is not a valid module name "
            f"in {folder_name}"
        )

    module_parts = module_name.split(".")
    module_path = plugin_dir.joinpath(*module_parts[:-1], f"{module_parts[-1]}.py")

    # Containment check.
    try:
        module_path.resolve().relative_to(plugin_dir.resolve())
    except (ValueError, RuntimeError) as exc:
        raise PluginLoadError(
            f"entry_class module path escapes plugin directory in {folder_name}"
        ) from exc

    if not module_path.is_file():
        raise PluginLoadError(
            f"entry_class module file not found: {module_path.relative_to(plugin_dir)} in {folder_name}"
        )

    # Use a unique module spec name to avoid collisions between plugins.
    spec_name = f"_tts_plugin_{folder_name}.{module_name}"

    try:
        spec = importlib.util.spec_from_file_location(spec_name, module_path)
        if spec is None or spec.loader is None:
            raise PluginLoadError(
                f"Could not create module spec for {module_path} in {folder_name}"
            )
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec_name] = module
        spec.loader.exec_module(module)  # type: ignore[attr-defined]
    except PluginLoadError:
        raise
    except Exception as exc:
        raise PluginLoadError(
            f"Failed to import {module_name} from {folder_name}: {exc}"
        ) from exc

    engine_cls = getattr(module, class_name, None)
    if engine_cls is None:
        raise PluginLoadError(
            f"Class {class_name!r} not found in {module_name}.py in {folder_name}"
        )
    if not isinstance(engine_cls, type):
        raise PluginLoadError(
            f"{class_name!r} in {folder_name} is not a class"
        )

    return engine_cls

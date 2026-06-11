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
import types
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

logger = logging.getLogger(__name__)

# Matches tts_<name> where <name> is 2–15 lowercase alphanumeric characters.
_PLUGIN_FOLDER_RE = re.compile(r"^tts_[a-z][a-z0-9]{1,14}$")

# Regex for callable fields: "module:ClassName" or "package.module:function_name"
_CALLABLE_RE = re.compile(r"^[a-z_][a-z0-9_.]*:[A-Za-z_][A-Za-z0-9_]*$")


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
        engine: Any = None,
        settings_schema: dict[str, Any] | None = None,
        load_error: str | None = None,
    ) -> None:
        self.folder_name = folder_name
        self.plugin_dir = plugin_dir
        self.manifest = manifest
        self.engine = engine
        self.settings_schema = settings_schema or {}
        self.load_error = load_error
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
        list[LoadedPlugin]: Successfully loaded plugins plus parseable manifest
        contract failures that can be shown as invalid_config in Studio. Missing
        manifests, malformed JSON, and runtime import/init/check failures are
        skipped and logged as warnings.
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
        except Exception as exc:
            logger.warning("Plugin %s failed to load: %s", folder_name, exc)
            # PluginLoadError messages are controlled diagnostics (manifest
            # validation strings, or crash details only when the plugin opts
            # into dev.enabled); they are intentionally surfaced to the local
            # operator on engine cards. Raw unexpected exceptions stay generic.
            plugin = _invalid_manifest_plugin(
                plugin_dir=entry,
                folder_name=folder_name,
                load_error=str(exc) if isinstance(exc, PluginLoadError) else "Unexpected error while loading plugin (see server logs)",  # lgtm[py/stack-trace-exposure]
            )
            if plugin is not None:
                loaded.append(plugin)
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


def _invalid_manifest_plugin(
    *,
    plugin_dir: Path,
    folder_name: str,
    load_error: str,
) -> LoadedPlugin | None:
    """Return a health-reportable plugin only for parseable manifest failures.

    Broken manifests are useful to surface in Studio because the plugin author
    can fix them from the diagnostics. Runtime failures remain isolated so a
    crashing plugin engine does not appear as an installed engine, EXCEPT when
    dev.enabled is True in the manifest.
    """
    try:
        manifest = _load_manifest(plugin_dir=plugin_dir, folder_name=folder_name)
    except PluginLoadError:
        # If manifest itself is missing or unparseable, we can't even check dev mode safely.
        # Isolation remains strict for security.
        return None

    try:
        _validate_manifest(manifest=manifest, folder_name=folder_name)
    except PluginLoadError:
        # Manifest validation failed. This is a "contract" error we surface.
        manifest = dict(manifest)
        manifest.setdefault("engine_id", folder_name.replace("tts_", "", 1))
        manifest.setdefault("display_name", folder_name)
        manifest.setdefault("capabilities", [])
        return LoadedPlugin(
            folder_name=folder_name,
            plugin_dir=plugin_dir,
            manifest=manifest,
            load_error=load_error,
        )

    # If we reached here, the manifest is valid but something else failed (import/init).
    # We only surface these if dev.enabled is True.
    dev_config = manifest.get("dev", {})
    if isinstance(dev_config, dict) and dev_config.get("enabled") is True:
        return LoadedPlugin(
            folder_name=folder_name,
            plugin_dir=plugin_dir,
            manifest=manifest,
            load_error=load_error,
        )

    return None


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
    dev_enabled = isinstance(manifest.get("dev"), dict) and manifest["dev"].get("enabled") is True
    try:
        engine = engine_cls()
    except Exception as exc:
        # Dev plugins surface full exception text for the plugin author;
        # otherwise only the exception type leaves the server (details logged).
        detail = str(exc) if dev_enabled else "unexpected error (see server logs)"
        raise PluginLoadError(
            f"Failed to instantiate {engine_cls.__name__}: {detail}"
        ) from exc

    # 5. Environment check — with persisted settings when the engine accepts
    # them, otherwise a settings-keyed engine (e.g. an API key stored in
    # engine settings) fails check_env on every boot and its persisted
    # verification below is discarded.
    from app.tts_server.health import call_check_env  # noqa: PLC0415
    try:
        ok, msg = call_check_env(engine, plugin_dir)
    except Exception as exc:
        detail = str(exc) if dev_enabled else "unexpected error (see server logs)"
        raise PluginLoadError(f"check_env() raised an exception: {detail}") from exc

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
    if not manifest.get("studio_tts_manifest"):
        manifest["studio_tts_manifest"] = "1.0"
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

    # For pip plugins, we use a folder in plugins_dir for settings persistence.
    plugin_dir = plugins_dir / f"tts_{ep.name}"
    plugin_dir.mkdir(parents=True, exist_ok=True)

    # 4. Environment check — settings-aware, same as folder plugins.
    from app.tts_server.health import call_check_env  # noqa: PLC0415
    try:
        ok, msg = call_check_env(engine, plugin_dir)
    except Exception as exc:
        raise PluginLoadError(f"check_env() raised {type(exc).__name__} (see server logs)") from exc

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
    required = ["studio_tts_manifest", "engine_id", "display_name", "entry_class", "capabilities"]
    for field_name in required:
        if not manifest.get(field_name):
            raise PluginLoadError(
                f"manifest.json missing required field '{field_name}' in {folder_name}"
            )

    manifest_version = str(manifest["studio_tts_manifest"]).strip()
    if manifest_version != "1.0":
        raise PluginLoadError(
            f"Unsupported studio_tts_manifest version {manifest_version!r} in {folder_name}. "
            "Supported versions: '1.0'."
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
    package_name = f"_tts_plugin_{folder_name}"
    spec_name = f"{package_name}.{module_name}"

    try:
        # 1. Ensure package modules exist so interface.py and nested modules can
        # use package-relative imports without colliding with other plugins.
        _ensure_plugin_package_hierarchy(
            package_name=package_name,
            plugin_dir=plugin_dir,
            module_parts=module_parts[:-1],
        )

        # 2. Load the actual engine module.
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

    # 4. Verify signature compatibility (Duck Typing check for StudioTTSEngine contract)
    required_methods = ["info", "check_env", "check_request", "synthesize", "settings_schema"]
    missing_methods = [m for m in required_methods if not hasattr(engine_cls, m) or not callable(getattr(engine_cls, m))]

    # Also check for unimplemented abstract methods if they used the ABC contract
    abstract_methods = getattr(engine_cls, "__abstractmethods__", set())
    unimplemented = abstract_methods.intersection(set(required_methods))

    if missing_methods or unimplemented:
        all_missing = sorted(list(set(missing_methods) | unimplemented))
        methods_str = ", ".join(all_missing)
        raise PluginLoadError(
            f"Class {class_name!r} in {folder_name} is missing or has unimplemented required methods: {methods_str}. "
            "Engines must implement the StudioTTSEngine contract."
        )

    return engine_cls


def _ensure_plugin_package_hierarchy(
    *,
    package_name: str,
    plugin_dir: Path,
    module_parts: list[str],
) -> None:
    """Create isolated package modules for a plugin's internal imports."""
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


def get_plugin_dir(engine_id: str) -> Path:
    """Return the expected plugin directory for a given engine_id.

    This uses the default PLUGINS_DIR from app.config. The result is
    guaranteed to stay inside PLUGINS_DIR (normpath+startswith barrier),
    so callers may use it in path expressions safely.

    Raises:
        ValueError: If engine_id would escape the plugins directory.
    """
    import os  # noqa: PLC0415
    from app.core.config import PLUGINS_DIR # noqa: PLC0415
    base = os.path.normpath(str(PLUGINS_DIR))
    candidate = os.path.normpath(os.path.join(base, f"tts_{engine_id}"))
    if not candidate.startswith(base + os.sep):
        raise ValueError("engine_id escapes the plugins directory")
    return Path(candidate)

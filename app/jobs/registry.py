from __future__ import annotations
import logging
import re
import sys
import types
from typing import Callable, Dict, Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..db.models import Job

logger = logging.getLogger(__name__)

HandlerFunc = Callable[..., Any]

class JobHandlerRegistry:
    """Registry for mapping job engines or kinds to execution handlers."""

    def __init__(self):
        self._engine_handlers: Dict[str, HandlerFunc] = {}
        self._kind_handlers: Dict[str, HandlerFunc] = {}

    def register_engine(self, engine: str, handler: HandlerFunc):
        """Register a specific handler for an engine name."""
        self._engine_handlers[engine] = handler
        logger.debug("Registered engine handler: %s", engine)

    def register_kind(self, kind: str, handler: HandlerFunc):
        """Register a fallback handler for a job kind (e.g., 'voice_build')."""
        self._kind_handlers[kind] = handler
        logger.debug("Registered kind handler: %s", kind)

    def has_any(self) -> bool:
        """Return True if any handlers are registered."""
        return bool(self._engine_handlers or self._kind_handlers)

    def clear(self):
        """Clear all registered handlers."""
        self._engine_handlers.clear()
        self._kind_handlers.clear()
        logger.debug("Cleared job handler registry")

    def get_handler(self, job: Job) -> Optional[HandlerFunc]:
        """Fetch the most specific handler for the given job."""
        engine = job.engine

        # 1. Exact engine match (e.g., 'audiobook')
        if engine in self._engine_handlers:
            return self._engine_handlers[engine]

        # 2. Kind match (e.g., 'voice_build', 'assembly')
        kind = getattr(job, "kind", None)
        if kind and kind in self._kind_handlers:
            return self._kind_handlers[kind]

        # 3. Handle special categories via kind mapping if engine name doesn't match
        if engine in ("voice_build", "voice_test") and "voice_task" in self._kind_handlers:
            return self._kind_handlers["voice_task"]

        # 4. Standard rendering fallback for generic plugins
        from ..engines.behavior import supports_standard_rendering
        if supports_standard_rendering(engine):
            if "standard" in self._kind_handlers:
                return self._kind_handlers["standard"]

        return None

# Singleton instance
_registry = JobHandlerRegistry()

def get_handler_registry() -> JobHandlerRegistry:
    """Return the global job handler registry."""
    return _registry

def initialize_default_handlers():
    """Wire up the built-in handlers and discover plugin handlers."""
    reg = get_handler_registry()
    if reg.has_any():
        return

    from .handlers.audiobook import handle_audiobook_job
    from app.core.config import PLUGINS_DIR
    import json

    reg = get_handler_registry()

    # 1. Built-in generic handlers
    reg.register_engine("audiobook", handle_audiobook_job)
    reg.register_kind("assembly", handle_audiobook_job)

    # 2. Voice/Sample handlers
    from .worker_voice import handle_voice_job
    reg.register_kind("voice_build", handle_voice_job)
    reg.register_kind("voice_test", handle_voice_job)
    reg.register_kind("sample_build", handle_voice_job)
    reg.register_kind("sample_test", handle_voice_job)

    # 3. Plugin discovery
    if not PLUGINS_DIR.is_dir():
        logger.debug("Plugins directory not found at %s", PLUGINS_DIR)
        return

    for entry in sorted(PLUGINS_DIR.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue

        manifest_path = entry / "manifest.json"
        if not manifest_path.is_file():
            continue

        try:
            with open(manifest_path, "r") as f:
                manifest = json.load(f)

            worker_logic = manifest.get("worker_logic")
            # Support potential 'job_handler' flat field for simple cases
            if not worker_logic and "job_handler" in manifest:
                eid = manifest.get("engine_id")
                if eid:
                    worker_logic = {"engine_handlers": {eid: manifest["job_handler"]}}

            if not worker_logic:
                continue

            logger.info("Found worker logic in plugin: %s", entry.name)

            # Load and register handlers
            for section, registry_method in [
                ("engine_handlers", reg.register_engine),
                ("kind_handlers", reg.register_kind)
            ]:
                handlers_map = worker_logic.get(section, {})
                for key, handler_spec in handlers_map.items():
                    try:
                        handler_func = _load_plugin_callable(
                            plugin_dir=entry,
                            folder_name=entry.name,
                            handler_spec=str(handler_spec),
                        )
                        if handler_func:
                            registry_method(key, handler_func)
                    except Exception as e:
                        logger.error("Failed to load handler %s from %s: %s", handler_spec, entry.name, e)
        except Exception as e:
            logger.error("Failed to process plugin %s for job handlers: %s", entry.name, e)


def _load_plugin_callable(*, plugin_dir, folder_name: str, handler_spec: str) -> HandlerFunc | None:
    import importlib.util

    if ":" not in handler_spec:
        logger.warning("Invalid handler spec %r in %s", handler_spec, folder_name)
        return None

    module_name, func_name = handler_spec.split(":", 1)
    module_name = module_name.strip()
    func_name = func_name.strip()
    if not re.match(r"^[a-z_][a-z0-9_.]*$", module_name):
        logger.warning("Invalid handler module %r in %s", module_name, folder_name)
        return None

    module_parts = module_name.split(".")
    module_path = plugin_dir.joinpath(*module_parts[:-1], f"{module_parts[-1]}.py")
    try:
        module_path.resolve().relative_to(plugin_dir.resolve())
    except (ValueError, RuntimeError):
        logger.warning("Handler module path escapes plugin directory: %s in %s", module_name, folder_name)
        return None
    if not module_path.is_file():
        logger.warning("Handler module %s not found in %s", module_name, folder_name)
        return None

    package_name = f"plugins.{folder_name}"
    spec_name = f"{package_name}.{module_name}"
    _ensure_plugin_package_hierarchy(
        package_name=package_name,
        plugin_dir=plugin_dir,
        module_parts=module_parts[:-1],
    )
    spec = importlib.util.spec_from_file_location(spec_name, module_path)
    if not spec or not spec.loader:
        logger.warning("Could not create handler module spec for %s in %s", module_name, folder_name)
        return None

    if spec_name in sys.modules:
        module = sys.modules[spec_name]
    else:
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec_name] = module
        spec.loader.exec_module(module)
    handler_func = getattr(module, func_name, None)
    if not handler_func:
        logger.error("Handler function %s not found in %s", func_name, module_path)
        return None
    return handler_func


def _ensure_plugin_package_hierarchy(*, package_name: str, plugin_dir, module_parts: list[str]) -> None:
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

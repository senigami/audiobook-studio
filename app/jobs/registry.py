from __future__ import annotations
import logging
from typing import Callable, Dict, Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..models import Job

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

    def get_handler(self, job: Job) -> Optional[HandlerFunc]:
        """Fetch the most specific handler for the given job."""
        engine = job.engine

        # 1. Exact engine match (e.g., 'audiobook')
        if engine in self._engine_handlers:
            return self._engine_handlers[engine]

        # 2. Kind match (e.g., 'voice_build' or 'voice_test')
        if engine in self._kind_handlers:
            return self._kind_handlers[engine]

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
    from .handlers.audiobook import handle_audiobook_job
    from app.config import PLUGINS_DIR
    import json
    import importlib.util
    import sys

    reg = get_handler_registry()

    # 1. Built-in generic handlers
    reg.register_engine("audiobook", handle_audiobook_job)

    # 2. Plugin discovery
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
                        if ":" not in handler_spec:
                            logger.warning("Invalid handler spec %r in %s", handler_spec, entry.name)
                            continue

                        module_name, func_name = handler_spec.split(":", 1)
                        # Support submodules if needed, but for now expect flat files in plugin root
                        module_path = entry / f"{module_name}.py"
                        if not module_path.is_file():
                            logger.warning("Handler module %s not found in %s", module_name, entry.name)
                            continue

                        # Use a unique spec name to avoid collisions
                        spec_name = f"_job_plugin_{entry.name}_{module_name}"
                        spec = importlib.util.spec_from_file_location(spec_name, module_path)
                        if spec and spec.loader:
                            module = importlib.util.module_from_spec(spec)
                            # Add the plugin directory to sys.path temporarily to allow local imports within the plugin
                            # but better to use absolute imports for app.*
                            sys.modules[spec_name] = module
                            spec.loader.exec_module(module)
                            handler_func = getattr(module, func_name, None)
                            if handler_func:
                                registry_method(key, handler_func)
                            else:
                                logger.error("Handler function %s not found in %s", func_name, module_path)
                    except Exception as e:
                        logger.error("Failed to load handler %s from %s: %s", handler_spec, entry.name, e)
        except Exception as e:
            logger.error("Failed to process plugin %s for job handlers: %s", entry.name, e)

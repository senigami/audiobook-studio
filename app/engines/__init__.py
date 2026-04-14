"""Engine registry and bridge package for Studio 2.0.

Phase 1 compatibility note:
- This package intentionally coexists with the legacy ``app/engines.py`` module.
- Until the engine cutover phase is complete, unresolved attribute access falls
  back to the legacy module so existing imports continue to work.

Compatibility behavior:
- Legacy helpers still execute against the legacy module globals.
- Test and migration code often patches ``app.engines.*`` directly.
- To keep those patches effective during the coexistence phase, writes to this
  package are mirrored into the legacy module when the same name exists there.

Phase 5 note:
- When ``USE_TTS_SERVER=true``, Studio boot wiring starts the TTS Server
  watchdog explicitly before synthesis work is routed through the bridge.
  Importing this package must not start threads or subprocesses on its own.
"""

import sys
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType

from .bridge import create_voice_bridge
from .registry import load_engine_registry

_LEGACY_MODULE: ModuleType | None = None


def _load_legacy_engines_module() -> ModuleType:
    """Load the legacy ``app/engines.py`` module behind the new package.

    Returns:
        ModuleType: Loaded legacy engines module.

    Raises:
        ImportError: If the legacy module file cannot be loaded.
    """
    global _LEGACY_MODULE

    if _LEGACY_MODULE is not None:
        return _LEGACY_MODULE

    legacy_path = Path(__file__).resolve().parent.parent / "engines.py"
    spec = spec_from_file_location("app._legacy_engines_module", legacy_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load legacy engines module from {legacy_path}")

    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    _LEGACY_MODULE = module
    return module


def __getattr__(name: str):
    """Resolve unknown attributes from the legacy engines module.

    Args:
        name: Attribute requested from the ``app.engines`` package.

    Returns:
        object: Either a Studio 2.0 package export or a legacy engine helper.

    Raises:
        AttributeError: If neither the new package nor legacy module defines
            the requested name.
    """
    if name in {"create_voice_bridge", "load_engine_registry"}:
        return globals()[name]

    legacy_module = _load_legacy_engines_module()
    try:
        return getattr(legacy_module, name)
    except AttributeError as exc:
        raise AttributeError(f"module 'app.engines' has no attribute {name!r}") from exc


def __dir__() -> list[str]:
    """Expose both Studio 2.0 and legacy names for discovery tools."""
    names = set(globals())
    try:
        names.update(dir(_load_legacy_engines_module()))
    except ImportError:
        pass
    return sorted(names)


__all__ = ["create_voice_bridge", "load_engine_registry"]


class _EnginesCompatibilityModule(ModuleType):
    """Mirror package-level patches into the legacy module during coexistence."""

    def __setattr__(self, name: str, value):
        super().__setattr__(name, value)

        if name.startswith("__"):
            return

        legacy_module = _LEGACY_MODULE
        if legacy_module is None:
            return

        if hasattr(legacy_module, name):
            setattr(legacy_module, name, value)


sys.modules[__name__].__class__ = _EnginesCompatibilityModule

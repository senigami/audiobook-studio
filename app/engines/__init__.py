"""Engine registry and bridge package for Studio 2.0.

Phase 1 compatibility note:
- This package intentionally coexists with the legacy ``app/engines.py`` module.
- Until the engine cutover phase is complete, unresolved attribute access falls
  back to the legacy module so existing imports continue to work.
"""

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

"""Engine registry for Studio 2.0."""

from app.engines.voice.base import BaseVoiceEngine


def load_engine_registry() -> dict[str, BaseVoiceEngine]:
    """Placeholder registry loader.

    The long-term loader will discover internal engine modules and expose them
    through a uniform registry for the voice bridge.
    """
    _ = _load_builtin_engines()
    _ = _load_plugin_engines()
    raise NotImplementedError


def _load_builtin_engines() -> dict[str, BaseVoiceEngine]:
    """Describe discovery of built-in engine adapters shipped with the app.

    Returns:
        dict[str, BaseVoiceEngine]: Built-in engine registry entries.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError


def _load_plugin_engines() -> dict[str, BaseVoiceEngine]:
    """Describe discovery of optional plugin-provided engine adapters.

    Returns:
        dict[str, BaseVoiceEngine]: Plugin engine registry entries.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError

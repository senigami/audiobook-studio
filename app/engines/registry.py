"""Engine registry for Studio 2.0."""

from pathlib import Path

from app.engines.voice.base import BaseVoiceEngine


def load_engine_registry() -> dict[str, BaseVoiceEngine]:
    """Placeholder registry loader.

    The long-term loader will discover internal engine modules and expose them
    through a uniform registry for the voice bridge.
    """
    _ = _load_engine_manifest(
        manifest_path=Path(__file__).resolve().parent / "voice" / "xtts" / "manifest.json"
    )
    _ = _load_engine_manifest(
        manifest_path=Path(__file__).resolve().parent / "voice" / "voxtral" / "manifest.json"
    )
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


def _load_engine_manifest(*, manifest_path: Path) -> dict[str, object]:
    """Describe manifest loading for built-in engine discovery.

    Args:
        manifest_path: Filesystem path to an engine manifest JSON file.

    Returns:
        dict[str, object]: Placeholder manifest payload for registry assembly.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = manifest_path
    raise NotImplementedError

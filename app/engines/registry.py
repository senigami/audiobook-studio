"""Engine registry for Studio 2.0."""

from app.engines.voice.base import BaseVoiceEngine


def load_engine_registry() -> dict[str, BaseVoiceEngine]:
    """Placeholder registry loader.

    The long-term loader will discover internal engine modules and expose them
    through a uniform registry for the voice bridge.
    """
    raise NotImplementedError

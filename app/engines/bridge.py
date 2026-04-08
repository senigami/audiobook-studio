"""Voice bridge for Studio 2.0.

This is the only place that should route a voice request to a concrete engine
implementation.
"""

from app.engines.registry import load_engine_registry


class VoiceBridge:
    """Placeholder bridge surface for synthesis and preview/test calls."""

    def synthesize(self, request):
        """Route a synthesis request through the registry."""
        _ = load_engine_registry
        raise NotImplementedError("Studio 2.0 synthesis routing is not implemented yet.")

    def preview(self, request):
        """Route a preview/test request through the registry."""
        _ = load_engine_registry
        raise NotImplementedError("Studio 2.0 preview routing is not implemented yet.")


def create_voice_bridge() -> VoiceBridge:
    """Factory for the future voice bridge."""
    raise NotImplementedError

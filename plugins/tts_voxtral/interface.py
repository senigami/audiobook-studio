"""Public Voxtral plugin interface.

Studio should load this module from manifest-declared entrypoints.  Internal
implementation details live under ``plugin/`` so future plugin repos have a
clear public surface.
"""

from __future__ import annotations

from .plugin.server.engine import VoxtralPlugin
from .plugin.studio.app_adapter import VoxtralVoiceEngine
from .plugin.studio.handler import handle_voxtral_job

__all__ = [
    "VoxtralPlugin",
    "VoxtralVoiceEngine",
    "handle_voxtral_job",
]

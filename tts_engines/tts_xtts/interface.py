"""Public XTTS plugin interface.

Studio should load this module from manifest-declared entrypoints.  Internal
implementation details live under ``plugin/`` so future plugin repos have a
clear public surface.
"""

from __future__ import annotations

from .plugin.server.engine import XttsPlugin
from .plugin.studio.app_adapter import XttsVoiceEngine
from .plugin.studio.adapter import xtts_dispatch_adapter
from .plugin.studio.handler import handle_xtts_job, _group_job_progress
from .plugin.studio.voice_adapter import voice_job_dispatch_adapter

__all__ = [
    "XttsPlugin",
    "XttsVoiceEngine",
    "xtts_dispatch_adapter",
    "handle_xtts_job",
    "_group_job_progress",
    "voice_job_dispatch_adapter",
]

"""Engine registry and bridge package for Studio 2.0.

This package provides the agnostic interface (Bridge/Registry) for Studio 2.0.
"""

from __future__ import annotations

from .bridge import create_voice_bridge
from .registry import load_engine_registry

__all__ = ["create_voice_bridge", "load_engine_registry"]

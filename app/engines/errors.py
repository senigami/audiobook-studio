"""Engine bridge exceptions: app-side re-export shim.

The tree itself lives in ``studio_plugin_sdk.engine_errors`` so a plugin can
raise and catch these without importing ``app.*`` (issue #200). This module
re-exports the identical class objects, so every existing importer and every
``except EngineBridgeError`` clause keeps working unchanged.

The whole tree moves and lives as one unit. ``EngineBridgeError`` roots at
``RuntimeError``, deliberately not at ``studio_plugin_sdk.errors.StudioException``:
re-parenting it would stop the live ``except EngineBridgeError`` clauses matching
without raising anything. ``tests/engines/test_engine_error_hierarchy.py`` pins
every parent.
"""

from __future__ import annotations

from studio_plugin_sdk.engine_errors import (
    EngineBridgeError,
    EngineExecutionError,
    EngineNotReadyError,
    EngineOutputRejectedError,
    EngineRequestError,
    EngineUnavailableError,
)

__all__ = [
    "EngineBridgeError",
    "EngineExecutionError",
    "EngineNotReadyError",
    "EngineOutputRejectedError",
    "EngineRequestError",
    "EngineUnavailableError",
]

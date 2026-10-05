"""Studio Plugin SDK: engine bridge exceptions.

SDK-owned and stdlib-only, so a plugin's app-side adapter can raise and catch
these without importing ``app.*`` (issue #200). ``app.engines.errors`` re-exports
them with identical object identity.

``EngineBridgeError`` roots at ``RuntimeError`` and every other class in this
module descends directly from it. That single root is load-bearing: seven live
``except EngineBridgeError`` sites in the host, plus the ``tts_mixed`` and
``tts_voxtral`` handlers, rely on it, and re-parenting any class here (under
``studio_plugin_sdk.errors.StudioException``, say) would stop those clauses
matching without raising anything. ``tests/engines/test_engine_error_hierarchy.py``
pins every parent by name.
"""

from __future__ import annotations


class EngineBridgeError(RuntimeError):
    """Base error for engine bridge failures."""


class EngineRequestError(EngineBridgeError):
    """Raised when a voice request is invalid for bridge routing."""


class EngineUnavailableError(EngineBridgeError):
    """Raised when an engine is installed but not available to execute."""


class EngineNotReadyError(EngineBridgeError):
    """Raised when an engine is installed but still warming or initializing."""


class EngineExecutionError(EngineBridgeError):
    """Raised when an engine began execution but failed before completion."""


class EngineOutputRejectedError(EngineBridgeError):
    """Raised when an engine's check_output hook rejects the synthesized artifact.

    The artifact has already been deleted by the TTS Server before this error
    reaches Studio.  The ``reason`` attribute carries the engine's rejection
    message verbatim.  Jobs that receive this error are failed immediately with
    no automatic retry.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(f"output_rejected: {reason}")
        self.reason = reason

"""Engine bridge exceptions for Studio 2.0."""

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

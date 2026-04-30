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

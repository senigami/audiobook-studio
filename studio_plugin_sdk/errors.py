"""Studio Plugin SDK — exception hierarchy.

SDK-owned: this module has zero ``app.*`` dependencies so it is importable
standalone in the TTS Server subprocess and in extracted plugin repos.
Plugin handlers should raise (or catch) these exceptions rather than
importing anything from ``app.engines.errors``.
"""

from __future__ import annotations


class StudioException(Exception):
    """Base class for all Studio plugin SDK exceptions."""


class BridgeError(StudioException):
    """Raised when the TTS bridge cannot complete a synthesis request."""


class ValidationError(StudioException):
    """Raised when a plugin-supplied value fails contract validation.

    Use this when a ``JobSpec`` field value, a manifest field, or a
    context-method argument is out of range or otherwise violates the
    plugin contract.
    """

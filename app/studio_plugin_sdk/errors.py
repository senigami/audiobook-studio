"""Studio Plugin SDK — exception hierarchy.

Plugin handlers should raise (or catch) these exceptions rather than
importing directly from ``app.engines.errors``.  ``BridgeError`` is
a subclass of (and therefore a drop-in replacement for) the internal
``EngineBridgeError`` so handlers can migrate their ``except`` clauses
one at a time.
"""

from __future__ import annotations


class StudioException(Exception):
    """Base class for all Studio plugin SDK exceptions."""


class BridgeError(StudioException):
    """Raised when the TTS bridge cannot complete a synthesis request.

    This is the SDK-visible alias for ``app.engines.errors.EngineBridgeError``.
    Handlers that currently catch ``EngineBridgeError`` can switch their import
    to ``from studio_plugin_sdk.errors import BridgeError`` with no other change
    required — the exception hierarchy is compatible in both directions.
    """


class ValidationError(StudioException):
    """Raised when a plugin-supplied value fails contract validation.

    Use this when a ``JobSpec`` field value, a manifest field, or a
    context-method argument is out of range or otherwise violates the
    plugin contract.
    """

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


# Resolve EngineBridgeError at module load time (late import to avoid side
# effects during a bare `import studio_plugin_sdk.errors` in the TTS Server
# subprocess where app.* isn't available).  Falls back to StudioException so
# the module is importable standalone.
try:
    from app.engines.errors import EngineBridgeError as _EngineBridgeError  # noqa: PLC0415
    _BridgeErrorBase = _EngineBridgeError
except ImportError:
    _BridgeErrorBase = StudioException  # type: ignore[assignment]


class BridgeError(StudioException, _BridgeErrorBase):  # type: ignore[valid-base]
    """Raised when the TTS bridge cannot complete a synthesis request.

    This is the SDK-visible alias for ``app.engines.errors.EngineBridgeError``.
    ``BridgeError`` is also a subclass of ``EngineBridgeError`` so that:
    - ``except BridgeError`` catches exceptions raised by the bridge, and
    - legacy ``except EngineBridgeError`` clauses continue to catch
      ``BridgeError`` instances.
    The exception hierarchy is compatible in both directions.
    """


class ValidationError(StudioException):
    """Raised when a plugin-supplied value fails contract validation.

    Use this when a ``JobSpec`` field value, a manifest field, or a
    context-method argument is out of range or otherwise violates the
    plugin contract.
    """

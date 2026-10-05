"""Studio Plugin SDK: the app-adapter contract.

Distinct from ``StudioTTSEngine`` (the server-side, per-job contract that runs
inside the TTS Server subprocess). This is the reverse direction: the class the
Studio host process itself instantiates and calls into, declared in a plugin's
``manifest.json`` as ``app_adapter_class`` / ``app_adapter_module`` and living in
``plugin/studio/app_adapter.py``.

``VoiceEngineAdapter`` is a Protocol, deliberately, so a plugin inherits nothing
host-side and can be extracted into its own repo (issue #189). It matches what
the host already does at the one place it consumes an engine object: duck-typing.
``app/engines/registry.py`` wraps every engine in ``_TtsServerEngineProxy``, which
has never subclassed anything.

The four request helpers below were methods on the host's ``BaseVoiceEngine``,
duplicated verbatim in both plugins before that. They take everything they need
as arguments, so they lose nothing as functions, and ``BaseVoiceEngine`` now
binds these exact function objects rather than keeping a second copy.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from .engine_errors import EngineRequestError
from .engine_models import EngineHealthModel
from .types import VoiceProcessingHooks

__all__ = [
    "VoiceEngineAdapter",
    "normalize_output_format",
    "resolve_output_path",
    "resolve_on_output",
    "resolve_cancel_check",
]


@runtime_checkable
class VoiceEngineAdapter(Protocol):
    """The nine methods the Studio host may call on a plugin's app adapter.

    Structural, not nominal: implement the methods on a plain class and the
    adapter satisfies this without importing or subclassing anything host-side.
    ``isinstance`` against a ``runtime_checkable`` Protocol checks method
    presence only, never signatures, which is the same guarantee the TTS Server's
    plugin loader gives for ``StudioTTSEngine``.

    ``hooks``, ``settings_schema`` and ``current_settings`` have sensible
    fallbacks in the host (no hooks, empty schema, empty settings), but an
    adapter must still define all nine to satisfy the Protocol.
    """

    def hooks(self) -> VoiceProcessingHooks:
        """Return the engine's processing hooks."""
        ...

    def describe_health(self) -> EngineHealthModel:
        """Summarize readiness for discovery and diagnostics, without side effects."""
        ...

    def validate_environment(self) -> None:
        """Raise if the engine cannot run in the current environment."""
        ...

    def validate_request(self, request: dict[str, object]) -> None:
        """Raise ``EngineRequestError`` if the request is not valid for this engine."""
        ...

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Synthesize audio for a canonical voice request."""
        ...

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Run preview or test synthesis for a lightweight voice request."""
        ...

    def settings_schema(self) -> dict[str, Any]:
        """Return the engine's configuration schema for the Settings UI."""
        ...

    def current_settings(self) -> dict[str, Any]:
        """Return the engine's current persisted settings snapshot."""
        ...

    def build_voice_asset(self, request: dict[str, object]) -> dict[str, object]:
        """Build or refresh engine-specific voice assets for a profile."""
        ...


def normalize_output_format(
    request: dict[str, object],
    *,
    engine_name: str,
    allow_mp3: bool = False,
) -> str:
    """Validate and normalize the requested output audio format.

    Args:
        request: Engine-ready request payload.
        engine_name: Human-readable engine name for error messages
            (e.g. "XTTS", "Voxtral").
        allow_mp3: Whether mp3 output is permitted for this call (typically
            True for synthesis, False for lightweight preview).
    """
    output_format = str(request.get("output_format") or "wav").strip().lower() or "wav"
    allowed_formats = {"wav", "mp3"} if allow_mp3 else {"wav"}
    if output_format not in allowed_formats:
        if allow_mp3:
            raise EngineRequestError(
                f"{engine_name} bridge synthesis currently supports output_format='wav' or 'mp3' only."
            )
        raise EngineRequestError(
            f"{engine_name} bridge preview currently supports output_format='wav' only."
        )
    return output_format


def resolve_output_path(request: dict[str, object], *, engine_name: str) -> Path:
    """Resolve and prepare the output path for a synthesis request."""
    output_path = str(request.get("output_path") or "").strip()
    if not output_path:
        raise EngineRequestError(f"{engine_name} synthesis requests must include output_path.")
    resolved = Path(output_path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def resolve_on_output(request: dict[str, object], *, engine_name: str) -> Callable[[str], None]:
    """Resolve the request's on_output callback, defaulting to a no-op."""
    on_output = request.get("on_output")
    if on_output is None:
        return lambda _line: None
    if not callable(on_output):
        raise EngineRequestError(f"{engine_name} on_output callback must be callable.")
    return on_output


def resolve_cancel_check(request: dict[str, object], *, engine_name: str) -> Callable[[], bool]:
    """Resolve the request's cancel_check callback, defaulting to never-cancel."""
    cancel_check = request.get("cancel_check")
    if cancel_check is None:
        return lambda: False
    if not callable(cancel_check):
        raise EngineRequestError(f"{engine_name} cancel_check callback must be callable.")
    return cancel_check

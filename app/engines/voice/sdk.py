"""Studio TTS SDK contract types.

These dataclasses form the published interface between the TTS Server and
plugin engine implementations.  Plugin authors import from this module only —
they must not import anything from the rest of ``app``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class TTSRequest:
    """Immutable synthesis request passed from the TTS Server to an engine.

    The TTS Server constructs this from the incoming HTTP request and passes it
    directly to the engine's ``synthesize()`` or ``preview()`` method.

    Attributes:
        text: The text to synthesize.  Already pre-cleaned by the caller.
        output_path: Absolute filesystem path where the engine must write the
            output audio file.  Created by the TTS Server; the engine only
            writes to it.
        voice_ref: Optional absolute path to a reference audio WAV file used
            for voice cloning or speaker conditioning.
        settings: Engine-specific settings dict loaded from the engine's
            ``settings.json``.  Keys and value types match the engine's own
            ``settings_schema.json``.
        language: BCP-47 language code, e.g. ``"en"``, ``"es"``.
    """

    text: str
    output_path: str
    voice_ref: str | None = None
    settings: dict[str, Any] = field(default_factory=dict)
    language: str = "en"


@dataclass
class TTSResult:
    """Result returned by an engine after synthesis or preview.

    Engines must return this from ``synthesize()`` and ``preview()``.  On
    failure, set ``ok=False`` and populate ``error``; do not raise.

    Attributes:
        ok: ``True`` when synthesis completed and a valid audio file was
            written to ``output_path``.
        output_path: Absolute path to the written audio file, or ``None`` when
            ``ok`` is ``False``.
        duration_sec: Duration of the generated audio in seconds, or ``None``
            when unavailable.
        warnings: Non-fatal messages the engine wants to surface to the user.
        error: Human-readable error message when ``ok`` is ``False``.
    """

    ok: bool
    output_path: str | None = None
    duration_sec: float | None = None
    warnings: list[str] = field(default_factory=list)
    error: str | None = None

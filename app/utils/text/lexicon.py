"""Pronunciation lexicon substitution for TTS pre-processing.

Re-export shim. The implementation moved to ``studio_plugin_sdk.text`` in
SDK 1.1 (issue #200) so engine plugins can reach it without importing
``app.*``; it is a pure function over text with no host dependency. This
module keeps the historic ``app.utils.text.lexicon`` import path working and
is the same object, not a copy.
"""

from __future__ import annotations

from studio_plugin_sdk.text import apply_lexicon

__all__ = ["apply_lexicon"]

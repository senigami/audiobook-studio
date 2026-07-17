"""Test that synthesis failure surfaces the worker's captured output tail.

R1 revert-check: this test must FAIL on pre-fix engine.py (the tail is absent from
the generic error message) and PASS after the fix.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from studio_plugin_sdk.types import TTSRequest


@pytest.fixture
def engine():
    from tts_engines.tts_xtts.plugin.server.engine import XttsPlugin
    return XttsPlugin()


def _simple_request(tmp_path: Path) -> TTSRequest:
    return TTSRequest(
        text="Hello world",
        output_path=str(tmp_path / "out.wav"),
        voice_ref=str(tmp_path / "ref.wav"),
        settings={},
    )


def _make_fake_voice_ref(tmp_path: Path) -> Path:
    """Create a minimal .wav file so check_request passes voice_ref validation."""
    ref = tmp_path / "ref.wav"
    ref.write_bytes(b"\x00" * 44)  # minimal header bytes, just needs to exist
    return ref


class TestSynthesizeFailureTailSurfaced:
    """Failure error must include the tail of worker output when available."""

    def test_worker_output_tail_in_error_on_rc_nonzero(self, engine, tmp_path):
        """When the worker emits fake stderr lines and returns rc=1 with no output
        file, result.error must contain those lines so the real cause is visible."""
        _make_fake_voice_ref(tmp_path)
        req = _simple_request(tmp_path)

        fake_lines = [
            "Traceback (most recent call last):",
            '  File "xtts_worker.py", line 42, in generate',
            "RuntimeError: simulated XTTS failure",
        ]

        def fake_xtts_generate(*, text, out_wav, safe_mode, on_output, cancel_check,
                               speaker_wav, speed, voice_profile_dir, task_id,
                               engine_settings=None):
            for line in fake_lines:
                on_output(line)
            # Do NOT write any file — simulate failure
            return 1

        with patch.object(engine, "_xtts_generate", side_effect=fake_xtts_generate):
            result = engine.synthesize(req)

        assert result.ok is False
        assert result.error is not None
        assert "XTTS synthesis did not produce an audio file." in result.error
        assert "simulated XTTS failure" in result.error, (
            f"Worker output tail not found in error. Got: {result.error!r}"
        )

    def test_no_worker_output_gives_fallback_message(self, engine, tmp_path):
        """When the worker emits no output lines and returns rc=1, the error
        still uses the standard prefix and notes no output was captured."""
        _make_fake_voice_ref(tmp_path)
        req = _simple_request(tmp_path)

        def fake_xtts_generate(*, text, out_wav, safe_mode, on_output, cancel_check,
                               speaker_wav, speed, voice_profile_dir, task_id,
                               engine_settings=None):
            # Emit nothing — empty output
            return 1

        with patch.object(engine, "_xtts_generate", side_effect=fake_xtts_generate):
            result = engine.synthesize(req)

        assert result.ok is False
        assert result.error is not None
        assert "XTTS synthesis did not produce an audio file." in result.error
        assert "no worker output captured" in result.error, (
            f"Expected '(no worker output captured)' in error. Got: {result.error!r}"
        )

    def test_multi_line_tail_all_present(self, engine, tmp_path):
        """All fake stderr lines should appear in the tail."""
        _make_fake_voice_ref(tmp_path)
        req = _simple_request(tmp_path)

        lines = [f"line_{i}" for i in range(10)]

        def fake_xtts_generate(*, text, out_wav, safe_mode, on_output, cancel_check,
                               speaker_wav, speed, voice_profile_dir, task_id,
                               engine_settings=None):
            for line in lines:
                on_output(line)
            return 1

        with patch.object(engine, "_xtts_generate", side_effect=fake_xtts_generate):
            result = engine.synthesize(req)

        assert result.ok is False
        for line in lines:
            assert line in result.error, (
                f"Expected {line!r} in error tail. Got: {result.error!r}"
            )

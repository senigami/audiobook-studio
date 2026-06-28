"""XTTS plugin engine for Studio 2.0.

Implements the ``StudioTTSEngine`` SDK contract.  This module runs inside the
TTS Server subprocess.  It must NOT import from ``app.api``, ``app.domain``,
``app.orchestration``, or ``app.db``.  All Studio internals are accessed via
the HTTP boundary.

The engine delegates actual synthesis to plugin-owned helpers via late imports
so that loading this module does not trigger model loading.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
from collections import deque
from pathlib import Path
from typing import Any, Optional

# SDK contract types — the only app.* import allowed in plugin code.
from app.engines.voice.sdk import TTSRequest, TTSResult, VerificationResult
from app.engines.voice.base import StudioTTSEngine
from app.engines.proc_utils import run_cmd_stream

logger = logging.getLogger(__name__)  # W-MIX-LA-DIAG


def relay_marker(line: str, task_id: str) -> Optional[str]:
    """Normalize a worker progress-marker line to the watchdog-expected format.

    The watchdog parser in ``app.engines.watchdog._drain_stream`` expects:
      - ``[START_SYNTHESIS] {task_id}``       — task_id in position 1
      - ``[START_SEGMENT] {sid} {task_id}``   — task_id in position 2
      - ``[SEGMENT_SAVED] {path_or_sid} {task_id}`` — task_id in position 2
      - ``[PROGRESS] {pct}% {task_id}``       — task_id in position 2

    The XTTS worker emits START_SEGMENT and SEGMENT_SAVED WITHOUT a task_id;
    START_SYNTHESIS and PROGRESS already include it.  This function appends the
    task_id where it is absent so the watchdog can correlate lines to the right
    job.

    Returns the normalized line string, or ``None`` if ``line`` is not a
    recognised progress marker.
    """
    cleaned = line.strip()
    if not cleaned:
        return None

    if cleaned.startswith("[START_SYNTHESIS]"):
        # Already formatted: "[START_SYNTHESIS] {task_id}" — pass through.
        return cleaned

    if cleaned.startswith("[START_SEGMENT]"):
        # Worker emits "[START_SEGMENT] {sid}" without task_id.
        # Normalize to "[START_SEGMENT] {sid} {task_id}".
        rest = cleaned[len("[START_SEGMENT]"):].strip()
        if not rest:
            return None
        # If task_id is already appended (idempotent guard), don't double-append.
        parts = rest.split()
        if len(parts) >= 2 and parts[-1] == task_id:
            return cleaned
        return f"[START_SEGMENT] {rest} {task_id}"

    if cleaned.startswith("[SEGMENT_SAVED]"):
        # Worker emits "[SEGMENT_SAVED] {path}" without task_id.
        # Normalize to "[SEGMENT_SAVED] {path} {task_id}".
        rest = cleaned[len("[SEGMENT_SAVED]"):].strip()
        if not rest:
            return None
        parts = rest.split()
        if len(parts) >= 2 and parts[-1] == task_id:
            return cleaned
        return f"[SEGMENT_SAVED] {rest} {task_id}"

    if cleaned.startswith("[PROGRESS]"):
        # Already formatted: "[PROGRESS] {pct}% {task_id}" — pass through.
        return cleaned

    return None


class XttsPlugin(StudioTTSEngine):
    """XTTS voice synthesis plugin for Audiobook Studio."""

    def info(self) -> dict[str, Any]:
        """Return runtime environment metadata."""
        env_activate = os.environ.get("XTTS_ENV_ACTIVATE", "")
        env_python = os.environ.get("XTTS_ENV_PYTHON", "")

        # Check if TTS is installed in current environment
        try:
            import TTS # noqa: F401
            has_tts = True
        except ImportError:
            has_tts = False

        return {
            "env_activate": env_activate,
            "env_python": env_python,
            "env_available": has_tts or bool(env_activate and Path(env_activate).exists()),
            "bundled_path": str(Path(__file__).parent),
        }

    def check_env(self) -> tuple[bool, str]:
        """Verify the XTTS runtime environment is ready."""
        # 1. Check manual environment override.
        env_activate = os.environ.get("XTTS_ENV_ACTIVATE", "")
        if env_activate:
            if Path(env_activate).exists():
                return True, "OK (Manual Environment)"
            return False, f"XTTS_ENV_ACTIVATE path does not exist: {env_activate}"

        # 2. Check current environment for XTTS (normal path)
        try:
            import TTS  # noqa: F401, PLC0415
            return True, "OK"
        except ImportError:
            return False, "XTTS dependencies not found. Click 'Install Deps' to set up the built-in engine."

    def verify(self, req: TTSRequest) -> VerificationResult:
        """Fast readiness check for XTTS."""
        ok, msg = self.check_env()
        if not ok:
            return VerificationResult(ok=False, message=msg)

        try:
            # Late import to see if the engine adapter can load its dependencies.
            from ..core.implementation import xtts_generate  # noqa: F401, PLC0415
            return VerificationResult(ok=True, message="XTTS engine is ready.")
        except Exception as exc:
            return VerificationResult(
                ok=False,
                message=f"XTTS dependencies are present but the engine failed to load: {exc}"
            )

    def run_test(self) -> VerificationResult:
        """Run a self-contained synthesis test."""
        ok, msg = self.check_env()
        if not ok:
            return VerificationResult(ok=False, message=msg)

        plugin_dir = Path(__file__).parents[2]
        assets_dir = plugin_dir / "assets"
        assets_dir.mkdir(exist_ok=True)

        # 1. Resolve input asset
        voice_ref = None
        for name in ["latent.pth", "voice.wav", "sample.wav"]:
            cand = assets_dir / name
            if cand.is_file():
                voice_ref = str(cand)
                break

        if not voice_ref:
            return VerificationResult(ok=False, message="No test assets found in assets/ folder.")

        # 2. Setup output path inside plugin folder
        output_path = assets_dir / "test_output.wav"

        # 3. Create request
        manifest_path = plugin_dir / "manifest.json"
        test_text = "This is an internal XTTS verification test."
        try:
            if manifest_path.exists():
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                test_text = manifest.get("test_text") or test_text
        except Exception:
            pass

        req = TTSRequest(
            text=test_text,
            output_path=str(output_path),
            voice_ref=voice_ref,
        )

        # 4. Run synthesis
        result = self.synthesize(req)
        if result.ok:
            return VerificationResult(ok=True, message=f"Test passed. Output: {output_path.name}")
        return VerificationResult(ok=False, message=f"Test failed: {result.error}")

    def check_request(self, req: TTSRequest) -> tuple[bool, str]:
        """Validate an XTTS synthesis request."""
        has_text = bool(req.text and req.text.strip())
        has_script = bool(req.script)
        if not has_text and not has_script:
            return False, "text must not be empty."

        if not req.output_path or not req.output_path.strip():
            return False, "output_path must not be empty."

        output_path = Path(req.output_path)
        if output_path.suffix.lower() not in (".wav", ".mp3"):
            return False, "output_path must end with .wav or .mp3."

        if req.voice_ref:
            voice_ref = Path(req.voice_ref)
            if not voice_ref.exists() or not voice_ref.is_file():
                return False, f"voice_ref path does not exist: {req.voice_ref}"
            if voice_ref.suffix.lower() not in (".wav", ".pth"):
                return False, "voice_ref must be a .wav or .pth file for XTTS."

        return True, "OK"

    def check_output(self, req: TTSRequest, result: TTSResult) -> tuple[bool, str]:
        """Reject artifacts that are suspiciously short (likely truncated).

        Rules:
        - duration == 0: always reject.
        - implied speech rate (chars / duration) above max_chars_per_second:
          reject — no real voice speaks that fast, so the audio is truncated.
        The threshold is a MAXIMUM plausible rate (default 60 chars/sec; normal
        speech is ~12-15). Set to 0 to skip the rate check.
        """
        import wave as _wave
        import contextlib as _contextlib

        duration = result.duration_sec

        # If TTSResult didn't populate duration, probe the file directly.
        if duration is None and result.output_path:
            try:
                with _contextlib.closing(_wave.open(result.output_path, "r")) as wf:
                    frames = wf.getnframes()
                    rate = wf.getframerate()
                    duration = frames / float(rate) if rate > 0 else 0.0
            except Exception:
                duration = None

        if duration is not None and duration == 0:
            return False, "rendered audio has zero duration (synthesis produced silence or empty file)"

        if duration is not None and duration > 0:
            threshold = float((req.settings or {}).get("max_chars_per_second", 60.0))
            if threshold > 0:
                char_count = len(req.text or "")
                if char_count > 0:
                    min_secs = char_count / threshold
                    if duration < min_secs:
                        implied = char_count / duration
                        return (
                            False,
                            f"audio too short ({duration:.2f}s) for {char_count} chars — "
                            f"implied {implied:.0f} chars/sec exceeds the {threshold:.0f}/sec "
                            f"plausibility cap (likely truncated)",
                        )

        return True, "OK"

    def settings_schema(self) -> dict[str, Any]:
        """Return the XTTS settings JSON Schema."""
        schema_path = Path(__file__).parents[2] / "settings_schema.json"
        try:
            return json.loads(schema_path.read_text(encoding="utf-8"))
        except Exception:
            return {"type": "object", "properties": {}}

    def synthesize(self, req: TTSRequest) -> TTSResult:
        """Run XTTS synthesis and write audio to req.output_path."""
        import time
        from app.engines.voice.sdk import TTSTimingResult, SegmentTimingResult, TimingEvent

        engine_activity_started_at = None
        chapter_render_started_at = None
        chapter_render_completed_at = None
        segments_timing: list[SegmentTimingResult] = []

        try:
            engine_activity_started_at = time.time()
            if req.on_timing_event:
                try:
                    req.on_timing_event(TimingEvent(event_name="engine_activity_started", timestamp=engine_activity_started_at))
                except Exception:
                    pass
        except Exception:
            pass

        ok, msg = self.check_request(req)
        if not ok:
            return TTSResult(ok=False, error=f"check_request failed: {msg}")

        output_path = Path(req.output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_format = output_path.suffix.lower().lstrip(".")  # "wav" or "mp3"

        speed = float(req.settings.get("speed", 1.0))
        safe_mode = bool(req.settings.get("safe_mode", True))

        speaker_wav: str | None = None
        voice_profile_dir: Path | None = None
        if not req.script:
            # Single-text synthesis still needs a voice source. Script payloads
            # carry per-segment voice data produced by the job handlers.
            speaker_wav, voice_profile_dir = self._resolve_voice_inputs(req)
            if speaker_wav is None and voice_profile_dir is None:
                return TTSResult(
                    ok=False,
                    error=(
                        "XTTS requires voice_ref (a .wav reference) or a voice profile "
                        "directory to be configured."
                    ),
                )

        render_wav_path = output_path
        temp_wav: Path | None = None

        if output_format == "mp3":
            fd, tmp = tempfile.mkstemp(
                prefix=f"{output_path.stem}_",
                suffix=".wav",
                dir=output_path.parent,
            )
            os.close(fd)
            temp_wav = Path(tmp)
            render_wav_path = temp_wav

        active_segment_id: str | None = None
        segment_starts: dict[str, float] = {}
        recent_output: deque[str] = deque(maxlen=40)

        def parse_output(line: str):
            nonlocal active_segment_id
            # Always capture raw output for failure diagnostics — outside the
            # marker-parsing try/except so a bad line never stops capture.
            try:
                stripped = line.strip()
                if stripped:
                    recent_output.append(stripped)
            except Exception:
                pass
            try:
                cleaned = line.strip()
                if not cleaned:
                    return
                # W-MIX-LA-DIAG: log any line that looks like a model-load line so
                # we can tell whether parse_output ever sees it.
                if "loading model" in cleaned.lower() or "[MODEL_LOAD_STARTED]" in cleaned:
                    logger.info(
                        "W-MIX-LA-DIAG engine.parse_output saw load-ish line=%r task_id=%r active_segment_id=%r",
                        cleaned,
                        getattr(req, "task_id", None),
                        active_segment_id,
                    )
                if cleaned.startswith("[START_SEGMENT]"):
                    parts = cleaned.split("[START_SEGMENT]", 1)
                    if len(parts) > 1:
                        seg_id_or_path = parts[1].strip()
                        now = time.time()
                        segment_starts[seg_id_or_path] = now
                        active_segment_id = seg_id_or_path
                        if req.on_timing_event:
                            try:
                                req.on_timing_event(TimingEvent(
                                    event_name="segment_render_started",
                                    timestamp=now,
                                    segment_id=seg_id_or_path
                                ))
                            except Exception:
                                pass
                elif cleaned.startswith("[SEGMENT_SAVED]"):
                    parts = cleaned.split("[SEGMENT_SAVED]", 1)
                    if len(parts) > 1:
                        seg_id_or_path = parts[1].strip()
                        now = time.time()
                        start_time = segment_starts.get(seg_id_or_path)
                        if start_time is None and active_segment_id:
                            start_time = segment_starts.get(active_segment_id)
                            seg_id_or_path = active_segment_id

                        if start_time is not None:
                            chars = None
                            if req.script:
                                for entry in req.script:
                                    if str(entry.get("id")) == seg_id_or_path or entry.get("save_path") == seg_id_or_path or Path(entry.get("save_path", "")).name == Path(seg_id_or_path).name:
                                        chars = len(entry.get("text", ""))
                                        if "id" in entry:
                                            seg_id_or_path = str(entry["id"])
                                        break
                            segments_timing.append(SegmentTimingResult(
                                segment_id=seg_id_or_path,
                                render_started_at=start_time,
                                render_completed_at=now,
                                chars=chars
                            ))
                        if req.on_timing_event:
                            try:
                                req.on_timing_event(TimingEvent(
                                    event_name="segment_render_completed",
                                    timestamp=now,
                                    segment_id=seg_id_or_path
                                ))
                            except Exception:
                                pass
            except Exception:
                pass
            # Re-emit recognized progress markers to the TTS-server's own stderr so
            # the watchdog log-listener (app.engines.watchdog._drain_stream) can
            # correlate them to this job and flip the orchestrator from
            # "preparing" → "running" and emit per-segment highlights.
            # The worker's stderr is a separate captured PIPE; writing to sys.stderr
            # here writes to the server process's stderr — no recursion risk.
            try:
                normalized = relay_marker(line, req.task_id) if req.task_id else None
                if normalized is not None:
                    print(normalized, file=sys.stderr, flush=True)
                else:
                    # W-MIX-LA: forward raw non-marker worker output so the Engine
                    # Diagnostics page shows the complete live log, and status/load
                    # lines reach the orchestrator. Forwarded regardless of task_id so
                    # internal run_test/verify calls (task_id=None) are never silently dropped.
                    print(line, file=sys.stderr, flush=True)
            except Exception:
                pass

            # Emit a dedicated [MODEL_LOAD_STARTED] marker when the XTTS worker's
            # cold-load line is observed.  These bare text lines are dropped by
            # relay_marker (which only recognizes bracketed markers), but they are
            # the only real-load signal: the worker prints them ONCE per process on
            # cold load; warm reuse and Voxtral never print them.  Re-emitting as a
            # recognized bracketed marker lets the watchdog and orchestrator see the
            # real-load event (INV-2 safe — never fires on warm/cloud groups).
            if req.task_id:
                try:
                    stripped_for_load = line.strip()
                    if (
                        stripped_for_load == "Loading XTTS model..."
                        or stripped_for_load == "XTTS serve mode: loading model..."
                    ):
                        if active_segment_id:
                            load_marker = f"[MODEL_LOAD_STARTED] {active_segment_id} {req.task_id}"
                        else:
                            load_marker = f"[MODEL_LOAD_STARTED] {req.task_id}"
                        print(load_marker, file=sys.stderr, flush=True)
                        logger.info("W-MIX-LA-DIAG engine emitted %r", load_marker)  # W-MIX-LA-DIAG
                except Exception:
                    pass

        rc = 1
        try:
            try:
                chapter_render_started_at = time.time()
                if req.on_timing_event:
                    try:
                        req.on_timing_event(TimingEvent(event_name="chapter_render_started", timestamp=chapter_render_started_at))
                    except Exception:
                        pass
            except Exception:
                pass

            if req.script:
                with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as handle:
                    json.dump(req.script, handle)
                    script_path = Path(handle.name)
                try:
                    rc = self._xtts_generate_script(
                        script_json_path=script_path,
                        out_wav=render_wav_path,
                        on_output=parse_output,
                        cancel_check=req.cancel_check or (lambda: False),
                        speed=speed,
                        task_id=req.task_id,
                        engine_settings=req.settings,
                    )
                finally:
                    script_path.unlink(missing_ok=True)
            else:
                rc = self._xtts_generate(
                    text=req.text.strip(),
                    out_wav=render_wav_path,
                    safe_mode=safe_mode,
                    on_output=parse_output,
                    cancel_check=req.cancel_check or (lambda: False),
                    speaker_wav=speaker_wav,
                    speed=speed,
                    voice_profile_dir=voice_profile_dir,
                    task_id=req.task_id,
                    engine_settings=req.settings,
                )

            try:
                chapter_render_completed_at = time.time()
                if req.on_timing_event:
                    try:
                        req.on_timing_event(TimingEvent(event_name="chapter_render_completed", timestamp=chapter_render_completed_at))
                    except Exception:
                        pass
            except Exception:
                pass
        except Exception as exc:
            return TTSResult(ok=False, error=f"XTTS synthesis raised: {exc}")
        finally:
            if temp_wav and temp_wav.exists() and rc != 0:
                temp_wav.unlink(missing_ok=True)

        if rc != 0 or not render_wav_path.exists():
            if recent_output:
                tail = "\n".join(recent_output)
                # Cap total appended chars so a huge traceback can't bloat the response.
                if len(tail) > 4000:
                    tail = tail[-4000:]
                error = f"XTTS synthesis did not produce an audio file. Worker output tail:\n{tail}"
            else:
                error = "XTTS synthesis did not produce an audio file. (no worker output captured)"
            return TTSResult(ok=False, error=error)

        if output_format == "mp3" and temp_wav is not None:
            mp3_rc = self._wav_to_mp3(temp_wav, output_path)
            try:
                temp_wav.unlink(missing_ok=True)
            except Exception:
                pass
            if mp3_rc != 0 or not output_path.exists():
                return TTSResult(
                    ok=False,
                    error="XTTS mp3 conversion did not produce a valid file.",
                )

        timing_payload = None
        try:
            if (
                engine_activity_started_at is not None
                and chapter_render_started_at is not None
                and chapter_render_completed_at is not None
            ):
                timing_payload = TTSTimingResult(
                    engine_activity_started_at=engine_activity_started_at,
                    chapter_render_started_at=chapter_render_started_at,
                    chapter_render_completed_at=chapter_render_completed_at,
                    segments=segments_timing if segments_timing else None
                )
        except Exception:
            pass

        return TTSResult(
            ok=True,
            output_path=str(output_path),
            timing=timing_payload,
        )

    def preview(self, req: TTSRequest) -> TTSResult:
        """Run a lightweight XTTS preview synthesis to a temp file."""
        ok, msg = self.check_request(req)
        if not ok:
            return TTSResult(ok=False, error=f"check_request failed: {msg}")

        speed = float(req.settings.get("speed", 1.0))
        safe_mode = bool(req.settings.get("safe_mode", True))

        speaker_wav, voice_profile_dir = self._resolve_voice_inputs(req)
        if speaker_wav is None and voice_profile_dir is None:
            return TTSResult(
                ok=False,
                error="XTTS preview requires voice_ref or a configured voice profile.",
            )

        try:
            rc = self._xtts_generate(
                text=req.text.strip(),
                out_wav=Path(req.output_path),
                safe_mode=safe_mode,
                on_output=lambda _: None,
                cancel_check=req.cancel_check or (lambda: False),
                speaker_wav=speaker_wav,
                speed=speed,
                voice_profile_dir=voice_profile_dir,
                task_id=req.task_id,
                engine_settings=req.settings,
            )
        except Exception as exc:
            return TTSResult(ok=False, error=f"XTTS preview raised: {exc}")

        output_path = Path(req.output_path)
        if rc != 0 or not output_path.exists():
            return TTSResult(
                ok=False, error="XTTS preview did not produce an audio file."
            )

        return TTSResult(ok=True, output_path=str(output_path))

    def shutdown(self) -> None:
        """Terminate the warm worker if one is running."""
        try:
            from ..core.implementation import _reset_warm_worker  # noqa: PLC0415
            _reset_warm_worker()
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _resolve_voice_inputs(
        self, req: TTSRequest
    ) -> tuple[str | None, Path | None]:
        """Resolve the speaker WAV and voice profile dir for a request."""
        if req.voice_ref:
            return req.voice_ref, None

        # Voice inputs come exclusively from the request: the engine runs in
        # the TTS Server process and never reaches into Studio storage to
        # guess paths (bridge callers always send voice_profile_dir).
        vdir = req.settings.get("voice_profile_dir")
        if vdir:
            vdir_path = Path(vdir)
            if vdir_path.exists() and vdir_path.is_dir():
                return None, vdir_path

        return None, None

    @staticmethod
    def _xtts_generate(
        *,
        text: str,
        out_wav: Path,
        safe_mode: bool,
        on_output,
        cancel_check,
        speaker_wav: str | None,
        speed: float,
        voice_profile_dir: Path | None,
        task_id: str | None,
        engine_settings: dict | None = None,
    ) -> int:
        """Delegate synthesis to the XTTS runtime generator."""
        from ..core.implementation import xtts_generate as _gen  # noqa: PLC0415

        return _gen(
            text=text,
            out_wav=out_wav,
            safe_mode=safe_mode,
            on_output=on_output,
            cancel_check=cancel_check,
            speaker_wav=speaker_wav,
            speed=speed,
            voice_profile_dir=voice_profile_dir,
            task_id=task_id,
            engine_settings=engine_settings,
        )

    @staticmethod
    def _xtts_generate_script(
        *,
        script_json_path: Path,
        out_wav: Path,
        on_output,
        cancel_check,
        speed: float,
        task_id: str | None,
        engine_settings: dict | None = None,
    ) -> int:
        """Delegate script synthesis to the XTTS batch generator."""
        from ..core.implementation import xtts_generate_script as _gen_script  # noqa: PLC0415

        return _gen_script(
            script_json_path=script_json_path,
            out_wav=out_wav,
            on_output=on_output,
            cancel_check=cancel_check,
            speed=speed,
            task_id=task_id,
            engine_settings=engine_settings,
        )

    @staticmethod
    def _wav_to_mp3(in_wav: Path, out_mp3: Path) -> int:
        """Delegate WAV to MP3 conversion to the shared audio helper."""
        from app.engines.audio_ops import wav_to_mp3 as _conv  # noqa: PLC0415

        return _conv(in_wav=in_wav, out_mp3=out_mp3)

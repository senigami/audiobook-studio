from __future__ import annotations
import time
from pathlib import Path
from typing import Any, Callable


def _get_ctx():
    """Return the shared StudioPluginContext for the xtts engine."""
    from studio_plugin_sdk import get_plugin_ctx  # noqa: PLC0415
    return get_plugin_ctx("xtts")


# ---------------------------------------------------------------------------
# Module-level aliases for host services, routed through the SDK context
# rather than app.* (issue #200). The NAMES are kept exactly as they were,
# because tests patch these module attributes directly.
#
# Several of these re-wrap the context's return value: the context hands back
# str where this file's call sites do path arithmetic, and a split list where
# the downstream bridge still expects the legacy comma-joined string. Adapting
# here keeps the shape change out of the render path, which is a separate
# question from the import boundary this change is about.
# ---------------------------------------------------------------------------

def _get_speaker_wavs(profile_name):
    wavs = _get_ctx().get_speaker_wavs(profile_name)
    return ",".join(wavs) if wavs else None


def _get_speaker_settings(profile_name):
    return _get_ctx().get_voice_settings(profile_name)


def _get_chapter_dir(project_id, chapter_id):
    return Path(_get_ctx().get_chapter_dir(chapter_id, project_id=project_id))


def _get_voice_profile_dir(profile_name):
    result = _get_ctx().get_voice_profile_dir(profile_name)
    return Path(result) if result is not None else None


def _get_voices_dir():
    return Path(_get_ctx().get_voices_dir())


def _finalize_sample_artifact(wav_path):
    return _get_ctx().finalize_sample_artifact(wav_path)


def _do_update_job(jid, **kwargs):
    return _get_ctx().update_job_fields(jid, **kwargs)


def xtts_dispatch_adapter(jid: str, j: Any, start: float, on_output: Callable[[str], None], cancel_check: Callable[[], bool], **kwargs):
    """Adapter to wrap handle_xtts_job with the standard signature."""
    from .handler import handle_xtts_job

    # Extract text from kwargs
    text = kwargs.get("text")

    is_sample_job = getattr(j, "kind", None) in ("sample_build", "sample_test", "voice_build", "voice_test") or getattr(j, "engine", None) in ("voice_build", "voice_test")
    if not is_sample_job and (not j.project_id or not j.chapter_id):
        _do_update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="XTTS jobs require project and chapter context.")
        return

    if is_sample_job:
        try:
            pdir = _get_voice_profile_dir(j.speaker_profile)
        except ValueError:
            pdir = _get_voices_dir() / j.speaker_profile
        out_wav = pdir / "sample.wav"
        out_mp3 = pdir / "sample.mp3"
    else:
        pdir = _get_chapter_dir(j.project_id, j.chapter_id)
        out_wav = pdir / "chapter.wav"
        out_mp3 = pdir / "chapter.mp3"

    pdir.mkdir(parents=True, exist_ok=True)
    sw = _get_speaker_wavs(j.speaker_profile)
    spk = _get_speaker_settings(j.speaker_profile)

    handle_xtts_job(
        jid, j, start, on_output, cancel_check,
        sw, spk["speed"], pdir, out_wav, out_mp3,
        text=text
    )

    # For sample jobs, convert WAV → MP3 and delete WAV after successful synthesis
    if is_sample_job and out_wav.exists():
        _finalize_sample_artifact(out_wav)

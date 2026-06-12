from __future__ import annotations
import time
from pathlib import Path
from typing import Any, Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from app.db.models import Job


# ---------------------------------------------------------------------------
# Module-level patchable aliases for DB and config helpers.
# ---------------------------------------------------------------------------

def _get_speaker_wavs(profile_name):
    from app.db.speakers import get_profile_wavs  # noqa: PLC0415
    return get_profile_wavs(profile_name)


def _get_speaker_settings(profile_name):
    from app.db.speakers import get_speaker_settings as _fn  # noqa: PLC0415
    return _fn(profile_name)


def _get_chapter_dir(project_id, chapter_id):
    from app.core.config import get_chapter_dir  # noqa: PLC0415
    return get_chapter_dir(project_id, chapter_id)


def _get_voice_profile_dir(profile_name):
    from app.db.speakers import get_profile_dir  # noqa: PLC0415
    return get_profile_dir(profile_name)


def _get_voices_dir():
    from app.core.config import VOICES_DIR  # noqa: PLC0415
    return VOICES_DIR


def _finalize_sample_artifact(wav_path):
    from app.engines.audio_ops import finalize_sample_artifact  # noqa: PLC0415
    return finalize_sample_artifact(wav_path)


def _do_update_job(jid, **kwargs):
    from app.db.state import update_job  # noqa: PLC0415
    return update_job(jid, **kwargs)


def xtts_dispatch_adapter(jid: str, j: Job, start: float, on_output: Callable[[str], None], cancel_check: Callable[[], bool], **kwargs):
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

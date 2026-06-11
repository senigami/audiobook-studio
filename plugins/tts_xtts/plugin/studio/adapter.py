from __future__ import annotations
import time
from pathlib import Path
from typing import Any, Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from app.db.models import Job

def xtts_dispatch_adapter(jid: str, j: Job, start: float, on_output: Callable[[str], None], cancel_check: Callable[[], bool], **kwargs):
    """Adapter to wrap handle_xtts_job with the standard signature."""
    from .handler import handle_xtts_job
    from app.db.speakers import get_profile_wavs as get_speaker_wavs, get_speaker_settings
    from app.core.config import get_chapter_dir
    from app.db.state import get_performance_metrics

    # Extract text from kwargs
    text = kwargs.get("text")

    is_sample_job = getattr(j, "kind", None) in ("sample_build", "sample_test", "voice_build", "voice_test") or getattr(j, "engine", None) in ("voice_build", "voice_test")
    if not is_sample_job and (not j.project_id or not j.chapter_id):
        from app.db.state import update_job
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="XTTS jobs require project and chapter context.")
        return

    if is_sample_job:
        from app.db.speakers import get_profile_dir as get_voice_profile_dir
        try:
            pdir = get_voice_profile_dir(j.speaker_profile)
        except ValueError:
            from app.core.config import VOICES_DIR
            pdir = VOICES_DIR / j.speaker_profile
        out_wav = pdir / "sample.wav"
        out_mp3 = pdir / "sample.mp3"
    else:
        pdir = get_chapter_dir(j.project_id, j.chapter_id)
        out_wav = pdir / "chapter.wav"
        out_mp3 = pdir / "chapter.mp3"

    pdir.mkdir(parents=True, exist_ok=True)
    sw = get_speaker_wavs(j.speaker_profile)
    spk = get_speaker_settings(j.speaker_profile)

    handle_xtts_job(
        jid, j, start, on_output, cancel_check,
        sw, spk["speed"], pdir, out_wav, out_mp3,
        text=text
    )

    # For sample jobs, convert WAV → MP3 and delete WAV after successful synthesis
    if is_sample_job and out_wav.exists():
        from app.engines.audio_ops import finalize_sample_artifact
        finalize_sample_artifact(out_wav)

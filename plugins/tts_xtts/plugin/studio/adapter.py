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

    # This path logic will move to StorageManager in Slice D
    if not j.project_id or not j.chapter_id:
        from app.db.state import update_job
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="XTTS jobs require project and chapter context.")
        return

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

    # Record metrics
    chars = len(text) if text else 0
    perf = get_performance_metrics()
    from app.jobs.worker_metrics import record_engine_sample
    record_engine_sample(j, start, chars, perf, 0)

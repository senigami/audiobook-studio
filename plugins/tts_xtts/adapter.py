from __future__ import annotations
import time
from pathlib import Path
from typing import Any, Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import Job

def xtts_dispatch_adapter(jid: str, j: Job, start: float, on_output: Callable[[str], None], cancel_check: Callable[[], bool], **kwargs):
    """Adapter to wrap handle_xtts_job with the standard signature."""
    from .handler import handle_xtts_job
    from app.jobs.speaker import get_speaker_wavs, get_speaker_settings
    from app.config import get_project_audio_dir, get_chapter_dir, get_project_storage_version, AUDIO_OUT_DIR
    from app.state import get_performance_metrics

    # Extract text from kwargs
    text = kwargs.get("text")

    # This path logic will move to StorageManager in Slice D
    if j.project_id and j.chapter_id and get_project_storage_version(j.project_id) >= 2:
        pdir = get_chapter_dir(j.project_id, j.chapter_id)
        out_wav = pdir / "chapter.wav"
        out_mp3 = pdir / "chapter.mp3"
    else:
        pdir = get_project_audio_dir(j.project_id) if j.project_id else AUDIO_OUT_DIR
        out_wav = pdir / f"{Path(j.chapter_file).stem}.wav"
        out_mp3 = pdir / f"{Path(j.chapter_file).stem}.mp3"

    pdir.mkdir(parents=True, exist_ok=True)
    sw = get_speaker_wavs(j.speaker_profile)
    spk = get_speaker_settings(j.speaker_profile)
    version = get_project_storage_version(j.project_id) if j.project_id else 1

    handle_xtts_job(
        jid, j, start, on_output, cancel_check, 
        sw, spk["speed"], pdir, out_wav, out_mp3, 
        text=text, storage_version=version
    )

    # Record metrics
    chars = getattr(j, "_chars_count", 0)
    eta_unit_count = getattr(j, "_eta_unit_count", 0)
    perf = get_performance_metrics()
    from app.jobs.worker_metrics import record_engine_sample
    record_engine_sample(j, start, chars, perf, eta_unit_count)

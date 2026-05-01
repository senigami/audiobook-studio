from __future__ import annotations
from typing import Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import Job

def voice_job_dispatch_adapter(jid: str, j: Job, start: float, on_output: Callable[[str], None], cancel_check: Callable[[], bool], **kwargs):
    """Adapter for voice tasks to match the standard synthesis signature."""
    from app.jobs.worker_voice import handle_voice_job
    voice_job_settings = kwargs.get("voice_job_settings")
    handle_voice_job(jid, j, on_output, cancel_check, voice_job_settings=voice_job_settings)

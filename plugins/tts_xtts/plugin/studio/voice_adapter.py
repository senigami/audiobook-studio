from __future__ import annotations
from typing import Callable

# ---------------------------------------------------------------------------
# Module-level SDK context factory (lazy singleton)
# ---------------------------------------------------------------------------

_ctx_instance = None


def _get_ctx():
    """Return the shared StudioPluginContext for the xtts engine."""
    global _ctx_instance  # noqa: PLW0603
    if _ctx_instance is None:
        try:
            from studio_plugin_sdk import StudioPluginContext  # noqa: PLC0415
        except ImportError:
            from app.studio_plugin_sdk import StudioPluginContext  # noqa: PLC0415
        _ctx_instance = StudioPluginContext("xtts")
    return _ctx_instance


def voice_job_dispatch_adapter(jid: str, j, start: float, on_output: Callable[[str], None], cancel_check: Callable[[], bool], **kwargs):
    """Adapter for voice tasks to match the standard synthesis signature."""
    ctx = _get_ctx()
    try:
        from studio_plugin_sdk import JobSpec  # noqa: PLC0415
    except ImportError:
        from app.studio_plugin_sdk import JobSpec  # noqa: PLC0415
    voice_job_settings = kwargs.get("voice_job_settings")
    # Build a minimal JobSpec so run_voice_job can delegate correctly.
    job_spec = JobSpec(
        id=jid,
        engine="xtts",
        kind=getattr(j, "kind", "voice_build"),
        chapter_id=getattr(j, "chapter_id", None),
        project_id=getattr(j, "project_id", None),
        segment_ids=getattr(j, "segment_ids", None),
        speaker_profile=getattr(j, "speaker_profile", None),
        is_bake=getattr(j, "is_bake", False),
        make_mp3=getattr(j, "make_mp3", False),
        safe_mode=getattr(j, "safe_mode", False),
        extra={"voice_job_settings": voice_job_settings},
    )
    ctx.run_voice_job(job_spec)

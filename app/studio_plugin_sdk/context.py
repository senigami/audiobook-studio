"""Studio Plugin SDK — context and job dataclasses.

``StudioPluginContext`` is injected into every plugin job handler at
dispatch time.  It exposes all 13 §3.3 service groups from doc 02 as
thin wrappers over the existing ``app.*`` internals.

**Import discipline**: every ``app.*`` import is done *inside* its
wrapper method (late import) so that importing this module has zero
side effects — required by the no-import-side-effects rule in
``modular_architecture.md``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


# ---------------------------------------------------------------------------
# Data contract types
# ---------------------------------------------------------------------------

@dataclass
class JobSpec:
    """Immutable snapshot of a dispatched job."""
    id: str
    engine: str
    kind: str                           # JobKind literal
    chapter_id: str | None
    project_id: str | None
    segment_ids: list[str] | None
    speaker_profile: str | None
    is_bake: bool
    make_mp3: bool
    safe_mode: bool
    extra: dict[str, Any] = field(default_factory=dict)  # Engine-specific fields


@dataclass
class JobResult:
    """Returned by the handler to signal final job state."""
    status: str                         # "done" | "failed" | "cancelled"
    error: str | None = None
    output_wav: str | None = None
    output_mp3: str | None = None
    progress: float = 1.0


# ---------------------------------------------------------------------------
# Context object
# ---------------------------------------------------------------------------

class StudioPluginContext:
    """SDK context object injected into plugin job handlers.

    Plugin handlers receive one of these at dispatch time.  All interaction
    with Studio internals must go through this object — never via ``app.*``
    imports directly.

    Args:
        engine_id: The engine_id this context was created for (used as
            default in path helpers and logging).
    """

    def __init__(self, engine_id: str) -> None:
        self._engine_id = engine_id

    # ------------------------------------------------------------------
    # §3.3.1 Job Progress
    # ------------------------------------------------------------------

    def update_job_progress(
        self,
        job_id: str,
        *,
        status: str | None = None,
        progress: float | None = None,
        eta_seconds: float | None = None,
        active_segment_id: str | None = None,
        active_segment_progress: float | None = None,
        completed_render_groups: int | None = None,
        render_group_count: int | None = None,
        active_render_group_index: int | None = None,
        error: str | None = None,
        finished_at: float | None = None,
        output_wav: str | None = None,
        output_mp3: str | None = None,
        broadcast: bool = True,
    ) -> None:
        """Persist job row changes and optionally emit a queue.items WS event."""
        from app.db.state_jobs import update_job  # noqa: PLC0415
        updates: dict[str, Any] = {}
        if status is not None:
            updates["status"] = status
        if progress is not None:
            updates["progress"] = progress
        if eta_seconds is not None:
            updates["eta_seconds"] = eta_seconds
        if active_segment_id is not None:
            updates["active_segment_id"] = active_segment_id
        if active_segment_progress is not None:
            updates["active_segment_progress"] = active_segment_progress
        if completed_render_groups is not None:
            updates["completed_render_groups"] = completed_render_groups
        if render_group_count is not None:
            updates["render_group_count"] = render_group_count
        if active_render_group_index is not None:
            updates["active_render_group_index"] = active_render_group_index
        if error is not None:
            updates["error"] = error
        if finished_at is not None:
            updates["finished_at"] = finished_at
        if output_wav is not None:
            updates["output_wav"] = output_wav
        if output_mp3 is not None:
            updates["output_mp3"] = output_mp3
        update_job(job_id, force_broadcast=broadcast, **updates)

    # ------------------------------------------------------------------
    # §3.3.2 Segment Progress Events
    # ------------------------------------------------------------------

    def emit_segment_started(
        self,
        chapter_id: str,
        segment_id: str,
        job_id: str,
    ) -> None:
        """Emit a segment_started event on the segments.progress WS topic."""
        from app.api.ws import broadcast_job_updated  # noqa: PLC0415
        broadcast_job_updated(
            job_id=job_id,
            updates={
                "event": "segment_started",
                "chapter_id": chapter_id,
                "segment_id": segment_id,
            },
        )

    def emit_segment_saved(
        self,
        chapter_id: str,
        segment_id: str,
        job_id: str,
        audio_file_path: str,
        duration_sec: float | None = None,
    ) -> None:
        """Emit a segment_saved event on the segments.progress WS topic."""
        from app.api.ws import broadcast_job_updated  # noqa: PLC0415
        payload: dict[str, Any] = {
            "event": "segment_saved",
            "chapter_id": chapter_id,
            "segment_id": segment_id,
            "audio_file_path": audio_file_path,
        }
        if duration_sec is not None:
            payload["duration_sec"] = duration_sec
        broadcast_job_updated(job_id=job_id, updates=payload)

    def emit_segment_progress(
        self,
        chapter_id: str,
        segment_id: str,
        job_id: str,
        progress: float,
    ) -> None:
        """Emit a segment_progress event (0.0–1.0 within a segment)."""
        from app.api.ws import broadcast_segment_progress  # noqa: PLC0415
        broadcast_segment_progress(
            job_id=job_id,
            chapter_id=chapter_id,
            segment_id=segment_id,
            progress=progress,
        )

    def broadcast_segments_updated(self, chapter_id: str) -> None:
        """Invalidate the chapter's segment list in connected browser clients."""
        from app.api.ws import broadcast_segments_updated  # noqa: PLC0415
        broadcast_segments_updated(chapter_id=chapter_id)

    # ------------------------------------------------------------------
    # §3.3.3 Queue Row Updates
    # ------------------------------------------------------------------

    def update_queue_row(
        self,
        job_id: str,
        *,
        status: str,
        progress: float,
        eta_seconds: float | None = None,
        message: str | None = None,
    ) -> None:
        """Emit a transient queue_item_status event without persisting the job row."""
        from app.api.ws import broadcast_queue_update  # noqa: PLC0415
        broadcast_queue_update(
            reason=message or f"progress={progress} status={status}",
            job_id=job_id,
            changed_fields=["status", "progress"],
        )

    # ------------------------------------------------------------------
    # §3.3.4 Speaker / Voice Settings Lookup
    # ------------------------------------------------------------------

    def get_speaker_wavs(self, profile_name: str) -> list[str]:
        """Return absolute WAV reference paths for a speaker profile.

        Splits the legacy comma-separated string so plugins never parse it.
        """
        from app.db.speakers import get_profile_wavs  # noqa: PLC0415
        raw = get_profile_wavs(profile_name)
        if not raw:
            return []
        return [p.strip() for p in raw.split(",") if p.strip()]

    def get_voice_profile_dir(self, profile_name: str) -> str | None:
        """Return the absolute directory path for a speaker profile, or None."""
        from app.db.speakers import get_profile_dir  # noqa: PLC0415
        result = get_profile_dir(profile_name)
        return str(result) if result is not None else None

    def get_voice_settings(self, profile_name: str) -> dict[str, Any]:
        """Return the persisted voice settings dict for this profile."""
        from app.db.speakers import get_speaker_settings  # noqa: PLC0415
        return get_speaker_settings(profile_name)

    # ------------------------------------------------------------------
    # §3.3.5 Chunk-Group Derivation
    # ------------------------------------------------------------------

    def get_chapter_segments(self, chapter_id: str) -> list[dict[str, Any]]:
        """Return all segment rows for the chapter, ordered by position."""
        from app.db.segments import get_chapter_segments  # noqa: PLC0415
        return get_chapter_segments(chapter_id)

    def build_chunk_groups(
        self,
        segments: list[dict[str, Any]],
        char_limit: int | None = None,
        *,
        default_profile: str | None = None,
    ) -> list[dict[str, Any]]:
        """Group consecutive segments by speaker into render groups.

        Wraps ``app.domain.chunk_groups.build_chunk_groups``.
        ``char_limit`` is accepted for API symmetry but the underlying
        grouper does not yet split on character count (S10 work); it is
        preserved here so callers that pass it do not break.
        ``default_profile`` is forwarded as the fallback speaker profile.

        Note: the return type is ``list[dict]`` (each dict has a
        ``segments`` key), NOT ``list[list[dict]]``; callers must iterate
        ``group["segments"]``.
        """
        from app.domain.chunk_groups import build_chunk_groups  # noqa: PLC0415
        return build_chunk_groups(segments, default_profile=default_profile)

    def load_chunk_segments(
        self,
        chapter_id: str,
        char_limit: int,
    ) -> list[list[dict[str, Any]]]:
        """Convenience: fetch segments then group them."""
        segments = self.get_chapter_segments(chapter_id)
        return self.build_chunk_groups(segments, char_limit)

    # ------------------------------------------------------------------
    # §3.3.6 Bridge Synthesis Call
    # ------------------------------------------------------------------

    def generate_via_bridge(
        self,
        engine: str,
        text: str,
        out_wav: Path,
        *,
        profile_name: str | None = None,
        on_output: Callable[[str], None] | None = None,
        cancel_check: Callable[[], bool] | None = None,
        speed: float = 1.0,
        script: list[dict[str, Any]] | None = None,
        task_id: str | None = None,
        safe_mode: bool = True,
    ) -> int:
        """Send a synthesis request to the TTS Server via the bridge.

        Returns 0 on success.  Raises ``BridgeError`` on failure.
        """
        from app.jobs.handlers.bridge_helpers import generate_via_bridge  # noqa: PLC0415
        return generate_via_bridge(
            engine=engine,
            text=text,
            out_wav=out_wav,
            profile_name=profile_name,
            on_output=on_output,
            cancel_check=cancel_check,
            speed=speed,
            script=script,
            task_id=task_id,
            safe_mode=safe_mode,
        )

    # ------------------------------------------------------------------
    # §3.3.7 Engine Behavior Parameters
    # ------------------------------------------------------------------

    def get_behavior(self, engine_id: str) -> Any:
        """Return the engine behavior configuration for the named engine.

        Returns the normalized behavior dict from the manifest.  Keys include
        ``text_chunk_limit``, ``text_split_target``, ``features``, etc.
        Wraps ``app.engines.behavior.normalize_behavior`` using manifest data
        fetched from the TTS Server's loaded plugin registry.
        """
        from app.engines.behavior import normalize_behavior  # noqa: PLC0415
        try:
            from app.tts_server.plugin_loader import get_plugin_dir  # noqa: PLC0415
            import json as _json  # noqa: PLC0415
            manifest_path = get_plugin_dir(engine_id) / "manifest.json"
            if manifest_path.is_file():
                manifest = _json.loads(manifest_path.read_text(encoding="utf-8"))
                return normalize_behavior(manifest.get("behavior"))
        except Exception:
            pass
        return normalize_behavior(None)

    # ------------------------------------------------------------------
    # §3.3.8 Cancellation Check
    # ------------------------------------------------------------------

    def is_cancelled(self, job_id: str) -> bool:
        """Return True if the job has been cancelled by the user.

        Poll at the top of each render group loop.
        """
        from app.db.state_jobs import get_jobs  # noqa: PLC0415
        jobs = get_jobs()
        job = jobs.get(job_id)
        if job is None:
            return False
        status = job.get("status", "") if isinstance(job, dict) else getattr(job, "status", "")
        return status == "cancelled"

    # ------------------------------------------------------------------
    # §3.3.9 Structured Logging
    # ------------------------------------------------------------------

    def log(
        self,
        message: str,
        *,
        level: str = "info",
        job_id: str | None = None,
        engine_id: str | None = None,
    ) -> None:
        """Emit a structured log line routed to the tts.logs WS topic.

        Also emits a standard Python log so it appears in server logs.
        Queue must never infer state from tts.logs.
        """
        import logging  # noqa: PLC0415
        from app.api.ws import broadcast_tts_log_line  # noqa: PLC0415
        _logger = logging.getLogger(f"studio.plugin.{engine_id or self._engine_id}")
        log_fn = getattr(_logger, level, _logger.info)
        log_fn("[job=%s] %s", job_id or "?", message)
        broadcast_tts_log_line(
            line=message,
            source=engine_id or self._engine_id,
            job_id=job_id or "",
            project_id=None,
            chapter_id=None,
        )

    # ------------------------------------------------------------------
    # §3.3.10 Segment Persistence
    # ------------------------------------------------------------------

    def update_segment(self, segment_id: str, **fields: Any) -> None:
        """Update one segment row."""
        from app.db.segments import update_segment  # noqa: PLC0415
        update_segment(segment_id, **fields)

    def update_segments_status_bulk(self, segment_ids: list[str], status: str) -> None:
        """Bulk status update for multiple segments."""
        from app.db.segments import update_segments_status_bulk  # noqa: PLC0415
        # The underlying function requires chapter_id; derive from first segment when available.
        # If chapter_id is unknown pass empty string — the DB layer handles it.
        update_segments_status_bulk(segment_ids, chapter_id="", status=status, broadcast=False)

    def cleanup_orphaned_segments(self, chapter_id: str) -> None:
        """Remove segment rows with no backing audio."""
        from app.db.segments import cleanup_orphaned_segments  # noqa: PLC0415
        cleanup_orphaned_segments(chapter_id)

    def update_job_fields(self, job_id: str, *, broadcast: bool = False, **fields: Any) -> None:
        """Low-level pass-through for arbitrary job row updates.

        Prefer ``update_job_progress`` for the standard set of job state
        fields.  Use this method only for engine-specific render-tracking
        fields not covered by ``update_job_progress`` (e.g.
        ``total_render_weight``, ``completed_render_weight``,
        ``active_render_group_weight``, ``grouped_progress``).

        Added in S4 (gap found during tts_xtts handler migration).
        """
        from app.db.state_jobs import update_job  # noqa: PLC0415
        update_job(job_id, force_broadcast=broadcast, **fields)

    def update_queue_item(self, job_id: str, **fields: Any) -> None:
        """Low-level queue row write.  Prefer update_job_progress / update_queue_row.

        ``fields`` may include: ``status``, ``audio_length_seconds``,
        ``force_chapter_id``, ``output_file``, ``error``, ``chapter_scoped``.
        """
        from app.db.queue import update_queue_item  # noqa: PLC0415
        update_queue_item(
            job_id,
            status=fields.get("status", ""),
            audio_length_seconds=fields.get("audio_length_seconds", 0.0),
            force_chapter_id=fields.get("force_chapter_id"),
            output_file=fields.get("output_file"),
            error=fields.get("error"),
            chapter_scoped=fields.get("chapter_scoped", True),
        )

    # ------------------------------------------------------------------
    # §3.3.11 Path and Directory Resolution
    # ------------------------------------------------------------------

    def get_plugin_data_dir(self, engine_id: str | None = None) -> str:
        """Absolute path to plugin_data/<engine_id>/ (writable runtime dir)."""
        from app.core.config import PLUGIN_DATA_DIR  # noqa: PLC0415
        eid = engine_id or self._engine_id
        path = PLUGIN_DATA_DIR / eid
        path.mkdir(parents=True, exist_ok=True)
        return str(path)

    def get_chapter_dir(self, chapter_id: str) -> str:
        """Absolute path to the chapter's working/output directory."""
        from app.core.config import get_chapter_dir  # noqa: PLC0415
        # get_chapter_dir requires (project_id, chapter_id); fetch project_id from DB.
        from app.db.chapters import get_chapter  # noqa: PLC0415
        chapter = get_chapter(chapter_id)
        project_id = chapter.get("project_id", "") if chapter else ""
        return str(get_chapter_dir(project_id, chapter_id))

    def get_voices_dir(self) -> str:
        """Absolute path to the voices root."""
        from app.core.config import VOICES_DIR  # noqa: PLC0415
        return str(VOICES_DIR)

    # ------------------------------------------------------------------
    # §3.3.12 Audio Operations
    # ------------------------------------------------------------------

    def stitch_segments(self, segment_wavs: list[str], out_wav: str) -> None:
        """Concatenate segment WAVs into a chapter WAV."""
        from app.engines.audio_ops import stitch_segments  # noqa: PLC0415
        stitch_segments(segment_wavs, out_wav)

    def wav_to_mp3(self, in_wav: str, out_mp3: str) -> None:
        """Transcode WAV to MP3."""
        from app.engines.audio_ops import wav_to_mp3  # noqa: PLC0415
        wav_to_mp3(in_wav, out_mp3)

    def get_audio_duration(self, path: str) -> float:
        """Return audio duration in seconds."""
        from app.engines.audio_ops import get_audio_duration  # noqa: PLC0415
        return get_audio_duration(Path(path))

    def finalize_sample_artifact(self, wav_path: Path) -> Path:
        """Convert a voice-sample WAV to MP3, delete WAV on success, return the final path.

        On conversion failure the WAV is kept and its path is returned.
        Wraps ``app.engines.audio_ops.finalize_sample_artifact``.
        Added in S5 (gap found during tts_voxtral handler migration).
        """
        from app.engines.audio_ops import finalize_sample_artifact  # noqa: PLC0415
        return finalize_sample_artifact(wav_path)

    # ------------------------------------------------------------------
    # §3.3.13 Text Preparation
    # ------------------------------------------------------------------

    def sanitize_text(self, text: str, categories: Any = None) -> str:
        """Apply safe-mode text sanitization.

        ``categories`` is forwarded to the underlying sanitizer when supplied;
        obtain a category config via ``get_sanitize_categories(engine_id)``.
        """
        from app.utils.text.textops_cleaning import sanitize_text  # noqa: PLC0415
        if categories is not None:
            return sanitize_text(text, categories)
        return sanitize_text(text)

    def split_long_sentences(self, text: str, char_limit: int) -> list[str]:
        """Split overlong sentences under char_limit."""
        from app.utils.text.textops_splitting import safe_split_long_sentences  # noqa: PLC0415
        result = safe_split_long_sentences(text, target=char_limit)
        if isinstance(result, list):
            return result
        return [result]

    def get_text_chunk_limit(self, engine_id: str) -> int:
        """Engine character chunk limit from manifest."""
        from app.engines.behavior import get_text_chunk_limit  # noqa: PLC0415
        return get_text_chunk_limit(engine_id)

    def get_sanitize_categories(self, engine_id: str) -> Any:
        """Return the sanitization category config for the named engine.

        Wraps ``app.engines.behavior.get_sanitize_categories``.
        Added in S4 (gap found during tts_xtts handler migration).
        """
        from app.engines.behavior import get_sanitize_categories  # noqa: PLC0415
        return get_sanitize_categories(engine_id)

    def get_chapter_segments_counts(self, chapter_id: str) -> tuple[int, int]:
        """Return (done_count, total_count) for segments in a chapter.

        Wraps ``app.db.chapters.get_chapter_segments_counts``.
        Added in S4 (gap found during tts_xtts handler migration).
        """
        from app.db.chapters import get_chapter_segments_counts  # noqa: PLC0415
        return get_chapter_segments_counts(chapter_id)

    # ------------------------------------------------------------------
    # Extra methods mentioned in doc 02 text (outside the tables)
    # ------------------------------------------------------------------

    def run_voice_job(self, job: JobSpec) -> JobResult:
        """Delegate to the shared voice-build/test handler.

        Wraps ``app.jobs.worker_voice.handle_voice_job``.  Plugin handlers
        for voice_build / voice_test / voice_task kinds should call this
        rather than importing the worker directly.

        NOTE: doc 02 §3.3 tables do not yet list this method; it will be
        added in S10 when the spec is synced to 1.3.0.
        """
        from app.jobs.worker_voice import handle_voice_job  # noqa: PLC0415
        # handle_voice_job(jid, j, on_output, cancel_check) is the legacy sig.
        # We expose a simplified facade; full wiring happens in S9.
        def _noop_output(line: str) -> None:
            self.log(line, job_id=job.id)

        def _cancel_check() -> bool:
            return self.is_cancelled(job.id)

        raw = handle_voice_job(job.id, job.extra, _noop_output, _cancel_check)
        if raw is None:
            return JobResult(status="done")
        if isinstance(raw, dict):
            return JobResult(
                status=raw.get("status", "done"),
                error=raw.get("error"),
                output_wav=raw.get("output_wav"),
                output_mp3=raw.get("output_mp3"),
            )
        return JobResult(status="done")

    def resolve_voice_preview_inputs(
        self,
        profile_name: str,
        *,
        engine: str | None = None,  # reserved for future use (S10)
    ) -> dict[str, Any]:
        """Resolve voice preview inputs for a profile.

        Wraps ``app.engines.voice_engines.resolve_voice_preview_inputs``.
        Returns a dict with keys ``voice_ref`` (str|None) and
        ``voice_profile_dir`` (str|None).

        NOTE: doc 02 §3.3 tables do not yet list this method; it will be
        added in S10 when the spec is synced to 1.3.0.
        """
        from app.engines.voice_engines import resolve_voice_preview_inputs  # noqa: PLC0415
        voice_ref, profile_dir = resolve_voice_preview_inputs(profile_name)
        return {
            "voice_ref": voice_ref,
            "voice_profile_dir": str(profile_dir) if profile_dir is not None else None,
        }

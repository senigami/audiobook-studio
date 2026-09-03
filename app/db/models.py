from dataclasses import dataclass, field
from typing import Optional, Literal, List, Dict, Any

JobEngineId = str
JobKind = Literal["synthesis", "assembly", "voice_build", "voice_test", "mixed", "generic"]
Status = Literal["queued", "preparing", "running", "finalizing", "done", "failed", "cancelled"]

@dataclass
class Job:
    id: str
    engine: JobEngineId
    status: Status
    created_at: float
    kind: Optional[JobKind] = None

    chapter_file: Optional[str] = None
    project_id: Optional[str] = None
    chapter_id: Optional[str] = None

    started_at: Optional[float] = None
    updated_at: Optional[float] = None
    finished_at: Optional[float] = None

    safe_mode: bool = True
    make_mp3: bool = False

    speaker_profile: Optional[str] = None

    output_wav: Optional[str] = None
    output_mp3: Optional[str] = None

    progress: float = 0.0  # 0..1
    eta_seconds: Optional[int] = None
    eta_basis: Optional[str] = None
    estimated_end_at: Optional[float] = None
    eta_confidence: Optional[str] = None
    reason_code: Optional[str] = None

    log: str = ""
    error: Optional[str] = None
    warning_count: int = 0
    bypass_pause: bool = False
    custom_title: Optional[str] = None
    author_meta: Optional[str] = None
    narrator_meta: Optional[str] = None
    chapter_list: Optional[List[dict]] = None
    cover_path: Optional[str] = None
    segment_ids: Optional[List[str]] = None
    is_bake: bool = False
    force_rerender: bool = False
    active_segment_id: Optional[str] = None
    active_segment_progress: float = 0.0
    render_group_count: int = 0
    completed_render_groups: int = 0
    active_render_group_index: int = 0
    total_render_weight: int = 0
    completed_render_weight: int = 0
    active_render_group_weight: int = 0
    grouped_progress: float = 0.0
    # W-PAR 003 (C2 contract): chapter-level snapshot of independently-tracked
    # concurrent segments, keyed by segment_id. Additive field (INV-1/INV-9):
    # absent or None at cap=1 means "no concurrent segments to report" and the
    # frontend falls back to the singular active_segment_id path byte-identically.
    active_segments_map: Optional[Dict[str, Dict[str, Any]]] = None
    active_render_batch_id: Optional[str] = None
    active_render_batch_progress: Optional[float] = None
    active_segment_eta_seconds: Optional[int] = None
    active_segment_eta_basis: Optional[str] = None
    active_segment_updated_at: Optional[float] = None
    has_segment_support: bool = False
    synthesis_duration_seconds: Optional[float] = None
    classification_override: Optional[str] = None

    engine_activity_started_at: Optional[float] = None
    first_start_segment_at: Optional[float] = None
    chapter_render_completed_at: Optional[float] = None
    sum_segment_render_seconds: float = 0.0
    model_load_seconds: Optional[float] = None
    inter_group_overhead_seconds: Optional[float] = None
    chapter_post_start_window: Optional[float] = None
    chapter_wall_duration: Optional[float] = None
    eta_updated_at: Optional[float] = None

    @property
    def classification(self) -> str:
        # Prefer explicit classification if present
        explicit = getattr(self, "classification_override", None)
        if explicit in {"job", "chapter", "segment"}:
            return explicit

        # Check chapter_id + active_segment_id combination
        if getattr(self, "chapter_id", None) and getattr(self, "active_segment_id", None):
            return "chapter"

        # Check true segment indicators
        if getattr(self, "segment_ids", None):
            return "segment"

        # Check chapter indicators
        if getattr(self, "chapter_id", None):
            return "chapter"

        # Defensive fallback for parent_job_id
        parent_id = getattr(self, "parent_job_id", None)
        if parent_id and parent_id.startswith("job-"):
            return "segment"

        return "job"

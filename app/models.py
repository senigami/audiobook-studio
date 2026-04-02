from dataclasses import dataclass
from typing import Optional, Literal, List

Engine = Literal["xtts", "voxtral", "mixed", "audiobook", "voice_build", "voice_test"]
Status = Literal["queued", "preparing", "running", "finalizing", "done", "failed", "cancelled"]

@dataclass
class Job:
    id: str
    engine: Engine
    chapter_file: str
    status: Status
    created_at: float

    project_id: Optional[str] = None
    chapter_id: Optional[str] = None

    started_at: Optional[float] = None
    synthesis_started_at: Optional[float] = None
    finished_at: Optional[float] = None

    safe_mode: bool = True
    make_mp3: bool = False

    speaker_profile: Optional[str] = None

    output_wav: Optional[str] = None
    output_mp3: Optional[str] = None

    progress: float = 0.0  # 0..1
    eta_seconds: Optional[int] = None

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
    active_segment_id: Optional[str] = None
    active_segment_progress: float = 0.0
    render_group_count: int = 0
    completed_render_groups: int = 0
    active_render_group_index: int = 0

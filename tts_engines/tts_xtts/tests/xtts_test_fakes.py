"""Plugin-local test fakes for the XTTS plugin suite.

These replace host-side types (``app.db.models.Job``) so the plugin tests can
run without the Studio host installed. Per R2 the fake sits at the host
boundary: plugin handlers only duck-type ``job.<attr>`` reads/writes, so a
plain dataclass mirroring the fields the plugin actually touches is a faithful
stand-in. Field names and defaults mirror ``app.db.models.Job``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Job:
    id: str
    engine: str
    status: str
    created_at: float
    kind: Optional[str] = None

    chapter_file: Optional[str] = None
    project_id: Optional[str] = None
    chapter_id: Optional[str] = None

    safe_mode: bool = True
    make_mp3: bool = False

    speaker_profile: Optional[str] = None

    output_wav: Optional[str] = None
    output_mp3: Optional[str] = None

    progress: float = 0.0
    log: str = ""
    error: Optional[str] = None
    segment_ids: Optional[List[str]] = None
    is_bake: bool = False
    force_rerender: bool = False
    chapter_list: Optional[List[dict]] = field(default=None)

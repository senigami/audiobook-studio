"""Project domain models.

Studio 2.0 treats project metadata, snapshots, and export intent as explicit
domain contracts instead of route-local or worker-local state.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class ProjectModel:
    """Project-level metadata owned by the project domain."""

    id: str
    title: str
    author: str | None = None
    series: str | None = None
    cover_asset_ref: str | None = None
    default_voice_id: str | None = None
    default_output_preset: str | None = None
    pronunciation_profile_id: str | None = None
    status: str = "draft"
    created_at: datetime = field(default_factory=_utc_now)
    updated_at: datetime = field(default_factory=_utc_now)

    @property
    def name(self) -> str:
        """Backward-compatible alias for legacy project callers."""

        return self.title


@dataclass
class SnapshotModel:
    """Revision-safe snapshot used for restore and export flows."""

    id: str
    project_id: str
    label: str
    source_revision: str
    metadata_json: dict[str, Any] = field(default_factory=dict)
    chapter_ids: list[str] = field(default_factory=list)
    artifact_hashes: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=_utc_now)


ProjectSnapshotModel = SnapshotModel


@dataclass
class ProjectExportManifestModel:
    """Export intent payload describing what a project export should include."""

    project_id: str
    format_id: str
    chapter_ids: list[str] = field(default_factory=list)
    include_cover_art: bool = True
    include_audio: bool = True
    snapshot_id: str | None = None

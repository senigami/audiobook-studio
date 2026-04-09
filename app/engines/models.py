"""Shared engine contract models for Studio 2.0."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .voice.base import BaseVoiceEngine


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class EngineManifestModel:
    """Discovery metadata for a voice engine adapter."""

    engine_id: str
    display_name: str
    phase: str
    module_path: str
    notes: tuple[str, ...] = ()
    capabilities: tuple[str, ...] = ()
    built_in: bool = True


@dataclass(frozen=True)
class EngineHealthModel:
    """Readiness and health summary for a loaded engine adapter."""

    engine_id: str
    available: bool
    ready: bool
    status: str
    message: str | None = None
    details: dict[str, Any] = field(default_factory=dict)
    checked_at: datetime = field(default_factory=_utc_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "engine_id": self.engine_id,
            "available": self.available,
            "ready": self.ready,
            "status": self.status,
            "message": self.message,
            "details": dict(self.details),
            "checked_at": self.checked_at.isoformat(),
        }


@dataclass(frozen=True)
class EngineRegistrationModel:
    """Resolved engine adapter and its discovery metadata."""

    manifest: EngineManifestModel
    engine: "BaseVoiceEngine"
    health: EngineHealthModel

    def to_dict(self) -> dict[str, Any]:
        return {
            "manifest": {
                "engine_id": self.manifest.engine_id,
                "display_name": self.manifest.display_name,
                "phase": self.manifest.phase,
                "module_path": self.manifest.module_path,
                "notes": list(self.manifest.notes),
                "capabilities": list(self.manifest.capabilities),
                "built_in": self.manifest.built_in,
            },
            "health": self.health.to_dict(),
        }

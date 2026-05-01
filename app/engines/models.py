"""Shared engine contract models for Studio 2.0.

During the Phase 5 migration, this module serves two generations of engine
metadata:

- ``EngineManifestModel`` \u2014 original minimal manifest used by the legacy
  in-process registry.  Extended with new optional SDK fields so both paths
  can coexist without a breaking change.
- ``ResourceProfile`` \u2014 new resource declaration used by the scheduler and
  the TTS Server discovery path.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .voice.base import BaseVoiceEngine


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class ResourceProfile:
    """Resource requirements declared by a TTS plugin engine.

    Used by the orchestrator to decide whether a task can be scheduled given
    current resource availability.

    Attributes:
        gpu: Whether the engine requires exclusive GPU access.
        vram_mb: Estimated VRAM usage in megabytes (0 when gpu is False).
        cpu_heavy: Whether the engine does sustained heavy CPU work.
    """

    gpu: bool = False
    vram_mb: int = 0
    cpu_heavy: bool = False


@dataclass(frozen=True)
class EngineManifestModel:
    """Discovery metadata for a voice engine adapter.

    Legacy fields (``engine_id``, ``display_name``, ``phase``,
    ``module_path``, ``notes``, ``capabilities``, ``built_in``) are preserved
    for the in-process registry path.

    New SDK fields are optional with safe defaults so existing registrations
    remain valid during the migration window.
    """

    # Legacy fields — always present
    engine_id: str
    display_name: str
    phase: str
    module_path: str
    notes: tuple[str, ...] = ()
    capabilities: tuple[str, ...] = ()
    built_in: bool = True

    # SDK fields — populated by the TTS Server plugin loader
    schema_version: str = "1.0"
    version: str = "0.0.0"
    min_studio: str = "2.0.0"
    entry_class: str = ""
    resource: ResourceProfile = field(default_factory=ResourceProfile)
    languages: tuple[str, ...] = ("en",)
    local: bool = True
    cloud: bool = False
    network: bool = False
    author: str = ""
    license: str = ""
    homepage: str = ""
    test_text: str = "This is a verification test."
    verified: bool = False
    behavior: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class EngineHealthModel:
    """Readiness and health summary for a loaded engine adapter."""

    engine_id: str
    available: bool
    ready: bool
    status: str
    message: str | None = None
    dependencies_satisfied: bool = True
    missing_dependencies: list[str] = field(default_factory=list)
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
            "dependencies_satisfied": self.dependencies_satisfied,
            "missing_dependencies": self.missing_dependencies,
            "checked_at": self.checked_at.isoformat(),
        }


@dataclass(frozen=True)
class EngineRegistrationModel:
    """Resolved engine adapter and its discovery metadata."""

    manifest: EngineManifestModel
    engine: "BaseVoiceEngine"
    health: EngineHealthModel

    def to_dict(self) -> dict[str, Any]:
        from dataclasses import asdict  # noqa: PLC0415

        data = {
            "manifest": asdict(self.manifest),
            "health": self.health.to_dict(),
        }

        # Flatten manifest for top-level compatibility with TTS Server detail shape
        flattened = {
            "engine_id": self.manifest.engine_id,
            "display_name": self.manifest.display_name,
            "status": self.health.status,
            "verified": self.manifest.verified,
            "version": self.manifest.version,
            "local": self.manifest.local,
            "cloud": self.manifest.cloud,
            "network": self.manifest.network,
            "languages": list(self.manifest.languages),
            "capabilities": list(self.manifest.capabilities),
            "resource": asdict(self.manifest.resource),
            "author": self.manifest.author,
            "homepage": self.manifest.homepage,
            "behavior": dict(self.manifest.behavior),
        }

        try:
            if hasattr(self.engine, "current_settings"):
                flattened["current_settings"] = self.engine.current_settings()
            else:
                flattened["current_settings"] = {}
        except Exception:
            flattened["current_settings"] = {}

        # Add settings_schema if the engine supports it (StudioTTSEngine contract)
        try:
            if hasattr(self.engine, "settings_schema"):
                flattened["settings_schema"] = self.engine.settings_schema()
            else:
                flattened["settings_schema"] = {}
        except Exception:
            flattened["settings_schema"] = {}

        flattened["health_message"] = self.health.message
        flattened["health_details"] = dict(self.health.details)
        flattened["setup_message"] = self.health.message if not self.health.ready else None
        flattened["dependencies_satisfied"] = self.health.dependencies_satisfied
        flattened["missing_dependencies"] = list(self.health.missing_dependencies)

        # Merge in the flattened manifest fields
        data.update(flattened)
        return data

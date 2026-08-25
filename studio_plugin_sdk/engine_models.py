"""Studio Plugin SDK: engine discovery and health models.

SDK-owned and stdlib-only (dataclasses, datetime, typing), so a plugin's
app-side adapter can accept and return these without importing ``app.*``
(issue #200). ``app.engines.models`` re-exports them with identical object
identity and keeps ``EngineRegistrationModel``, which is host orchestration
glue rather than plugin contract.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

__all__ = [
    "ResourceProfile",
    "EngineManifestModel",
    "EngineHealthModel",
]


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
    """Discovery metadata for an installed voice engine adapter."""

    # App-side discovery fields (always present)
    engine_id: str
    display_name: str
    phase: str
    module_path: str
    notes: tuple[str, ...] = ()
    capabilities: tuple[str, ...] = ()
    built_in: bool = True

    # SDK fields, populated by the TTS Server plugin loader
    studio_tts_manifest: str = "1.0"
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
    test_sample: str | None = None
    verified: bool = False
    behavior: dict[str, Any] = field(default_factory=dict)
    dev: dict[str, Any] = field(default_factory=dict)
    logo: dict[str, Any] = field(default_factory=dict)


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

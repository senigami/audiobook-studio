"""Engine registration model, plus re-exports of the SDK engine models.

``ResourceProfile``, ``EngineManifestModel`` and ``EngineHealthModel`` moved
into ``studio_plugin_sdk.engine_models`` (issue #200) so a plugin's app-side
adapter can use them without importing ``app.*``. They are re-exported here
with identical object identity, so existing importers keep working.

``EngineRegistrationModel`` stays: it pairs a manifest with a resolved engine
object and flattens both for ``/api/engines``, which is host orchestration
glue, not part of the published plugin contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, TYPE_CHECKING

from studio_plugin_sdk.engine_models import (
    EngineHealthModel,
    EngineManifestModel,
    ResourceProfile,
)

if TYPE_CHECKING:
    from .voice.base import BaseVoiceEngine

__all__ = [
    "ResourceProfile",
    "EngineManifestModel",
    "EngineHealthModel",
    "EngineRegistrationModel",
]


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
            "studio_tts_manifest": self.manifest.studio_tts_manifest,
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
            "test_text": self.manifest.test_text,
            "behavior": dict(self.manifest.behavior),
            "dev": dict(self.manifest.dev),
            "logo": dict(self.manifest.logo),
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

"""Voxtral engine adapter scaffold for Studio 2.0.

This module will wrap the existing Voxtral behavior behind the standard engine
contract without leaking engine-specific request handling into orchestration.
"""

from __future__ import annotations

from app.engines.voice.base import BaseVoiceEngine
from app.engines.models import EngineHealthModel, EngineManifestModel
from app.infra.subprocess import run_managed_subprocess_async

INTENDED_UPSTREAM_CALLERS = (
    "app.engines.registry",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = (
    "app.engines.voice.base.BaseVoiceEngine",
    "app.infra.subprocess.run_managed_subprocess",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.orchestration",
    "app.api.routers",
    "app.jobs",
)


class VoxtralVoiceEngine(BaseVoiceEngine):
    """Standard Voxtral adapter placeholder."""

    def __init__(self, *, manifest: EngineManifestModel):
        self.manifest = manifest

    def describe_health(self) -> EngineHealthModel:
        """Summarize Voxtral adapter readiness without triggering side effects."""

        return EngineHealthModel(
            engine_id=self.manifest.engine_id,
            available=True,
            ready=False,
            status="scaffold",
            message="Voxtral adapter is registered but execution is still scaffolded.",
            details={
                "module_path": self.manifest.module_path,
                "capabilities": list(self.manifest.capabilities),
            },
        )

    def validate_environment(self) -> None:
        """Describe Voxtral environment validation."""
        raise NotImplementedError

    def validate_request(self, request: dict[str, object]) -> None:
        """Describe Voxtral request validation."""
        if not isinstance(request, dict):
            raise TypeError("Voxtral requests must be provided as a mapping.")
        engine_id = str(request.get("engine_id") or "").strip()
        if engine_id and engine_id != self.manifest.engine_id:
            raise ValueError("Voxtral request is targeting a different engine.")

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Describe Voxtral synthesis through the standard engine contract."""
        _ = run_managed_subprocess_async
        raise NotImplementedError

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Describe Voxtral preview/test flow through the standard contract."""
        _ = run_managed_subprocess_async
        raise NotImplementedError

    def build_voice_asset(self, request: dict[str, object]) -> dict[str, object]:
        """Describe Voxtral voice-asset build flow through the standard contract."""
        _ = run_managed_subprocess_async
        raise NotImplementedError

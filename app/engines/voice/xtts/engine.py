"""XTTS engine adapter scaffold for Studio 2.0.

This module will wrap the existing XTTS behavior behind the standard engine
contract without leaking XTTS-specific process management into the scheduler.
"""

from __future__ import annotations

from app.engines.errors import EngineRequestError
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


class XttsVoiceEngine(BaseVoiceEngine):
    """Standard XTTS adapter placeholder."""

    def __init__(self, *, manifest: EngineManifestModel):
        self.manifest = manifest

    def describe_health(self) -> EngineHealthModel:
        """Summarize XTTS adapter readiness without triggering side effects."""

        return EngineHealthModel(
            engine_id=self.manifest.engine_id,
            available=False,
            ready=False,
            status="scaffold",
            message="XTTS adapter is registered, but the Studio 2.0 bridge execution path is not implemented yet.",
            details={
                "module_path": self.manifest.module_path,
                "capabilities": list(self.manifest.capabilities),
            },
        )

    def validate_environment(self) -> None:
        """Describe XTTS environment validation."""
        raise NotImplementedError

    def validate_request(self, request: dict[str, object]) -> None:
        """Describe XTTS request validation."""
        if not isinstance(request, dict):
            raise EngineRequestError("XTTS requests must be provided as a mapping.")
        engine_id = str(request.get("engine_id") or "").strip()
        if engine_id and engine_id != self.manifest.engine_id:
            raise EngineRequestError("XTTS request is targeting a different engine.")

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Describe XTTS synthesis through the standard engine contract."""
        _ = run_managed_subprocess_async
        raise NotImplementedError

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Describe XTTS preview/test flow through the standard contract."""
        _ = run_managed_subprocess_async
        raise NotImplementedError

    def build_voice_asset(self, request: dict[str, object]) -> dict[str, object]:
        """Describe XTTS voice-asset build flow through the standard contract."""
        _ = run_managed_subprocess_async
        raise NotImplementedError

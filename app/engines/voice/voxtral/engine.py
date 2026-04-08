"""Voxtral engine adapter scaffold for Studio 2.0.

This module will wrap the existing Voxtral behavior behind the standard engine
contract without leaking engine-specific request handling into orchestration.
"""

from app.engines.voice.base import BaseVoiceEngine
from app.infra.subprocess import run_managed_subprocess

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

    def validate_environment(self) -> None:
        """Describe Voxtral environment validation."""
        raise NotImplementedError

    def validate_request(self, request: dict[str, object]) -> None:
        """Describe Voxtral request validation."""
        raise NotImplementedError

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Describe Voxtral synthesis through the standard engine contract."""
        _ = run_managed_subprocess
        raise NotImplementedError

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Describe Voxtral preview/test flow through the standard contract."""
        _ = run_managed_subprocess
        raise NotImplementedError

    def build_voice_asset(self, request: dict[str, object]) -> dict[str, object]:
        """Describe Voxtral voice-asset build flow through the standard contract."""
        _ = run_managed_subprocess
        raise NotImplementedError

"""Tests for orchestrator internal helpers."""

from __future__ import annotations

from app.orchestration.scheduler.orchestrator import _claim_to_dict
from app.orchestration.scheduler.resources import ResourceClaim


class TestClaimToDict:
    def test_none_returns_empty_dict(self):
        assert _claim_to_dict(None) == {}

    def test_resource_claim_converted(self):
        claim = ResourceClaim.gpu_heavy(vram_mb=6000)
        d = _claim_to_dict(claim)
        assert d["gpu"] is True
        assert d["vram_mb"] == 6000
        assert d["cpu_heavy"] is True

    def test_none_claim_all_false(self):
        claim = ResourceClaim.none()
        d = _claim_to_dict(claim)
        assert d["gpu"] is False
        assert d["vram_mb"] == 0

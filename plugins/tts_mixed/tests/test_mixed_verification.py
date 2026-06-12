"""Verification tests for the Mixed orchestrator plugin.

Mixed is a delegation-only engine — it has no model of its own. Its run_test()
must return ok=True so the enablement/health gates (which require verified=True)
do not permanently block it.

R1: These tests are written BEFORE the implementation so they can be confirmed
    red against the base-class default.
"""
from __future__ import annotations

import pytest

from app.engines.voice.sdk import VerificationResult
from plugins.tts_mixed.engine import MixedPlugin


@pytest.fixture()
def engine() -> MixedPlugin:
    return MixedPlugin()


def test_run_test_returns_verification_result(engine: MixedPlugin) -> None:
    """run_test() must return an sdk.VerificationResult instance."""
    result = engine.run_test()
    assert isinstance(result, VerificationResult)


def test_run_test_ok_true(engine: MixedPlugin) -> None:
    """Mixed is an orchestrator with no model; run_test must report ok=True.

    The base-class default returns ok=False — this test is RED until
    MixedPlugin overrides run_test().
    """
    result = engine.run_test()
    assert result.ok is True, f"run_test returned ok=False: {result.message}"


def test_run_test_message_not_base_default(engine: MixedPlugin) -> None:
    """The result message must not be the unimplemented base-class sentinel."""
    result = engine.run_test()
    assert "does not implement" not in result.message

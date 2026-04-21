from __future__ import annotations

from app.core.feature_flags import (
    USE_STUDIO_ORCHESTRATOR_ENV,
    USE_TTS_SERVER_ENV,
    is_feature_enabled,
    use_studio_orchestrator,
    use_tts_server,
)


def test_is_feature_enabled_reads_truthy_env(monkeypatch) -> None:
    monkeypatch.setenv("USE_V2_ENGINE_BRIDGE", "1")

    assert is_feature_enabled("USE_V2_ENGINE_BRIDGE") is True


def test_is_feature_enabled_treats_missing_or_falsey_env_as_disabled(monkeypatch) -> None:
    monkeypatch.delenv("USE_V2_ENGINE_BRIDGE", raising=False)

    assert is_feature_enabled("USE_V2_ENGINE_BRIDGE") is False

    monkeypatch.setenv("USE_V2_ENGINE_BRIDGE", "no")

    assert is_feature_enabled("USE_V2_ENGINE_BRIDGE") is False


def test_named_helpers_read_truthy_env(monkeypatch) -> None:
    monkeypatch.setenv(USE_TTS_SERVER_ENV, "true")
    monkeypatch.setenv(USE_STUDIO_ORCHESTRATOR_ENV, "1")

    assert use_tts_server() is True
    assert use_studio_orchestrator() is True


def test_named_helpers_treat_missing_as_disabled(monkeypatch) -> None:
    monkeypatch.delenv(USE_TTS_SERVER_ENV, raising=False)
    monkeypatch.delenv(USE_STUDIO_ORCHESTRATOR_ENV, raising=False)

    assert use_tts_server() is False
    assert use_studio_orchestrator() is False

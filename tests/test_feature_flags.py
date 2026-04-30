from __future__ import annotations

from app.core.feature_flags import is_feature_enabled


def test_is_feature_enabled_reads_truthy_env(monkeypatch) -> None:
    monkeypatch.setenv("USE_V2_ENGINE_BRIDGE", "1")

    assert is_feature_enabled("USE_V2_ENGINE_BRIDGE") is True


def test_is_feature_enabled_treats_missing_or_falsey_env_as_disabled(monkeypatch) -> None:
    monkeypatch.delenv("USE_V2_ENGINE_BRIDGE", raising=False)

    assert is_feature_enabled("USE_V2_ENGINE_BRIDGE") is False

    monkeypatch.setenv("USE_V2_ENGINE_BRIDGE", "no")

    assert is_feature_enabled("USE_V2_ENGINE_BRIDGE") is False

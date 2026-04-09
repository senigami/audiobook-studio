from __future__ import annotations

import pytest

from app.engines.bridge import create_voice_bridge
from app.engines.models import EngineHealthModel, EngineManifestModel, EngineRegistrationModel
from app.engines.registry import load_engine_registry


def test_engine_registry_loads_builtin_adapters() -> None:
    registry = load_engine_registry()

    assert set(registry) == {"xtts", "voxtral"}

    xtts = registry["xtts"]
    assert xtts.manifest.display_name == "XTTS"
    assert xtts.manifest.module_path == "app.engines.voice.xtts.engine"
    assert xtts.health.available is False
    assert xtts.health.ready is False
    assert xtts.health.status == "scaffold"


def test_voice_bridge_describes_registry() -> None:
    bridge = create_voice_bridge()

    registry_summary = bridge.describe_registry()

    assert {entry["manifest"]["engine_id"] for entry in registry_summary} == {"xtts", "voxtral"}
    assert all(entry["health"]["status"] == "scaffold" for entry in registry_summary)
    assert all(entry["health"]["available"] is False for entry in registry_summary)


def test_voice_bridge_rejects_unknown_engine() -> None:
    bridge = create_voice_bridge()

    with pytest.raises(KeyError, match="Unknown voice engine"):
        bridge.synthesize({"engine_id": "unknown", "text": "hello"})


def test_voice_bridge_rejects_unavailable_engine_before_routing() -> None:
    bridge = create_voice_bridge()

    with pytest.raises(RuntimeError, match="is unavailable"):
        bridge.preview({"engine_id": "xtts", "text": "hello"})


def test_voice_bridge_rejects_registered_engine_that_is_not_ready() -> None:
    class ReadyCheckEngine:
        def validate_request(self, request: dict[str, object]) -> None:
            raise AssertionError("validate_request should not run when engine is not ready")

        def preview(self, request: dict[str, object]) -> dict[str, object]:
            raise AssertionError("preview should not run when engine is not ready")

    manifest = EngineManifestModel(
        engine_id="test",
        display_name="Test Engine",
        phase="phase-3",
        module_path="tests.test_engine",
    )
    registration = EngineRegistrationModel(
        manifest=manifest,
        engine=ReadyCheckEngine(),
        health=EngineHealthModel(
            engine_id="test",
            available=True,
            ready=False,
            status="warming",
            message="still starting",
        ),
    )
    bridge = create_voice_bridge()
    bridge.registry_loader = lambda: {"test": registration}

    with pytest.raises(RuntimeError, match="is not ready"):
        bridge.preview({"engine_id": "test", "text": "hello"})

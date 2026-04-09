from __future__ import annotations

import pytest

from app.engines.bridge import create_voice_bridge
from app.engines.registry import load_engine_registry


def test_engine_registry_loads_builtin_adapters() -> None:
    registry = load_engine_registry()

    assert set(registry) == {"xtts", "voxtral"}

    xtts = registry["xtts"]
    assert xtts.manifest.display_name == "XTTS"
    assert xtts.manifest.module_path == "app.engines.voice.xtts.engine"
    assert xtts.health.available is True
    assert xtts.health.ready is False
    assert xtts.health.status == "scaffold"


def test_voice_bridge_describes_registry() -> None:
    bridge = create_voice_bridge()

    registry_summary = bridge.describe_registry()

    assert {entry["manifest"]["engine_id"] for entry in registry_summary} == {"xtts", "voxtral"}
    assert all(entry["health"]["status"] == "scaffold" for entry in registry_summary)


def test_voice_bridge_rejects_unknown_engine() -> None:
    bridge = create_voice_bridge()

    with pytest.raises(KeyError, match="Unknown voice engine"):
        bridge.synthesize({"engine_id": "unknown", "text": "hello"})

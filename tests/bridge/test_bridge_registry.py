from app.engines.bridge import create_voice_bridge

def test_voice_bridge_describes_remote_registry_by_default() -> None:
    bridge = create_voice_bridge()
    summary = bridge.describe_registry()

    assert {entry.get("engine_id") for entry in summary} == {"xtts", "voxtral"}
    assert {entry.get("status") for entry in summary} == {"ready"}

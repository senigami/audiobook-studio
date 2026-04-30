import pytest
from app.engines.bridge import create_voice_bridge
from app.engines.errors import EngineRequestError

def test_voice_bridge_describes_remote_registry_by_default(monkeypatch) -> None:
    monkeypatch.setattr("app.core.feature_flags.use_tts_server", lambda: True)
    bridge = create_voice_bridge()
    summary = bridge.describe_registry()

    assert {entry.get("engine_id") for entry in summary} == {"xtts", "voxtral"}
    assert {entry.get("status") for entry in summary} == {"ready"}

def test_voice_bridge_rejects_unknown_engine(monkeypatch) -> None:
    from app.engines.bridge_remote import RemoteBridgeHandler
    # Mock the remote synthesize to raise on unknown
    def mock_synthesize(self, req):
        if req.get("engine_id") == "unknown":
            raise EngineRequestError("Unknown voice engine: unknown")
        return {}

    monkeypatch.setattr(RemoteBridgeHandler, "synthesize", mock_synthesize)

    bridge = create_voice_bridge()
    with pytest.raises(EngineRequestError, match="Unknown voice engine"):
        bridge.synthesize({"engine_id": "unknown", "text": "hello"})

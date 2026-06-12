from app.engines.voice.base import StudioTTSEngine
from typing import Any

class MixedPlugin(StudioTTSEngine):
    """Mixed synthesis plugin (orchestrator)."""
    def info(self) -> dict[str, Any]:
        return {"display_name": "Mixed Synthesis"}
    def check_env(self) -> tuple[bool, str]:
        return True, "OK"
    def synthesize(self, req: Any) -> Any:
        raise NotImplementedError("Mixed synthesis is handled by the worker-side job handler.")

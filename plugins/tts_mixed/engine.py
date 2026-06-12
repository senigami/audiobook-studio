from app.engines.voice.base import StudioTTSEngine
from app.engines.voice.sdk import TTSRequest, TTSResult
from typing import Any

class MixedPlugin(StudioTTSEngine):
    """Mixed synthesis plugin (orchestrator).

    Mixed rendering is dispatched entirely through the worker-side job handler;
    these contract stubs satisfy the StudioTTSEngine ABC so the plugin loads.
    """
    def info(self) -> dict[str, Any]:
        return {"display_name": "Mixed Synthesis"}

    def check_env(self) -> tuple[bool, str]:
        return True, "OK"

    def check_request(self, req: TTSRequest) -> tuple[bool, str]:
        """Pre-flight validation — always accepted (orchestrator delegates to sub-engines)."""
        return True, "OK"

    def synthesize(self, req: TTSRequest) -> TTSResult:
        raise NotImplementedError("Mixed synthesis is handled by the worker-side job handler.")

    def settings_schema(self) -> dict[str, Any]:
        return {}

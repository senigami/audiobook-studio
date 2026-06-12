from app.engines.voice.base import StudioTTSEngine
from app.engines.voice.sdk import TTSRequest, TTSResult, VerificationResult
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

    def run_test(self) -> VerificationResult:
        """Verify the Mixed orchestrator plugin.

        Mixed is a delegation-only engine — it has no model of its own and
        delegates all synthesis to sub-engines (each of which verifies itself
        independently). This test confirms the plugin loads, its core classes
        instantiate, and the contract stubs function as expected.
        """
        try:
            info = self.info()
            assert isinstance(info, dict), "info() must return a dict"
            ok_env, _ = self.check_env()
            assert ok_env is True, "check_env() must return True for Mixed"
        except Exception as exc:  # noqa: BLE001
            return VerificationResult(ok=False, message=f"Mixed orchestrator self-check failed: {exc}")
        return VerificationResult(ok=True, message="Mixed orchestrator plugin loaded and self-check passed.")

    def settings_schema(self) -> dict[str, Any]:
        return {}

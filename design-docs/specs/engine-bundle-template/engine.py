"""Example TTS engine — template for an Audiobook Studio engine bundle.

Implements the StudioTTSEngine contract (see design-docs/plans/reference/v2_plugin_sdk.md and
design-docs/plans/reference/v2_voice_system_interface.md §11). Five required methods, two optional.

Boundary rules (enforced by the SDK):
- Do NOT import `app.*`. Engines run in the TTS Server subprocess, isolated from Studio.
- Only write to the requested output path (and your own plugin folder / assets root).
- Heavy model weights are downloaded on first use, not committed to this git repo.
"""

from __future__ import annotations


class ExampleTTSEngine:
    """Replace the body of each method with your engine's real logic."""

    # --- required ---------------------------------------------------------------

    def info(self) -> dict:
        """Engine metadata for registry display. Usually echoes manifest.json."""
        return {
            "engine_id": "exampletts",
            "display_name": "Example TTS",
            "engine_version": "1.0.0",
        }

    def check_env(self) -> dict:
        """Can this engine run here? Validate deps, weights, hardware.

        Return a health result, e.g.:
            {"status": "ready"}            # good to go
            {"status": "needs_setup", "detail": "Run Install Dependencies."}
            {"status": "not_available", "detail": "No CUDA GPU detected."}
        """
        return {"status": "ready"}

    def check_request(self, request: dict) -> dict:
        """Pre-flight validation of a synthesis request before it is queued.

        Return {"ok": True} or {"ok": False, "detail": "why"}.
        """
        if not request.get("text"):
            return {"ok": False, "detail": "Empty text."}
        return {"ok": True}

    def synthesize(self, request: dict) -> dict:
        """Run synthesis and write audio to request['output_path'].

        Return normalized result metadata, e.g.:
            {"status": "ok", "output_path": request["output_path"],
             "sample_rate": 24000, "channels": 1}
        """
        output_path = request["output_path"]
        # TODO: generate audio for request["text"] using request["voice_asset"]
        #       and write a WAV/PCM file to output_path.
        raise NotImplementedError("Implement synthesize() for your engine.")

    def settings_schema(self) -> dict:
        """JSON Schema for this engine's configurable settings (drives the UI form)."""
        import json
        import pathlib
        return json.loads((pathlib.Path(__file__).parent / "settings_schema.json").read_text())

    # --- optional ---------------------------------------------------------------

    def preview(self, request: dict) -> dict:
        """Lightweight preview. Defaults to a normal synthesize() if omitted."""
        return self.synthesize(request)

    def shutdown(self) -> None:
        """Cleanup on unload (free GPU memory, close handles). Defaults to no-op."""
        return None

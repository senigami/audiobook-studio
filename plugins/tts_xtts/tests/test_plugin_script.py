from __future__ import annotations

from pathlib import Path

from app.engines.voice.sdk import TTSRequest
from plugins.tts_xtts.engine import XttsPlugin


def test_xtts_plugin_accepts_script_without_plain_text(tmp_path):
    plugin = XttsPlugin()
    req = TTSRequest(
        text="",
        output_path=str(tmp_path / "chapter.wav"),
        script=[{"text": "Hello", "save_path": str(tmp_path / "segment.wav")}],
    )

    ok, message = plugin.check_request(req)

    assert ok is True
    assert message == "OK"


def test_xtts_plugin_routes_script_to_batch_generator(tmp_path, monkeypatch):
    plugin = XttsPlugin()
    output_path = tmp_path / "chapter.wav"
    seen: dict[str, object] = {}

    def fake_generate_script(*, script_json_path: Path, out_wav: Path, on_output, cancel_check, speed: float) -> int:
        seen["script_json_path"] = script_json_path
        seen["speed"] = speed
        out_wav.write_text("wav")
        return 0

    monkeypatch.setattr(plugin, "_xtts_generate_script", fake_generate_script)
    monkeypatch.setattr(
        plugin,
        "_xtts_generate",
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError("single-text generator should not run")),
    )

    result = plugin.synthesize(
        TTSRequest(
            text="",
            output_path=str(output_path),
            settings={"speed": 1.25},
            script=[{"text": "Hello", "save_path": str(tmp_path / "segment.wav")}],
        )
    )

    assert result.ok is True
    assert result.output_path == str(output_path)
    assert seen["speed"] == 1.25
    assert not Path(str(seen["script_json_path"])).exists()

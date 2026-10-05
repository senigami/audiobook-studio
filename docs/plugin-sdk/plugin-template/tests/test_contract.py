from __future__ import annotations

from pathlib import Path
import importlib.util
import sys
import types

from app.engines.voice.sdk import TTSRequest


def test_template_engine_writes_audio(tmp_path: Path):
    template_dir = Path(__file__).resolve().parents[1]
    package = types.ModuleType("template_plugin")
    package.__path__ = [str(template_dir)]
    sys.modules["template_plugin"] = package
    spec = importlib.util.spec_from_file_location("template_plugin.interface", template_dir / "interface.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    CloudMockEngine = module.CloudMockEngine

    engine = CloudMockEngine()
    output_path = tmp_path / "preview.wav"

    result = engine.synthesize(
        TTSRequest(text="Hello from the template.", output_path=str(output_path))
    )

    assert result.ok is True
    assert output_path.is_file()

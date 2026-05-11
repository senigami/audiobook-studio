from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path


def test_job_registry_loads_interface_and_dotted_worker_handlers(tmp_path, monkeypatch):
    from app.jobs import registry as job_registry

    plugins_dir = tmp_path / "plugins"
    interface_dir = plugins_dir / "tts_ifacejob"
    dotted_dir = plugins_dir / "tts_dotjob"
    worker_dir = dotted_dir / "plugin" / "studio"
    interface_dir.mkdir(parents=True)
    worker_dir.mkdir(parents=True)
    for package_file in [
        dotted_dir / "plugin" / "__init__.py",
        worker_dir / "__init__.py",
    ]:
        package_file.write_text("", encoding="utf-8")

    (interface_dir / "manifest.json").write_text(
        json.dumps(
            {
                "engine_id": "ifacejob",
                "display_name": "Interface Job",
                "entry_class": "interface:Engine",
                "capabilities": ["synthesis"],
                "worker_logic": {"engine_handlers": {"ifacejob": "interface:handle_job"}},
            }
        ),
        encoding="utf-8",
    )
    (interface_dir / "interface.py").write_text(
        textwrap.dedent(
            """
            class Engine:
                pass

            def handle_job(*args, **kwargs):
                return "interface handled"
            """
        ),
        encoding="utf-8",
    )

    (dotted_dir / "manifest.json").write_text(
        json.dumps(
            {
                "engine_id": "dotjob",
                "display_name": "Dotted Job",
                "entry_class": "interface:Engine",
                "capabilities": ["synthesis"],
                "worker_logic": {"engine_handlers": {"dotjob": "plugin.studio.worker:handle_job"}},
            }
        ),
        encoding="utf-8",
    )
    (dotted_dir / "interface.py").write_text("class Engine: pass\n", encoding="utf-8")
    (worker_dir / "worker.py").write_text(
        textwrap.dedent(
            """
            def handle_job(*args, **kwargs):
                return "dotted handled"
            """
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr("app.config.PLUGINS_DIR", plugins_dir)
    monkeypatch.setattr(job_registry, "_registry", job_registry.JobHandlerRegistry())

    job_registry.initialize_default_handlers()
    registry = job_registry.get_handler_registry()

    assert registry._engine_handlers["ifacejob"]() == "interface handled"
    assert registry._engine_handlers["dotjob"]() == "dotted handled"


def test_app_registry_resolves_interface_and_dotted_adapter_modules(tmp_path, monkeypatch):
    import plugins
    from app.engines.voice.base import BaseVoiceEngine
    from app.engines import registry as engine_registry
    from app.engines.models import EngineHealthModel

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.syspath_prepend(str(tmp_path))
    monkeypatch.setattr(plugins, "__path__", [str(plugins_dir)])

    interface_dir = plugins_dir / "tts_ifacead"
    dotted_dir = plugins_dir / "tts_dotad"
    adapter_dir = dotted_dir / "plugin" / "studio"
    interface_dir.mkdir()
    adapter_dir.mkdir(parents=True)
    for package_file in [
        interface_dir / "__init__.py",
        dotted_dir / "__init__.py",
        dotted_dir / "plugin" / "__init__.py",
        adapter_dir / "__init__.py",
    ]:
        package_file.write_text("", encoding="utf-8")

    adapter_src = """
from app.engines.voice.base import BaseVoiceEngine
from app.engines.models import EngineHealthModel

class Adapter(BaseVoiceEngine):
    def __init__(self, *, manifest):
        self.manifest = manifest
    def describe_health(self):
        return EngineHealthModel(engine_id=self.manifest.engine_id, available=True, ready=True, status="ready")
"""
    (interface_dir / "interface.py").write_text(textwrap.dedent(adapter_src), encoding="utf-8")
    (adapter_dir / "adapter.py").write_text(textwrap.dedent(adapter_src), encoding="utf-8")
    (interface_dir / "manifest.json").write_text(
        json.dumps(
            {
                "engine_id": "ifacead",
                "display_name": "Interface Adapter",
                "entry_class": "interface:Engine",
                "app_adapter_class": "Adapter",
                "app_adapter_module": "interface",
                "capabilities": ["synthesis"],
            }
        ),
        encoding="utf-8",
    )
    (dotted_dir / "manifest.json").write_text(
        json.dumps(
            {
                "engine_id": "dotad",
                "display_name": "Dotted Adapter",
                "entry_class": "interface:Engine",
                "app_adapter_class": "Adapter",
                "app_adapter_module": "plugin.studio.adapter",
                "capabilities": ["synthesis"],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr("app.config.PLUGINS_DIR", plugins_dir)
    specs = engine_registry._plugin_adapter_specs()

    assert [path.parent.name for path, _engine_cls in specs] == ["tts_dotad", "tts_ifacead"]
    assert all(issubclass(engine_cls, BaseVoiceEngine) for _path, engine_cls in specs)

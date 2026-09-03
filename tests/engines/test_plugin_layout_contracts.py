from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path


def test_job_registry_loads_interface_and_dotted_worker_handlers(tmp_path, monkeypatch):
    from app.jobs import registry as job_registry

    plugins_dir = tmp_path / "tts_engines"
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
                "studio_tts_manifest": "1.0",
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
                "studio_tts_manifest": "1.0",
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

    monkeypatch.setattr("app.core.config.PLUGINS_DIR", plugins_dir)
    monkeypatch.setattr(job_registry, "_registry", job_registry.JobHandlerRegistry())

    job_registry.initialize_default_handlers()
    registry = job_registry.get_handler_registry()

    assert registry._engine_handlers["ifacejob"]() == "interface handled"
    assert registry._engine_handlers["dotjob"]() == "dotted handled"


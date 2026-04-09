"""Engine registry for Studio 2.0."""

from __future__ import annotations

import json
from pathlib import Path

from app.engines.models import (
    EngineManifestModel,
    EngineRegistrationModel,
)
from app.engines.voice.base import BaseVoiceEngine
from app.engines.voice.voxtral.engine import VoxtralVoiceEngine
from app.engines.voice.xtts.engine import XttsVoiceEngine


def load_engine_registry() -> dict[str, EngineRegistrationModel]:
    """Placeholder registry loader.

    The long-term loader will discover internal engine modules and expose them
    through a uniform registry for the voice bridge.
    """
    registry = _load_builtin_engines()
    registry.update(_load_plugin_engines())
    return registry


def _load_builtin_engines() -> dict[str, EngineRegistrationModel]:
    """Describe discovery of built-in engine adapters shipped with the app.

    Returns:
        dict[str, EngineRegistrationModel]: Built-in engine registry entries.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    registry: dict[str, EngineRegistrationModel] = {}
    for manifest_path, engine_cls in _builtin_engine_specs():
        manifest = _load_engine_manifest(manifest_path=manifest_path)
        engine = engine_cls(manifest=manifest)
        health = engine.describe_health()
        registry[manifest.engine_id] = EngineRegistrationModel(
            manifest=manifest,
            engine=engine,
            health=health,
        )
    return registry


def _load_plugin_engines() -> dict[str, EngineRegistrationModel]:
    """Describe discovery of optional plugin-provided engine adapters.

    Returns:
        dict[str, EngineRegistrationModel]: Plugin engine registry entries.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    return {}


def _load_engine_manifest(*, manifest_path: Path) -> EngineManifestModel:
    """Describe manifest loading for built-in engine discovery.

    Args:
        manifest_path: Filesystem path to an engine manifest JSON file.

    Returns:
        EngineManifestModel: Parsed discovery metadata for one engine.

    Raises:
        FileNotFoundError: If the manifest file is missing.
        ValueError: If the manifest file is malformed.
    """
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    engine_id = str(payload.get("engine_id") or "").strip()
    display_name = str(payload.get("display_name") or engine_id).strip() or engine_id
    phase = str(payload.get("phase") or "unknown").strip()
    if not engine_id:
        raise ValueError(f"Engine manifest is missing engine_id: {manifest_path}")
    return EngineManifestModel(
        engine_id=engine_id,
        display_name=display_name,
        phase=phase,
        module_path=_manifest_module_path(manifest_path),
        notes=tuple(str(note).strip() for note in payload.get("notes", []) if str(note).strip()),
        capabilities=tuple(
            str(capability).strip()
            for capability in payload.get("capabilities", [])
            if str(capability).strip()
        ),
    )


def _builtin_engine_specs() -> list[tuple[Path, type[BaseVoiceEngine]]]:
    """Return the built-in engine manifests and adapter classes."""

    base_dir = Path(__file__).resolve().parent / "voice"
    return [
        (base_dir / "xtts" / "manifest.json", XttsVoiceEngine),
        (base_dir / "voxtral" / "manifest.json", VoxtralVoiceEngine),
    ]


def _manifest_module_path(manifest_path: Path) -> str:
    """Infer the module path for a manifest discovered on disk."""

    engine_dir = manifest_path.parent
    return f"app.engines.voice.{engine_dir.name}.engine"

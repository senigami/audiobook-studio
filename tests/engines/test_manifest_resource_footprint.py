"""Every local or heavy engine must declare a memory footprint, or the cap safety check skips it (#251)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

_MANIFESTS = sorted((Path(__file__).resolve().parents[2] / "tts_engines").glob("tts_*/manifest.json"))


def test_manifests_were_found():
    assert _MANIFESTS, "no tts_engines/*/manifest.json found; the guard would pass vacuously"


@pytest.mark.parametrize("path", _MANIFESTS, ids=lambda p: p.parent.name)
def test_heavy_or_local_engine_declares_a_footprint(path):
    manifest = json.loads(path.read_text(encoding="utf-8"))
    resource = manifest.get("resource") if isinstance(manifest.get("resource"), dict) else {}
    heavy = bool(resource.get("gpu")) or bool(resource.get("cpu_heavy")) or manifest.get("local") is True
    if heavy:
        assert int(resource.get("vram_mb", 0)) > 0, (
            f"{path.parent.name} is local/heavy but declares no resource.vram_mb; "
            "the parallel-cap safety check treats footprint 0 as 'no memory limit'"
        )

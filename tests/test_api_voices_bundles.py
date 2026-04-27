import pytest
import json
import io
import zipfile
from pathlib import Path
from unittest.mock import patch, MagicMock


def _write_voice_root(root: Path, voice_name: str = "Dracula") -> Path:
    voice_root = root / voice_name
    default_dir = voice_root / "Default"
    angry_dir = voice_root / "Angry"
    default_dir.mkdir(parents=True)
    angry_dir.mkdir(parents=True)
    (voice_root / "voice.json").write_text(json.dumps({
        "version": 2,
        "name": voice_name,
        "default_variant": "Default",
    }))
    (default_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default",
        "engine": "xtts",
    }))
    (default_dir / "latent.pth").write_bytes(b"latent")
    (default_dir / "sample.mp3").write_bytes(b"mp3")
    (default_dir / "sample.wav").write_bytes(b"preview")
    (default_dir / "source.wav").write_bytes(b"source")
    (angry_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Angry",
        "engine": "xtts",
    }))
    (angry_dir / "source.wav").write_bytes(b"angry-source")
    return voice_root


def _zip_names(response) -> set[str]:
    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        return set(zf.namelist())


def test_export_voice_bundle_excludes_source_wavs_by_default(clean_db, voices_root, client):
    voices_root.mkdir()
    _write_voice_root(voices_root)

    response = client.get("/api/voices/Dracula/bundle/download")

    assert response.status_code == 200
    names = _zip_names(response)
    assert "bundle.json" in names
    assert "voice.json" in names
    assert "Default/profile.json" in names
    assert "Default/latent.pth" in names
    assert "Default/sample.mp3" in names
    assert "Default/sample.wav" in names
    assert "Default/source.wav" not in names
    assert "Angry/source.wav" not in names


def test_export_voice_bundle_includes_source_wavs_when_requested(clean_db, voices_root, client):
    voices_root.mkdir()
    _write_voice_root(voices_root)

    response = client.get("/api/voices/Dracula/bundle/download?include_source_wavs=true")

    assert response.status_code == 200
    names = _zip_names(response)
    assert "Default/source.wav" in names
    assert "Angry/source.wav" in names


def test_import_voice_bundle_duplicate_creates_suffixed_copy(clean_db, voices_root, client):
    voices_root.mkdir()
    _write_voice_root(voices_root)
    export_response = client.get("/api/voices/Dracula/bundle/download?include_source_wavs=true")

    response = client.post(
        "/api/voices/bundle/import",
        files={"file": ("dracula.voice.zip", io.BytesIO(export_response.content), "application/zip")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["voice_name"] == "Dracula 2"
    assert payload["was_renamed"] is True
    assert (voices_root / "Dracula").exists()
    assert (voices_root / "Dracula 2" / "Default" / "latent.pth").exists()
    assert (voices_root / "Dracula 2" / "Angry" / "source.wav").exists()
    imported_manifest = json.loads((voices_root / "Dracula 2" / "voice.json").read_text())
    assert imported_manifest["name"] == "Dracula 2"
    assert imported_manifest["default_variant"] == "Default"


def test_import_voice_bundle_rejects_invalid_archives(clean_db, voices_root, client):
    voices_root.mkdir()

    malformed = client.post(
        "/api/voices/bundle/import",
        files={"file": ("bad.zip", io.BytesIO(b"not a zip"), "application/zip")},
    )
    assert malformed.status_code == 400

    missing_voice = io.BytesIO()
    with zipfile.ZipFile(missing_voice, "w") as zf:
        zf.writestr("Default/profile.json", "{}")
    response = client.post(
        "/api/voices/bundle/import",
        files={"file": ("missing.voice.zip", io.BytesIO(missing_voice.getvalue()), "application/zip")},
    )
    assert response.status_code == 400
    assert "voice.json" in response.json()["message"]

    traversal = io.BytesIO()
    with zipfile.ZipFile(traversal, "w") as zf:
        zf.writestr("voice.json", json.dumps({"name": "Evil"}))
        zf.writestr("../escape.txt", "nope")
        zf.writestr("Default/profile.json", "{}")
    response = client.post(
        "/api/voices/bundle/import",
        files={"file": ("traversal.voice.zip", io.BytesIO(traversal.getvalue()), "application/zip")},
    )
    assert response.status_code == 400

    missing_profile = io.BytesIO()
    with zipfile.ZipFile(missing_profile, "w") as zf:
        zf.writestr("voice.json", json.dumps({"name": "NoProfile"}))
        zf.writestr("Default/sample.wav", b"preview")
    response = client.post(
        "/api/voices/bundle/import",
        files={"file": ("missing-profile.voice.zip", io.BytesIO(missing_profile.getvalue()), "application/zip")},
    )
    assert response.status_code == 400
    assert "profile.json" in response.json()["message"]


def test_imported_latent_voice_lists_ready_without_rebuild(clean_db, voices_root, client):
    source_root = voices_root / "source"
    source_root.mkdir(parents=True)
    _write_voice_root(source_root, "LatentVoice")

    from app.domain.voices.bundles import export_voice_bundle
    bundle = export_voice_bundle(source_root, "LatentVoice")

    response = client.post(
        "/api/voices/bundle/import",
        files={"file": ("latent.voice.zip", io.BytesIO(bundle), "application/zip")},
    )
    assert response.status_code == 200

    bridge = MagicMock()
    bridge.check_readiness.return_value = (True, "ready")
    with patch("app.engines.bridge.create_voice_bridge", return_value=bridge):
        profiles = client.get("/api/speaker-profiles").json()

    profile = next(p for p in profiles if p["name"] == "LatentVoice")
    assert profile["has_latent"] is True
    assert profile["is_ready"] is True
    assert profile["is_rebuild_required"] is False

"""Version history for a voice variant's live sample state.

A "version" is a point-in-time snapshot of a variant directory's live
`*.wav` samples plus its `sample.mp3` artifact (if present), recorded under
`versions/v-<unix-timestamp>-<8-hex-shortid>/` inside the variant directory.
`versions/versions.json` tracks the ordered list of known versions plus
which one is currently "active" (i.e. matches the variant's live state).

This module owns only the file mechanics — it never calls into settings
persistence (`update_speaker_settings`) or triggers rebuilds; those remain
the caller's responsibility.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

VERSIONS_DIRNAME = "versions"
VERSIONS_MANIFEST_FILENAME = "versions.json"
VERSION_META_FILENAME = "meta.json"
VERSION_SAMPLES_DIRNAME = "samples"
VERSION_ARTIFACT_FILENAME = "artifact.mp3"
LIVE_ARTIFACT_FILENAME = "sample.mp3"


def _contained(root: Path, candidate: Path) -> Optional[Path]:
    """Resolve `candidate` and verify it stays under `root`. Returns the
    resolved path, or None if containment cannot be proven."""
    try:
        resolved = candidate.resolve()
        resolved.relative_to(root.resolve())
        return resolved
    except (ValueError, OSError, RuntimeError):
        return None


def _versions_root(variant_dir: Path) -> Path:
    return variant_dir / VERSIONS_DIRNAME


def _versions_manifest_path(variant_dir: Path) -> Path:
    return _versions_root(variant_dir) / VERSIONS_MANIFEST_FILENAME


def _load_versions_manifest(variant_dir: Path) -> Optional[Dict[str, Any]]:
    manifest_path = _contained(variant_dir, _versions_manifest_path(variant_dir))
    if manifest_path is None or not manifest_path.exists():
        return None
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        logger.warning("Failed to load versions manifest %s: %s", manifest_path, exc)
        return None


def _save_versions_manifest(variant_dir: Path, manifest: Dict[str, Any]) -> None:
    versions_root = _contained(variant_dir, _versions_root(variant_dir))
    if versions_root is None:
        raise ValueError(f"Refusing to write versions manifest outside variant dir: {variant_dir}")
    versions_root.mkdir(parents=True, exist_ok=True)

    manifest_path = _contained(variant_dir, _versions_manifest_path(variant_dir))
    if manifest_path is None:
        raise ValueError(f"Refusing to write versions manifest outside variant dir: {variant_dir}")
    tmp_path = manifest_path.with_suffix(manifest_path.suffix + ".tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    os.replace(tmp_path, manifest_path)


def _version_dir(variant_dir: Path, version_id: str) -> Path:
    return _versions_root(variant_dir) / version_id


def _version_meta_path(variant_dir: Path, version_id: str) -> Path:
    return _version_dir(variant_dir, version_id) / VERSION_META_FILENAME


def _version_samples_dir(variant_dir: Path, version_id: str) -> Path:
    return _version_dir(variant_dir, version_id) / VERSION_SAMPLES_DIRNAME


def _version_artifact_path(variant_dir: Path, version_id: str) -> Path:
    return _version_dir(variant_dir, version_id) / VERSION_ARTIFACT_FILENAME


def _load_version_meta(variant_dir: Path, version_id: str) -> Optional[Dict[str, Any]]:
    meta_path = _contained(variant_dir, _version_meta_path(variant_dir, version_id))
    if meta_path is None or not meta_path.exists():
        return None
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        logger.warning("Failed to load version meta %s: %s", meta_path, exc)
        return None


def _new_version_id() -> str:
    return f"v-{int(time.time())}-{uuid.uuid4().hex[:8]}"


def _allocate_version_dir(variant_dir: Path) -> tuple[str, Path]:
    """Pick a fresh version id whose directory does not yet exist, guarding
    against same-second collisions within a process."""
    for _ in range(8):
        version_id = _new_version_id()
        version_dir = _contained(variant_dir, _version_dir(variant_dir, version_id))
        if version_dir is None:
            raise ValueError(f"Refusing to create version dir outside variant dir: {variant_dir}")
        if not version_dir.exists():
            return version_id, version_dir
    # Extremely unlikely fallback: keep retrying with fresh uuids indefinitely.
    while True:
        version_id = _new_version_id()
        version_dir = _contained(variant_dir, _version_dir(variant_dir, version_id))
        if version_dir is None:
            raise ValueError(f"Refusing to create version dir outside variant dir: {variant_dir}")
        if not version_dir.exists():
            return version_id, version_dir


def snapshot_current_as_version(
    variant_dir: Path,
    *,
    engine_id: str,
    test_text: str,
    voice_job_settings: Optional[dict] = None,
) -> str:
    """Snapshot the variant directory's current live state into a new
    versions/v-*/ entry. Returns the new version id.

    Does not touch active_version_id.
    """
    existing_manifest = _load_versions_manifest(variant_dir)
    backfilled = existing_manifest is None

    version_id, version_dir = _allocate_version_dir(variant_dir)
    samples_dir = _contained(variant_dir, _version_samples_dir(variant_dir, version_id))
    if samples_dir is None:
        raise ValueError(f"Refusing to create samples dir outside variant dir: {variant_dir}")
    samples_dir.mkdir(parents=True, exist_ok=True)

    sample_manifest: List[Dict[str, str]] = []
    for wav_path in sorted(variant_dir.glob("*.wav")):
        dest = _contained(variant_dir, samples_dir / wav_path.name)
        if dest is None:
            continue
        shutil.copy2(wav_path, dest)
        digest = hashlib.sha256(wav_path.read_bytes()).hexdigest()
        sample_manifest.append({"filename": wav_path.name, "sha256": digest})

    live_artifact = variant_dir / LIVE_ARTIFACT_FILENAME
    if live_artifact.exists():
        artifact_dest = _contained(variant_dir, _version_artifact_path(variant_dir, version_id))
        if artifact_dest is not None:
            shutil.copy2(live_artifact, artifact_dest)

    created_at = time.time()
    meta = {
        "engine_id": engine_id,
        "model": (voice_job_settings or {}).get("model"),
        "voice_job_settings": voice_job_settings or {},
        "reference_sample": (voice_job_settings or {}).get("reference_sample"),
        "voice_asset_id": (voice_job_settings or {}).get("voice_asset_id"),
        "test_text": test_text,
        "created_at": created_at,
        "sample_manifest": sample_manifest,
        "backfilled": backfilled,
    }

    meta_path = _contained(variant_dir, _version_meta_path(variant_dir, version_id))
    if meta_path is None:
        raise ValueError(f"Refusing to write version meta outside variant dir: {variant_dir}")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    manifest = existing_manifest or {"active_version_id": None, "versions": []}
    manifest.setdefault("versions", [])
    manifest["versions"].append({"id": version_id, "created_at": created_at, "backfilled": backfilled})
    _save_versions_manifest(variant_dir, manifest)

    return version_id


def record_new_version(
    variant_dir: Path,
    *,
    engine_id: str,
    test_text: str,
    voice_job_settings: Optional[dict] = None,
) -> str:
    """Snapshot the current state as a new version and set it active."""
    version_id = snapshot_current_as_version(
        variant_dir,
        engine_id=engine_id,
        test_text=test_text,
        voice_job_settings=voice_job_settings,
    )

    manifest = _load_versions_manifest(variant_dir) or {"active_version_id": None, "versions": []}
    manifest["active_version_id"] = version_id
    _save_versions_manifest(variant_dir, manifest)

    return version_id


def list_versions(variant_dir: Path) -> list[dict]:
    """Return a summary of all recorded versions, oldest-first."""
    manifest = _load_versions_manifest(variant_dir)
    if manifest is None:
        return []

    results: List[Dict[str, Any]] = []
    for entry in manifest.get("versions", []):
        version_id = entry.get("id")
        if not version_id:
            continue
        meta = _load_version_meta(variant_dir, version_id) or {}
        artifact_path = _contained(variant_dir, _version_artifact_path(variant_dir, version_id))
        has_artifact = artifact_path is not None and artifact_path.exists()
        results.append(
            {
                "id": version_id,
                "created_at": entry.get("created_at", meta.get("created_at")),
                "backfilled": entry.get("backfilled", meta.get("backfilled", False)),
                "engine_id": meta.get("engine_id"),
                "model": meta.get("model"),
                "test_text": meta.get("test_text"),
                "sample_count": len(meta.get("sample_manifest") or []),
                "has_artifact": has_artifact,
            }
        )
    return results


def get_version(variant_dir: Path, version_id: str) -> Optional[dict]:
    """Return one version's full record, or None if unknown."""
    manifest = _load_versions_manifest(variant_dir)
    if manifest is None:
        return None
    entry = next((v for v in manifest.get("versions", []) if v.get("id") == version_id), None)
    if entry is None:
        return None
    meta = _load_version_meta(variant_dir, version_id)
    if meta is None:
        return None
    record = dict(meta)
    record["id"] = version_id
    record["created_at"] = entry.get("created_at", meta.get("created_at"))
    record["backfilled"] = entry.get("backfilled", meta.get("backfilled", False))
    return record


def get_active_version_id(variant_dir: Path) -> Optional[str]:
    """Return versions.json's active_version_id, or None if absent."""
    manifest = _load_versions_manifest(variant_dir)
    if manifest is None:
        return None
    return manifest.get("active_version_id")


def promote_version(variant_dir: Path, version_id: str) -> bool:
    """Restore a version's samples/artifact as the variant's live state and
    mark it active. Returns False (no-op) if the version is unknown.

    Pure file mechanics — callers own snapshotting the pre-promote state and
    updating speaker settings.
    """
    manifest = _load_versions_manifest(variant_dir)
    if manifest is None:
        return False
    entry = next((v for v in manifest.get("versions", []) if v.get("id") == version_id), None)
    if entry is None:
        return False

    samples_dir = _contained(variant_dir, _version_samples_dir(variant_dir, version_id))
    if samples_dir is None or not samples_dir.exists():
        return False

    # Clear current live *.wav files (excluding sample.wav, which is not a raw sample).
    for wav_path in list(variant_dir.glob("*.wav")):
        if wav_path.name == "sample.wav":
            continue
        try:
            wav_path.unlink()
        except OSError as exc:
            logger.warning("promote_version: could not remove existing sample %s: %s", wav_path, exc)

    for src in sorted(samples_dir.glob("*.wav")):
        dest = _contained(variant_dir, variant_dir / src.name)
        if dest is None:
            continue
        shutil.copy2(src, dest)

    artifact_src = _contained(variant_dir, _version_artifact_path(variant_dir, version_id))
    live_artifact = _contained(variant_dir, variant_dir / LIVE_ARTIFACT_FILENAME)
    if live_artifact is None:
        return False

    if artifact_src is not None and artifact_src.exists():
        shutil.copy2(artifact_src, live_artifact)
    elif live_artifact.exists():
        live_artifact.unlink()

    manifest["active_version_id"] = version_id
    _save_versions_manifest(variant_dir, manifest)

    return True

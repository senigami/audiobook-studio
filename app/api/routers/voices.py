import uuid
import shutil
import time
import anyio
import logging
import re
import json
import os
import urllib.parse
from pathlib import Path
from typing import Optional, List, Dict
from fastapi import APIRouter, Form, File, UploadFile, HTTPException, Request
from fastapi.responses import JSONResponse
from ...db import (
    get_characters, create_character, update_character, delete_character,
    list_speakers, create_speaker, get_speaker, update_speaker, delete_speaker,
    update_voice_profile_references
)
from ...db.speakers import (
    infer_speaker_name,
    infer_variant_name,
    sync_speakers_from_profiles,
    normalize_profile_metadata,
    DEFAULT_PROFILE_ENGINE,
    VALID_PROFILE_ENGINES,
)
from ...jobs import (
    enqueue, get_speaker_settings, update_speaker_settings,
    DEFAULT_SPEAKER_TEST_TEXT
)
from ...engines.bridge import create_voice_bridge
from ... import config
from ...state import get_settings, update_settings, get_jobs, put_job, update_job
from ...models import Job
from ...pathing import safe_basename

# Compatibility for tests that monkeypatch these
VOICES_DIR = config.VOICES_DIR

logger = logging.getLogger(__name__)
SAFE_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
SAFE_SAMPLE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")


def get_voices_dir() -> Path:
    return VOICES_DIR


def _valid_profile_name(name: str) -> str:
    if not SAFE_PROFILE_NAME_RE.fullmatch(name):
        raise ValueError(f"Invalid profile name: {name}")
    return name


def _valid_sample_name(sample_name: str) -> str:
    if not SAFE_SAMPLE_NAME_RE.fullmatch(sample_name):
        raise ValueError(f"Invalid sample name: {sample_name}")
    return sample_name


def _normalize_profile_engine(engine: Optional[str]) -> str:
    normalized = (engine or DEFAULT_PROFILE_ENGINE).strip().lower()
    if normalized not in VALID_PROFILE_ENGINES:
        raise ValueError(f"Invalid profile engine: {engine}")
    return normalized


def _is_engine_active(engine_id: str) -> bool:
    bridge = create_voice_bridge()
    engines = bridge.describe_registry()
    for e in engines:
        if e["engine_id"] == engine_id:
            return bool(e.get("enabled"))
    return False


def _voice_dirs_map() -> Dict[str, Path]:
    if not VOICES_DIR.exists():
        return {}
    dirs: Dict[str, Path] = {}
    for entry in VOICES_DIR.iterdir():
        if entry.is_dir() and SAFE_PROFILE_NAME_RE.fullmatch(entry.name):
            # 1. Nested Voice Roots (v2)
            if (entry / "voice.json").exists():
                for sub in entry.iterdir():
                    if sub.is_dir() and (sub / "profile.json").exists():
                        name = f"{entry.name} - {sub.name}"
                        if sub.name == "Default":
                            name = entry.name
                        dirs[name] = sub.resolve()

            # 2. Legacy Flat or Default Variant at Root
            if (entry / "profile.json").exists():
                dirs[entry.name] = entry.resolve()
    return dirs


def _existing_voice_profile_dir(name: str) -> Optional[Path]:
    return _voice_dirs_map().get(_valid_profile_name(name))


def _new_voice_profile_dir(name: str) -> Path:
    candidate = _valid_profile_name(name)

    # Phase 8: Default to nested layout for new variants
    if " - " in candidate:
        voice_name, variant_name = candidate.split(" - ", 1)
        voice_name = voice_name.strip()
        variant_name = variant_name.strip()

        # Collision check: don't allow creating if a FLAT folder exists with the same name
        if (VOICES_DIR / candidate).exists():
             return VOICES_DIR / candidate

        # Ensure voice root has a manifest if we create it
        voice_root = VOICES_DIR / voice_name
        if not (voice_root / "voice.json").exists():
             voice_root.mkdir(parents=True, exist_ok=True)
             from ...domain.voices.manifest import save_voice_manifest
             save_voice_manifest(voice_root, {"version": 2, "name": voice_name})

        return voice_root / variant_name

    base_dir = os.path.abspath(os.path.normpath(os.fspath(VOICES_DIR)))
    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_dir, candidate)))
    if not fullpath.startswith(base_dir + os.sep):
        raise ValueError(f"Invalid profile name: {name}")
    return Path(fullpath)


def _cleanup_voice_root(root: Path):
    """Delete a voice root if it has no remaining variants."""
    if not root.exists() or not root.is_dir() or root == VOICES_DIR:
        return

    # A v2 voice root is empty of variants if no subdirs have profile.json
    has_variants = False
    for sub in root.iterdir():
        if sub.is_dir() and (sub / "profile.json").exists():
            has_variants = True
            break

    if not has_variants:
        # Check if anything else important is there. If just voice.json, wipe it.
        remaining = [f for f in root.iterdir() if f.name != ".DS_Store"]
        if not remaining or (len(remaining) == 1 and remaining[0].name == "voice.json"):
            try:
                shutil.rmtree(root)
            except Exception:
                logger.warning("Failed to cleanup empty voice root: %s", root)

def _voice_file_map(profile_dir: Optional[Path]) -> Dict[str, Path]:
    if not profile_dir or not profile_dir.exists():
        return {}
    files: Dict[str, Path] = {}
    for entry in profile_dir.iterdir():
        if entry.is_file():
            files[entry.name] = entry.resolve()
    return files


def _existing_voice_sample_path(name: str, sample_name: str) -> Optional[Path]:
    return _voice_file_map(_existing_voice_profile_dir(name)).get(_valid_sample_name(sample_name))


def _new_voice_sample_path(profile_dir: Path, sample_name: str) -> Path:
    candidate = _valid_sample_name(sample_name)
    base_dir = os.path.abspath(os.path.normpath(os.fspath(profile_dir)))
    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_dir, candidate)))
    if not fullpath.startswith(base_dir + os.sep):
        raise ValueError(f"Invalid sample name: {sample_name}")
    return Path(fullpath)


def _voice_raw_sample_count(name: str) -> int:
    try:
        profile_dir = _existing_voice_profile_dir(name)
    except ValueError:
        return 0
    if not profile_dir:
        return 0
    return len([
        f for f in profile_dir.iterdir()
        if f.is_file() and f.suffix.lower() == ".wav" and f.name != "sample.wav"
    ])


def _voice_preview_url(name: str) -> Optional[str]:
    profile_dir = _existing_voice_profile_dir(name)
    if not profile_dir:
        return None

    # Calculate URL path relative to VOICES_DIR
    try:
        rel_path = profile_dir.relative_to(VOICES_DIR)
        url_path = rel_path.as_posix()
    except ValueError:
        url_path = name

    files = _voice_file_map(profile_dir)
    if "sample.mp3" in files:
        return f"/out/voices/{url_path}/sample.mp3"

    if "sample.wav" in files:
        return f"/out/voices/{url_path}/sample.wav"

    return None


def _voice_asset_base_url(profile_dir: Path) -> str:
    try:
        rel_path = profile_dir.relative_to(VOICES_DIR)
        url_path = urllib.parse.quote(rel_path.as_posix(), safe="/")
    except ValueError:
        url_path = urllib.parse.quote(profile_dir.name, safe="/")
    return f"/out/voices/{url_path}"


def _voice_has_latent(name: str) -> bool:
    profile_dir = _existing_voice_profile_dir(name)
    if not profile_dir:
        return False
    return (_voice_file_map(profile_dir).get("latent.pth") or _new_voice_sample_path(profile_dir, "latent.pth")).exists()


def _voice_has_generation_material(name: str) -> bool:
    settings = get_speaker_settings(name)
    engine = settings.get("engine", DEFAULT_PROFILE_ENGINE)

    if not _is_engine_active(engine):
        return False

    bridge = create_voice_bridge()
    try:
        profile_dir = _existing_voice_profile_dir(name)
        ready, _ = bridge.check_readiness(
            engine_id=engine,
            profile_id=name,
            settings=settings,
            profile_dir=str(profile_dir) if profile_dir else None
        )
        return ready
    except Exception as exc:
        logger.warning("Failed to check voice readiness for %s: %s", name, exc)
        return False


def _voice_job_title(name: str, action: str = "Building voice for") -> str:
    settings = get_speaker_settings(name)
    variant_name = str(settings.get("variant_name") or infer_variant_name(name) or "Default").strip() or "Default"
    speaker_name = infer_speaker_name(name, settings).strip() or name
    return f"{action} {speaker_name}: {variant_name}"

router = APIRouter(tags=["voices"])


def _ensure_default_speaker_profile(speaker_id: str, speaker_name: str, default_profile_name: Optional[str]) -> str:
    profile_name = default_profile_name or speaker_name
    try:
        profile_name = _valid_profile_name(profile_name)
    except ValueError:
        profile_name = _valid_profile_name(f"speaker-{speaker_id}")

    profile_dir = _existing_voice_profile_dir(profile_name)
    meta: Dict[str, object] = {}

    if profile_dir:
        meta_path = _voice_file_map(profile_dir).get("profile.json") or _new_voice_sample_path(profile_dir, "profile.json")
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text())
            except Exception:
                logger.warning("Failed to read existing speaker profile metadata for %s", meta_path, exc_info=True)
                meta = {}

        if meta.get("speaker_id") and meta["speaker_id"] != speaker_id:
            idx = 1
            while _existing_voice_profile_dir(f"{profile_name}_{idx}"):
                idx += 1
            profile_name = f"{profile_name}_{idx}"
            profile_dir = _new_voice_profile_dir(profile_name)
            meta = {}
            meta_path = _new_voice_sample_path(profile_dir, "profile.json")
    else:
        profile_dir = _new_voice_profile_dir(profile_name)
        meta_path = _new_voice_sample_path(profile_dir, "profile.json")

    profile_dir.mkdir(parents=True, exist_ok=True)
    meta["speaker_id"] = speaker_id
    meta["variant_name"] = infer_variant_name(profile_name)
    if "speed" not in meta:
        meta["speed"] = 1.0
    normalized_meta = normalize_profile_metadata(profile_name, meta, persist=False)
    meta_path.write_text(json.dumps(normalized_meta, indent=2))

    return profile_name

@router.get("/api/speaker-profiles")
def list_speaker_profiles():
    from ...domain.voices.migration import migrate_voices_to_v2
    migrate_voices_to_v2()
    sync_speakers_from_profiles()

    if not VOICES_DIR.exists():
        return []

    dirs_map = _voice_dirs_map()
    sorted_items = sorted(dirs_map.items(), key=lambda item: item[0])
    settings = get_settings()
    default_speaker = settings.get("default_speaker_profile")

    # Auto-set default if only one exists
    if sorted_items:
        names = [name for name, _ in sorted_items]
        if len(sorted_items) == 1 and default_speaker != names[0]:
            default_speaker = names[0]
            update_settings({"default_speaker_profile": default_speaker})
        elif default_speaker and default_speaker not in names:
            default_speaker = names[0] if len(sorted_items) > 0 else None
            update_settings({"default_speaker_profile": default_speaker})

    profiles = []
    for name, d in sorted_items:
        raw_wavs = sorted([f.name for f in d.glob("*.wav") if f.name != "sample.wav"])
        spk_settings = get_speaker_settings(name)
        built_samples = spk_settings.get("built_samples", [])

        samples = []
        is_rebuild_required = False
        for w in raw_wavs:
            is_new = w not in built_samples
            samples.append({"name": w, "is_new": is_new})
            if is_new: is_rebuild_required = True

        if len([b for b in built_samples if SAFE_SAMPLE_NAME_RE.fullmatch(b) and (d / b).exists()]) < len(built_samples):
             is_rebuild_required = True

        preview_url = _voice_preview_url(name)
        preview_signature_stale = False
        if preview_url:
            has_preview_signature = any(
                spk_settings.get(key) is not None
                for key in (
                    "preview_test_text",
                    "preview_engine",
                    "preview_reference_sample",
                    "preview_voxtral_voice_id",
                    "preview_voxtral_model",
                )
            )
            if has_preview_signature:
                preview_signature_stale = (
                    spk_settings.get("preview_test_text") != spk_settings.get("test_text")
                    or spk_settings.get("preview_engine") != spk_settings.get("engine", DEFAULT_PROFILE_ENGINE)
                )
                if spk_settings.get("engine") == "voxtral":
                    preview_signature_stale = preview_signature_stale or (
                        spk_settings.get("preview_reference_sample") != spk_settings.get("reference_sample")
                        or spk_settings.get("preview_voxtral_voice_id") != spk_settings.get("voxtral_voice_id")
                        or spk_settings.get("preview_voxtral_model") != spk_settings.get("voxtral_model")
                    )
        if preview_signature_stale:
            is_rebuild_required = True
        if not preview_url and len(raw_wavs) > 0:
            is_rebuild_required = True

        profile_data = {
            "name": name,
            "is_default": name == default_speaker,
            "wav_count": len(raw_wavs),
            "samples_detailed": samples,
            "samples": raw_wavs,
            "is_rebuild_required": is_rebuild_required,
            "speed": spk_settings["speed"],
            "test_text": spk_settings["test_text"],
            "speaker_id": spk_settings.get("speaker_id"),
            "variant_name": spk_settings.get("variant_name"),
            "engine": spk_settings.get("engine", DEFAULT_PROFILE_ENGINE),
            "voxtral_voice_id": spk_settings.get("voxtral_voice_id"),
            "voxtral_model": spk_settings.get("voxtral_model"),
            "reference_sample": spk_settings.get("reference_sample"),
            "preview_url": preview_url,
            "asset_base_url": _voice_asset_base_url(d),
            "has_latent": _voice_has_latent(name),
            "is_ready": False,
            "readiness_message": "",
        }

        # Calculate readiness using the bridge
        bridge = create_voice_bridge()
        try:
            is_ready, msg = bridge.check_readiness(
                engine_id=profile_data["engine"],
                profile_id=d.name,
                settings=spk_settings,
                profile_dir=str(d.resolve())
            )
            profile_data["is_ready"] = is_ready
            profile_data["readiness_message"] = msg
        except Exception as exc:
            profile_data["is_ready"] = False
            profile_data["readiness_message"] = str(exc)

        profiles.append(profile_data)
    return profiles

@router.post("/api/speaker-profiles")
def api_create_speaker_profile(
    speaker_id: str = Form(...),
    variant_name: str = Form(...),
    engine: str = Form(DEFAULT_PROFILE_ENGINE),
):
    logger.info(f"Creating profile for speaker_id='{speaker_id}', variant_name='{variant_name}', engine='{engine}'")
    try:
        normalized_engine = _normalize_profile_engine(engine)
        if not _is_engine_active(normalized_engine):
            return JSONResponse({"status": "error", "message": f"Engine {normalized_engine} is not enabled in Settings."}, status_code=400)
        # Try to use speaker name instead of ID if possible for folder name
        spk = get_speaker(speaker_id)
        spk_name = spk["name"] if spk else speaker_id
        name = f"{spk_name} - {variant_name}"
        try:
            path = _existing_voice_profile_dir(name) or _new_voice_profile_dir(name)
        except ValueError:
            logger.warning(f"Blocking profile creation traversal attempt: {name}")
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)

        if path.exists():
            return JSONResponse({"status": "error", "message": "Profile already exists"}, status_code=400)

        path.mkdir(parents=True, exist_ok=True)
        # Record speaker_id (could be a UUID or a name for unassigned)
        update_speaker_settings(name, speaker_id=speaker_id, variant_name=variant_name, engine=normalized_engine)
        return JSONResponse({"status": "ok", "name": name})
    except ValueError:
        return JSONResponse({"status": "error", "message": "Invalid profile engine"}, status_code=400)
    except Exception as e:
        logger.error(f"Error creating profile {speaker_id}/{variant_name}: {e}")
        return JSONResponse({"status": "error", "message": "Creation failed"}, status_code=500)

@router.get("/api/projects/{project_id}/characters")
def api_list_characters(project_id: str):
    return JSONResponse({"status": "ok", "characters": get_characters(project_id)})

@router.post("/api/projects/{project_id}/characters")
def api_create_character_route(
    project_id: str,
    name: str = Form(...),
    speaker_profile_name: Optional[str] = Form(None),
    color: Optional[str] = Form(None)
):
    normalized_profile_name = (speaker_profile_name or "").strip() or None
    cid = create_character(project_id, name, normalized_profile_name, color=color)
    return JSONResponse({"status": "ok", "id": cid, "character_id": cid})

@router.put("/api/characters/{character_id}")
async def api_update_character_route(
    character_id: str,
    request: Request,
    name: Optional[str] = Form(None),
    speaker_profile_name: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
):
    updates = {}
    if name is not None: updates["name"] = name
    form = await request.form()
    if "speaker_profile_name" in form:
        updates["speaker_profile_name"] = (str(form.get("speaker_profile_name") or "").strip() or None)
    if color is not None: updates["color"] = color
    update_character(character_id, **updates)
    return JSONResponse({"status": "ok"})

@router.delete("/api/characters/{character_id}")
def api_delete_character_route(character_id: str):
    delete_character(character_id)
    return JSONResponse({"status": "ok"})

@router.get("/api/speakers")
def api_list_speakers_route():
    sync_speakers_from_profiles()
    return JSONResponse(list_speakers())

@router.post("/api/speakers")
def api_create_speaker_route(name: str = Form(...), default_profile_name: Optional[str] = Form(None)):
    sid = create_speaker(name, default_profile_name)
    linked_profile_name = _ensure_default_speaker_profile(sid, name, default_profile_name)
    if linked_profile_name != default_profile_name:
        update_speaker(sid, default_profile_name=linked_profile_name)
    return JSONResponse({"status": "ok", "id": sid, "speaker_id": sid})

def _rename_profile_folders(old_name: str, new_name: str):
    """Helper to rename all profile folders on disk starting with a speaker name."""
    try:
        # 0. Voice Root (v2)
        old_root = VOICES_DIR / old_name
        new_root = VOICES_DIR / new_name
        if old_root.exists() and old_root.is_dir() and (old_root / "voice.json").exists():
            if not new_root.exists():
                old_root.rename(new_root)
                # Update references for all variants within this root
                for sub in new_root.iterdir():
                    if sub.is_dir() and (sub / "profile.json").exists():
                        old_vname = f"{old_name} - {sub.name}"
                        new_vname = f"{new_name} - {sub.name}"
                        update_voice_profile_references(old_vname, new_vname)

                        # Update speaker_id in profile.json
                        meta_path = sub / "profile.json"
                        try:
                            import json as _json
                            meta = _json.loads(meta_path.read_text())
                            if meta.get("speaker_id") == old_name:
                                meta["speaker_id"] = new_name
                                meta_path.write_text(_json.dumps(meta, indent=2))
                        except Exception:
                            logger.warning("Failed to update speaker_id in %s", meta_path)

                # Update voice.json
                from ...domain.voices.manifest import load_voice_manifest, save_voice_manifest
                manifest = load_voice_manifest(new_root)
                manifest["name"] = new_name
                save_voice_manifest(new_root, manifest)
                return

        voice_dirs = _voice_dirs_map()
        old_dir = voice_dirs.get(_valid_profile_name(old_name))
        new_dir = voice_dirs.get(_valid_profile_name(new_name)) or _new_voice_profile_dir(new_name)
    except ValueError:
        logger.warning(f"Blocking profile rename traversal attempt: {old_name} -> {new_name}")
        raise HTTPException(status_code=403, detail="Invalid profile name")

    # 1. Exact match (unassigned profile or narrator-identical name)
    if old_dir and not new_dir.exists():
        old_dir.rename(new_dir)
        update_voice_profile_references(old_name, new_name)
        # Update meta if exists
        meta_path = _voice_file_map(new_dir).get("profile.json")
        if meta_path:
            try:
                import json
                meta = json.loads(meta_path.read_text())
                if " - " in new_name:
                    meta["variant_name"] = new_name.split(" - ", 1)[1]
                # Only update speaker_id if it was the old name (unassigned case)
                if meta.get("speaker_id") == old_name:
                    meta["speaker_id"] = new_name
                meta_path.write_text(json.dumps(meta, indent=2))
            except Exception:
                logger.warning("Failed to update profile metadata during rename: %s -> %s", old_name, new_name, exc_info=True)

    # 2. Variants (Narrator - Variant)
    variants = []
    for dir_name, d in _voice_dirs_map().items():
        if dir_name.startswith(old_name + " - "):
            variants.append(d)
    for vdir in variants:
        suffix = vdir.name[len(old_name):]
        new_vname = new_name + suffix
        new_vpath = _existing_voice_profile_dir(new_vname) or _new_voice_profile_dir(new_vname)
        if not new_vpath.exists():
            vdir.rename(new_vpath)
            update_voice_profile_references(vdir.name, new_vname)
            # Update meta
            meta_path = _voice_file_map(new_vpath).get("profile.json")
            if meta_path:
                try:
                    import json
                    meta = json.loads(meta_path.read_text())
                    # Ensure metadata speaker_id stays correct if it was a UUID, or updates to new name if unassigned
                    if meta.get("speaker_id") == old_name:
                        meta["speaker_id"] = new_name
                    meta_path.write_text(json.dumps(meta, indent=2))
                except Exception:
                    logger.warning("Failed to update variant metadata during rename: %s -> %s", vdir.name, new_vname, exc_info=True)

@router.put("/api/speakers/{speaker_id}")
@router.post("/api/speakers/{speaker_id}")
@router.patch("/api/speakers/{speaker_id}")
def api_update_speaker_route(
    speaker_id: str,
    name: Optional[str] = Form(None),
    new_name: Optional[str] = Form(None), # Alias for name
    default_profile_name: Optional[str] = Form(None),
):
    from ...db.speakers import get_speaker
    old_spk = get_speaker(speaker_id)
    if not old_spk:
        return JSONResponse({"status": "error", "message": "Speaker not found"}, status_code=404)

    updates = {}
    target_name = name or new_name
    if target_name is not None: updates["name"] = target_name
    if default_profile_name is not None: updates["default_profile_name"] = default_profile_name

    update_speaker(speaker_id, **updates)

    if target_name and target_name != old_spk["name"]:
        # Renaming narrator: rename all profile directories on disk
        _rename_profile_folders(old_spk["name"], target_name)

    return JSONResponse({"status": "ok"})

@router.delete("/api/speakers/{speaker_id}")
def api_delete_speaker_route(speaker_id: str):
    delete_speaker(speaker_id)
    return JSONResponse({"status": "ok"})

@router.post("/api/speaker-profiles/{profile_name}/assign")
def api_assign_profile_to_speaker(
    profile_name: str,
    speaker_id: Optional[str] = Form(None),
):
    """Reassign a variant profile to a different speaker (or unassign it).
    This renames the folder to match the new speaker's naming, and updates profile.json.
    """
    import json as _json
    try:
        try:
            old_dir = _existing_voice_profile_dir(profile_name)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)
        if not old_dir:
            return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

        # Determine the variant name from existing metadata or folder name
        variant_name = None
        meta_path = _existing_voice_sample_path(profile_name, "profile.json")
        meta = {}
        if meta_path:
            try:
                meta = _json.loads(meta_path.read_text())
                variant_name = meta.get("variant_name")
            except Exception:
                logger.debug("Failed to read metadata while assigning profile %s", profile_name, exc_info=True)

        if not variant_name:
            variant_name = infer_variant_name(profile_name)

        # Determine the new folder name
        if speaker_id:
            # Get the speaker name if it's a UUID
            spk = get_speaker(speaker_id)
            spk_name = spk["name"] if spk else speaker_id
            new_profile_name = f"{spk_name} - {variant_name}"
        else:
            # Unassigning: keep variant name as the folder
            new_profile_name = variant_name

        try:
            new_dir = _existing_voice_profile_dir(new_profile_name) or _new_voice_profile_dir(new_profile_name)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid target profile name"}, status_code=403)

        if new_dir.exists() and new_dir != old_dir:
            return JSONResponse({"status": "error", "message": "Target profile already exists"}, status_code=400)

        # Rename the folder
        if new_dir != old_dir:
            old_dir.rename(new_dir)
            update_voice_profile_references(profile_name, new_profile_name)
            # Cleanup old voice root if empty
            if old_dir.parent != VOICES_DIR:
                _cleanup_voice_root(old_dir.parent)

        # Update profile.json with new speaker_id and variant_name
        new_meta_path = _voice_file_map(new_dir).get("profile.json") or _new_voice_sample_path(new_dir, "profile.json")
        meta.update({"speaker_id": speaker_id, "variant_name": variant_name})
        normalized_meta = normalize_profile_metadata(new_profile_name, meta, persist=False)
        new_meta_path.write_text(_json.dumps(normalized_meta, indent=2))

        return JSONResponse({"status": "ok", "new_profile_name": new_profile_name})
    except Exception as e:
        logger.error(f"Error assigning profile {profile_name}: {e}")
        return JSONResponse({"status": "error", "message": "Assign failed"}, status_code=500)

@router.post("/api/voices/rename-profile")
def api_rename_voice_profile(
    old_name: str = Form(...),
    new_name: str = Form(...),
):
    try:
        _rename_profile_folders(old_name, new_name)

        # Sync global settings
        settings = get_settings()
        if settings.get("default_speaker_profile") == old_name:
            update_settings({"default_speaker_profile": new_name})

        return JSONResponse({"status": "ok", "new_name": new_name})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during directory rename: {e}")
        return JSONResponse({"status": "error", "message": "Directory rename failed"}, status_code=400)

@router.post("/api/speaker-profiles/{name}/test-text")
def update_speaker_test_text(name: str, text: str = Form(...)):
    update_speaker_settings(name, test_text=text)
    return JSONResponse({"status": "ok", "test_text": text})

@router.post("/api/speaker-profiles/{name}/reset-test-text")
def reset_speaker_test_text(name: str):
    update_speaker_settings(name, test_text=None)
    return JSONResponse({"status": "ok", "test_text": DEFAULT_SPEAKER_TEST_TEXT})

@router.post("/api/speaker-profiles/{name}/settings")
async def api_update_profile_settings(name: str, request: Request):
    try:
        settings = await request.json()
    except Exception:
        # Fallback for form data if needed, but JSON is preferred
        form = await request.form()
        settings = dict(form)

    if not update_speaker_settings(name, **settings):
         return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)
    return {"status": "ok"}


@router.post("/api/speaker-profiles/{name}/speed")
def update_speaker_speed(name: str, speed: float = Form(...)):
    update_speaker_settings(name, speed=speed)
    return JSONResponse({"status": "ok", "speed": speed})

@router.post("/api/speaker-profiles/{name}/variant-name")
def update_speaker_variant_name(name: str, variant_name: str = Form(...)):
    clean_variant_name = (variant_name or "").strip() or "Default"
    update_speaker_settings(name, variant_name=None if clean_variant_name == "Default" else clean_variant_name)
    return JSONResponse({"status": "ok", "variant_name": clean_variant_name})


@router.post("/api/speaker-profiles/{name}/engine")
def update_speaker_engine(name: str, engine: str = Form(...)):
    try:
        normalized_engine = _normalize_profile_engine(engine)
    except ValueError:
        return JSONResponse({"status": "error", "message": "Invalid profile engine"}, status_code=400)

    if not _is_engine_active(normalized_engine):
        return JSONResponse({"status": "error", "message": f"Engine {normalized_engine} is not enabled in Settings."}, status_code=400)

    if not update_speaker_settings(name, engine=normalized_engine):
        return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

    return JSONResponse({"status": "ok", "engine": normalized_engine})


@router.post("/api/speaker-profiles/{name}/reference-sample")
def update_speaker_reference_sample(name: str, sample_name: str = Form("")):
    if not _is_engine_active("voxtral"):
        return JSONResponse({"status": "error", "message": "Enable Voxtral in Settings to configure metadata."}, status_code=400)

    clean_sample = (sample_name or "").strip() or None

    if clean_sample:
        try:
            sample_path = _existing_voice_sample_path(name, clean_sample)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid sample name"}, status_code=403)
        if not sample_path:
            return JSONResponse({"status": "error", "message": "Sample not found"}, status_code=404)

    if not update_speaker_settings(name, reference_sample=clean_sample):
        return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

    return JSONResponse({"status": "ok", "reference_sample": clean_sample})


@router.post("/api/speaker-profiles/{name}/voxtral-voice-id")
def update_speaker_voxtral_voice_id(name: str, voice_id: str = Form("")):
    if not _is_engine_active("voxtral"):
        return JSONResponse({"status": "error", "message": "Enable Voxtral in Settings to configure metadata."}, status_code=400)

    clean_voice_id = (voice_id or "").strip() or None
    if not update_speaker_settings(name, voxtral_voice_id=clean_voice_id):
        return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

    return JSONResponse({"status": "ok", "voxtral_voice_id": clean_voice_id})

@router.post("/api/speaker-profiles/{name}/build")
async def build_speaker_profile(
    name: str,
    files: List[UploadFile] = File(default=[]),
):
    try:
        try:
            path = _existing_voice_profile_dir(name) or _new_voice_profile_dir(name)
        except ValueError:
            logger.warning(f"Blocking profile build traversal attempt: {name}")
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)

        existing_raw_samples = _voice_raw_sample_count(name)
        has_latent = _voice_has_latent(name)
        has_generation_material = _voice_has_generation_material(name)
        if existing_raw_samples == 0 and not has_latent and not has_generation_material and not files:
            return JSONResponse(
                {"status": "error", "message": "Add at least one sample or keep a latent before building this voice."},
                status_code=400
            )

        path.mkdir(parents=True, exist_ok=True)

        # Clear existing sample if it exists to ensure accurate building status
        sample_path = _voice_file_map(path).get("sample.wav")
        if sample_path:
            sample_path.unlink()
    except Exception as e:
        logger.error(f"Error preparing path for profile {name}: {e}")
        return JSONResponse({"status": "error", "message": "Build failed"}, status_code=500)

    saved_files = []
    for f in files:
        if not f.filename:
            continue
        content = await f.read()
        try:
            dest = _new_voice_sample_path(path, f.filename)
        except ValueError:
            logger.warning("Blocking invalid sample filename for profile %s: %s", name, f.filename)
            return JSONResponse({"status": "error", "message": "Invalid sample filename"}, status_code=403)

        def save_file(data, target):
            target.write_bytes(data)

        await anyio.to_thread.run_sync(save_file, content, dest)
        saved_files.append(safe_basename(f.filename))

    # Create build job
    jid = f"build-{uuid.uuid4().hex[:8]}"
    j = Job(
        id=jid,
        engine="voice_build",
        chapter_file="", # Required by model
        status="queued",
        created_at=time.time(),
        speaker_profile=name,
        custom_title=_voice_job_title(name),
    )
    put_job(j)
    enqueue(j)
    return JSONResponse({"status": "ok", "job_id": jid})

@router.post("/api/speaker-profiles/{name}/samples/upload")
async def upload_speaker_samples(
    name: str,
    files: List[UploadFile] = File(...),
):
    try:
        try:
            path = _existing_voice_profile_dir(name) or _new_voice_profile_dir(name)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid profile"}, status_code=403)

        path.mkdir(parents=True, exist_ok=True)

        for f in files:
            if not f.filename: continue
            content = await f.read()
            try:
                sample_path = _new_voice_sample_path(path, f.filename)
            except ValueError:
                return JSONResponse({"status": "error", "message": "Invalid sample filename"}, status_code=403)
            sample_path.write_bytes(content)

        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Upload failed for {name}: {e}")
        return JSONResponse({"status": "error", "message": "Upload failed"}, status_code=500)

@router.delete("/api/speaker-profiles/{name}/samples/{sample_name}")
def delete_speaker_sample(
    name: str,
    sample_name: str,
):
    try:
        try:
            profile_dir = _existing_voice_profile_dir(name)
            path = _voice_file_map(profile_dir).get(_valid_sample_name(sample_name)) if profile_dir else None
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid path"}, status_code=403)

        if path:
            path.unlink()
            return JSONResponse({"status": "ok"})
        return JSONResponse({"status": "error", "message": "File not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Delete failed for {name}/{sample_name}: {e}")
        return JSONResponse({"status": "error", "message": "Delete failed"}, status_code=500)

@router.post("/api/speaker-profiles/{name}/rename")
def api_rename_voice_profile_path(
    name: str,
    new_name: str = Form(...),
):
    return api_rename_voice_profile(
        old_name=name,
        new_name=new_name,
    )

@router.delete("/api/speaker-profiles/{name}")
def delete_speaker_profile(
    name: str,
):
    try:
        try:
            path = _existing_voice_profile_dir(name)
        except ValueError:
            logger.warning(f"Blocking profile delete traversal attempt: {name}")
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)

        if path:
            if path.is_relative_to(VOICES_DIR.resolve()):
                parent = path.parent
                shutil.rmtree(path)
                if parent != VOICES_DIR:
                    _cleanup_voice_root(parent)
            else:
                logger.warning("Blocking profile delete outside voices root: %s", path)
                return JSONResponse({"status": "error", "message": "Invalid profile path"}, status_code=403)
            return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Error deleting profile {name}: {e}")
        return JSONResponse({"status": "error", "message": "Delete failed"}, status_code=500)

    return JSONResponse({"status": "error", "message": "Not found"}, status_code=404)

@router.post("/api/speaker-profiles/{name}/test")
def test_speaker_profile(name: str):
    settings = get_speaker_settings(name)
    engine = settings.get("engine", DEFAULT_PROFILE_ENGINE)
    if not _is_engine_active(engine):
        return JSONResponse({"status": "error", "message": f"Engine {engine} is not enabled in Settings."}, status_code=400)

    if not _voice_has_generation_material(name):
        return JSONResponse(
            {"status": "error", "message": "Add at least one sample or keep a latent before testing this voice."},
            status_code=400
        )

    jid = f"test-{uuid.uuid4().hex[:8]}"
    j = Job(
        id=jid,
        engine="voice_test",
        chapter_file="", # Required by model
        status="queued",
        created_at=time.time(),
        speaker_profile=name,
        custom_title=_voice_job_title(name),
    )
    put_job(j)
    enqueue(j)
    preview_url = _voice_preview_url(name)
    return JSONResponse({
        "status": "ok",
        "job_id": jid,
        "audio_url": preview_url or f"/out/voices/{name}/sample.wav"
    })

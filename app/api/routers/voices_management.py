import logging
import json
import shutil
from pathlib import Path
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from . import voices_helpers
from ... import db
from ... import jobs
from ...engines import bridge
from ... import state
from ... import pathing
from ... import config

logger = logging.getLogger(__name__)

router = APIRouter()

def _ensure_default_speaker_profile(speaker_id: str, speaker_name: str, default_profile_name: Optional[str]) -> str:
    profile_name = default_profile_name or speaker_name
    try:
        profile_name = voices_helpers._valid_profile_name(profile_name)
    except ValueError:
        profile_name = voices_helpers._valid_profile_name(f"speaker-{speaker_id}")

    profile_dir = voices_helpers._existing_voice_profile_dir(profile_name)
    meta: Dict[str, object] = {}

    if profile_dir:
        meta_path = voices_helpers._voice_file_map(profile_dir).get("profile.json") or voices_helpers._new_voice_sample_path(profile_dir, "profile.json")
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text())
            except Exception:
                logger.warning("Failed to read existing speaker profile metadata for %s", meta_path, exc_info=True)
                meta = {}

        if meta.get("speaker_id") and meta["speaker_id"] != speaker_id:
            idx = 1
            while voices_helpers._existing_voice_profile_dir(f"{profile_name}_{idx}"):
                idx += 1
            profile_name = f"{profile_name}_{idx}"
            profile_dir = voices_helpers._new_voice_profile_dir(profile_name)
            meta = {}
            meta_path = voices_helpers._new_voice_sample_path(profile_dir, "profile.json")
    else:
        profile_dir = voices_helpers._new_voice_profile_dir(profile_name)
        meta_path = voices_helpers._new_voice_sample_path(profile_dir, "profile.json")

    profile_dir.mkdir(parents=True, exist_ok=True)
    meta["speaker_id"] = speaker_id
    meta["variant_name"] = db.speakers.infer_variant_name(profile_name)
    if "speed" not in meta:
        meta["speed"] = 1.0
    normalized_meta = db.speakers.normalize_profile_metadata(profile_name, meta, persist=False)

    import os
    trusted_voices_root = os.path.abspath(os.fspath(config.VOICES_DIR))
    resolved_pdir = os.path.abspath(os.fspath(profile_dir))
    if resolved_pdir.startswith(trusted_voices_root + os.sep) or resolved_pdir == trusted_voices_root:
        meta_path_full = os.path.normpath(os.path.join(resolved_pdir, "profile.json"))
        if meta_path_full.startswith(resolved_pdir + os.sep):
            with open(meta_path_full, "w", encoding="utf-8") as f:
                f.write(json.dumps(normalized_meta, indent=2))

    return profile_name

def _rename_profile_folders(old_name: str, new_name: str):
    """Helper to rename all profile folders on disk starting with a speaker name."""
    # 0. Validate names
    if not (config.SAFE_PROJECT_ID_RE.fullmatch(old_name) and config.SAFE_PROJECT_ID_RE.fullmatch(new_name)):
         # If not simple IDs, check if they are valid profile names (could contain spaces/hyphens)
         if not (voices_helpers.SAFE_PROFILE_NAME_RE.fullmatch(old_name) and voices_helpers.SAFE_PROFILE_NAME_RE.fullmatch(new_name)):
               logger.warning(f"Blocking invalid profile rename attempt: {old_name} -> {new_name}")
               raise HTTPException(status_code=403, detail="Invalid profile name format")

    try:
        # 0. Voice Root (v2)
        root = voices_helpers.get_voices_dir()
        old_root = pathing.secure_join_flat(root, old_name)
        new_root = pathing.secure_join_flat(root, new_name)

        import os
        trusted_voices_root = os.path.abspath(os.fspath(root))
        resolved_old = os.path.abspath(os.fspath(old_root))
        resolved_new = os.path.abspath(os.fspath(new_root))

        # Rule 9: Locally visible containment check for both sides
        if not (resolved_old.startswith(trusted_voices_root + os.sep) and resolved_new.startswith(trusted_voices_root + os.sep)):
             raise HTTPException(status_code=403, detail="Invalid profile name")

        if os.path.exists(resolved_old) and os.path.isdir(resolved_old) and pathing.find_secure_file(Path(resolved_old), "voice.json"):
            if not os.path.exists(resolved_new):
                os.rename(resolved_old, resolved_new)
                # Update references for all variants within this root
                for sub in os.scandir(resolved_new):
                    if sub.is_dir():
                        sub_path = os.path.abspath(sub.path)
                        if pathing.find_secure_file(Path(sub_path), "profile.json"):
                            old_vname = f"{old_name} - {sub.name}"
                            new_vname = f"{new_name} - {sub.name}"
                            db.update_voice_profile_references(old_vname, new_vname)

                            # Update speaker_id in profile.json
                            meta_path_full = os.path.normpath(os.path.join(sub_path, "profile.json"))
                            if meta_path_full.startswith(sub_path + os.sep):
                                try:
                                    import json as _json
                                    with open(meta_path_full, "r", encoding="utf-8") as f:
                                        meta = _json.loads(f.read())
                                    if meta.get("speaker_id") == old_name:
                                        meta["speaker_id"] = new_name
                                        with open(meta_path_full, "w", encoding="utf-8") as f:
                                            f.write(_json.dumps(meta, indent=2))
                                except Exception:
                                    logger.warning("Failed to update speaker_id in %s", meta_path_full)

                # Update voice.json
                from ...domain.voices.manifest import load_voice_manifest, save_voice_manifest
                manifest = load_voice_manifest(Path(resolved_new))
                manifest["name"] = new_name
                save_voice_manifest(Path(resolved_new), manifest)
                return

        dirs_map = voices_helpers._voice_dirs_map()
        old_dir = dirs_map.get(voices_helpers._valid_profile_name(old_name))
        new_dir = dirs_map.get(voices_helpers._valid_profile_name(new_name)) or voices_helpers._new_voice_profile_dir(new_name)

        # Rule 9: Explicit containment check for scanner locality
        try:
            if old_dir: old_dir.resolve().relative_to(voices_helpers.get_voices_dir().resolve())
            if new_dir: new_dir.resolve().relative_to(voices_helpers.get_voices_dir().resolve())
        except (ValueError, OSError, RuntimeError):
             raise HTTPException(status_code=403, detail="Invalid profile name")
    except ValueError:
        logger.warning(f"Blocking profile rename traversal attempt: {old_name} -> {new_name}")
        raise HTTPException(status_code=403, detail="Invalid profile name")

    # 1. Exact match (unassigned profile or narrator-identical name)
    if old_dir and not new_dir.exists():
        import os
        trusted_voices_root = os.path.abspath(os.fspath(voices_helpers.get_voices_dir()))
        resolved_old = os.path.abspath(os.fspath(old_dir))
        resolved_new = os.path.abspath(os.fspath(new_dir))

        if " - " in old_name and " - " in new_name and old_dir.parent == voices_helpers.get_voices_dir():
            # Preserve the legacy flat layout
            resolved_new = os.path.abspath(os.fspath(pathing.secure_join_flat(voices_helpers.get_voices_dir(), new_name)))

        if resolved_old.startswith(trusted_voices_root + os.sep) and resolved_new.startswith(trusted_voices_root + os.sep):
            os.rename(resolved_old, resolved_new)
            db.update_voice_profile_references(old_name, new_name)
            # Update meta if exists
            meta_path_full = os.path.normpath(os.path.join(resolved_new, "profile.json"))
            if os.path.exists(meta_path_full) and meta_path_full.startswith(resolved_new + os.sep):
                try:
                    import json
                    with open(meta_path_full, "r", encoding="utf-8") as f:
                        meta = json.loads(f.read())
                    if " - " in new_name:
                        meta["variant_name"] = new_name.split(" - ", 1)[1]
                    # Only update speaker_id if it was the old name (unassigned case)
                    if meta.get("speaker_id") == old_name:
                        meta["speaker_id"] = new_name
                    with open(meta_path_full, "w", encoding="utf-8") as f:
                        f.write(json.dumps(meta, indent=2))
                except Exception:
                    logger.warning("Failed to update profile metadata during rename: %s -> %s", old_name, new_name, exc_info=True)

    # 2. Variants (Narrator - Variant)
    variants = []
    for dir_name, d in voices_helpers._voice_dirs_map().items():
        if dir_name.startswith(old_name + " - "):
            variants.append(d)
    for vdir in variants:
        suffix = vdir.name[len(old_name):]
        new_vname = new_name + suffix
        new_vpath = voices_helpers._existing_voice_profile_dir(new_vname) or voices_helpers._new_voice_profile_dir(new_vname)
        if not new_vpath.exists():
            import os
            trusted_voices_root = os.path.abspath(os.fspath(voices_helpers.get_voices_dir()))
            resolved_vdir = os.path.abspath(os.fspath(vdir))
            resolved_new_vpath = os.path.abspath(os.fspath(new_vpath))

            if resolved_vdir.startswith(trusted_voices_root + os.sep) and resolved_new_vpath.startswith(trusted_voices_root + os.sep):
                os.rename(resolved_vdir, resolved_new_vpath)
                db.update_voice_profile_references(vdir.name, new_vname)
                # Update meta
                meta_path_full = os.path.normpath(os.path.join(resolved_new_vpath, "profile.json"))
                if os.path.exists(meta_path_full) and meta_path_full.startswith(resolved_new_vpath + os.sep):
                    try:
                        import json
                        with open(meta_path_full, "r", encoding="utf-8") as f:
                            meta = json.loads(f.read())
                        # Ensure metadata speaker_id stays correct if it was a UUID, or updates to new name if unassigned
                        if meta.get("speaker_id") == old_name:
                            meta["speaker_id"] = new_name
                        with open(meta_path_full, "w", encoding="utf-8") as f:
                            f.write(json.dumps(meta, indent=2))
                    except Exception:
                        logger.warning("Failed to update variant metadata during rename: %s -> %s", vdir.name, new_vname, exc_info=True)


@router.get("/speaker-profiles")
def list_speaker_profiles():
    from ...domain.voices.migration import migrate_voices_to_v2
    migrate_voices_to_v2()
    db.speakers.sync_speakers_from_profiles()

    if not voices_helpers.get_voices_dir().exists():
        return []

    dirs_map = voices_helpers._voice_dirs_map()
    sorted_items = sorted(dirs_map.items(), key=lambda item: item[0])
    settings = state.get_settings()
    default_speaker = settings.get("default_speaker_profile")

    # Auto-set default if only one exists
    if sorted_items:
        names = [name for name, _ in sorted_items]
        if len(sorted_items) == 1 and default_speaker != names[0]:
            default_speaker = names[0]
            state.update_settings({"default_speaker_profile": default_speaker})
        elif default_speaker and default_speaker not in names:
            default_speaker = names[0] if len(sorted_items) > 0 else None
            state.update_settings({"default_speaker_profile": default_speaker})

    profiles = []
    for name, d in sorted_items:
        raw_wavs = sorted([f.name for f in d.glob("*.wav") if f.name != "sample.wav"])
        spk_settings = jobs.get_speaker_settings(name)
        built_samples = spk_settings.get("built_samples", [])

        samples = []
        is_rebuild_required = False
        for w in raw_wavs:
            is_new = w not in built_samples
            samples.append({"name": w, "is_new": is_new})
            if is_new: is_rebuild_required = True

        preview_url = voices_helpers._voice_preview_url(name)
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
                    or spk_settings.get("preview_engine") != spk_settings.get("engine", db.speakers.DEFAULT_PROFILE_ENGINE)
                )
                if spk_settings.get("engine") == "voxtral":
                    preview_signature_stale = preview_signature_stale or (
                        spk_settings.get("preview_reference_sample") != spk_settings.get("reference_sample")
                        or spk_settings.get("preview_voxtral_voice_id") != spk_settings.get("voxtral_voice_id")
                        or spk_settings.get("preview_voxtral_model") != spk_settings.get("voxtral_model")
                    )

        rebuild_reasons = []
        if any(s['is_new'] for s in samples):
            rebuild_reasons.append("new_samples")
        if len([b for b in built_samples if voices_helpers.SAFE_SAMPLE_NAME_RE.fullmatch(b) and pathing.find_secure_file(d, b)]) < len(built_samples):
            rebuild_reasons.append("samples_missing")
        if preview_signature_stale:
            rebuild_reasons.append("settings_changed")
        if not preview_url and len(raw_wavs) > 0:
            rebuild_reasons.append("no_preview")

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
            "rebuild_reasons": rebuild_reasons,
            "speed": spk_settings["speed"],
            "test_text": spk_settings["test_text"],
            "speaker_id": spk_settings.get("speaker_id"),
            "variant_name": spk_settings.get("variant_name"),
            "engine": spk_settings.get("engine", db.speakers.DEFAULT_PROFILE_ENGINE),
            "voxtral_voice_id": spk_settings.get("voxtral_voice_id"),
            "voxtral_model": spk_settings.get("voxtral_model"),
            "reference_sample": spk_settings.get("reference_sample"),
            "preview_url": preview_url,
            "asset_base_url": voices_helpers._voice_asset_base_url(d),
            "has_latent": voices_helpers._voice_has_latent(name),
            "is_ready": False,
            "readiness_message": "",
        }

        # Calculate readiness using the bridge
        v_bridge = bridge.create_voice_bridge()
        try:
            is_ready, msg = v_bridge.check_readiness(
                engine_id=profile_data["engine"],
                profile_id=d.name,
                settings=spk_settings,
                profile_dir=str(d.resolve())
            )
            profile_data["is_ready"] = is_ready
            profile_data["readiness_message"] = msg
        except Exception:
            profile_data["is_ready"] = False
            profile_data["readiness_message"] = "Internal error during readiness check"

        profiles.append(profile_data)
    return profiles

@router.post("/speaker-profiles")
def api_create_speaker_profile(
    speaker_id: str = Form(...),
    variant_name: str = Form(...),
    engine: str = Form(db.speakers.DEFAULT_PROFILE_ENGINE),
):
    logger.info(f"Creating profile for speaker_id='{speaker_id}', variant_name='{variant_name}', engine='{engine}'")
    try:
        normalized_engine = voices_helpers._normalize_profile_engine(engine)
        if not voices_helpers._is_engine_active(normalized_engine):
            return JSONResponse({"status": "error", "message": f"Engine {normalized_engine} is not enabled in Settings."}, status_code=400)
        # Try to use speaker name instead of ID if possible for folder name
        spk = db.get_speaker(speaker_id)
        spk_name = spk["name"] if spk else speaker_id
        name = f"{spk_name} - {variant_name}"
        try:
            path = voices_helpers._existing_voice_profile_dir(name) or voices_helpers._new_voice_profile_dir(name)
        except ValueError:
            logger.warning(f"Blocking profile creation traversal attempt: {name}")
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)

        if path.exists():
            return JSONResponse({"status": "error", "message": "Profile already exists"}, status_code=400)

        path.mkdir(parents=True, exist_ok=True)
        # Record speaker_id (could be a UUID or a name for unassigned)
        jobs.update_speaker_settings(name, speaker_id=speaker_id, variant_name=variant_name, engine=normalized_engine)
        return JSONResponse({"status": "ok", "name": name})
    except ValueError:
        return JSONResponse({"status": "error", "message": "Invalid profile engine"}, status_code=400)
    except Exception as e:
        logger.error(f"Error creating profile {speaker_id}/{variant_name}: {e}")
        return JSONResponse({"status": "error", "message": "Creation failed"}, status_code=500)

@router.delete("/speaker-profiles/{name}")
def delete_speaker_profile(
    name: str,
):
    try:
        try:
            path = voices_helpers._existing_voice_profile_dir(name)
        except ValueError:
            logger.warning(f"Blocking profile delete traversal attempt: {name}")
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)

        if path:
            import os
            trusted_voices_root = os.path.abspath(os.fspath(voices_helpers.get_voices_dir()))
            resolved_path = os.path.abspath(os.fspath(path))

            if resolved_path.startswith(trusted_voices_root + os.sep):
                parent = os.path.dirname(resolved_path)
                shutil.rmtree(resolved_path)
                if parent != trusted_voices_root:
                    voices_helpers._cleanup_voice_root(Path(parent))
            else:
                logger.warning("Blocking profile delete outside voices root: %s", resolved_path)
                return JSONResponse({"status": "error", "message": "Access denied"}, status_code=403)
            return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Error deleting profile {name}: {e}")
        return JSONResponse({"status": "error", "message": "Delete failed"}, status_code=500)

    return JSONResponse({"status": "error", "message": "Not found"}, status_code=404)

@router.post("/speaker-profiles/{profile_name}/assign")
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
            old_dir = voices_helpers._existing_voice_profile_dir(profile_name)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)
        if not old_dir:
            return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

        # Determine the variant name from existing metadata or folder name
        variant_name = None
        meta_path = voices_helpers._existing_voice_sample_path(profile_name, "profile.json")
        meta = {}
        if meta_path:
            try:
                meta = _json.loads(meta_path.read_text())
                variant_name = meta.get("variant_name")
            except Exception:
                logger.debug("Failed to read metadata while assigning profile %s", profile_name, exc_info=True)

        if not variant_name:
            variant_name = db.speakers.infer_variant_name(profile_name)

        # Determine the new folder name
        if speaker_id:
            # Get the speaker name if it's a UUID
            spk = db.get_speaker(speaker_id)
            spk_name = spk["name"] if spk else speaker_id
            new_profile_name = f"{spk_name} - {variant_name}"
        else:
            # Unassigning: keep variant name as the folder
            new_profile_name = variant_name

        try:
            new_dir = voices_helpers._existing_voice_profile_dir(new_profile_name) or voices_helpers._new_voice_profile_dir(new_profile_name)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid target profile name"}, status_code=403)

        if new_dir.exists() and new_dir != old_dir:
            return JSONResponse({"status": "error", "message": "Target profile already exists"}, status_code=400)

        # Rename the folder
        if new_dir != old_dir:
            import os
            trusted_voices_root = os.path.abspath(os.fspath(voices_helpers.get_voices_dir()))
            resolved_old = os.path.abspath(os.fspath(old_dir))
            resolved_new = os.path.abspath(os.fspath(new_dir))

            if resolved_old.startswith(trusted_voices_root + os.sep) and resolved_new.startswith(trusted_voices_root + os.sep):
                os.rename(resolved_old, resolved_new)
                db.update_voice_profile_references(profile_name, new_profile_name)
                # Cleanup old voice root if empty
                old_parent = os.path.dirname(resolved_old)
                if old_parent != trusted_voices_root:
                    voices_helpers._cleanup_voice_root(Path(old_parent))
            else:
                return JSONResponse({"status": "error", "message": "Access denied"}, status_code=403)

        # Update profile.json with new speaker_id and variant_name
        resolved_new = os.path.abspath(os.fspath(new_dir))
        meta_path_full = os.path.normpath(os.path.join(resolved_new, "profile.json"))
        if meta_path_full.startswith(resolved_new + os.sep):
            meta.update({"speaker_id": speaker_id, "variant_name": variant_name})
            normalized_meta = db.speakers.normalize_profile_metadata(new_profile_name, meta, persist=False)
            with open(meta_path_full, "w", encoding="utf-8") as f:
                f.write(_json.dumps(normalized_meta, indent=2))

        return JSONResponse({"status": "ok", "new_profile_name": new_profile_name})
    except Exception as e:
        logger.error(f"Error assigning profile {profile_name}: {e}")
        return JSONResponse({"status": "error", "message": "Assign failed"}, status_code=500)


@router.post("/voices/rename-profile")
def api_rename_voice_profile(
    old_name: str = Form(...),
    new_name: str = Form(...),
):
    try:
        _rename_profile_folders(old_name, new_name)

        # Sync global settings
        settings = state.get_settings()
        if settings.get("default_speaker_profile") == old_name:
            state.update_settings({"default_speaker_profile": new_name})

        return JSONResponse({"status": "ok", "new_name": new_name})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during directory rename: {e}")
        return JSONResponse({"status": "error", "message": "Directory rename failed"}, status_code=400)


@router.post("/speaker-profiles/{name}/rename")
def api_rename_voice_profile_path(
    name: str,
    new_name: str = Form(...),
):
    return api_rename_voice_profile(
        old_name=name,
        new_name=new_name,
    )



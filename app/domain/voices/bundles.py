import io
import json
import os
import re
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Iterable, List

from .manifest import (
    CURRENT_VOICE_STORAGE_VERSION,
    load_variant_manifest,
    load_voice_manifest,
    save_variant_manifest,
    save_voice_manifest,
)

SAFE_VOICE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
BUNDLE_SCHEMA_VERSION = 1
BUNDLE_MANIFEST_FILENAME = "bundle.json"
VOICE_MANIFEST_FILENAME = "voice.json"
VARIANT_MANIFEST_FILENAME = "profile.json"
PREVIEW_ASSET_NAMES = {"sample.mp3", "sample.wav"}
MODEL_ASSET_NAMES = {"latent.pth"}


class VoiceBundleError(ValueError):
    pass


def _require_safe_name(name: str, label: str = "voice") -> str:
    clean = (name or "").strip()
    if not SAFE_VOICE_NAME_RE.fullmatch(clean):
        raise VoiceBundleError(f"Invalid {label} name")
    return clean


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _voice_root_or_error(voices_root: Path, voice_name: str) -> Path:
    voice_name = _require_safe_name(voice_name)

    # Rule 9: Locally visible containment proof for directory validation sinks
    v_root_str = os.path.abspath(os.path.realpath(os.fspath(voices_root)))
    v_root_prefix = v_root_str if v_root_str.endswith(os.sep) else v_root_str + os.sep

    target_root_str = os.path.abspath(os.path.realpath(os.path.join(v_root_str, voice_name)))
    if not (target_root_str == v_root_str or target_root_str.startswith(v_root_prefix)):
        raise VoiceBundleError("Invalid voice name")

    if not os.path.isdir(target_root_str):
        raise VoiceBundleError("Voice not found")

    manifest_path = os.path.join(target_root_str, VOICE_MANIFEST_FILENAME)
    if not os.path.exists(manifest_path):
        raise VoiceBundleError("Voice not found")

    return Path(target_root_str)


def _variant_dirs(voice_root: Path) -> List[Path]:
    return sorted(
        [
            entry
            for entry in voice_root.iterdir()
            if entry.is_dir() and (entry / VARIANT_MANIFEST_FILENAME).exists()
        ],
        key=lambda p: p.name.lower(),
    )


def _add_file(zf: zipfile.ZipFile, source: Path, arcname: str) -> bool:
    if source.exists() and source.is_file():
        zf.write(source, arcname)
        return True
    return False


def export_voice_bundle(voices_root: Path, voice_name: str, *, include_source_wavs: bool = False) -> bytes:
    voice_root = _voice_root_or_error(voices_root, voice_name)
    variants = _variant_dirs(voice_root)
    if not variants:
        raise VoiceBundleError("Voice has no variants to export")

    voice_manifest = load_voice_manifest(voice_root)
    voice_manifest["version"] = CURRENT_VOICE_STORAGE_VERSION
    voice_manifest["name"] = voice_name
    if not voice_manifest.get("default_variant"):
        voice_manifest["default_variant"] = "Default" if any(v.name == "Default" for v in variants) else variants[0].name

    variant_entries = []
    included_asset_classes = {"voice_manifest", "variant_manifest"}

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(VOICE_MANIFEST_FILENAME, json.dumps(voice_manifest, indent=2))

        for variant_dir in variants:
            variant_manifest = load_variant_manifest(variant_dir)
            variant_manifest["variant_name"] = variant_manifest.get("variant_name") or variant_dir.name

            arc_prefix = variant_dir.name
            zf.writestr(f"{arc_prefix}/{VARIANT_MANIFEST_FILENAME}", json.dumps(variant_manifest, indent=2))

            assets = []
            for filename in sorted(MODEL_ASSET_NAMES | PREVIEW_ASSET_NAMES):
                if _add_file(zf, variant_dir / filename, f"{arc_prefix}/{filename}"):
                    assets.append(filename)
                    if filename in MODEL_ASSET_NAMES:
                        included_asset_classes.add("latent")
                    if filename in PREVIEW_ASSET_NAMES:
                        included_asset_classes.add("preview")

            if include_source_wavs:
                for wav in sorted(variant_dir.glob("*.wav"), key=lambda p: p.name.lower()):
                    if wav.name == "sample.wav":
                        continue
                    if _add_file(zf, wav, f"{arc_prefix}/{wav.name}"):
                        assets.append(wav.name)
                        included_asset_classes.add("source_wavs")

            variant_entries.append({
                "name": variant_dir.name,
                "label": variant_manifest.get("variant_name") or variant_dir.name,
                "assets": sorted(assets),
            })

        bundle_manifest = {
            "schema_version": BUNDLE_SCHEMA_VERSION,
            "voice_storage_version": CURRENT_VOICE_STORAGE_VERSION,
            "voice_name": voice_name,
            "created_at": _utc_now(),
            "include_source_wavs": include_source_wavs,
            "variants": variant_entries,
            "included_asset_classes": sorted(included_asset_classes),
        }
        zf.writestr(BUNDLE_MANIFEST_FILENAME, json.dumps(bundle_manifest, indent=2))

    return buffer.getvalue()


def _validate_member_path(name: str) -> PurePosixPath:
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        raise VoiceBundleError("Voice bundle contains an unsafe path")
    return path


def _read_json(zf: zipfile.ZipFile, name: str) -> Dict[str, Any]:
    try:
        return json.loads(zf.read(name).decode("utf-8"))
    except KeyError as exc:
        raise VoiceBundleError(f"Voice bundle is missing {name}") from exc
    except Exception as exc:
        raise VoiceBundleError(f"Voice bundle contains invalid JSON in {name}") from exc


def _safe_copy_name(voices_root: Path, desired_name: str) -> str:
    base = _require_safe_name(desired_name)
    if not (voices_root / base).exists():
        return base

    idx = 2
    while True:
        candidate = f"{base} {idx}"
        if not (voices_root / candidate).exists():
            return candidate
        idx += 1


def _valid_payload_paths(paths: Iterable[PurePosixPath]) -> List[PurePosixPath]:
    accepted: List[PurePosixPath] = []
    for path in paths:
        if len(path.parts) == 1 and path.name in {VOICE_MANIFEST_FILENAME, BUNDLE_MANIFEST_FILENAME}:
            accepted.append(path)
            continue
        if len(path.parts) == 2:
            variant, filename = path.parts
            _require_safe_name(variant, "variant")
            if (
                filename == VARIANT_MANIFEST_FILENAME
                or filename in MODEL_ASSET_NAMES
                or filename in PREVIEW_ASSET_NAMES
                or (filename.endswith(".wav") and filename != "sample.wav")
            ):
                accepted.append(path)
                continue
        raise VoiceBundleError(f"Voice bundle contains unsupported file: {path.as_posix()}")
    return accepted


def import_voice_bundle(voices_root: Path, bundle_bytes: bytes) -> Dict[str, Any]:
    voices_root.mkdir(parents=True, exist_ok=True)

    try:
        zf = zipfile.ZipFile(io.BytesIO(bundle_bytes))
    except zipfile.BadZipFile as exc:
        raise VoiceBundleError("Voice bundle is not a valid zip file") from exc

    with zf:
        files = [info for info in zf.infolist() if not info.is_dir()]
        member_paths = [_validate_member_path(info.filename) for info in files]
        accepted_paths = _valid_payload_paths(member_paths)
        names = {path.as_posix() for path in accepted_paths}

        if VOICE_MANIFEST_FILENAME not in names:
            raise VoiceBundleError("Voice bundle is missing voice.json")

        variant_profile_paths = [
            path for path in accepted_paths
            if len(path.parts) == 2 and path.parts[1] == VARIANT_MANIFEST_FILENAME
        ]
        if not variant_profile_paths:
            raise VoiceBundleError("Voice bundle must include at least one variant profile.json")

        voice_manifest = _read_json(zf, VOICE_MANIFEST_FILENAME)
        bundle_manifest = _read_json(zf, BUNDLE_MANIFEST_FILENAME) if BUNDLE_MANIFEST_FILENAME in names else {}
        original_voice_name = _require_safe_name(
            str(voice_manifest.get("name") or bundle_manifest.get("voice_name") or ""),
            "voice",
        )
        imported_voice_name = _safe_copy_name(voices_root, original_voice_name)
        target_root = voices_root / imported_voice_name
        staging_root = voices_root / f".voice-import-{uuid.uuid4().hex}"

        try:
            staging_root.mkdir(parents=True)
            target_root = staging_root / imported_voice_name
            target_root.mkdir(parents=True)

            voice_manifest["version"] = CURRENT_VOICE_STORAGE_VERSION
            voice_manifest["name"] = imported_voice_name
            if not voice_manifest.get("default_variant"):
                voice_manifest["default_variant"] = "Default" if any(path.parts[0] == "Default" for path in variant_profile_paths) else variant_profile_paths[0].parts[0]
            save_voice_manifest(target_root, voice_manifest)

            variants = []
            for profile_path in sorted(variant_profile_paths, key=lambda p: p.parts[0].lower()):
                variant_name = profile_path.parts[0]
                variant_dir = target_root / variant_name
                variant_dir.mkdir(parents=True, exist_ok=True)

                profile = _read_json(zf, profile_path.as_posix())
                profile["variant_name"] = profile.get("variant_name") or variant_name
                profile["speaker_id"] = imported_voice_name
                save_variant_manifest(variant_dir, profile)
                variants.append(variant_name)

            for path in accepted_paths:
                if len(path.parts) != 2 or path.parts[1] == VARIANT_MANIFEST_FILENAME:
                    continue
                target = target_root / path.parts[0] / path.parts[1]
                target.write_bytes(zf.read(path.as_posix()))

            final_root = voices_root / imported_voice_name
            staging_voice_root = target_root
            staging_voice_root.rename(final_root)
        except Exception:
            import shutil
            shutil.rmtree(staging_root, ignore_errors=True)
            raise
        else:
            import shutil
            shutil.rmtree(staging_root, ignore_errors=True)

    return {
        "voice_name": imported_voice_name,
        "original_voice_name": original_voice_name,
        "was_renamed": imported_voice_name != original_voice_name,
        "variants": variants,
    }

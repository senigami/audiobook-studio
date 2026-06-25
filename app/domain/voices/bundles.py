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
    load_voice_state,
    save_variant_manifest,
    save_voice_manifest,
    save_voice_state,
)

from ...core.config import SAFE_VOICE_NAME_RE
BUNDLE_SCHEMA_VERSION = 1
BUNDLE_MANIFEST_FILENAME = "bundle.json"
VOICE_MANIFEST_FILENAME = "voice.json"
VARIANT_MANIFEST_FILENAME = "profile.json"
README_FILENAME = "README.md"
PREVIEW_ASSET_NAMES = {"sample.mp3", "sample.wav"}
MODEL_ASSET_NAMES = {"latent.pth"}

# Path to the canonical bundle schema (voice.schema.json)
_REPO_ROOT = Path(__file__).resolve().parents[3]
_BUNDLE_SCHEMA_PATH = _REPO_ROOT / "docs" / "specs" / "voice.schema.json"

# Fields that are runtime-operational and MUST NOT appear in exported voice.json
_EXPORT_STRIP_FIELDS = {"version", "default_variant", "_untagged", "_taxonomy_version"}


class VoiceBundleError(ValueError):
    pass


def _load_bundle_schema() -> Dict[str, Any]:
    """Load design-docs/specs/voice.schema.json once per process (cached on module)."""
    try:
        with _BUNDLE_SCHEMA_PATH.open(encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        raise VoiceBundleError(f"Could not load bundle schema: {exc}") from exc


_CACHED_BUNDLE_SCHEMA: Dict[str, Any] = {}


def _get_bundle_schema() -> Dict[str, Any]:
    global _CACHED_BUNDLE_SCHEMA
    if not _CACHED_BUNDLE_SCHEMA:
        _CACHED_BUNDLE_SCHEMA = _load_bundle_schema()
    return _CACHED_BUNDLE_SCHEMA


def validate_voice_manifest_strict(voice_manifest: Dict[str, Any]) -> None:
    """Validate voice.json against voice.schema.json with strict rules.

    Raises VoiceBundleError with an actionable message on any failure.
    Used exclusively on the export path (Phase E, E1).
    """
    try:
        import jsonschema
    except ImportError as exc:
        raise VoiceBundleError("jsonschema package is required for export validation") from exc

    schema = _get_bundle_schema()
    errors = list(jsonschema.Draft202012Validator(schema).iter_errors(voice_manifest))
    if not errors:
        return

    # Build a human-readable message
    messages = []
    for err in errors:
        path = " → ".join(str(p) for p in err.absolute_path) if err.absolute_path else "root"
        messages.append(f"{path}: {err.message}")
    raise VoiceBundleError(
        f"Voice manifest failed schema validation ({len(errors)} error(s)). "
        + " | ".join(messages)
    )


def _as_tag(field: str, value: str) -> str:
    """Convert an attribute field + value to a namespaced HF tag (as-<field>-<value>)."""
    # Shorten field names per the template: use_case → use, quality keeps its name
    field_alias = {
        "use_case": "use",
    }
    f = field_alias.get(field, field)
    return f"as-{f}-{value}"


def generate_readme_md(voice_manifest: Dict[str, Any]) -> str:
    """Generate a HuggingFace-compatible README.md from a voice.json manifest.

    The output matches the shape in design-docs/specs/voice-bundle-template/README.md:
    - YAML frontmatter with license, language, pipeline_tag, library_name, tags, widget
    - Icon img tag
    - # <name> heading
    - description
    - attributes table
    - import instructions

    The README is generated; callers should not hand-edit it in a real bundle.
    """
    name = voice_manifest.get("name", "Voice")
    description = voice_manifest.get("description", "")
    image = voice_manifest.get("image", "icon.png")
    license_str = voice_manifest.get("license", "")
    languages = voice_manifest.get("languages", [])
    attributes = voice_manifest.get("attributes") or {}
    free_tags = list(voice_manifest.get("tags") or [])

    # Build HF tags list
    hf_tags: List[str] = ["audiobook-studio-voice", "audiobook-studio-spec-v1", "text-to-speech"]

    # as-* namespaced attribute tags
    scalar_fields = ("class", "gender", "age", "accent", "pace")
    array_fields = ("tone", "timbre", "use_case", "quality")

    for field in scalar_fields:
        val = attributes.get(field)
        if val:
            hf_tags.append(_as_tag(field, val))

    for field in array_fields:
        vals = attributes.get(field) or []
        for val in vals:
            hf_tags.append(_as_tag(field, val))

    # Append free tags
    hf_tags.extend(free_tags)

    # Determine primary sample for widget
    samples = voice_manifest.get("samples") or []
    primary_sample = next((s for s in samples if s.get("primary")), samples[0] if samples else None)
    sample_path = primary_sample["path"] if primary_sample else "samples/preview.mp3"
    sample_text = (primary_sample or {}).get("text", "")

    # Build language list for frontmatter
    lang_short = [lang.split("-")[0] for lang in languages] or ["en"]

    # YAML frontmatter
    lines: List[str] = ["---"]
    if license_str:
        lines.append(f"license: {license_str}")
    lines.append("language:")
    for lang in lang_short:
        lines.append(f"  - {lang}")
    lines.append("pipeline_tag: text-to-speech")
    lines.append("library_name: audiobook-studio")
    lines.append("tags:")
    for tag in hf_tags:
        lines.append(f"  - {tag}")
    if primary_sample:
        lines.append("widget:")
        lines.append(f'  - text: "{sample_text}"')
        lines.append(f'    example_title: "{name} — preview"')
        lines.append("    output:")
        lines.append(f"      url: {sample_path}")
    lines.append("---")
    lines.append("")

    # Body
    if image:
        lines.append(f'<img src="{image}" alt="{name}" width="256" height="256" />')
        lines.append("")
    lines.append(f"# {name}")
    lines.append("")
    if description:
        lines.append(description)
        lines.append("")

    # Attributes table
    if attributes:
        attr_rows: List[tuple[str, str]] = []
        if attributes.get("class"):
            attr_rows.append(("Class", attributes["class"].capitalize()))
        if attributes.get("gender"):
            attr_rows.append(("Gender", attributes["gender"].capitalize()))
        if attributes.get("age"):
            attr_rows.append(("Age", attributes["age"].replace("-", " ").title()))
        if attributes.get("accent"):
            attr_rows.append(("Accent", attributes["accent"]))
        if attributes.get("tone"):
            attr_rows.append(("Tone", ", ".join(attributes["tone"])))
        if attributes.get("timbre"):
            attr_rows.append(("Timbre", ", ".join(attributes["timbre"])))
        if attributes.get("pace"):
            attr_rows.append(("Pace", attributes["pace"].capitalize()))
        if attributes.get("use_case"):
            attr_rows.append(("Best for", ", ".join(
                uc.replace("-", " ") for uc in attributes["use_case"]
            )))
        if attr_rows:
            lines.append("| Attribute | Value |")
            lines.append("| --- | --- |")
            for label, value in attr_rows:
                lines.append(f"| {label} | {value} |")
            lines.append("")

    lines.append(
        "_This voice follows the Audiobook Studio voice spec v1. Download it and drop it into "
        "`tts_voices/`, or import the `.asvoice.zip` from the Voices tab — Studio reads `voice.json` "
        "and registers it automatically._"
    )
    lines.append("")
    lines.append("<!--")
    lines.append(
        "This README is GENERATED from voice.json by the Studio exporter. Don't hand-edit it for a"
    )
    lines.append(
        "real bundle; edit voice.json and regenerate so the page and the machine spec never drift."
    )
    lines.append(
        "The `widget … output.url` above is what makes the sample playable right on the HF page."
    )
    lines.append("-->")
    lines.append("")

    return "\n".join(lines)


def _require_safe_name(name: str, label: str = "voice") -> str:
    clean = (name or "").strip()
    if not SAFE_VOICE_NAME_RE.fullmatch(clean):
        raise VoiceBundleError(f"Invalid {label} name")
    return clean


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _voice_root_or_error(voices_root: Path, voice_name: str) -> Path:
    voice_name = _require_safe_name(voice_name)

    # Rule 9: Discover from the trusted root, then match by entry.name.
    v_root_str = os.path.abspath(os.path.realpath(os.fspath(voices_root)))
    if not os.path.isdir(v_root_str):
        raise VoiceBundleError("Voice not found")

    for entry in os.scandir(v_root_str):
        if not entry.is_dir() or entry.name != voice_name:
            continue

        target_root_str = os.path.abspath(os.path.realpath(entry.path))
        if target_root_str != v_root_str and not target_root_str.startswith(v_root_str + os.sep):
            continue

        manifest_path = os.path.abspath(os.path.realpath(os.path.join(target_root_str, VOICE_MANIFEST_FILENAME)))
        if manifest_path != target_root_str and not manifest_path.startswith(target_root_str + os.sep):
            continue
        if not os.path.exists(manifest_path):
            continue

        return Path(target_root_str)

    raise VoiceBundleError("Voice not found")


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
    voice_manifest["name"] = voice_name
    # D8: drop fields that are forbidden by the bundle schema's additionalProperties:false.
    # `version` (integer storage marker) and `default_variant` (operational, lives in
    # state.json after Phase B migration) must not appear in the exported voice.json.
    for _field in _EXPORT_STRIP_FIELDS:
        voice_manifest.pop(_field, None)
    # Recover default_variant from state.json for any operational logic (none currently).
    _state = load_voice_state(voice_root)
    _default_variant = (
        _state.get("default_variant")
        or ("Default" if any(v.name == "Default" for v in variants) else variants[0].name)
    )

    # E1: Strict schema validation gate — exports must produce valid voice.json.
    # This runs BEFORE writing any bytes so failures are clean raises.
    validate_voice_manifest_strict(voice_manifest)

    variant_entries = []
    included_asset_classes = {"voice_manifest", "variant_manifest"}

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(VOICE_MANIFEST_FILENAME, json.dumps(voice_manifest, indent=2))

        # E2: Generate and include HF-compatible README.md.
        readme_content = generate_readme_md(voice_manifest)
        zf.writestr(README_FILENAME, readme_content)
        included_asset_classes.add("readme")

        for variant_dir in variants:
            variant_manifest = load_variant_manifest(variant_dir)
            variant_manifest["variant_name"] = variant_manifest.get("variant_name") or variant_dir.name

            arc_prefix = variant_dir.name
            zf.writestr(f"{arc_prefix}/{VARIANT_MANIFEST_FILENAME}", json.dumps(variant_manifest, indent=2))

            from ...engines.behavior import get_test_sample_name
            from ...db.speakers import get_speaker_settings

            profile_name = voice_name + " - " + variant_dir.name if variant_dir.name != "Default" else voice_name
            spk_settings = get_speaker_settings(profile_name)
            engine = variant_manifest.get("engine") or spk_settings.get("engine")
            if not engine:
                raise VoiceBundleError(f"No TTS engine configured for variant {variant_dir.name}")
            test_sample = get_test_sample_name(engine)

            effective_model_assets = ({test_sample} if test_sample else set()) | MODEL_ASSET_NAMES
            assets = []
            for filename in sorted(effective_model_assets | PREVIEW_ASSET_NAMES):
                if _add_file(zf, variant_dir / filename, f"{arc_prefix}/{filename}"):
                    assets.append(filename)
                    if filename in effective_model_assets:
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


_ROOT_LEVEL_ACCEPTED = {VOICE_MANIFEST_FILENAME, BUNDLE_MANIFEST_FILENAME, README_FILENAME}


def _valid_payload_paths(paths: Iterable[PurePosixPath]) -> List[PurePosixPath]:
    accepted: List[PurePosixPath] = []
    for path in paths:
        if len(path.parts) == 1 and path.name in _ROOT_LEVEL_ACCEPTED:
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

            # D8: separate operational state from the schema-compliant voice.json.
            # - `version` (integer runtime marker) must NOT appear in voice.json.
            # - `default_variant` is operational; it belongs in state.json only.
            # Determine default_variant before stripping it from the manifest.
            _default_variant = (
                voice_manifest.get("default_variant")
                or ("Default" if any(path.parts[0] == "Default" for path in variant_profile_paths) else variant_profile_paths[0].parts[0])
            )
            for _field in _EXPORT_STRIP_FIELDS:
                voice_manifest.pop(_field, None)
            voice_manifest["name"] = imported_voice_name
            save_voice_manifest(target_root, voice_manifest)

            # Write operational state.json — Studio-managed, never exported.
            save_voice_state(target_root, {"default_variant": _default_variant})

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

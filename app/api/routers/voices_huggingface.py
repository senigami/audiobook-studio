"""Hugging Face voice browse/import/export endpoints.

Mounted under ``/api/voices`` by ``app.api.routers.voices`` (final prefix:
``/api/voices/huggingface/...``). Wraps the domain logic in
``app.domain.voices.huggingface`` — this router owns HTTP concerns only
(request/response shape, error mapping, sourcing the HF token from settings,
containment-checked file writes into the live voices root); the domain module
owns the Hub-facing logic and stays decoupled from FastAPI and the live
voices store.

Endpoint granularity (an explicit, documented call — see the design note
below): the import wizard is split into two endpoints rather than one
end-to-end "import" call:

- ``POST /api/voices/huggingface/import`` — search -> inspect -> consent ->
  download -> register as a new local voice profile with metadata/provenance
  annotated from the card. This is synchronous (HF downloads for a single
  voice's reference audio are small — typically one short audio file plus a
  manifest — so a request/response round trip is acceptable; contrast with
  chapter rendering, which is always an async orchestrator job because it can
  run for minutes).
- Building the actual engine-specific voice asset (cloning) is **not** done
  by this endpoint. It reuses the existing, already-wired
  ``POST /api/speaker-profiles/{name}/build`` job endpoint (an async
  orchestrator task) once the user has picked/confirmed an engine for the
  newly-imported profile — the same path every other "add samples then build"
  voice flow in this app already uses. ``build_voice_asset_from_download`` in
  the domain module remains an explicit, documented stub
  (``status: "not_built"``) because the engine bridge's own
  ``build_voice_asset`` is itself unimplemented for the TTS Server path
  (raises ``NotImplementedError`` in ``app/engines/bridge.py``) — this router
  does not paper over that with a fake synchronous "build".

This granularity call was made by the implementer, not the plan doc; flagged
in the delivery report as something the owner may want to revisit (e.g. an
end-to-end async job that also triggers the build).
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel

from .voices_helpers import (
    _new_voice_profile_dir,
    _new_voice_sample_path,
    get_voices_dir,
    submit_sample_test_job,
)
from ...core.config import TRANSIENT_DIR
from ...db.speakers import sync_speakers_from_profiles
from ...db.state import get_settings
from ...domain.voices.huggingface import (
    HFConsentDecision,
    HFHubClient,
    HFToken,
    HFVoiceCardMetadata,
    annotate_from_card,
    check_consent,
    download_voice_files,
    export_hf_voice_bundle,
    inspect_card,
    search_voices,
    upload_voice_to_hub,
    utc_now_iso,
    validate_hub_id,
)
from ...domain.voices.metadata import find_voice_dir_by_id, update_voice_metadata
from ...utils.pathing import contained_path, safe_basename

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/huggingface", tags=["voices-huggingface"])

# A variant manifest's ``engine`` value is disk-sourced (written at variant
# creation, but also present in imported voices), NOT validated at the API
# boundary — before it is used as a zip arcname segment
# (``assets/<engine_id>/...``) or README text, it must match the same strict
# single-segment shape real engine ids use. Reject (skip assets), never
# silently "fix" (backend-paths rule: reject traversal-style input).
_SAFE_ENGINE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")


def _client() -> HFHubClient:
    """Construct the live Hub client for this request.

    A fresh instance per request is cheap (``HfApi()`` holds no persistent
    connection) and keeps this router stateless / easy to test by monkeypatching
    this function.
    """
    return HFHubClient()


def _token_from_settings() -> HFToken | None:
    """Source the HF token from the settings store (never logged, never echoed)."""
    raw = str(get_settings().get("huggingface_token") or "").strip()
    return HFToken(value=raw) if raw else None


def _card_to_dict(card: HFVoiceCardMetadata) -> dict[str, Any]:
    return {
        "hub_id": card.hub_id,
        "revision": card.revision,
        "license": card.license,
        "is_restrictive_license": card.is_restrictive_license,
        "languages": card.languages,
        "tags": card.tags,
        "author": card.author,
        "description": card.description,
        "sample_url": card.sample_url,
    }


# ---------------------------------------------------------------------------
# GET /api/voices/huggingface/search
# ---------------------------------------------------------------------------


@router.get("/search")
def search_hub_voices(q: str | None = Query(default=None, description="Free-text search query")):
    """Search the Hub for voices tagged ``audiobook-studio-voice``. Public, no token required."""
    try:
        results = search_voices(_client(), query=q)
    except Exception:
        logger.exception("Hugging Face search failed")
        raise HTTPException(status_code=502, detail="Hugging Face search failed.")
    return [
        {"hub_id": r.hub_id, "author": r.author, "tags": r.tags, "likes": r.likes}
        for r in results
    ]


# ---------------------------------------------------------------------------
# GET /api/voices/huggingface/inspect
# ---------------------------------------------------------------------------


@router.get("/inspect")
def inspect_hub_voice(hub_id: str = Query(...), revision: str | None = Query(default=None)):
    """Fetch and parse a single Hub card (license, languages, description, sample URL)."""
    try:
        validate_hub_id(hub_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    try:
        card = inspect_card(_client(), hub_id, revision=revision)
    except Exception:
        logger.exception("Hugging Face card inspection failed for %s", hub_id)
        raise HTTPException(status_code=502, detail="Failed to fetch the Hugging Face voice card.")
    return _card_to_dict(card)


# ---------------------------------------------------------------------------
# POST /api/voices/huggingface/import
# ---------------------------------------------------------------------------


class ImportRequestModel(BaseModel):
    hub_id: str
    revision: str | None = None
    consent: bool = False
    voice_name: str | None = None


@router.post("/import")
def import_hub_voice(body: ImportRequestModel):
    """Import a voice from the Hub into the local voice catalog.

    Flow: validate hub_id -> inspect card -> consent gate -> download ->
    register as a new local voice profile (reference audio saved as raw
    samples) -> annotate metadata + provenance (``source: "imported"``, per
    voice-bundles.md §8.1 — NOT ``"huggingface"``, which is not a valid
    ``source`` enum value).

    Does not build an engine-specific voice asset — see the module docstring
    for why that is a separate, existing endpoint
    (``POST /api/speaker-profiles/{name}/build``).
    """
    try:
        validate_hub_id(body.hub_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    consent_decision: HFConsentDecision = check_consent(user_confirmed=body.consent)
    if not consent_decision.granted:
        raise HTTPException(status_code=422, detail=consent_decision.reason or "Consent not granted.")

    client = _client()
    try:
        card = inspect_card(client, body.hub_id, revision=body.revision)
    except Exception:
        logger.exception("Hugging Face card inspection failed for %s", body.hub_id)
        raise HTTPException(status_code=502, detail="Failed to fetch the Hugging Face voice card.")

    token = _token_from_settings()
    try:
        downloaded_files = download_voice_files(client, body.hub_id, revision=body.revision, token=token)
    except Exception:
        logger.exception("Hugging Face download failed for %s", body.hub_id)
        raise HTTPException(status_code=502, detail="Failed to download voice files from Hugging Face.")

    if not downloaded_files:
        raise HTTPException(status_code=502, detail="Hugging Face repo contained no downloadable files.")

    # Derive a safe local voice name: prefer the caller's chosen name, else
    # fall back to a sanitized "author-repo" slug from hub_id.
    fallback_name = body.hub_id.replace("/", "-")
    voice_name = (body.voice_name or fallback_name).strip() or fallback_name

    try:
        profile_dir = _new_voice_profile_dir(voice_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid voice name: {exc}")
    profile_dir.mkdir(parents=True, exist_ok=True)

    voices_dir = get_voices_dir()
    saved_samples: list[str] = []
    for src in downloaded_files:
        # Only pull audio-looking files in as reference samples; skip manifests,
        # READMEs, etc. Containment-checked write via safe_join_flat under the
        # profile dir (never a raw path join of a Hub-derived filename).
        if src.suffix.lower() not in {".wav", ".mp3", ".flac", ".ogg"}:
            continue
        try:
            dest = _new_voice_sample_path(profile_dir, safe_basename(src.name))
        except ValueError:
            continue
        try:
            dest.write_bytes(src.read_bytes())
        except OSError:
            logger.warning("Failed to copy downloaded HF sample %s into voice profile", src)
            continue
        saved_samples.append(dest.name)

    if not saved_samples:
        raise HTTPException(
            status_code=422,
            detail="No usable audio files (.wav/.mp3/.flac/.ogg) were found in the Hugging Face repo.",
        )

    # voice_dir is profile_dir's parent (the voice root holding voice.json) —
    # _new_voice_profile_dir already created voice.json with {"version": 2, "name": ...}.
    voice_dir = profile_dir.parent
    voice_id = voice_dir.name.lower().replace(" ", "-").replace("_", "-")

    annotated = annotate_from_card(card)
    provenance = {
        "source": "imported",
        "author": card.author or body.hub_id.split("/", 1)[0],
        "consent_ack": True,
        "created_at": utc_now_iso(),
    }

    try:
        updated = update_voice_metadata(
            voices_dir,
            voice_id,
            description=annotated["description"],
            languages=annotated["languages"] or None,
            tags=annotated["tags"] or None,
            provenance=provenance,
        )
    except KeyError:
        raise HTTPException(status_code=500, detail="Voice profile was created but could not be found for annotation.")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=exc.args[0])
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    sync_speakers_from_profiles(voices_dir)

    return {
        "status": "ok",
        "voice_id": voice_id,
        "voice_name": voice_dir.name,
        "profile_name": voice_dir.name,
        "saved_samples": saved_samples,
        "license": card.license,
        "is_restrictive_license": card.is_restrictive_license,
        "metadata": updated,
    }


# ---------------------------------------------------------------------------
# POST /api/voices/huggingface/export
# ---------------------------------------------------------------------------


class ExportRequestModel(BaseModel):
    voice_id: str


def _resolve_publish_variant(voice_dir: Path) -> Path | None:
    """Resolve which variant's sample + engine asset get published together.

    Owner decision (2026-07-12): the published sample must be the one
    already generated by the variant's own model — never a different
    variant's sample paired with this one's engine asset. Uses the exact
    same default-variant fallback chain as ``bundles.export_voice_bundle``
    (state.json's ``default_variant`` -> a directory literally named
    ``"Default"`` -> the first variant alphabetically) so "the currently
    selected model" means the same thing here as everywhere else in Studio.
    """
    from ...domain.voices.bundles import VARIANT_MANIFEST_FILENAME
    from ...domain.voices.manifest import load_voice_state

    variant_dirs = sorted(
        (entry for entry in voice_dir.iterdir() if entry.is_dir() and (entry / VARIANT_MANIFEST_FILENAME).exists()),
        key=lambda p: p.name.lower(),
    )
    if not variant_dirs:
        return None

    state = load_voice_state(voice_dir)
    default_variant = state.get("default_variant")
    if default_variant:
        for entry in variant_dirs:
            if entry.name == default_variant:
                return entry
    for entry in variant_dirs:
        if entry.name == "Default":
            return entry
    return variant_dirs[0]


def _publish_profile_name(voice_name: str, variant_dir: Path) -> str:
    """The speaker-profile name a variant is addressed by elsewhere in the
    app (matches bundles.py:337's convention): the voice name alone for the
    "Default" variant, "<voice> - <variant>" for any other."""
    return voice_name if variant_dir.name == "Default" else f"{voice_name} - {variant_dir.name}"


@router.post("/export")
def export_hub_voice(body: ExportRequestModel, background_tasks: BackgroundTasks):
    """Export an installed voice as a portable ``.asvoice.zip`` for manual upload."""
    voices_dir = get_voices_dir()
    voice_dir = find_voice_dir_by_id(voices_dir, body.voice_id)
    if voice_dir is None:
        raise HTTPException(status_code=404, detail=f"Voice not found: {body.voice_id!r}")

    from ...domain.voices.bundles import MODEL_ASSET_NAMES
    from ...domain.voices.manifest import load_variant_manifest, load_voice_manifest

    manifest = load_voice_manifest(voice_dir)

    # The sample and any engine asset MUST come from the same variant (the
    # owner's explicit requirement) -- resolve one variant and read both
    # from it, rather than looking for a voice-root-level sample that (per
    # this repo's actual on-disk layout) never exists: samples/engine
    # assets live inside each variant's own directory, not at the voice
    # root. The prior lookup here (voice_dir/"samples/preview.mp3" or
    # voice_dir/"sample.mp3") always missed for every real voice.
    variant_dir = _resolve_publish_variant(voice_dir)

    sample_bytes = b""
    sample_engine_id: str | None = None
    engine_assets: dict[str, list[tuple[str, bytes]]] = {}
    if variant_dir is not None:
        try:
            sample_path = contained_path(variant_dir, "sample.mp3")
        except ValueError:
            sample_path = None
        if sample_path is not None and sample_path.exists():
            sample_bytes = sample_path.read_bytes()

        if not sample_bytes:
            # Owner requirement: never publish an empty sample -- generate
            # one first, the same way the "Generate"/"Test" button in Voice
            # Lab does (same job type, same orchestrator submission; see
            # voices_helpers.submit_sample_test_job, shared with
            # POST /{name}/test). The caller retries the publish once the
            # job completes; the frontend surfaces this as a
            # "generating..." state rather than a bare error.
            profile_name = _publish_profile_name(voice_dir.name, variant_dir)
            gen = submit_sample_test_job(profile_name, background_tasks)
            if not gen["ok"]:
                raise HTTPException(status_code=gen["status_code"], detail=gen["message"])
            return {
                "status": "generating",
                "job_id": gen["job_id"],
                "message": "No sample exists yet for this voice -- generating one now. Try publishing again once it completes.",
            }

        variant_manifest = load_variant_manifest(variant_dir)
        engine_id = variant_manifest.get("engine")
        if engine_id and not (isinstance(engine_id, str) and _SAFE_ENGINE_ID_RE.fullmatch(engine_id)):
            logger.warning(
                "Skipping engine assets for voice %r: variant %r declares an unsafe engine id %r",
                body.voice_id,
                variant_dir.name,
                engine_id,
            )
            engine_id = None
        if engine_id:
            sample_engine_id = engine_id
            asset_files: list[tuple[str, bytes]] = []
            for asset_name in sorted(MODEL_ASSET_NAMES):
                try:
                    asset_path = contained_path(variant_dir, asset_name)
                except ValueError:
                    continue
                if asset_path.exists():
                    asset_files.append((asset_name, asset_path.read_bytes()))
            if asset_files:
                engine_assets[engine_id] = asset_files

    icon_bytes: bytes | None = None
    try:
        icon_path = contained_path(voice_dir, "icon.png")
    except ValueError:
        icon_path = None
    if icon_path is not None and icon_path.exists():
        icon_bytes = icon_path.read_bytes()

    export_dir = contained_path(TRANSIENT_DIR, "hf_exports")
    bundle_path = export_hf_voice_bundle(
        voice_manifest=manifest,
        sample_mp3_bytes=sample_bytes,
        output_dir=export_dir,
        bundle_name=safe_basename(body.voice_id),
        icon_bytes=icon_bytes,
        engine_assets=engine_assets or None,
        sample_engine_id=sample_engine_id,
    )
    return {"status": "ok", "bundle_path": str(bundle_path), "bundle_name": bundle_path.name}


# ---------------------------------------------------------------------------
# POST /api/voices/huggingface/upload
# ---------------------------------------------------------------------------


class UploadRequestModel(BaseModel):
    voice_id: str
    hub_id: str
    extra_tags: list[str] = []


@router.post("/upload")
def upload_hub_voice(body: UploadRequestModel, background_tasks: BackgroundTasks):
    """Publish an installed voice's exported bundle files to a Hugging Face repo."""
    try:
        validate_hub_id(body.hub_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    token = _token_from_settings()
    if token is None:
        raise HTTPException(
            status_code=422,
            detail="No Hugging Face access token is configured. Add one in Settings to publish voices.",
        )

    voices_dir = get_voices_dir()
    voice_dir = find_voice_dir_by_id(voices_dir, body.voice_id)
    if voice_dir is None:
        raise HTTPException(status_code=404, detail=f"Voice not found: {body.voice_id!r}")

    export_result = export_hub_voice(ExportRequestModel(voice_id=body.voice_id), background_tasks)
    if export_result.get("status") == "generating":
        # A sample generation job was just kicked off (no sample existed
        # yet for the variant being published) -- propagate the same
        # "generating" signal instead of trying to upload a bundle that
        # doesn't exist yet.
        return export_result
    bundle_path = Path(export_result["bundle_path"])

    import zipfile

    extract_dir = contained_path(TRANSIENT_DIR, "hf_uploads", safe_basename(body.voice_id))
    # Wipe any previous publish's extraction for this voice: the dir is
    # keyed by voice_id and reused, so without this a file that existed in
    # publish N but was removed from the voice before publish N+1 (e.g. a
    # deleted latent.pth) would silently ride along to the Hub again.
    import shutil

    shutil.rmtree(extract_dir, ignore_errors=True)
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(bundle_path) as zf:
        zf.extractall(extract_dir)

    try:
        commit_id = upload_voice_to_hub(
            _client(),
            body.hub_id,
            extract_dir,
            extra_tags=body.extra_tags,
            token=token,
        )
    except Exception:
        logger.exception("Hugging Face upload failed for %s", body.hub_id)
        raise HTTPException(status_code=502, detail="Failed to upload voice to Hugging Face.")

    return {"status": "ok", "hub_id": body.hub_id, "commit_id": commit_id}

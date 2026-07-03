"""Phase C endpoints — voice metadata read/write, search, casting, icon upload.

Routes (all prefixed /api/voices by the parent router):
  GET  /api/voices                          → list with full metadata
  GET  /api/voices/search                   → faceted search
  POST /api/voices/cast                     → casting recommendation
  GET  /api/voices/{id}                     → single voice metadata
  PATCH /api/voices/{id}/metadata           → update attributes/tags/description
  POST /api/voices/{id}/icon                → icon upload
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .voices_helpers import get_voices_dir
from ...domain.voices.metadata import (
    cast_voices,
    get_voice_metadata,
    list_voices_with_metadata,
    find_voice_dir_by_id,
    search_voices,
    update_voice_metadata,
)
from ...domain.voices.manifest import save_voice_manifest, load_voice_manifest
from ...utils.pathing import secure_join_flat

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _voices_dir() -> Path:
    return get_voices_dir()


def _get_or_404(voice_id: str) -> dict[str, Any]:
    meta = get_voice_metadata(_voices_dir(), voice_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Voice not found: {voice_id!r}")
    return meta


# ---------------------------------------------------------------------------
# C1 — GET /api/voices
# ---------------------------------------------------------------------------

@router.get("/")
def list_voices():
    """Return all installed voices with full metadata (attributes, tags, description, languages, image)."""
    return list_voices_with_metadata(_voices_dir())


# ---------------------------------------------------------------------------
# C3 — GET /api/voices/search
# (declared before /{id} so FastAPI matches the literal segment first)
# ---------------------------------------------------------------------------

@router.get("/search")
def search_voices_endpoint(
    q: str | None = Query(default=None, description="Free-text over name/description/tags"),
    class_: str | None = Query(default=None, alias="class"),
    gender: str | None = Query(default=None),
    age: str | None = Query(default=None),
    accent: str | None = Query(default=None),
    tone: list[str] = Query(default=[]),
    timbre: list[str] = Query(default=[]),
    use_case: list[str] = Query(default=[]),
    tag: list[str] = Query(default=[]),
):
    """Filter voices by any combination of attributes and free tags.

    Multi-value params (tone, timbre, use_case, tag) are OR-within-field;
    distinct params are AND-across-fields.
    """
    return search_voices(
        _voices_dir(),
        q=q,
        class_=class_,
        gender=gender,
        age=age,
        accent=accent,
        tone=tone or None,
        timbre=timbre or None,
        use_case=use_case or None,
        tag=tag or None,
    )


# ---------------------------------------------------------------------------
# C4 — POST /api/voices/cast
# ---------------------------------------------------------------------------

class CastingBriefModel(BaseModel):
    contract_version: str = "1.0"
    character: dict[str, Any]
    project_language: str = ""
    catalog: list[dict[str, Any]]
    limit: int = 5


@router.post("/cast")
def cast_voices_endpoint(body: CastingBriefModel):
    """Casting recommendation: rank voices for a character brief.

    Input and output match the casting contract (plan §2.2).
    Unknown ``contract_version`` major or ``card_version`` major → 422.
    """
    try:
        result = cast_voices(
            catalog=body.catalog,
            character=body.character,
            project_language=body.project_language,
            limit=body.limit,
            contract_version=body.contract_version,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return result


# ---------------------------------------------------------------------------
# Single voice GET — must come after /search and /cast (literal segments)
# ---------------------------------------------------------------------------

@router.get("/{voice_id}")
def get_voice_endpoint(voice_id: str):
    """Return full metadata for a single voice."""
    return _get_or_404(voice_id)


# ---------------------------------------------------------------------------
# C2 — PATCH /api/voices/{id}/metadata
# ---------------------------------------------------------------------------

class MetadataPatchModel(BaseModel):
    description: str | None = None
    image: str | None = None
    attributes: dict[str, Any] | None = None
    tags: list[str] | None = None
    languages: list[str] | None = None
    provenance: dict[str, Any] | None = None


@router.patch("/{voice_id}/metadata")
def patch_voice_metadata(voice_id: str, body: MetadataPatchModel):
    """Update voice metadata fields.

    ``attributes`` and ``provenance`` values are strictly validated against their
    controlled vocabularies. Unknown values → 422 with a list of valid values.
    ``provenance`` is a shared field (voice.schema.json §provenance): this endpoint
    only persists what it's given — it does not populate provenance itself. A future
    HuggingFace import module will write it through this same path, decoupled from
    this change.
    """
    try:
        updated = update_voice_metadata(
            _voices_dir(),
            voice_id,
            description=body.description,
            image=body.image,
            attributes=body.attributes,
            tags=body.tags,
            languages=body.languages,
            provenance=body.provenance,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        # exc.args[0] is the errors list from validate_attributes_strict/validate_provenance_strict
        errors = exc.args[0]
        raise HTTPException(status_code=422, detail=errors)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return updated


# ---------------------------------------------------------------------------
# C5 — POST /api/voices/{id}/icon
# ---------------------------------------------------------------------------

_ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
_ICON_FILENAME = "icon.png"


@router.post("/{voice_id}/icon")
async def upload_voice_icon(voice_id: str, file: UploadFile = File(...)):
    """Upload a voice icon.

    Accepts PNG/JPEG/WebP.  Saves as ``icon.png`` in the voice root and
    updates the ``image`` field in ``voice.json``.
    """
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported image type {file.content_type!r}. Use PNG, JPEG, or WebP.",
        )

    voices_dir = _voices_dir()
    voice_dir = find_voice_dir_by_id(voices_dir, voice_id)
    if voice_dir is None:
        raise HTTPException(status_code=404, detail=f"Voice not found: {voice_id!r}")

    # Validate path containment
    trusted_root = os.path.abspath(os.path.realpath(os.fspath(voices_dir)))
    icon_path = os.path.abspath(os.path.realpath(os.path.join(os.fspath(voice_dir), _ICON_FILENAME)))
    if not icon_path.startswith(trusted_root + os.sep):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        data = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to read uploaded file")

    # Validate image dimensions (1:1 required per C5 spec)
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        if w != h:
            raise HTTPException(
                status_code=422,
                detail=f"Icon must be square (1:1 aspect ratio). Got {w}×{h}.",
            )
        # Re-save as PNG regardless of input format
        out_buf = io.BytesIO()
        img.save(out_buf, format="PNG")
        data = out_buf.getvalue()
    except HTTPException:
        raise
    except ImportError:
        # Pillow not installed — skip dimension check, save as-is
        logger.warning("Pillow not available; skipping icon dimension validation")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid image: {exc}")

    # Write atomically
    tmp_path = icon_path + ".tmp"
    try:
        with open(tmp_path, "wb") as fh:
            fh.write(data)
        os.replace(tmp_path, icon_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save icon: {exc}")

    # Update voice.json
    raw = load_voice_manifest(voice_dir)
    raw["image"] = _ICON_FILENAME
    save_voice_manifest(voice_dir, raw)

    return {"status": "ok", "image": _ICON_FILENAME}

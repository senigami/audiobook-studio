import logging
from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse, Response
from .voices_helpers import get_voices_dir
from ...pathing import safe_basename
from ...domain.voices.bundles import VoiceBundleError, export_voice_bundle, import_voice_bundle
from ...db.speakers import sync_speakers_from_profiles

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/{voice_name}/bundle/download")
def download_voice_bundle_route(voice_name: str, include_source_wavs: bool = False):
    from ...domain.voices.migration import migrate_voices_to_v2
    migrate_voices_to_v2()

    try:
        bundle = export_voice_bundle(
            get_voices_dir(),
            voice_name,
            include_source_wavs=include_source_wavs,
        )
    except VoiceBundleError as exc:
        # Rule: allow sanitized domain errors (like 'missing voice.json') while blocking path leaks
        msg = str(exc) if not any(c in str(exc) for c in ["/", "\\", ":"]) else "Voice export failed due to invalid bundle structure"
        return JSONResponse({"status": "error", "message": msg}, status_code=400)
    except Exception as e:
        logger.exception("Failed to export voice bundle for %s", voice_name)
        return JSONResponse({"status": "error", "message": "Voice export failed"}, status_code=500)

    safe_filename = safe_basename(f"{voice_name}.voice.zip")
    return Response(
        bundle,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


@router.post("/bundle/import")
async def import_voice_bundle_route(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".zip"):
        return JSONResponse({"status": "error", "message": "Upload a .zip voice bundle."}, status_code=400)

    try:
        result = import_voice_bundle(get_voices_dir(), await file.read())
        sync_speakers_from_profiles(get_voices_dir())
        return JSONResponse({"status": "ok", **result})
    except VoiceBundleError as exc:
        # Rule: allow sanitized domain errors (like 'missing voice.json') while blocking path leaks
        msg = str(exc) if not any(c in str(exc) for c in ["/", "\\", ":"]) else "Voice import failed due to invalid bundle structure"
        return JSONResponse({"status": "error", "message": msg}, status_code=400)
    except Exception as e:
        logger.exception("Failed to import voice bundle %s", file.filename)
        return JSONResponse({"status": "error", "message": "Voice import failed"}, status_code=500)

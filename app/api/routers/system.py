import uuid
import time
import json
import shutil
import anyio
import logging
from pathlib import Path
from typing import Optional, List, Any
from fastapi import APIRouter, Form, UploadFile, File, Request, Depends, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from ... import config
from ...state import get_settings, update_settings, get_jobs, put_job, update_job
from ...jobs import paused, set_paused, cleanup_and_reconcile, enqueue
from ...db import list_speakers
from ...models import Job
from ...pathing import safe_basename, safe_join_flat
from ..utils import read_preview

# Compatibility for tests that monkeypatch these
UPLOAD_DIR = config.UPLOAD_DIR
CHAPTER_DIR = config.CHAPTER_DIR
COVER_DIR = config.COVER_DIR
AUDIOBOOK_DIR = config.AUDIOBOOK_DIR
VOICES_DIR = config.VOICES_DIR
XTTS_OUT_DIR = config.XTTS_OUT_DIR

logger = logging.getLogger(__name__)


def get_upload_dir() -> Path:
    return UPLOAD_DIR


def get_chapter_dir() -> Path:
    return CHAPTER_DIR


def get_cover_dir() -> Path:
    return COVER_DIR


def get_audiobook_dir() -> Path:
    return AUDIOBOOK_DIR


def get_voices_dir() -> Path:
    return VOICES_DIR


def get_xtts_out_dir() -> Path:
    return XTTS_OUT_DIR

router = APIRouter(prefix="/api", tags=["system"])

@router.get("/home")
def api_home(
    voices_dir: Path = Depends(get_voices_dir),
):
    """Returns initial data for the React SPA."""
    from .voices import list_speaker_profiles

    profiles = list_speaker_profiles()
    speakers = list_speakers()
    settings = get_settings()
    jobs = {j_id: job for j_id, job in get_jobs().items()}

    return {
        "chapters": [],
        "jobs": jobs,
        "settings": settings,
        "paused": paused(),
        "narrator_ok": any(
            entry.is_dir() and entry.name == "Default"
            for entry in voices_dir.iterdir()
        ) if voices_dir.exists() else False,
        "xtts_mp3": [],
        "xtts_wav_only": [],
        "audiobooks": [],
        "speaker_profiles": profiles,
        "speakers": speakers,
    }


@router.post("/settings")
async def save_settings(
    request: Request,
    safe_mode: Optional[Any] = Form(None),
    make_mp3: Optional[Any] = Form(None)
):
    updates = {}

    def to_bool(v):
        if isinstance(v, bool): return v
        s = str(v).lower()
        if s in ("true", "1", "on", "yes"): return True
        if s in ("false", "0", "off", "no"): return False
        return None

    # 1. Try JSON if content-type matches
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            if isinstance(body, dict):
                for k in ["safe_mode", "make_mp3"]:
                    if k in body:
                        val = to_bool(body[k])
                        if val is not None:
                            updates[k] = val
                if "default_engine" in body and str(body["default_engine"]).strip():
                    updates["default_engine"] = str(body["default_engine"]).strip().lower()
                if "voxtral_model" in body:
                    updates["voxtral_model"] = str(body["voxtral_model"] or "").strip()
                if "mistral_api_key" in body:
                    updates["mistral_api_key"] = str(body["mistral_api_key"] or "").strip()
        except Exception:
            logger.warning("Failed to parse JSON settings payload", exc_info=True)

    try:
        form = await request.form()
    except Exception:
        form = None
    if form:
        for k in ["safe_mode", "make_mp3"]:
            if k not in updates and form.get(k) is not None:
                val = to_bool(form.get(k))
                if val is not None:
                    updates[k] = val
        if "default_engine" not in updates and form.get("default_engine") is not None:
            updates["default_engine"] = str(form.get("default_engine") or "").strip().lower()
        if "voxtral_model" not in updates and form.get("voxtral_model") is not None:
            updates["voxtral_model"] = str(form.get("voxtral_model") or "").strip()
        if "mistral_api_key" not in updates and form.get("mistral_api_key") is not None:
            updates["mistral_api_key"] = str(form.get("mistral_api_key") or "").strip()

    # 2. Try Form parameters (either from FastAPI's parsing or manual fallback)
    if "safe_mode" not in updates and safe_mode is not None:
        val = to_bool(safe_mode)
        if val is not None: updates["safe_mode"] = val

    if "make_mp3" not in updates and make_mp3 is not None:
        val = to_bool(make_mp3)
        if val is not None: updates["make_mp3"] = val

    if updates:
        update_settings(updates)

    return JSONResponse({"status": "ok", "settings": get_settings()})

@router.post("/system/import-legacy")
def api_import_legacy():
    from ...db import migrate_state_json_to_db
    migrate_state_json_to_db()
    return JSONResponse({"status": "ok"})

@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    mode: str = "parts",
    max_chars: Optional[int] = None,
    upload_dir: Path = Depends(get_upload_dir),
    chapter_dir: Path = Depends(get_chapter_dir)
):
    file_content = await file.read()
    # Safe basename for protection
    safe_filename = safe_basename(file.filename)

    def process_file():
        try:
            upload_dir.mkdir(parents=True, exist_ok=True)
            temp_path = safe_join_flat(upload_dir, safe_filename)
            temp_path.write_bytes(file_content)
        except Exception as e:
            if isinstance(e, HTTPException): raise
            logger.error(f"Upload failed for {file.filename}: {e}")
            raise HTTPException(status_code=500, detail="Upload failed")

        # Logic to split file
        content = temp_path.read_text(encoding="utf-8", errors="replace")
        import re
        chapter_filenames = []
        chapter_dir.mkdir(parents=True, exist_ok=True)

        # Simple split: "Chapter X:" or similar
        parts = re.split(r'(?i)(Chapter\s+\d+.*?(?:\n|$))', content)
        if len(parts) > 1:
            # Re-assemble
            for i in range(1, len(parts), 2):
                header = parts[i]
                body = parts[i+1] if i+1 < len(parts) else ""
                fname = f"part_{len(chapter_filenames)+1:04d}.txt"
                safe_join_flat(chapter_dir, fname).write_text(
                    header + body, encoding="utf-8"
                )
                chapter_filenames.append(fname)
        else:
            fname = "part_0001.txt"
            safe_join_flat(chapter_dir, fname).write_text(content, encoding="utf-8")
            chapter_filenames.append(fname)
        return chapter_filenames

    chapter_filenames = await anyio.to_thread.run_sync(process_file)

    return JSONResponse({
        "status": "success",
        "filename": safe_filename,
        "chapters": chapter_filenames
    })

@router.post("/create_audiobook")
async def create_audiobook(
    title: str = Form(...),
    author: str = Form(None),
    narrator: str = Form(None),
    chapters: str = Form("[]"),
    cover: Optional[UploadFile] = File(None),
):
    try:
        chapter_list = json.loads(chapters)
    except Exception:
        logger.warning("Invalid chapters payload for audiobook creation", exc_info=True)
        chapter_list = []

    cover_dir = config.COVER_DIR
    audiobook_dir = config.AUDIOBOOK_DIR
    cover_dir.mkdir(parents=True, exist_ok=True)
    audiobook_dir.mkdir(parents=True, exist_ok=True)

    cover_path = None
    if cover:
        try:
            # Use safe basename for filename
            safe_cover_filename = safe_basename(cover.filename)
            ext = Path(safe_cover_filename).suffix
            cover_filename = f"{uuid.uuid4().hex}{ext}"
            dest = safe_join_flat(cover_dir, cover_filename)
            cover_path = str(dest)
            cover_content = await cover.read()

            def save_cover():
                dest.write_bytes(cover_content)

            await anyio.to_thread.run_sync(save_cover)
        except Exception as e:
            if isinstance(e, HTTPException): raise
            logger.error(f"Error saving cover: {e}")
            raise HTTPException(status_code=500, detail="Cover save failed")

    jid = uuid.uuid4().hex[:12]
    j = Job(
        id=jid,
        engine="audiobook",
        chapter_file=title,
        custom_title=title,
        status="queued",
        created_at=time.time(),
        author_meta=author,
        narrator_meta=narrator,
        chapter_list=chapter_list,
        cover_path=cover_path
    )
    put_job(j)
    enqueue(j)
    update_job(jid, force_broadcast=True, status="queued")
    return JSONResponse({"status": "ok", "job_id": jid})

@router.get("/audiobook/prepare")
def api_audiobook_prepare():
    from ..utils import legacy_list_chapters
    chapters = [p.name for p in legacy_list_chapters()]
    return JSONResponse({"status": "ok", "chapters": chapters, "total_duration": 0.0})
@router.post("/settings/default-speaker")
def set_default_speaker_settings(name: str = Form(...)):
    update_settings({"default_speaker_profile": name})
    return JSONResponse({"status": "ok"})

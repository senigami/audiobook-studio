import os
import uuid
import time
import json
import shutil
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Form, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from dataclasses import asdict
from ... import config
from ...state import get_settings, update_settings, get_jobs, put_job, update_job
from ...jobs import paused, set_paused, cleanup_and_reconcile, enqueue
from ...db import list_speakers
from ...models import Job
from ..utils import read_preview, output_exists, xtts_outputs_for, legacy_list_chapters, list_audiobooks

router = APIRouter(prefix="/api", tags=["system"])

@router.get("/home")
def api_home():
    """Returns initial data for the React SPA."""
    cleanup_and_reconcile()

    from .voices import list_speaker_profiles

    profiles = list_speaker_profiles()
    speakers = list_speakers()
    settings = get_settings()

    jobs = {j_id: job for j_id, job in get_jobs().items()}
    chapters = [p.name for p in legacy_list_chapters()]

    xtts_wav_only = []
    xtts_mp3 = []
    for c in chapters:
        stem = Path(c).stem
        if (config.XTTS_OUT_DIR / f"{stem}.mp3").exists():
            xtts_mp3.append(c)
        if (config.XTTS_OUT_DIR / f"{stem}.wav").exists():
            xtts_wav_only.append(c)

    return {
        "chapters": chapters,
        "jobs": jobs,
        "settings": settings,
        "paused": paused(),
        "narrator_ok": (config.VOICES_DIR / "Default").exists(),
        "xtts_mp3": xtts_mp3,
        "xtts_wav_only": xtts_wav_only,
        "audiobooks": list_audiobooks(),
        "speaker_profiles": profiles,
        "speakers": speakers,
    }

@router.post("/settings")
def save_settings(
    safe_mode: Optional[bool] = Form(None),
    make_mp3: Optional[bool] = Form(None)
):
    updates = {}
    if safe_mode is not None: updates["safe_mode"] = safe_mode
    if make_mp3 is not None: updates["make_mp3"] = make_mp3

    if updates:
        update_settings(updates)
    return JSONResponse({"status": "ok", "settings": get_settings()})

@router.post("/speakers/default")
def set_default_speaker(name: str = Form(...)):
    update_settings({"default_speaker_profile": name})
    return JSONResponse({"status": "ok"})

@router.post("/system/import-legacy")
def api_import_legacy():
    from ...db import migrate_state_json_to_db
    migrate_state_json_to_db()
    return JSONResponse({"status": "ok"})

@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    mode: str = "parts",
    max_chars: Optional[int] = None
):
    config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = config.UPLOAD_DIR / file.filename
    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Logic to split file
    content = temp_path.read_text(encoding="utf-8", errors="replace")
    import re
    chapter_filenames = []
    config.CHAPTER_DIR.mkdir(parents=True, exist_ok=True)

    # Simple split: "Chapter X:" or similar
    parts = re.split(r'(?i)(Chapter\s+\d+.*?(?:\n|$))', content)
    if len(parts) > 1:
        # Re-assemble
        for i in range(1, len(parts), 2):
            header = parts[i]
            body = parts[i+1] if i+1 < len(parts) else ""
            fname = f"part_{len(chapter_filenames)+1:04d}.txt"
            (config.CHAPTER_DIR / fname).write_text(header + body, encoding="utf-8")
            chapter_filenames.append(fname)
    else:
        fname = "part_0001.txt"
        (config.CHAPTER_DIR / fname).write_text(content, encoding="utf-8")
        chapter_filenames.append(fname)

    return JSONResponse({"status": "success", "filename": file.filename, "chapters": chapter_filenames})

@router.post("/create_audiobook")
async def create_audiobook(
    title: str = Form(...),
    author: str = Form(None),
    narrator: str = Form(None),
    chapters: str = Form("[]"),
    cover: Optional[UploadFile] = File(None)
):
    try:
        chapter_list = json.loads(chapters)
    except:
        chapter_list = []

    config.COVER_DIR.mkdir(parents=True, exist_ok=True)
    config.AUDIOBOOK_DIR.mkdir(parents=True, exist_ok=True)

    cover_path = None
    if cover:
        ext = Path(cover.filename).suffix
        cover_filename = f"{uuid.uuid4().hex}{ext}"
        cover_path = str(config.COVER_DIR / cover_filename)
        with open(cover_path, "wb") as f:
            shutil.copyfileobj(cover.file, f)

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

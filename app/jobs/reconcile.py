import time
from pathlib import Path
from .core import job_queue, assembly_queue, cancel_flags
from ..state import get_jobs, update_job, delete_jobs
from ..config import CHAPTER_DIR, XTTS_OUT_DIR, AUDIOBOOK_DIR

def _output_exists(engine: str, chapter_file: str, project_id: str = None, make_mp3: bool = True) -> bool:
    # Voice jobs produce sample.wav, not chapter audio; they are always considered "done"
    if engine in ("voice_build", "voice_test"):
        return True

    if not chapter_file: return False
    stem = Path(chapter_file).stem
    if engine == "audiobook":
        if project_id:
            from ..config import get_project_m4b_dir
            return (get_project_m4b_dir(project_id) / f"{chapter_file}.m4b").exists()
        return (AUDIOBOOK_DIR / f"{chapter_file}.m4b").exists()

    if engine == "xtts":
        if project_id:
            from ..config import get_project_audio_dir
            pdir = get_project_audio_dir(project_id)
            mp3 = (pdir / f"{stem}.mp3").exists()
            if not mp3:
                mp3 = (XTTS_OUT_DIR / f"{stem}.mp3").exists()
            wav = (pdir / f"{stem}.wav").exists()
            if not wav:
                wav = (XTTS_OUT_DIR / f"{stem}.wav").exists()
        else:
            pdir = XTTS_OUT_DIR
            mp3 = (pdir / f"{stem}.mp3").exists()
            wav = (pdir / f"{stem}.wav").exists()
    else:
        return False

    if make_mp3:
        return mp3 or wav
    return wav

def cleanup_and_reconcile():
    """
    Perform a complete scan. 
    1. Prune jobs where text file is gone.
    2. Reset 'done' jobs where audio is gone.
    3. Prune audiobook jobs where m4b is gone.
    Returns: List of jids that were reset/affected.
    """
    all_jobs = get_jobs()

    # 1. Prune missing text files & missing audiobooks
    stale_ids = []
    for jid, j in all_jobs.items():
        if j.engine != "audiobook":
            if j.segment_ids:
                continue

            if j.project_id:
                from ..config import get_project_text_dir
                text_path = get_project_text_dir(j.project_id) / j.chapter_file
                if not text_path.exists():
                    text_path = CHAPTER_DIR / j.chapter_file
            else:
                text_path = CHAPTER_DIR / j.chapter_file

            if not text_path.exists():
                if j.id == "mp3-backfill-task" or "Backfill" in j.chapter_file:
                    continue
                stale_ids.append(jid)
        else:
            if j.status == "done" and not (AUDIOBOOK_DIR / f"{j.chapter_file}.m4b").exists():
                stale_ids.append(jid)

        # Prune ANY job that has been finished (done/failed) for more than 5 minutes
        now = time.time()
        if j.status in ("done", "failed", "cancelled") and j.finished_at:
            if now - j.finished_at > 300: # 5 minutes
                stale_ids.append(jid)

    if stale_ids:
        delete_jobs(stale_ids)
        all_jobs = {jid: j for jid, j in all_jobs.items() if jid not in stale_ids}

    # 2. Reconcile missing audio
    reset_ids = []
    for jid, j in all_jobs.items():
        if j.status == "done":
            if j.engine in ("audiobook", "voice_build", "voice_test") or j.id == "mp3-backfill-task" or "Backfill" in (j.chapter_file or ""):
                continue

            if j.segment_ids:
                continue

            exists = _output_exists(
                j.engine, 
                j.chapter_file, 
                project_id=j.project_id, 
                make_mp3=j.make_mp3
            )

            if not exists:
                update_job(jid,
                           status="queued",
                           output_mp3=None,
                           output_wav=None,
                           progress=0.0,
                           started_at=None,
                           finished_at=None,
                           eta_seconds=None,
                           log="Reconcliation: Output missing, resetting to queued.",
                           error=None,
                           warning_count=0)
                reset_ids.append(jid)
            else:
                # Forward-sync to chapters table
                try:
                    from ..db import update_queue_item
                    audio_length = 0.0
                    from ..config import get_project_audio_dir
                    pdir = get_project_audio_dir(j.project_id) if j.project_id else XTTS_OUT_DIR
                    output_file = j.output_mp3 or j.output_wav
                    if output_file:
                        import subprocess
                        audio_path = pdir / output_file
                        if not audio_path.exists():
                            audio_path = XTTS_OUT_DIR / output_file

                        if audio_path.exists():
                            try:
                                result = subprocess.run(
                                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
                                    stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT,
                                    text=True,
                                    timeout=2
                                )
                                audio_length = float(result.stdout.strip())
                            except Exception: pass
                    update_queue_item(jid, "done", audio_length_seconds=audio_length)

                    cid = j.chapter_id
                    if not cid and j.project_id:
                        try:
                            from ..db import list_chapters
                            chaps = list_chapters(j.project_id)
                            for c in chaps:
                                if c.get("id") and j.chapter_file.startswith(c["id"]):
                                    cid = c["id"]
                                    break
                        except: pass

                    if cid:
                        from ..db import update_chapter
                        update_chapter(cid, audio_status='done', audio_file_path=output_file, audio_generated_at=time.time())
                except Exception: pass

    # 3. Requeue the reset jobs
    from . import requeue
    for rid in reset_ids:
        requeue(rid)

    return reset_ids

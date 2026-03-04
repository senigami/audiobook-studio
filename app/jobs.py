import json
import queue
import threading
import time
import traceback
import os
import re
from pathlib import Path
from typing import Dict, Optional

from .models import Job
from .state import get_jobs, put_job, update_job, get_settings, get_performance_metrics, update_performance_metrics
from .config import CHAPTER_DIR, XTTS_OUT_DIR, AUDIOBOOK_DIR, VOICES_DIR, SAMPLES_DIR, SENT_CHAR_LIMIT
from .engines import xtts_generate, xtts_generate_script, wav_to_mp3, assemble_audiobook, stitch_segments

job_queue: "queue.Queue[str]" = queue.Queue()
assembly_queue: "queue.Queue[str]" = queue.Queue()
cancel_flags: Dict[str, threading.Event] = {}
pause_flag = threading.Event()

# These are default fallbacks; the system will auto-tune these over time in state.json
BASELINE_XTTS_CPS = 16.7


def enqueue(job: Job):
    put_job(job)
    cancel_flags[job.id] = threading.Event()
    if job.engine == "audiobook":
        assembly_queue.put(job.id)
    else:
        job_queue.put(job.id)

def requeue(job_id: str):
    """Re-add an existing job id back into the correct worker queue."""
    j = get_jobs().get(job_id)
    if not j: return
    if j.engine == "audiobook":
        assembly_queue.put(job_id)
    else:
        job_queue.put(job_id)

def cancel(job_id: str):
    ev = cancel_flags.get(job_id)
    if ev:
        ev.set()


def clear_job_queue():
    """Empty the in-memory task queues."""
    for q in [job_queue, assembly_queue]:
        while not q.empty():
            try:
                q.get_nowait()
                q.task_done()
            except queue.Empty:
                break


def paused() -> bool:
    return pause_flag.is_set()


def toggle_pause():
    if pause_flag.is_set():
        pause_flag.clear()
    else:
        pause_flag.set()

def set_paused(value: bool):
    if value:
        pause_flag.set()
    else:
        pause_flag.clear()

def _estimate_seconds(text_chars: int, cps: float) -> int:
    return max(5, int(text_chars / max(1.0, cps)))


def format_seconds(seconds: int) -> str:
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h}h {m}m {s}s"
    return f"{m}m {s}s"


def _output_exists(engine: str, chapter_file: str, project_id: Optional[str] = None, make_mp3: bool = True) -> bool:
    stem = Path(chapter_file).stem
    if engine == "audiobook":
        if project_id:
            from .config import get_project_m4b_dir
            return (get_project_m4b_dir(project_id) / f"{chapter_file}.m4b").exists()
        return (AUDIOBOOK_DIR / f"{chapter_file}.m4b").exists()

    if engine == "xtts":
        if project_id:
            from .config import get_project_audio_dir
            pdir = get_project_audio_dir(project_id)
            mp3 = (pdir / f"{stem}.mp3").exists() or (XTTS_OUT_DIR / f"{stem}.mp3").exists()
            wav = (pdir / f"{stem}.wav").exists() or (XTTS_OUT_DIR / f"{stem}.wav").exists()
        else:
            pdir = XTTS_OUT_DIR
            mp3 = (pdir / f"{stem}.mp3").exists()
            wav = (pdir / f"{stem}.wav").exists()
    else:
        return False

    if make_mp3:
        # If MP3 is required but missing, check if WAV exists as a fallback.
        # This prevents reconciliation from resetting a job that is currently converting WAV -> MP3.
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
    from .state import delete_jobs
    all_jobs = get_jobs()

    # 1. Prune missing text files & missing audiobooks
    stale_ids = []
    for jid, j in all_jobs.items():
        if j.engine != "audiobook":
            # Skip pruning for granular segment jobs which don't have a backing text file on disk
            if j.segment_ids:
                continue

            if j.project_id:
                from .config import get_project_text_dir
                text_path = get_project_text_dir(j.project_id) / j.chapter_file
                if not text_path.exists():
                    text_path = CHAPTER_DIR / j.chapter_file
            else:
                text_path = CHAPTER_DIR / j.chapter_file

            if not text_path.exists():
                print(f"DEBUG: Pruning stale job {jid} - text file missing at project dir and legacy {CHAPTER_DIR}")
                stale_ids.append(jid)
        else:
            # For audiobooks, if the m4b is gone AND it's marked done, it's stale.
            # Do NOT prune queued or running jobs just because the file isn't there yet!
            if j.status == "done" and not (AUDIOBOOK_DIR / f"{j.chapter_file}.m4b").exists():
                print(f"DEBUG: Pruning stale audiobook job {jid} - M4B missing")
                stale_ids.append(jid)

        # New: Prune ANY job that has been finished (done/failed) for more than 5 minutes
        now = time.time()
        if j.status in ("done", "failed", "cancelled") and j.finished_at:
            if now - j.finished_at > 300: # 5 minutes
                print(f"DEBUG: Pruning old finished job {jid} (finished {(now-j.finished_at)/60:.1f}m ago)")
                stale_ids.append(jid)

    if stale_ids:
        delete_jobs(stale_ids)
        # Refresh local map for the next step
        all_jobs = {jid: j for jid, j in all_jobs.items() if jid not in stale_ids}

    # 2. Reconcile missing audio
    reset_ids = []
    for jid, j in all_jobs.items():
        if j.status == "done":
            if j.engine == "audiobook":
                continue

            # Segment jobs (from Performance/Listen) don't have a merged output file —
            # they save individual seg_*.wav files directly. Skip them here.
            if j.segment_ids:
                continue

            # Use _output_exists to check the correct path based on project_id
            exists = _output_exists(
                j.engine, 
                j.chapter_file, 
                project_id=j.project_id, 
                make_mp3=j.make_mp3
            )

            if not exists:
                print(f"DEBUG: Resetting job {jid} - audio missing (checked project_id={j.project_id})")
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
                # Forward-sync to chapters table in case the DB got out of sync or lost the queue item
                try:
                    from .db import update_queue_item
                    audio_length = 0.0
                    from .config import get_project_audio_dir
                    pdir = get_project_audio_dir(j.project_id) if j.project_id else XTTS_OUT_DIR
                    output_file = j.output_mp3 or j.output_wav
                    if output_file:
                        import subprocess
                        audio_path = pdir / output_file
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
                except Exception as e:
                    print(f"Warning: Failed to forward-sync job {jid} to SQLite: {e}")

    # 3. Requeue the reset jobs so the worker picks them up
    for rid in reset_ids:
        requeue(rid)

    return reset_ids


def get_speaker_wavs(profile_name_or_id: str) -> Optional[str]:
    """Returns a comma-separated string of absolute paths for the given profile or speaker ID."""
    from .db import get_speaker

    # Resolve speaker ID to profile name if necessary
    target_profile = profile_name_or_id if profile_name_or_id else "Dark Fantasy"

    # Heuristic: if it looks like a UUID, check if it's a speaker ID
    if len(target_profile) == 36 and "-" in target_profile:
        spk = get_speaker(target_profile)
        if spk and spk["default_profile_name"]:
            target_profile = spk["default_profile_name"]

    p = VOICES_DIR / target_profile

    if not p.exists() or not p.is_dir():
        # Fallback to ANY existing profile folder if the requested one is gone
        subdirs = [d for d in VOICES_DIR.iterdir() if d.is_dir() and not d.name.startswith(".")]
        if subdirs:
            p = subdirs[0]
        else:
            return None

    wavs = sorted(p.glob("*.wav"))
    if not wavs:
        return None

    return ",".join([str(w.absolute()) for w in wavs])


def get_speaker_settings(profile_name_or_id: str) -> dict:
    """Returns metadata (like speed and test text) for a profile or speaker ID, falling back to global settings."""
    from .db import get_speaker
    target_profile = profile_name_or_id if profile_name_or_id else "Dark Fantasy"

    # Resolve speaker ID to profile name if necessary
    if len(target_profile) == 36 and "-" in target_profile:
        spk = get_speaker(target_profile)
        if spk and spk["default_profile_name"]:
            target_profile = spk["default_profile_name"]
    p = VOICES_DIR / target_profile

    defaults = get_settings()
    default_test_text = (
        "The mysterious traveler, bathed in the soft glow of the azure twilight, "
        "whispered of ancient treasures buried beneath the jagged mountains. "
        "'Zephyr,' he exclaimed, his voice a mixture of awe and trepidation, "
        "'the path is treacherous, yet the reward is beyond measure.' "
        "Around them, the vibrant forest hummed with rhythmic sounds while a "
        "cold breeze carried the scent of wet earth and weathered stone."
    )

    res = {
        "speed": float(defaults.get("xtts_speed", 1.0)),
        "test_text": default_test_text,
        "speaker_id": None,
        "variant_name": None,
        "built_samples": []
    }

    p = VOICES_DIR / target_profile

    meta_path = p / "profile.json"
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
            if "speed" in meta:
                res["speed"] = meta["speed"]
            if "test_text" in meta:
                res["test_text"] = meta["test_text"]
            if "speaker_id" in meta:
                res["speaker_id"] = meta["speaker_id"]
            if "variant_name" in meta:
                res["variant_name"] = meta["variant_name"]
            if "built_samples" in meta:
                res["built_samples"] = meta["built_samples"]
        except: pass

    return res

def update_speaker_settings(profile_name: str, **updates):
    """Updates metadata for a profile in its profile.json."""
    p = VOICES_DIR / profile_name
    if not p.exists():
        return False

    meta_path = p / "profile.json"
    meta = {}
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
        except: pass

    meta.update(updates)
    meta_path.write_text(json.dumps(meta, indent=2))
    return True

def worker_loop(q: "queue.Queue[str]"):
    while True:
        jid = q.get()
        try:
            j = get_jobs().get(jid)
            if not j:
                continue

            # pause support (unless bypassed by a single-chapter manual enqueue or it's an audiobook job)
            while pause_flag.is_set() and not j.bypass_pause and j.engine != "audiobook":
                time.sleep(0.2)

            cancel_ev = cancel_flags.get(jid) or threading.Event()
            cancel_flags[jid] = cancel_ev

            start_dt = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time()))

            # Prepare initial identity and ETA for immediate UI sync
            chars = 0
            eta = 0
            header = []

            if j.engine != "audiobook":
                if j.project_id:
                    from .config import get_project_text_dir
                    text_path = get_project_text_dir(j.project_id) / j.chapter_file
                else:
                    text_path = CHAPTER_DIR / j.chapter_file

                if text_path.exists():
                    text = text_path.read_text(encoding="utf-8", errors="replace")
                    chars = len(text)
                elif j.segment_ids:
                    # For specific segments, sum ONLY their lengths
                    from .db import get_connection
                    with get_connection() as conn:
                        cursor = conn.cursor()
                        placeholders = ",".join(["?"] * len(j.segment_ids))
                        cursor.execute(f"SELECT SUM(LENGTH(text_content)) FROM chapter_segments WHERE id IN ({placeholders})", j.segment_ids)
                        row = cursor.fetchone()
                        chars = row[0] if row and row[0] else 0
                elif j.is_bake:
                    # For bake, use total length of segments in DB as a proxy
                    from .db import get_connection
                    with get_connection() as conn:
                        cursor = conn.cursor()
                        cursor.execute("SELECT SUM(LENGTH(text_content)) FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                        row = cursor.fetchone()
                        chars = row[0] if row and row[0] else 0

                if chars > 0:
                    perf = get_performance_metrics()
                    cps = perf.get("xtts_cps", BASELINE_XTTS_CPS)
                    eta = _estimate_seconds(chars, cps)

                header = [
                    f"Job Started: {j.chapter_file}\n",
                    f"Started At:  {start_dt}\n",
                    f"Engine: {j.engine.upper()}\n",
                    f"Character Count: {chars:,}\n",
                    f"Predicted Duration: {format_seconds(eta)}\n",
                    "-" * 40 + "\n",
                    "\n"
                ]
            else:
                # Audiobook identity
                if j.project_id:
                    from .config import get_project_audio_dir
                    src_dir = get_project_audio_dir(j.project_id)
                else:
                    src_dir = XTTS_OUT_DIR

                if j.chapter_list:
                    audio_files = [c['filename'] for c in j.chapter_list]
                else:
                    audio_files = [f for f in os.listdir(src_dir) if f.endswith(('.wav', '.mp3'))] if src_dir.exists() else []

                num_files = len(audio_files)
                total_size_mb = sum((src_dir / f).stat().st_size for f in audio_files if (src_dir / f).exists()) / (1024 * 1024) if src_dir.exists() else 0

                perf = get_performance_metrics()
                mult = perf.get("audiobook_speed_multiplier", 1.0)
                base_eta = (num_files * 0.02) + (total_size_mb / 10)
                eta = max(15, int(base_eta * mult))

                header = [
                    f"Job Started: Audiobook {j.chapter_file}\n",
                    f"Started At:  {start_dt}\n",
                    "Engine: AUDIOBOOK ASSEMBLY\n",
                    f"Chapter Files: {num_files}\n",
                    f"Total Source Size: {total_size_mb:.1f} MB\n",
                    f"Predicted Duration: {format_seconds(eta)}\n",
                    "-" * 40 + "\n",
                    "\n"
                ]

            # Trigger immediate UI update with status, ETA, and Log Header
            initial_status = "running" if j.engine == "audiobook" else "preparing"
            initial_start = time.time() if j.engine == "audiobook" else None
            update_job(jid,
                       status=initial_status,
                       project_id=j.project_id,
                       chapter_id=j.chapter_id,
                       chapter_file=j.chapter_file,
                       started_at=initial_start,
                       finished_at=None,
                       progress=0.0,
                       error=None,
                       eta_seconds=eta,
                       log="".join(header))

            # CRITICAL: Synchronize the local 'j' object properties so the on_output
            # closure uses the fresh start state instead of stale data from a previous session.
            j.status = initial_status
            j.progress = 0.0
            j.finished_at = None
            j.log = "".join(header)
            j.error = None
            j.eta_seconds = eta
            j.started_at = initial_start
            j._last_broadcast_p = 0.0 # Track what we just sent in update_job above

            # --- Safety Checks ---
            if j.engine != "audiobook" and not text_path.exists():
                # Allow segment-based jobs to bypass physical file check
                if not (j.segment_ids or j.is_bake):
                    update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=f"Chapter file not found: {j.chapter_file}")
                    continue

            if _output_exists(j.engine, j.chapter_file, project_id=j.project_id, make_mp3=j.make_mp3):
                update_job(jid, status="done", finished_at=time.time(), progress=1.0, log="Skipped: output already exists.")
                continue

            logs = header.copy()
            start = time.time()

            def on_output(line: str):
                s = line.strip()
                now = time.time()
                elapsed = now - start

                # We'll use these to track if we need to broadcast an update
                new_progress = None
                new_log = None
                if not s:
                    # Heartbeat: only update prediction if it's a meaningful change (>1% or >5s since last)
                    current_p = getattr(j, 'progress', 0.0)

                    if not getattr(j, 'synthesis_started_at', None) and j.engine != "audiobook":
                        prog = min(0.01, current_p + 0.001)
                    else:
                        effective_start = j.synthesis_started_at or start
                        actual_elapsed = now - effective_start
                        prog = min(0.98, max(current_p, actual_elapsed / max(1, eta)))

                    last_b = getattr(j, '_last_broadcast_time', 0)
                    last_p = getattr(j, '_last_broadcast_p', 0.0)

                    # Only broadcast heartbeat if it's a meaningful jump or enough time has passed
                    if (prog - last_p >= 0.01) or (now - last_b >= 30.0):
                        prog = round(prog, 2)
                        j.progress = prog
                        j._last_broadcast_time = now
                        j._last_broadcast_p = prog
                        update_job(jid, progress=prog)
                    return

                # 0. Filter out noisy lines provided by XTTS
                if "[START_SYNTHESIS]" in s:
                    j.synthesis_started_at = now
                    j.started_at = now
                    j.status = "running"
                    new_progress = 0.01
                    on_output("Model prepared. Starting synthesis...\n")
                    # Explicitly broadcast status and started_at
                    update_job(jid, status="running", started_at=now, progress=0.01)
                    return
                if s.startswith("> Text"): return
                if s.startswith("> Processing sentence:"): return
                if s.startswith("['") or s.startswith('["'): return
                if s.endswith("']") or s.endswith('"]'): return
                if s.startswith("'") and s.endswith("',"): return # Middle of a list
                if s.startswith('"') and s.endswith('",'): return # Middle of a list
                if "pkg_resources is deprecated" in s: return
                if "Using model:" in s: return
                if "already downloaded" in s: return
                if "futurewarning" in s.lower(): return
                if "loading model" in s.lower(): return
                if "tensorboard" in s.lower(): return
                if "processing time" in s.lower(): return
                if "real-time factor" in s.lower(): return

                # 2. Extract Progress from tqdm if present
                progress_match = re.search(r'(\d+)%', s)
                is_progress_line = progress_match and "|" in s
                if is_progress_line and getattr(j, 'synthesis_started_at', None):
                    try:
                        p_val = round(int(progress_match.group(1)) / 100.0, 2)
                        current_p = getattr(j, 'progress', 0.0)
                        if p_val > current_p:
                            # Note: we don't update j.progress here, we let the consolidated broadcast handle it
                            new_progress = p_val
                    except:
                        pass

                # 3. Handle logs (only if not strictly progress, or if desired in logs)
                # If it's a progress line, we skip adding it to terminal logs to keep them clean
                # unless it contains other useful info (rare for tqdm).
                if not is_progress_line:
                    # Track long sentence warnings as job alerts
                    if "exceeds the character limit of 500" in s:
                        current_warnings = getattr(j, 'warning_count', 0) + 1
                        j.warning_count = current_warnings
                        update_job(jid, warning_count=current_warnings)

                    # Heuristic: only log meaningful lines
                    if not s.startswith("[") and not s.startswith(">"):
                        if len(s) > 20:
                            pass # likely chapter text leaking, skip
                        else:
                            logs.append(line)
                            new_log = "".join(logs)[-20000:]
                    else:
                        logs.append(line)
                        new_log = "".join(logs)[-20000:]

                print(line, end="", flush=True) # Live debug output

                # 4. Consolidated Broadcast
                # Decide if we SHOULD include progress in this update
                broadcast_p = getattr(j, '_last_broadcast_p', 0.0)

                # Update calculation for prediction (prediction floor)
                if new_progress is None:
                    current_p = getattr(j, 'progress', 0.0)

                    # If synthesis hasn't started yet, cap progress at 0.05 (Preparing)
                    if not getattr(j, 'synthesis_started_at', None) and j.engine != "audiobook":
                        new_val = min(0.05, current_p + 0.005)
                    elif getattr(j, 'status', None) == 'finalizing':
                        # Stop predicting during finalization; only use the manually set progress
                        new_val = current_p
                    else:
                        # Use synthesis_started_at for a more accurate elapsed time if available
                        effective_start = getattr(j, 'synthesis_started_at', start)
                        actual_elapsed = now - effective_start
                        new_val = max(current_p, min(0.85, actual_elapsed / max(1, eta)))

                    new_progress = round(new_val, 2)

                # Check threshold against last broadcast
                include_progress = (abs(new_progress - broadcast_p) >= 0.01) or (broadcast_p == 0 and new_progress > 0)

                if new_log is not None or include_progress:
                    j._last_broadcast_time = now
                    args = {}
                    if include_progress:
                        # Ensure internal state matches broadcasted value exactly
                        j.progress = new_progress
                        j._last_broadcast_p = new_progress
                        args['progress'] = new_progress
                    if new_log is not None:
                        args['log'] = new_log
                    update_job(jid, **args)

            def cancel_check():
                return cancel_ev.is_set()

            # --- Generate WAV or Audiobook ---
            if j.engine == "audiobook":
                from .config import get_project_audio_dir, get_project_m4b_dir
                if j.project_id:
                    src_dir = get_project_audio_dir(j.project_id)
                    title = j.chapter_file 
                    out_file = get_project_m4b_dir(j.project_id) / f"{title}.m4b"
                else:
                    src_dir = XTTS_OUT_DIR
                    title = j.chapter_file # We'll repurpose chapter_file to store the book title for audiobook jobs
                    out_file = AUDIOBOOK_DIR / f"{title}.m4b"

                # Collect custom titles from all jobs
                chapter_titles = {
                    val.chapter_file: val.custom_title
                    for val in get_jobs().values()
                    if val.custom_title
                }

                rc = assemble_audiobook(
                    src_dir, title, out_file, on_output, cancel_check,
                    chapter_titles=chapter_titles,
                    author=j.author_meta,
                    narrator=j.narrator_meta,
                    chapters=j.chapter_list,
                    cover_path=j.cover_path
                )

                if rc == 0 and out_file.exists():
                    # --- Auto-tuning feedback ---
                    actual_dur = time.time() - start
                    # Calculate multiplier relative to 'base' prediction (0.1s/file + 0.5s/MB)
                    # We use the same base_eta variables defined in the prediction section
                    learned_mult = actual_dur / max(1.0, base_eta)

                    old_mult = perf.get("audiobook_speed_multiplier", 1.0)
                    # Weighted moving average (60% old, 40% new)
                    updated_mult = (old_mult * 0.6) + (learned_mult * 0.4)
                    update_performance_metrics(audiobook_speed_multiplier=updated_mult)

                    on_output(f"\n[performance] Tuned Audiobook multiplier: {old_mult:.2f} -> {updated_mult:.2f}\n")
                    update_job(jid, status="done", project_id=j.project_id, chapter_id=j.chapter_id, finished_at=time.time(), progress=1.0, output_mp3=out_file.name, log="".join(logs))
                else:
                    update_job(jid, status="failed", project_id=j.project_id, chapter_id=j.chapter_id, finished_at=time.time(), progress=1.0, error=f"Audiobook assembly failed (rc={rc})", log="".join(logs))
                continue

            elif j.engine == "xtts":
                from .config import get_project_audio_dir
                from .db import get_connection
                import json

                if j.project_id:
                    pdir = get_project_audio_dir(j.project_id)
                else:
                    pdir = XTTS_OUT_DIR

                out_wav = pdir / f"{Path(j.chapter_file).stem}.wav"
                out_mp3 = pdir / f"{Path(j.chapter_file).stem}.mp3"

                # Resolve speaker WAVs and settings from profile
                default_sw = get_speaker_wavs(j.speaker_profile)
                spk_settings = get_speaker_settings(j.speaker_profile)
                speed = spk_settings["speed"]

                # NEW: Handle Chapter Baking (Stitching existing segments)
                if j.is_bake and j.chapter_id:
                    on_output(f"Baking Chapter {j.chapter_id} starting...\n")
                    from .db import get_chapter_segments, update_segment
                    from .textops import sanitize_for_xtts, safe_split_long_sentences
                    from .config import SENT_CHAR_LIMIT

                    segs = get_chapter_segments(j.chapter_id)
                    total_segs = len(segs)

                    # 1. Identify missing segments
                    missing_segs = []
                    for s in segs:
                        spath = pdir / (s['audio_file_path'] or f"seg_{s['id']}.wav")
                        if s['audio_status'] != 'done' or not spath.exists():
                            missing_segs.append(s)

                    if missing_segs:
                        # Group missing segments by speaker and proximity for combined generation
                        missing_groups = []
                        if missing_segs:
                            current_group = [missing_segs[0]]
                            for i in range(1, len(missing_segs)):
                                prev = missing_segs[i-1]
                                curr = missing_segs[i]

                                # Check if they are actually consecutive in the full chapter list
                                prev_full_idx = next((idx for idx, s in enumerate(segs) if s['id'] == prev['id']), -1)
                                curr_full_idx = next((idx for idx, s in enumerate(segs) if s['id'] == curr['id']), -1)

                                # Calculate combined length as it will be synthesized (with joining space)
                                trimmed_group_text = " ".join([s['text_content'] for s in current_group])
                                combined_len = len(trimmed_group_text) + 1 + len(curr['text_content'])

                                same_char = curr['character_id'] == prev['character_id']
                                is_consecutive = curr_full_idx == prev_full_idx + 1
                                fits_limit = combined_len <= SENT_CHAR_LIMIT

                                if same_char and is_consecutive and fits_limit:
                                    current_group.append(curr)
                                else:
                                    missing_groups.append(current_group)
                                    current_group = [curr]
                            missing_groups.append(current_group)

                        on_output(f"Smart Bake: {len(missing_segs)} segments need generation. Grouped into {len(missing_groups)} batches.\n")
                        # Debug logging for groups
                        for i, g in enumerate(missing_groups):
                            ids = [s['id'] for s in g]
                            tlen = sum(len(s['text_content']) for s in g)
                            on_output(f"  [Bake Group {i+1}] {len(g)} segments, len={tlen}: {ids}\n")

                        # Build a consolidated script so XTTS loads the model ONCE
                        full_script = []
                        # Map save_path -> group for real-time status updates
                        path_to_group = {}
                        for group in missing_groups:
                            char_profile = group[0].get('speaker_profile_name')
                            sw = get_speaker_wavs(char_profile) or default_sw

                            combined_text = " ".join([s['text_content'] for s in group])
                            if j.safe_mode:
                                combined_text = sanitize_for_xtts(combined_text)
                                combined_text = safe_split_long_sentences(combined_text, target=SENT_CHAR_LIMIT)

                            sid = group[0]['id']
                            seg_out = pdir / f"seg_{sid}.wav"
                            save_path_str = str(seg_out.absolute())

                            full_script.append({
                                "text": combined_text,
                                "speaker_wav": sw,
                                "save_path": save_path_str
                            })
                            path_to_group[save_path_str] = group

                        script_path = pdir / f"bake_{j.id}_script.json"
                        script_path.write_text(json.dumps(full_script), encoding="utf-8")
                        on_output(f"Synthesizing {len(full_script)} groups in a single XTTS session...\n")

                        # Wrap on_output to detect [SEGMENT_SAVED] markers and update segments in real-time
                        groups_completed = [0]
                        def bake_on_output(line):
                            on_output(line)
                            if "[SEGMENT_SAVED]" in line:
                                saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                                group = path_to_group.get(saved_path)
                                if group:
                                    seg_filename = Path(saved_path).name
                                    for s in group:
                                        update_segment(s['id'], audio_status='done', audio_file_path=seg_filename, audio_generated_at=time.time())
                                    groups_completed[0] += 1
                                    prog = (groups_completed[0] / len(missing_groups)) * 0.9
                                    update_job(jid, progress=prog)

                        try:
                            rc = xtts_generate_script(
                                script_json_path=script_path,
                                out_wav=out_wav,
                                on_output=bake_on_output,
                                cancel_check=cancel_check,
                                speed=speed
                            )

                            if rc != 0:
                                # Mark any un-saved groups as error
                                for group in missing_groups:
                                    sid = group[0]['id']
                                    seg_out = pdir / f"seg_{sid}.wav"
                                    if not seg_out.exists():
                                        for s in group:
                                            update_segment(s['id'], audio_status='error')
                        finally:
                            if script_path.exists():
                                script_path.unlink()

                    # 3. Final Stitch
                    if cancel_check(): continue

                    j.status = "finalizing"
                    update_job(jid, status="finalizing", project_id=j.project_id, chapter_id=j.chapter_id, progress=0.91, log="".join(logs)[-20000:])
                    on_output("Stitching all segments into final chapter file...\n")
                    # Refresh segment statuses
                    fresh_segs = get_chapter_segments(j.chapter_id)
                    segment_paths = []
                    last_path = None
                    for s in fresh_segs:
                        if s['audio_status'] == 'done' and s['audio_file_path']:
                            spath = pdir / s['audio_file_path']
                            if spath.exists() and spath != last_path:
                                segment_paths.append(spath)
                                last_path = spath

                    if not segment_paths:
                        update_job(jid, status="failed", error="No valid audio segments found to stitch.", finished_at=time.time())
                        continue

                    from .engines import get_audio_duration
                    rc = stitch_segments(pdir, segment_paths, out_wav, on_output, cancel_check)

                    if rc == 0 and out_wav.exists():
                        duration = get_audio_duration(out_wav)
                        # We don't mark as 'done' yet, we let it fall through to MP3 conversion if needed
                        # Update the DB record now though
                        from .db import update_queue_item
                        update_queue_item(jid, "done", audio_length_seconds=duration)
                    else:
                        update_job(jid, status="failed", error=f"Stitching failed (rc={rc})", finished_at=time.time())
                        continue
                elif j.segment_ids:
                    on_output(f"Processing generation for {len(j.segment_ids)} requested segments...\n")
                    from .db import get_connection, update_segment, get_chapter_segments
                    from .textops import sanitize_for_xtts, safe_split_long_sentences
                    from .config import SENT_CHAR_LIMIT

                    # Fetch all segments for this chapter to determine proximity
                    all_segs = get_chapter_segments(j.chapter_id)
                    requested_ids = set(j.segment_ids)
                    segs_to_gen = [s for s in all_segs if s['id'] in requested_ids]

                    if not segs_to_gen:
                        on_output("No valid segments found to generate.\n")
                        update_job(jid, status="done", progress=1.0)
                        continue

                    # Group consecutive segments by speaker
                    gen_groups = []
                    if segs_to_gen:
                        current_group = [segs_to_gen[0]]
                        for i in range(1, len(segs_to_gen)):
                            prev = segs_to_gen[i-1]
                            curr = segs_to_gen[i]

                            # Check if they are actually consecutive in the full chapter list
                            prev_full_idx = next((idx for idx, s in enumerate(all_segs) if s['id'] == prev['id']), -1)
                            curr_full_idx = next((idx for idx, s in enumerate(all_segs) if s['id'] == curr['id']), -1)

                            trimmed_group_text = " ".join([s['text_content'] for s in current_group])
                            combined_len = len(trimmed_group_text) + 1 + len(curr['text_content'])

                            same_char = curr['character_id'] == prev['character_id']
                            is_consecutive = curr_full_idx == prev_full_idx + 1
                            fits_limit = combined_len <= SENT_CHAR_LIMIT

                            if same_char and is_consecutive and fits_limit:
                                current_group.append(curr)
                            else:
                                gen_groups.append(current_group)
                                current_group = [curr]
                        gen_groups.append(current_group)

                    total_groups = len(gen_groups)
                    on_output(f"Grouped into {total_groups} generation batches.\n")
                    for i, g in enumerate(gen_groups):
                        ids = [s['id'] for s in g]
                        tlen = sum(len(s['text_content']) for s in g)
                        on_output(f"  [Batch {i+1}] {len(g)} segments, len={tlen}: {ids}\n")

                    # Build a consolidated script for single-session XTTS run
                    full_script = []
                    path_to_group = {}
                    for group in gen_groups:
                        char_profile = group[0].get('speaker_profile_name')
                        sw = get_speaker_wavs(char_profile) or default_sw

                        combined_text = "".join([s['text_content'] for s in group])
                        if j.safe_mode:
                            combined_text = sanitize_for_xtts(combined_text)
                            combined_text = safe_split_long_sentences(combined_text, target=SENT_CHAR_LIMIT)

                        first_sid = group[0]['id']
                        seg_out = pdir / f"seg_{first_sid}.wav"
                        save_path_str = str(seg_out.absolute())

                        full_script.append({
                            "text": combined_text,
                            "speaker_wav": sw,
                            "save_path": save_path_str
                        })
                        path_to_group[save_path_str] = group

                    script_path = pdir / f"gen_{j.id}_script.json"
                    script_path.write_text(json.dumps(full_script), encoding="utf-8")
                    on_output(f"Synthesizing {len(full_script)} groups in a single XTTS session...\n")

                    groups_completed = [0]
                    chapter_id_for_broadcast = j.chapter_id

                    def gen_on_output(line):
                        on_output(line)
                        if "[SEGMENT_SAVED]" in line:
                            saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                            group = path_to_group.get(saved_path)
                            if group:
                                seg_filename = Path(saved_path).name
                                for s in group:
                                    # batch: no broadcast per-segment, we'll broadcast once at the end
                                    update_segment(s['id'], broadcast=False, audio_status='done', audio_file_path=seg_filename, audio_generated_at=time.time())
                                groups_completed[0] += 1
                                prog = (groups_completed[0] / len(gen_groups))
                                update_job(jid, progress=prog)

                    try:
                        rc = xtts_generate_script(
                            script_json_path=script_path,
                            out_wav=pdir / f"output_{j.id}.wav", # Scratch output
                            on_output=gen_on_output,
                            cancel_check=cancel_check,
                            speed=speed
                        )

                        if rc != 0:
                            for group in gen_groups:
                                first_sid = group[0]['id']
                                seg_out = pdir / f"seg_{first_sid}.wav"
                                if not seg_out.exists():
                                    for s in group:
                                        update_segment(s['id'], broadcast=False, audio_status='error')
                    finally:
                        if script_path.exists():
                            script_path.unlink()
                        scratch_out = pdir / f"output_{j.id}.wav"
                        if scratch_out.exists():
                            scratch_out.unlink()

                    # Single broadcast now that all segments for this job are finalized
                    if chapter_id_for_broadcast:
                        try:
                            from .web import broadcast_segments_updated
                            broadcast_segments_updated(chapter_id_for_broadcast)
                        except Exception:
                            pass

                    update_job(jid, status="done", progress=1.0, finished_at=time.time())
                    continue

                else:
                    # Check for segment-level character assignments
                    segments_data = []
                    if j.chapter_id:
                        with get_connection() as conn:
                            cursor = conn.cursor()
                            cursor.execute("""
                                SELECT s.text_content, s.character_id, c.speaker_profile_name
                                FROM chapter_segments s
                                LEFT JOIN characters c ON s.character_id = c.id
                                WHERE s.chapter_id = ?
                                ORDER BY s.segment_order
                            """, (j.chapter_id,))
                            segments_data = cursor.fetchall()

                    has_custom_characters = any(s['character_id'] for s in segments_data) if segments_data else False

                    if has_custom_characters:
                        on_output("Detected segment-level character assignments. Using script mode.\n")
                        script = []

                        current_sw = None
                        current_text = ""

                        from .textops import sanitize_for_xtts, safe_split_long_sentences

                        for s in segments_data:
                            if not s['text_content'] or not s['text_content'].strip():
                                continue

                            # Resolve speaker for this segment
                            if s['character_id'] and s['speaker_profile_name']:
                                sw = get_speaker_wavs(s['speaker_profile_name'])
                            else:
                                sw = default_sw

                            # Merge if same voice
                            if current_sw is not None and sw == current_sw:
                                current_text += " " + s['text_content'].strip()
                            else:
                                if current_sw is not None:
                                    processed_text = current_text.strip()
                                    if j.safe_mode:
                                        processed_text = sanitize_for_xtts(processed_text)
                                        processed_text = safe_split_long_sentences(processed_text, target=SENT_CHAR_LIMIT)
                                    script.append({
                                        "text": processed_text,
                                        "speaker_wav": current_sw
                                    })

                                current_sw = sw
                                current_text = s['text_content'].strip()

                        # Add last one
                        if current_sw is not None:
                            processed_text = current_text.strip()
                            if j.safe_mode:
                                processed_text = sanitize_for_xtts(processed_text)
                                processed_text = safe_split_long_sentences(processed_text, target=SENT_CHAR_LIMIT)
                            script.append({
                                "text": processed_text,
                                "speaker_wav": current_sw
                            })

                        # Write script to tmp file
                        script_path = pdir / f"{j.id}_script.json"
                        script_path.write_text(json.dumps(script), encoding="utf-8")
                        on_output(f"[script] Mode: processing {len(script)} merged chunks from {len(segments_data)} segments.\n")

                        try:
                            rc = xtts_generate_script(
                                script_json_path=script_path,
                                out_wav=out_wav,
                                on_output=on_output,
                                cancel_check=cancel_check,
                                speed=speed
                            )
                        finally:
                            if script_path.exists():
                                script_path.unlink()
                    else:
                        # Original single-speaker mode
                        rc = xtts_generate(
                            text=text,
                            out_wav=out_wav,
                            safe_mode=j.safe_mode,
                            on_output=on_output,
                            cancel_check=cancel_check,
                            speaker_wav=default_sw,
                            speed=speed
                        )
            else:
                update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=f"Unknown engine: {j.engine}", log="".join(logs))
                continue

            if cancel_ev.is_set():
                update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.", log="".join(logs))
                continue

            # --- Auto-tuning feedback (TTS) ---
            if rc == 0 and out_wav.exists() and chars > 0 and not getattr(j, 'is_bake', False):
                # Use synthesis_started_at for much more accurate CPS calculation
                effective_start = getattr(j, 'synthesis_started_at', start)
                actual_dur = time.time() - effective_start
                if actual_dur > 0:
                    new_cps = chars / actual_dur
                    field = "xtts_cps"
                    old_cps = perf.get(field, BASELINE_XTTS_CPS)
                    # Smoothed update (80% old, 20% new to avoid outlier fluctuations)
                    updated_cps = (old_cps * 0.8) + (new_cps * 0.2)
                    update_performance_metrics(**{field: updated_cps})

            if rc == 0 and out_wav.exists() and not getattr(j, 'status', None) == 'finalizing':
                j.status = "finalizing"
                update_job(jid, status="finalizing", project_id=j.project_id, chapter_id=j.chapter_id, progress=0.88, log="".join(logs)[-20000:])

            if rc != 0 or not out_wav.exists():
                update_job(
                    jid,
                    status="failed",
                    finished_at=time.time(),
                    progress=1.0,
                    log="".join(logs),
                    error=f"Generation failed (rc={rc})."
                )
                continue

            # --- Convert to MP3 if enabled ---
            if j.make_mp3:
                j.status = "finalizing"
                update_job(jid, status="finalizing", project_id=j.project_id, chapter_id=j.chapter_id, progress=0.99, log="".join(logs)[-20000:])
                frc = wav_to_mp3(out_wav, out_mp3, on_output=on_output, cancel_check=cancel_check)
                logs.append(f"\n[ffmpeg] rc={frc}\n")
                if frc == 0 and out_mp3.exists():
                    update_job(
                        jid,
                        status="done",
                        project_id=j.project_id,
                        chapter_id=j.chapter_id,
                        finished_at=time.time(),
                        progress=1.0,
                        output_wav=out_wav.name,
                        output_mp3=out_mp3.name,
                        log="".join(logs)
                    )
                else:
                    update_job(
                        jid,
                        status="done",
                        project_id=j.project_id,
                        chapter_id=j.chapter_id,
                        finished_at=time.time(),
                        progress=1.0,
                        output_wav=out_wav.name,
                        log="".join(logs),
                        error="MP3 conversion failed (using WAV fallback)"
                    )
            else:
                update_job(
                    jid,
                    status="done",
                    project_id=j.project_id,
                    chapter_id=j.chapter_id,
                    finished_at=time.time(),
                    progress=1.0,
                    output_wav=out_wav.name,
                    log="".join(logs)
                )

        except Exception:
            # This is the critical part: don't let the worker die silently.
            tb = traceback.format_exc()
            try:
                update_job(
                    jid,
                    status="failed",
                    finished_at=time.time(),
                    progress=1.0,
                    error="Worker crashed (exception). See log for traceback.",
                    log=tb[-20000:]
                )
            except Exception:
                # If state writing fails too, at least print to console
                print("FATAL: could not update job state after exception")
                print(tb)
        finally:
            q.task_done()


# Start dedicated workers
synthesis_thread = threading.Thread(target=worker_loop, args=(job_queue,), name="SynthesisWorker", daemon=True)
assembly_thread = threading.Thread(target=worker_loop, args=(assembly_queue,), name="AssemblyWorker", daemon=True)

synthesis_thread.start()
assembly_thread.start()

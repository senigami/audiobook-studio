import time
import os
import re
import threading
import traceback
from pathlib import Path
from .core import (
    job_queue, assembly_queue, cancel_flags, pause_flag,
    BASELINE_XTTS_CPS, _estimate_seconds, format_seconds, calculate_predicted_progress
)
from ..state import get_jobs, update_job, get_performance_metrics, update_performance_metrics
from ..config import CHAPTER_DIR, XTTS_OUT_DIR, AUDIOBOOK_DIR, SAMPLES_DIR
from .reconcile import _output_exists
from .speaker import get_speaker_wavs, get_speaker_settings
from .handlers.audiobook import handle_audiobook_job
from .handlers.xtts import handle_xtts_job

def worker_loop(q):
    while True:
        jid = q.get()
        try:
            j = get_jobs().get(jid)
            if not j or j.id == "mp3-backfill-task":
                continue

            while pause_flag.is_set() and not j.bypass_pause and j.engine != "audiobook":
                time.sleep(0.2)

            cancel_ev = cancel_flags.get(jid) or threading.Event()
            cancel_flags[jid] = cancel_ev

            start_dt = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time()))
            chars = 0
            eta = 0
            header = []
            text = None

            if j.engine != "audiobook":
                if j.project_id:
                    from ..config import get_project_text_dir
                    text_path = get_project_text_dir(j.project_id) / j.chapter_file
                else:
                    text_path = CHAPTER_DIR / j.chapter_file

                if text_path.exists():
                    text = text_path.read_text(encoding="utf-8", errors="replace")
                    chars = len(text)
                elif j.segment_ids:
                    from ..db import get_connection
                    with get_connection() as conn:
                        cursor = conn.cursor()
                        placeholders = ",".join(["?"] * len(j.segment_ids))
                        cursor.execute(f"SELECT SUM(LENGTH(text_content)) FROM chapter_segments WHERE id IN ({placeholders})", j.segment_ids)
                        row = cursor.fetchone()
                        chars = row[0] if row and row[0] else 0
                elif j.is_bake:
                    from ..db import get_connection
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
                    "-" * 40 + "\n\n"
                ]
            else:
                if j.project_id:
                    from ..config import get_project_audio_dir
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
                    "-" * 40 + "\n\n"
                ]

            initial_status = "running" if j.engine == "audiobook" else "preparing"
            initial_start = time.time()

            # Accurate Resumption: Initialize progress from DB if resuming
            initial_progress = 0.0
            if j.chapter_id:
                try:
                    from ..db.chapters import get_chapter_segments_counts
                    done_c, total_c = get_chapter_segments_counts(j.chapter_id)
                    if total_c > 0:
                        initial_progress = round(done_c / total_c, 2)
                except: pass

            # ETA Fix: Adjust started_at to account for past work
            adjusted_start = initial_start - (initial_progress * eta) if eta > 0 else initial_start

            update_job(jid, status=initial_status, started_at=adjusted_start, eta_seconds=eta, log="".join(header), progress=initial_progress)

            j.status = initial_status
            j.progress = initial_progress
            j.log = "".join(header)
            j.started_at = adjusted_start
            j._last_broadcast_p = initial_progress

            if j.engine != "audiobook" and not (text_path.exists() or j.segment_ids or j.is_bake):
                update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=f"Chapter file not found: {j.chapter_file}")
                continue

            if _output_exists(j.engine, j.chapter_file, project_id=j.project_id, make_mp3=j.make_mp3):
                update_job(jid, status="done", finished_at=time.time(), progress=1.0, log="Skipped: output already exists.")
                continue

            logs = header.copy()
            start = adjusted_start

            def on_output(line):
                s = line.strip()
                now = time.time()
                new_progress = None
                new_log = None

                if not s:
                    prog = calculate_predicted_progress(j, now, j.started_at, eta, limit=0.98, prepare_limit=0.01, prepare_step=0.001)
                    last_b = getattr(j, '_last_broadcast_time', 0)
                    last_p = getattr(j, '_last_broadcast_p', 0.0)
                    if (prog - last_p >= 0.01) or (now - last_b >= 30.0):
                        prog = round(prog, 2)
                        j.progress = prog
                        j._last_broadcast_time = now
                        j._last_broadcast_p = prog
                        update_job(jid, progress=prog)
                    return

                if "[START_SYNTHESIS]" in s:
                    j.synthesis_started_at = now
                    j.status = "running"
                    prog = max(j.progress, 0.01)
                    j.progress = prog
                    j.started_at = now - (prog * eta) if eta > 0 else now
                    update_job(jid, status="running", started_at=j.started_at, progress=prog)
                    on_output("Model prepared. Starting synthesis...\n")
                    return

                if "[START_SEGMENT]" in s:
                    try:
                        raw = s.split("[START_SEGMENT]")[1].strip()
                        seg_id = raw
                        # Robustly extract ID from paths or filenames
                        if "/" in raw or "\\" in raw or "." in raw:
                            name = Path(raw).name
                            # Strip .wav, .mp3 etc
                            seg_id = Path(name).stem
                            # If it still has "seg_" prefix (some legacy parts might), strip it
                            if seg_id.startswith("seg_"):
                                seg_id = seg_id[4:]

                        j.active_segment_id = seg_id
                        j.active_segment_progress = 0.0
                        update_job(jid, active_segment_id=seg_id, active_segment_progress=0.0)
                    except Exception as e:
                        logger.warning(f"Failed to parse segment ID from '{s}': {e}")
                    return

                # Filter noise
                if any(x in s.lower() for x in ["> text", "> processing sentence", "pkg_resources is deprecated", "using model:", "already downloaded", "futurewarning", "loading model", "tensorboard", "processing time", "real-time factor"]): return
                if s.startswith(("['", '["', "'", '"')): return

                progress_match = re.search(r'(\d+)%', s)
                is_progress = False
                is_segment = getattr(j, 'active_segment_id', None) is not None
                broadcast_args = {}

                if progress_match:
                    p_val = round(int(progress_match.group(1)) / 100.0, 2)
                    if "[PROGRESS]" in s:
                        is_progress = True
                        if p_val != getattr(j, 'active_segment_progress', -1.0):
                            j.active_segment_progress = p_val
                            broadcast_args['active_segment_progress'] = p_val
                    elif "|" in s or "Synthesizing" in s:
                        is_progress = True
                        if getattr(j, 'synthesis_started_at', None):
                             if p_val > getattr(j, 'progress', 0.0):
                                 new_progress = p_val

                if not is_progress:
                    if "exceeds the character limit" in s:
                        j.warning_count = getattr(j, 'warning_count', 0) + 1
                        update_job(jid, warning_count=j.warning_count)
                    if not (s.startswith(("[", ">")) and len(s) > 20):
                        logs.append(line)
                        new_log = "".join(logs)[-20000:]

                broadcast_p = getattr(j, '_last_broadcast_p', 0.0)
                if new_progress is None:
                    new_progress = round(calculate_predicted_progress(j, now, j.started_at, eta, limit=0.85, prepare_limit=0.05, prepare_step=0.005), 2)

                include_p = new_progress is not None and ((abs(new_progress - broadcast_p) >= 0.01) or (broadcast_p == 0 and new_progress > 0))
                if new_log or include_p or broadcast_args:
                    j._last_broadcast_time = now
                    if include_p:
                        j.progress = new_progress
                        j._last_broadcast_p = new_progress
                        broadcast_args['progress'] = new_progress
                    if new_log: broadcast_args['log'] = new_log
                    update_job(jid, **broadcast_args)

            def cancel_check(): return cancel_ev.is_set()

            if j.engine == "audiobook":
                handle_audiobook_job(jid, j, start, logs, on_output, cancel_check)
                # Auto-tuning handled inside handle_audiobook_job in original code? 
                # (Actually it was split in my implementation plan, let's ensure it's here or there)
            elif j.engine == "xtts":
                from ..config import get_project_audio_dir
                pdir = get_project_audio_dir(j.project_id) if j.project_id else XTTS_OUT_DIR
                out_wav = pdir / f"{Path(j.chapter_file).stem}.wav"
                out_mp3 = pdir / f"{Path(j.chapter_file).stem}.mp3"

                sw = get_speaker_wavs(j.speaker_profile)
                spk = get_speaker_settings(j.speaker_profile)

                handle_xtts_job(jid, j, start, logs, on_output, cancel_check, sw, spk["speed"], pdir, out_wav, out_mp3, text=text)

                # Auto-tuning
                if not getattr(j, 'is_bake', False):
                    eff_start = getattr(j, 'synthesis_started_at', None) or start
                    dur = time.time() - eff_start
                    if dur > 0 and chars > 0:
                        new_cps = chars / dur
                        updated = (perf.get("xtts_cps", BASELINE_XTTS_CPS) * 0.8) + (new_cps * 0.2)
                        update_performance_metrics(xtts_cps=updated)

        except Exception:
            tb = traceback.format_exc()
            try: update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="Worker crashed.", log=tb[-20000:])
            except: print(f"FATAL: could not update job {jid}\n{tb}")
        finally:
            q.task_done()

from __future__ import annotations
import time
import os
import re
import threading
import traceback
import logging
from pathlib import Path

from .core import (
    job_queue, assembly_queue, cancel_flags, pause_flag,
    BASELINE_XTTS_CPS, _estimate_seconds, calculate_predicted_progress,
    get_robust_eta_params,
    PROGRESS_PREPARE_LIMIT, PROGRESS_PREPARE_STEP, PROGRESS_STITCH_LIMIT
)
from .handlers.xtts import handle_xtts_job
from .handlers.voxtral import handle_voxtral_job
from .handlers.mixed import handle_mixed_job
from .handlers.audiobook import handle_audiobook_job
from ..state import get_jobs, update_job, get_performance_metrics
from ..config import CHAPTER_DIR, XTTS_OUT_DIR
from ..pathing import safe_join
from .reconcile import _output_exists
from .speaker import get_speaker_wavs, get_speaker_settings

# New sub-modules
from .worker_helpers import (
    _calculate_group_resume_state, 
    _broadcast_segment_progress,
    _should_stream_predicted_progress, 
    _looks_like_external_download_progress,
    _mark_queue_failed
)
from .worker_metrics import _record_xtts_sample
from .worker_voice import handle_voice_job

logger = logging.getLogger(__name__)


def worker_loop(q):
    while True:
        jid = q.get()
        try:
            j = get_jobs().get(jid)
            if not j:
                continue

            while pause_flag.is_set() and not j.bypass_pause and j.engine != "audiobook":
                time.sleep(0.2)

            cancel_ev = cancel_flags.get(jid) or threading.Event()
            cancel_flags[jid] = cancel_ev

            chars = 0
            eta = 0
            eta_unit_count = 1
            text = None
            perf = get_performance_metrics()
            cps = perf.get("xtts_cps", BASELINE_XTTS_CPS)
            history = perf.get("xtts_render_history", [])
            robust_params = get_robust_eta_params(history, cps)
            voice_job_settings = None

            if j.engine in ("voice_build", "voice_test"):
                voice_job_settings = get_speaker_settings(j.speaker_profile)
                chars = len((voice_job_settings.get("test_text") or "").strip())
                if chars > 0 and voice_job_settings.get("engine", "xtts") == "xtts":
                    perf = get_performance_metrics()
                    cps = perf.get("xtts_cps", BASELINE_XTTS_CPS)
                    eta = _estimate_seconds(chars, cps, group_count=eta_unit_count)
                else:
                    eta = 0
            elif j.engine != "audiobook":
                if j.segment_ids:
                    from ..db import get_connection
                    with get_connection() as conn:
                        cursor = conn.cursor()
                        placeholders = ",".join(["?"] * len(j.segment_ids))
                        cursor.execute(f"SELECT COUNT(*), SUM(LENGTH(text_content)) FROM chapter_segments WHERE id IN ({placeholders})", j.segment_ids)
                        row = cursor.fetchone()
                        eta_unit_count = row[0] if row and row[0] else len(j.segment_ids)
                        chars = row[1] if row and row[1] else 0
                elif j.is_bake:
                    from ..db import get_connection
                    with get_connection() as conn:
                        cursor = conn.cursor()
                        cursor.execute("SELECT COUNT(*), SUM(LENGTH(text_content)) FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                        row = cursor.fetchone()
                        eta_unit_count = row[0] if row and row[0] else 1
                        chars = row[1] if row and row[1] else 0
                elif j.chapter_file:
                    if j.chapter_id:
                        try:
                            from ..db import get_connection
                            with get_connection() as conn:
                                cursor = conn.cursor()
                                cursor.execute("SELECT COUNT(*), SUM(LENGTH(text_content)) FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                                row = cursor.fetchone()
                                eta_unit_count = row[0] if row and row[0] else 1
                                chars = row[1] if row and row[1] else 0
                        except Exception:
                            logger.debug("Failed to calculate ETA unit count from DB, falling back to 1", exc_info=True)
                            eta_unit_count = 1

                    try:
                        if chars <= 0:
                            if j.project_id:
                                from ..config import get_project_text_dir
                                text_path = safe_join(get_project_text_dir(j.project_id), j.chapter_file)
                            else:
                                text_path = safe_join(CHAPTER_DIR, j.chapter_file)

                            text = text_path.read_text(encoding="utf-8", errors="replace")
                            chars = len(text)
                    except (FileNotFoundError, ValueError) as e:
                        logger.debug("Failed to read chapter text for ETA calculation from %s: %s", text_path, e)

                    robust_params = get_robust_eta_params(perf.get("xtts_render_history", []), cps)
                    if j.chapter_id and j.engine != "voxtral":
                        try:
                            from ..db.chapters import get_chapter_segments_counts
                            _, total_c = get_chapter_segments_counts(j.chapter_id)
                            seg_count = max(1, total_c)
                        except Exception:
                            logger.debug("Failed to calculate segment count from DB for ETA, falling back to job state", exc_info=True)
                            seg_count = len(getattr(j, "segment_ids", []) or [1])
                    else:
                        seg_count = len(getattr(j, "segment_ids", []) or [1])

                    eta_unit_count = seg_count
                    eta = _estimate_seconds(chars, cps, group_count=seg_count, robust_params=robust_params)
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
                total_size_mb = 0
                if src_dir.exists():
                    for f in audio_files:
                        try:
                            total_size_mb += safe_join(src_dir, f).stat().st_size
                        except FileNotFoundError:
                            logger.debug("Audiobook assembly skipped size calculation for missing file: %s", f)
                            continue
                total_size_mb /= (1024 * 1024)

                perf = get_performance_metrics()
                mult = perf.get("audiobook_speed_multiplier", 1.0)
                base_eta = (num_files * 0.02) + (total_size_mb / 10)
                eta = int(base_eta * mult)

            initial_status = "running" if j.engine == "audiobook" else "preparing"
            initial_start = time.time()

            initial_progress = 0.0
            completed_render_groups = 0
            render_group_count = 0
            if j.chapter_id and j.engine != "voxtral" and not j.segment_ids:
                initial_progress, completed_render_groups, render_group_count = _calculate_group_resume_state(j)

            adjusted_start = initial_start - (initial_progress * eta) if (eta > 0 and initial_progress > 0) else initial_start

            j._resume_progress = initial_progress
            j._resume_started_at = adjusted_start

            is_audiobook = j.engine == "audiobook"
            send_progress = initial_progress if is_audiobook else 0.0
            send_started = adjusted_start if is_audiobook else None
            send_eta = eta if is_audiobook else None

            update_job(
                jid,
                status=initial_status,
                started_at=send_started,
                eta_seconds=send_eta,
                progress=send_progress,
                completed_render_groups=completed_render_groups,
                render_group_count=render_group_count,
                active_render_group_index=0,
            )

            j.status = initial_status
            j.progress = send_progress
            j.started_at = send_started
            j._last_broadcast_p = send_progress
            j._synthesis_started_once = False
            j.completed_render_groups = completed_render_groups
            j.render_group_count = render_group_count
            j.active_render_group_index = 0

            if j.engine not in ("voice_build", "voice_test") and not j.segment_ids and not j.is_bake and _output_exists(j.engine, j.chapter_file, project_id=j.project_id, make_mp3=j.make_mp3):
                update_job(jid, status="done", finished_at=time.time(), progress=1.0)
                continue

            has_db_chapter_text = bool(j.chapter_id and chars > 0)
            if j.engine not in ("audiobook", "voice_build", "voice_test") and not (text or j.segment_ids or j.is_bake or has_db_chapter_text):
                update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=f"Chapter file not found: {j.chapter_file}")
                continue

            start = adjusted_start

            def on_output(line):
                nonlocal eta
                s = line.strip()
                now = time.time()
                new_progress = None
                lowered = s.lower() if s else ""

                if not s:
                    if _should_stream_predicted_progress(getattr(j, "engine", None)):
                        prog = calculate_predicted_progress(j, now, j.started_at, eta, limit=PROGRESS_STITCH_LIMIT, prepare_limit=PROGRESS_PREPARE_LIMIT, prepare_step=PROGRESS_PREPARE_STEP)
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
                    if getattr(j, "_synthesis_started_once", False):
                        return

                    resume_progress = getattr(j, "_resume_progress", 0.0) or 0.0
                    resume_started_at = getattr(j, "_resume_started_at", None)
                    j._synthesis_started_once = True
                    j.synthesis_started_at = now
                    j.status = "running"
                    prog = resume_progress
                    j.progress = prog

                    if resume_started_at and resume_progress > 0:
                        j.started_at = resume_started_at
                    else:
                        j.started_at = now - (prog * eta) if eta > 0 else now

                    seg_count = 1
                    if j.chapter_id:
                        try:
                            from ..db.chapters import get_chapter_segments_counts
                            _, total_c = get_chapter_segments_counts(j.chapter_id)
                            seg_count = max(1, total_c)
                        except Exception:
                            logger.debug("Failed to calculate segment count from DB for ETA update, falling back to job state", exc_info=True)
                            seg_count = len(getattr(j, "segment_ids", []) or [1])
                    else:
                        seg_count = len(getattr(j, "segment_ids", []) or [1])

                    eta = _estimate_seconds(chars, cps, group_count=seg_count, robust_params=robust_params)
                    update_job(
                        jid,
                        status="running",
                        progress=prog,
                        started_at=j.started_at,
                        eta_seconds=eta,
                    )
                    return

                if "[START_SEGMENT]" in s:
                    try:
                        raw = s.split("[START_SEGMENT]")[1].strip()
                        seg_id = raw
                        if "/" in raw or "\\" in raw or "." in raw:
                            name = Path(raw).name
                            seg_id = Path(name).stem
                            if seg_id.startswith("seg_"):
                                seg_id = seg_id[4:]

                        j.active_segment_id = seg_id
                        j.active_segment_progress = 0.0
                        update_job(jid, active_segment_id=seg_id, active_segment_progress=0.0)
                        _broadcast_segment_progress(j, jid, 0.0)
                    except Exception as e:
                        logger.warning(f"Failed to parse segment ID from '{s}': {e}")
                    return

                progress_match = re.search(r'(\d+)%', s)
                is_progress = False
                broadcast_args = {}

                if progress_match:
                    p_val = round(int(progress_match.group(1)) / 100.0, 2)
                    if "[PROGRESS]" in s:
                        is_progress = True
                        if p_val != getattr(j, 'active_segment_progress', -1.0):
                            j.active_segment_progress = p_val
                            broadcast_args['active_segment_progress'] = p_val
                            _broadcast_segment_progress(j, jid, p_val)

                if not is_progress:
                    if "exceeds the character limit" in s:
                        j.warning_count = getattr(j, 'warning_count', 0) + 1
                        update_job(jid, warning_count=j.warning_count)

                broadcast_p = getattr(j, '_last_broadcast_p', 0.0)
                if new_progress is None and _should_stream_predicted_progress(getattr(j, "engine", None)):
                    new_progress = round(calculate_predicted_progress(j, now, j.started_at, eta), 2)

                include_p = new_progress is not None and ((abs(new_progress - broadcast_p) >= 0.01) or (broadcast_p == 0 and new_progress > 0))
                if include_p or broadcast_args:
                    j._last_broadcast_time = now
                    if include_p:
                        j.progress = new_progress
                        j._last_broadcast_p = new_progress
                        broadcast_args['progress'] = new_progress
                    update_job(jid, **broadcast_args)

            def cancel_check(): return cancel_ev.is_set()

            if j.engine == "audiobook":
                handle_audiobook_job(jid, j, start, on_output, cancel_check)
            elif j.engine == "xtts":
                from ..config import get_project_audio_dir, get_chapter_dir, get_project_storage_version

                if j.project_id and j.chapter_id and get_project_storage_version(j.project_id) >= 2:
                    pdir = get_chapter_dir(j.project_id, j.chapter_id)
                    out_wav = pdir / "chapter.wav"
                    out_mp3 = pdir / "chapter.mp3"
                else:
                    pdir = get_project_audio_dir(j.project_id) if j.project_id else XTTS_OUT_DIR
                    out_wav = pdir / f"{Path(j.chapter_file).stem}.wav"
                    out_mp3 = pdir / f"{Path(j.chapter_file).stem}.mp3"

                pdir.mkdir(parents=True, exist_ok=True)
                sw = get_speaker_wavs(j.speaker_profile)
                spk = get_speaker_settings(j.speaker_profile)
                version = get_project_storage_version(j.project_id) if j.project_id else 1
                handle_xtts_job(jid, j, start, on_output, cancel_check, sw, spk["speed"], pdir, out_wav, out_mp3, text=text, storage_version=version)
                _record_xtts_sample(j, start, chars, perf, eta_unit_count)
            elif j.engine == "voxtral":
                result = handle_voxtral_job(jid, j, start, on_output, cancel_check, text=text)
                if result == "cancelled":
                    update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
            elif j.engine == "mixed":
                result = handle_mixed_job(jid, j, start, on_output, cancel_check, text=text)
                if result == "cancelled":
                    update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
                else:
                    _record_xtts_sample(j, start, chars, perf, eta_unit_count)
            elif j.engine in ("voice_build", "voice_test"):
                handle_voice_job(jid, j, on_output, cancel_check, voice_job_settings=voice_job_settings)

        except Exception:
            tb = traceback.format_exc()
            logger.error(f"Worker crashed for job {jid}:\n{tb}")
            try:
                _mark_queue_failed(jid, "Worker crashed.")
            except Exception:
                logger.critical(f"FATAL: could not update job {jid} failure state")
        finally:
            q.task_done()

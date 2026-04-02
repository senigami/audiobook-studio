import time
import os
import re
import threading
import traceback
import logging
from pathlib import Path
from .core import (
    job_queue, assembly_queue, cancel_flags, pause_flag,
    BASELINE_XTTS_CPS, _estimate_seconds, format_seconds, calculate_predicted_progress,
    PROGRESS_PREPARE_LIMIT, PROGRESS_PREPARE_STEP, PROGRESS_MAX_PREDICTED, PROGRESS_STITCH_LIMIT
)

from .handlers.xtts import handle_xtts_job
from .handlers.voxtral import handle_voxtral_job
from .handlers.mixed import handle_mixed_job
from ..state import get_jobs, update_job, get_performance_metrics, update_performance_metrics
from ..config import CHAPTER_DIR, XTTS_OUT_DIR, AUDIOBOOK_DIR, SAMPLES_DIR
from ..pathing import safe_join
from .reconcile import _output_exists
from .speaker import get_speaker_wavs, get_speaker_settings, get_voice_profile_dir
from .handlers.audiobook import handle_audiobook_job
from ..engines import wav_to_mp3
from ..engines_voxtral import VoxtralError, voxtral_generate

logger = logging.getLogger(__name__)


def _calculate_group_resume_state(job) -> tuple[float, int, int]:
    if not getattr(job, "chapter_id", None):
        return 0.0, 0, 0

    try:
        from ..chunk_groups import build_chunk_groups, load_chunk_segments

        groups = build_chunk_groups(load_chunk_segments(job.chapter_id), job.speaker_profile)
        if not groups:
            return 0.0, 0, 0

        completed_groups = 0
        for group in groups:
            segments = group.get("segments", [])
            if not segments:
                continue
            if all(segment.get("audio_status") == "done" and segment.get("audio_file_path") for segment in segments):
                completed_groups += 1

        return round(completed_groups / len(groups), 2), completed_groups, len(groups)
    except Exception:
        logger.error("Failed to get grouped chapter progress for resume initialization", exc_info=True)
        return 0.0, 0, 0


def _calculate_group_resume_progress(job) -> float:
    progress, _, _ = _calculate_group_resume_state(job)
    return progress


def _broadcast_segment_progress(j, jid: str, progress: float):
    segment_id = getattr(j, "active_segment_id", None)
    if not segment_id:
        return
    try:
        from ..api.ws import broadcast_segment_progress
        broadcast_segment_progress(jid, getattr(j, "chapter_id", None), segment_id, progress)
    except Exception:
        logger.debug("Failed to broadcast segment progress for %s", jid, exc_info=True)


def _should_stream_predicted_progress(engine: str | None) -> bool:
    return engine == "audiobook"


def _looks_like_external_download_progress(line: str, lowered: str | None = None) -> bool:
    lowered = lowered or line.lower()
    if "%|" not in line or ":" not in line:
        return False
    if "[progress]" in lowered or "synthesizing" in lowered:
        return False
    if any(token in lowered for token in ["downloading (", "fetching ", "converting "]):
        return True
    return bool(re.search(r"[a-z0-9._-]+\.(json|txt|bin|pth|pt|ckpt|onnx|safetensors)(?:\.[a-z0-9]+)*:", lowered))

def _mark_queue_failed(jid: str, error_message: str | None = None):
    try:
        from ..db import update_queue_item
        update_queue_item(jid, "failed")
    except Exception as e:
        logger.warning("Could not mark queue item %s failed: %s", jid, e, exc_info=True)

    if error_message:
        try:
            update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=error_message)
        except Exception as e:
            logger.warning("Could not update failed job state for %s: %s", jid, e, exc_info=True)

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

            chars = 0
            eta = 0
            text = None
            voice_job_settings = None

            if j.engine in ("voice_build", "voice_test"):
                voice_job_settings = get_speaker_settings(j.speaker_profile)
                chars = len((voice_job_settings.get("test_text") or "").strip())
                if chars > 0 and voice_job_settings.get("engine", "xtts") == "xtts":
                    perf = get_performance_metrics()
                    cps = perf.get("xtts_cps", BASELINE_XTTS_CPS)
                    eta = _estimate_seconds(chars, cps)
                else:
                    eta = max(15, eta)
            elif j.engine != "audiobook":
                if j.segment_ids:
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
                elif j.chapter_file:
                    try:
                        if j.project_id:
                            from ..config import get_project_text_dir
                            text_path = safe_join(get_project_text_dir(j.project_id), j.chapter_file)
                        else:
                            text_path = safe_join(CHAPTER_DIR, j.chapter_file)

                        text = text_path.read_text(encoding="utf-8", errors="replace")
                        chars = len(text)
                    except (FileNotFoundError, ValueError):
                        pass

                if chars > 0:
                    perf = get_performance_metrics()
                    cps = perf.get("xtts_cps", BASELINE_XTTS_CPS)
                    eta = _estimate_seconds(chars, cps)
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
                            continue
                total_size_mb /= (1024 * 1024)

                perf = get_performance_metrics()
                mult = perf.get("audiobook_speed_multiplier", 1.0)
                base_eta = (num_files * 0.02) + (total_size_mb / 10)
                eta = max(15, int(base_eta * mult))

            initial_status = "running" if j.engine == "audiobook" else "preparing"
            initial_start = time.time()

            # Accurate Resumption: Initialize progress from DB if resuming
            initial_progress = 0.0
            completed_render_groups = 0
            render_group_count = 0
            if j.chapter_id and j.engine != "voxtral" and not j.segment_ids:
                initial_progress, completed_render_groups, render_group_count = _calculate_group_resume_state(j)

            # ETA Fix: Adjust started_at to account for past work
            adjusted_start = initial_start - (initial_progress * eta) if (eta > 0 and initial_progress > 0) else initial_start

            # Only send started_at if we are actually resuming (p > 0)
            update_job(
                jid,
                status=initial_status,
                started_at=adjusted_start if initial_progress > 0 else None,
                eta_seconds=eta,
                progress=initial_progress,
                completed_render_groups=completed_render_groups,
                render_group_count=render_group_count,
                active_render_group_index=0,
            )

            j.status = initial_status
            j.progress = initial_progress
            j.started_at = adjusted_start
            j._last_broadcast_p = initial_progress
            j._synthesis_started_once = False
            j.completed_render_groups = completed_render_groups
            j.render_group_count = render_group_count
            j.active_render_group_index = 0

            # Skip output check if we are doing a segment rebuild or a bake, to ensure we don't skip due to a stale full-chapter wav
            # Never skip voice_build/voice_test — they must always run synthesis
            if j.engine not in ("voice_build", "voice_test") and not j.segment_ids and not j.is_bake and _output_exists(j.engine, j.chapter_file, project_id=j.project_id, make_mp3=j.make_mp3):
                update_job(jid, status="done", finished_at=time.time(), progress=1.0)
                continue

            if j.engine not in ("audiobook", "voice_build", "voice_test") and not (text or j.segment_ids or j.is_bake):
                update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=f"Chapter file not found: {j.chapter_file}")
                continue

            start = adjusted_start

            def on_output(line):
                raw_line = line
                s = line.strip()
                now = time.time()
                new_progress = None
                lowered = s.lower() if s else ""
                is_download_progress = _looks_like_external_download_progress(s, lowered) if s else False

                def log_terminal(message: str):
                    return None

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

                    previous_progress = getattr(j, "progress", 0.0) or 0.0
                    previous_started_at = getattr(j, "started_at", None)
                    j._synthesis_started_once = True
                    j.synthesis_started_at = now
                    j.status = "running"
                    prog = max(previous_progress, PROGRESS_PREPARE_LIMIT)
                    j.progress = prog

                    update_args = {"status": "running", "progress": prog}
                    if previous_started_at is None or previous_progress <= 0:
                        j.started_at = now - (prog * eta) if eta > 0 else now
                        update_args["started_at"] = j.started_at

                    update_job(jid, **update_args)
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
                from ..config import get_project_audio_dir
                pdir = get_project_audio_dir(j.project_id) if j.project_id else XTTS_OUT_DIR
                pdir.mkdir(parents=True, exist_ok=True)
                out_wav = pdir / f"{Path(j.chapter_file).stem}.wav"
                out_mp3 = pdir / f"{Path(j.chapter_file).stem}.mp3"

                sw = get_speaker_wavs(j.speaker_profile)
                spk = get_speaker_settings(j.speaker_profile)

                handle_xtts_job(jid, j, start, on_output, cancel_check, sw, spk["speed"], pdir, out_wav, out_mp3, text=text)
            elif j.engine == "voxtral":
                result = handle_voxtral_job(jid, j, start, on_output, cancel_check, text=text)
                if result == "cancelled":
                    update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
                return
            elif j.engine == "mixed":
                result = handle_mixed_job(jid, j, start, on_output, cancel_check, text=text)
                if result == "cancelled":
                    update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
                return
            elif j.engine in ("voice_build", "voice_test"):
                from ..config import VOICES_DIR
                pdir = VOICES_DIR / j.speaker_profile
                pdir.mkdir(parents=True, exist_ok=True)

                # For voice_test or missing sample.wav, generate one. voice_build always rebuilds.
                sample_path = pdir / "sample.wav"
                if j.engine in ("voice_build", "voice_test") or not sample_path.exists():
                    on_output(f"Generating test sample for {j.speaker_profile}...\n")
                    spk = voice_job_settings or get_speaker_settings(j.speaker_profile)
                    sw = get_speaker_wavs(j.speaker_profile)
                    try:
                        voice_profile_dir = get_voice_profile_dir(j.speaker_profile)
                    except ValueError:
                        voice_profile_dir = None
                    engine = spk.get("engine", "xtts")
                    if engine == "voxtral":
                        try:
                            rc = voxtral_generate(
                                text=spk["test_text"],
                                out_wav=sample_path,
                                on_output=on_output,
                                cancel_check=cancel_check,
                                profile_name=j.speaker_profile,
                                voice_id=spk.get("voxtral_voice_id"),
                                model=spk.get("voxtral_model"),
                                reference_sample=spk.get("reference_sample"),
                            )
                        except VoxtralError as exc:
                            _mark_queue_failed(jid, str(exc))
                            return
                    else:
                        from ..engines import xtts_generate
                        rc = xtts_generate(
                            text=spk["test_text"],
                            out_wav=sample_path,
                            safe_mode=True,
                            on_output=on_output,
                            cancel_check=cancel_check,
                            speaker_wav=sw,
                            speed=spk["speed"],
                            voice_profile_dir=voice_profile_dir
                        )
                    if rc != 0:
                        _mark_queue_failed(jid, "Voice synthesis failed.")
                        return

                    sample_mp3 = pdir / "sample.mp3"
                    mp3_rc = wav_to_mp3(sample_path, sample_mp3, on_output=on_output, cancel_check=cancel_check)
                    if mp3_rc == 0 and sample_mp3.exists():
                        try:
                            sample_path.unlink()
                        except FileNotFoundError:
                            pass
                    else:
                        logger.warning(
                            "Failed to convert voice sample for %s to mp3; keeping wav fallback",
                            j.speaker_profile,
                        )

                    # After success: mark samples as built if this was a build job
                    if j.engine == "voice_build" or j.engine == "voice_test":
                        try:
                            from .speaker import update_speaker_settings
                            raw_wavs = sorted([
                                f.name for f in pdir.glob("*.wav")
                                if f.name not in {"sample.wav", "sample.mp3"}
                            ])
                            update_speaker_settings(
                                j.speaker_profile,
                                built_samples=raw_wavs,
                                preview_test_text=spk["test_text"],
                                preview_engine=engine,
                                preview_reference_sample=spk.get("reference_sample"),
                                preview_voxtral_voice_id=spk.get("voxtral_voice_id"),
                                preview_voxtral_model=spk.get("voxtral_model"),
                            )
                            on_output(f"Updated build samples for {j.speaker_profile}.\n")
                        except Exception as e:
                            logger.error(f"Error updating build samples for {j.speaker_profile}: {e}")

                update_job(jid, status="done", progress=1.0, finished_at=time.time())
                # Mark done in the DB queue so sync_memory_queue doesn't re-enqueue on server restart
                try:
                    from ..db import update_queue_item
                    update_queue_item(jid, "done")
                except Exception as _qe:
                    logger.warning(f"Could not mark voice job {jid} done in DB queue: {_qe}")

                # Auto-tuning
                if not getattr(j, 'is_bake', False):
                    eff_start = getattr(j, 'synthesis_started_at', None) or start
                    dur = time.time() - eff_start
                    if dur > 0 and chars > 0 and engine == "xtts":
                        new_cps = chars / dur
                        updated = (perf.get("xtts_cps", BASELINE_XTTS_CPS) * 0.8) + (new_cps * 0.2)
                        update_performance_metrics(xtts_cps=updated)

        except Exception:
            tb = traceback.format_exc()
            logger.error(f"Worker crashed for job {jid}:\n{tb}")
            try: 
                _mark_queue_failed(jid, "Worker crashed.")
            except Exception:
                logger.critical(f"FATAL: could not update job {jid} failure state")
        finally:
            q.task_done()

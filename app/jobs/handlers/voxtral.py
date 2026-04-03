import time
import logging
from pathlib import Path

from ...config import XTTS_OUT_DIR, get_project_audio_dir
from ...engines import wav_to_mp3
from ...engines_voxtral import VoxtralError, voxtral_generate
from ...state import update_job
from ..speaker import get_speaker_settings

logger = logging.getLogger(__name__)


def _chapter_text_from_segments(chapter_id: str) -> str:
    from ...db import get_connection

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT text_content
            FROM chapter_segments
            WHERE chapter_id = ?
            ORDER BY segment_order
            """,
            (chapter_id,),
        )
        return " ".join((row["text_content"] or "").strip() for row in cursor.fetchall() if (row["text_content"] or "").strip())


def _chapter_uses_multiple_profiles(job) -> bool:
    if not job.chapter_id:
        return False

    from ...db import get_connection

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.character_id, c.speaker_profile_name
            FROM chapter_segments s
            LEFT JOIN characters c ON s.character_id = c.id
            WHERE s.chapter_id = ?
            ORDER BY s.segment_order
            """,
            (job.chapter_id,),
        )
        profiles = {
            (row["speaker_profile_name"] or job.speaker_profile or "").strip()
            for row in cursor.fetchall()
            if (row["speaker_profile_name"] or job.speaker_profile)
        }
        return len(profiles) > 1


def handle_voxtral_job(jid, j, start, on_output, cancel_check, text=None):
    from ...db import get_connection, update_segments_status_bulk

    if cancel_check():
        update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
        return "cancelled"

    if j.segment_ids or j.is_bake:
        update_job(
            jid,
            status="failed",
            finished_at=time.time(),
            progress=1.0,
            error="Voxtral segment and bake rendering land in a later issue.",
        )
        return "failed"

    if _chapter_uses_multiple_profiles(j):
        update_job(
            jid,
            status="failed",
            finished_at=time.time(),
            progress=1.0,
            error="This chapter uses multiple voice profiles. Mixed Voxtral rendering lands in a later issue.",
        )
        return "failed"

    pdir = get_project_audio_dir(j.project_id) if j.project_id else XTTS_OUT_DIR
    pdir.mkdir(parents=True, exist_ok=True)
    out_wav = pdir / f"{Path(j.chapter_file).stem}.wav"
    out_mp3 = pdir / f"{Path(j.chapter_file).stem}.mp3"

    spk = get_speaker_settings(j.speaker_profile) if j.speaker_profile else {}
    render_text = text or (_chapter_text_from_segments(j.chapter_id) if j.chapter_id else "")
    logger.info(
        "[voxtral-debug %s] start job=%s chapter=%s profile=%s make_mp3=%s out_wav=%s out_mp3=%s text_len=%s",
        time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
        jid,
        j.chapter_id,
        j.speaker_profile,
        getattr(j, "make_mp3", False),
        out_wav,
        out_mp3,
        len(render_text),
    )
    if not render_text.strip():
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="No text was available for Voxtral synthesis.")
        return "failed"

    try:
        logger.info("[voxtral-debug %s] calling voxtral_generate job=%s", time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()), jid)
        rc = voxtral_generate(
            text=render_text,
            out_wav=out_wav,
            on_output=on_output,
            cancel_check=cancel_check,
            profile_name=j.speaker_profile,
            voice_id=spk.get("voxtral_voice_id"),
            model=spk.get("voxtral_model"),
            reference_sample=spk.get("reference_sample"),
        )
        logger.info(
            "[voxtral-debug %s] voxtral_generate returned job=%s rc=%s wav_exists=%s",
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            jid,
            rc,
            out_wav.exists(),
        )
    except VoxtralError as exc:
        logger.info("[voxtral-debug %s] voxtral_generate error job=%s error=%s", time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()), jid, exc)
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=str(exc))
        return "failed"

    if cancel_check():
        update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
        return "cancelled"

    if rc != 0 or not out_wav.exists():
        logger.info(
            "[voxtral-debug %s] synthesis failed job=%s rc=%s wav_exists=%s",
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            jid,
            rc,
            out_wav.exists(),
        )
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="Voxtral synthesis failed.")
        return "failed"

    if j.make_mp3:
        logger.info("[voxtral-debug %s] finalizing mp3 job=%s wav=%s", time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()), jid, out_wav)
        update_job(jid, status="finalizing", progress=0.99)
        frc = wav_to_mp3(out_wav, out_mp3, on_output=on_output, cancel_check=cancel_check)
        logger.info(
            "[voxtral-debug %s] wav_to_mp3 returned job=%s rc=%s mp3_exists=%s",
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            jid,
            frc,
            out_mp3.exists(),
        )
        if frc == 0 and out_mp3.exists():
            logger.info(
                "[voxtral-debug %s] marking done job=%s wav=%s mp3=%s",
                time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
                jid,
                out_wav.name,
                out_mp3.name,
            )
            update_job(jid, status="done", finished_at=time.time(), progress=1.0, output_wav=out_wav.name, output_mp3=out_mp3.name)
            return "done"

        logger.info(
            "[voxtral-debug %s] marking done with wav fallback job=%s wav=%s",
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            jid,
            out_wav.name,
        )
        update_job(jid, status="done", finished_at=time.time(), progress=1.0, output_wav=out_wav.name, error="MP3 conversion failed (using WAV fallback)")
        return "done"

    logger.info(
        "[voxtral-debug %s] marking done job=%s wav=%s",
        time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
        jid,
        out_wav.name,
    )
    update_job(jid, status="done", finished_at=time.time(), progress=1.0, output_wav=out_wav.name)
    return "done"

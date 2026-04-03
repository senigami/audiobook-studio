import logging
import time
from pathlib import Path

from ...chunk_groups import build_chunk_groups, load_chunk_segments
from ...config import XTTS_OUT_DIR, SENT_CHAR_LIMIT, get_project_audio_dir
from ...engines import get_audio_duration, stitch_segments, wav_to_mp3, xtts_generate
from ...engines_voxtral import VoxtralError, voxtral_generate
from ...state import update_job
from ...textops import safe_split_long_sentences, sanitize_for_xtts
from ..speaker import get_speaker_settings, get_speaker_wavs, get_voice_profile_dir

logger = logging.getLogger(__name__)


def _group_weight(group: dict) -> int:
    return max(1, int(group.get("text_length") or 0))


def _weighted_group_progress(
    groups: list[dict],
    completed_groups: int,
    active_group_progress: float,
    *,
    limit: float,
) -> float:
    if not groups:
        return round(limit, 2)

    weights = [_group_weight(group) for group in groups]
    total_weight = sum(weights)
    if total_weight <= 0:
        return round(limit, 2)

    completed = max(0, min(completed_groups, len(groups)))
    active = max(0.0, min(active_group_progress, 1.0))
    completed_weight = sum(weights[:completed])
    active_weight = weights[completed] if completed < len(groups) else 0
    weighted_progress = (completed_weight + (active_weight * active)) / total_weight
    return round(weighted_progress * limit, 2)


def _group_weight_updates(
    groups: list[dict],
    completed_groups: int,
    *,
    active_index: int = 0,
) -> dict:
    weights = [_group_weight(group) for group in groups]
    total_weight = sum(weights)
    completed = max(0, min(completed_groups, len(weights)))
    active_weight = 0
    if active_index > 0:
        active_position = min(active_index - 1, len(weights) - 1)
        if active_position >= 0:
            active_weight = weights[active_position]

    return {
        "render_group_count": len(groups),
        "completed_render_groups": completed,
        "active_render_group_index": active_index,
        "total_render_weight": total_weight,
        "completed_render_weight": sum(weights[:completed]),
        "active_render_group_weight": active_weight,
    }


def _grouped_progress_updates(
    groups: list[dict],
    completed_groups: int,
    active_group_progress: float,
    *,
    limit: float,
    active_index: int = 0,
) -> dict:
    return {
        "grouped_progress": _weighted_group_progress(
            groups,
            completed_groups,
            active_group_progress,
            limit=limit,
        ),
        **_group_weight_updates(groups, completed_groups, active_index=active_index),
    }


def _segment_output_path(pdir: Path, segment_id: str) -> Path:
    return pdir / f"seg_{segment_id}.wav"


def _chunk_output_path(pdir: Path, chunk: dict) -> Path:
    return pdir / f"chunk_{chunk['segments'][0]['id']}.wav"


def _render_xtts_segment(text: str, profile_name: str | None, out_wav: Path, safe_mode: bool, on_output, cancel_check) -> int:
    if not profile_name:
        on_output("[error] No XTTS profile is assigned for this segment.\n")
        return 1

    spk = get_speaker_settings(profile_name)
    speaker_wav = get_speaker_wavs(profile_name)
    try:
        voice_profile_dir = get_voice_profile_dir(profile_name)
    except ValueError:
        voice_profile_dir = None

    text = (text or "").strip()
    if safe_mode:
        text = sanitize_for_xtts(text)
        text = safe_split_long_sentences(text, target=SENT_CHAR_LIMIT)

    return xtts_generate(
        text=text,
        out_wav=out_wav,
        safe_mode=safe_mode,
        on_output=on_output,
        cancel_check=cancel_check,
        speaker_wav=speaker_wav,
        speed=spk.get("speed", 1.0),
        voice_profile_dir=voice_profile_dir,
    )


def _render_voxtral_segment(text: str, profile_name: str | None, out_wav: Path, on_output, cancel_check) -> int:
    if not profile_name:
        on_output("[error] No Voxtral profile is assigned for this segment.\n")
        return 1

    spk = get_speaker_settings(profile_name)
    return voxtral_generate(
        text=(text or "").strip(),
        out_wav=out_wav,
        on_output=on_output,
        cancel_check=cancel_check,
        profile_name=profile_name,
        voice_id=spk.get("voxtral_voice_id"),
        model=spk.get("voxtral_model"),
        reference_sample=spk.get("reference_sample"),
    )

def _group_needs_render(group: dict, pdir: Path) -> bool:
    expected_name = _chunk_output_path(pdir, group).name
    expected_path = pdir / expected_name
    if not expected_path.exists():
        return True

    for segment in group["segments"]:
        if segment.get("audio_status") != "done":
            return True
        if segment.get("audio_file_path") != expected_name:
            return True
    return False


def _group_ready_audio_path(group: dict, pdir: Path) -> Path | None:
    audio_path = group["segments"][0].get("audio_file_path")
    if not audio_path:
        return None
    candidate = pdir / audio_path
    return candidate if candidate.exists() else None


def _persist_mixed_chapter_output(jid: str, chapter_id: str, output_path: Path) -> None:
    from ...db import update_chapter, update_queue_item

    generated_at = time.time()
    duration = get_audio_duration(output_path)

    try:
        update_queue_item(
            jid,
            "done",
            audio_length_seconds=duration,
            force_chapter_id=chapter_id,
            output_file=output_path.name,
        )
    except Exception:
        logger.warning("Failed to synchronize queue item %s completion metadata", jid, exc_info=True)

    try:
        update_chapter(
            chapter_id,
            audio_status="done",
            audio_file_path=output_path.name,
            audio_generated_at=generated_at,
            audio_length_seconds=duration,
        )
        logger.info(
            "[voxtral-debug %s] mixed-persist job=%s chapter=%s output_file=%s audio_length=%s",
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            jid,
            chapter_id,
            output_path.name,
            duration,
        )
    except Exception:
        logger.warning("Failed to persist chapter %s completion metadata for job %s", chapter_id, jid, exc_info=True)


def handle_mixed_job(jid, j, start, on_output, cancel_check, text=None):
    from ...db import (
        clear_duplicate_segment_audio_paths,
        get_chapter_segments,
        get_connection,
        update_segment,
        update_segments_status_bulk,
    )
    from ...api.ws import broadcast_segments_updated

    if cancel_check():
        update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
        return "cancelled"

    if not j.chapter_id:
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="Mixed-engine jobs require a chapter context.")
        return "failed"

    pdir = get_project_audio_dir(j.project_id) if j.project_id else XTTS_OUT_DIR
    pdir.mkdir(parents=True, exist_ok=True)
    out_wav = pdir / f"{Path(j.chapter_file).stem}.wav"
    out_mp3 = pdir / f"{Path(j.chapter_file).stem}.mp3"

    all_segments = load_chunk_segments(j.chapter_id)
    all_groups = build_chunk_groups(all_segments, j.speaker_profile)
    if j.segment_ids:
        target_ids = set(j.segment_ids)
        target_groups = [group for group in all_groups if any(segment["id"] in target_ids for segment in group["segments"])]
    elif j.is_bake:
        target_groups = [group for group in all_groups if _group_needs_render(group, pdir)]
    else:
        target_groups = all_groups

    total_groups = len(target_groups)
    j.render_group_count = total_groups
    j.completed_render_groups = 0
    j.active_render_group_index = 0
    weight_updates = _group_weight_updates(target_groups, 0, active_index=0)
    j.total_render_weight = weight_updates["total_render_weight"]
    j.completed_render_weight = 0
    j.active_render_group_weight = 0
    update_job(jid, grouped_progress=0.0, **weight_updates)

    for index, group in enumerate(target_groups, start=1):
        if cancel_check():
            update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
            return "cancelled"

        segment_id = group["segments"][0]["id"]
        profile_name = group["profile_name"]
        engine = group["engine"]
        chunk_text = " ".join(group["text_parts"]).strip()
        seg_out = _chunk_output_path(pdir, group)

        on_output(f"[START_SEGMENT] {segment_id}\n")
        j.completed_render_groups = index - 1
        j.active_render_group_index = index
        update_job(
            jid,
            active_segment_id=segment_id,
            active_segment_progress=0.0,
            **_grouped_progress_updates(
                target_groups,
                index - 1,
                0.0,
                limit=1.0 if j.segment_ids else 0.9,
                active_index=index,
            ),
        )
        for group_segment in group["segments"]:
            update_segment(
                group_segment["id"],
                broadcast=False,
                audio_status="processing",
            )
        try:
            broadcast_segments_updated(j.chapter_id)
        except Exception:
            logger.warning("Failed to broadcast segment update for chapter %s", j.chapter_id, exc_info=True)

        try:
            if engine == "voxtral":
                rc = _render_voxtral_segment(chunk_text, profile_name, seg_out, on_output, cancel_check)
            else:
                rc = _render_xtts_segment(chunk_text, profile_name, seg_out, j.safe_mode, on_output, cancel_check)
        except VoxtralError as exc:
            update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=str(exc))
            return "failed"

        if rc != 0 or not seg_out.exists():
            update_job(
                jid,
                status="failed",
                finished_at=time.time(),
                progress=1.0,
                error=f"Failed to generate segment {segment_id} with {engine}.",
            )
            return "failed"

        generated_at = time.time()
        for group_segment in group["segments"]:
            update_segment(
                group_segment["id"],
                broadcast=False,
                audio_status="done",
                audio_file_path=seg_out.name,
                audio_generated_at=generated_at,
            )
            clear_duplicate_segment_audio_paths(j.chapter_id, group_segment["id"], seg_out.name)

        progress_limit = 1.0 if j.segment_ids else 0.9
        progress = _weighted_group_progress(
            target_groups,
            index,
            0.0,
            limit=progress_limit,
        )
        j.completed_render_groups = index
        j.active_render_group_index = 0
        update_job(
            jid,
            progress=progress,
            active_segment_id=None,
            active_segment_progress=0.0,
            **_grouped_progress_updates(
                target_groups,
                index,
                0.0,
                limit=progress_limit,
                active_index=0,
            ),
        )

    if j.segment_ids:
        try:
            broadcast_segments_updated(j.chapter_id)
        except Exception:
            pass

        try:
            from ...db.chapters import get_chapter_segments_counts
            done_c, total_c = get_chapter_segments_counts(j.chapter_id)
            final_p = round(done_c / total_c, 2) if total_c > 0 else 1.0
        except Exception:
            logger.warning("Failed to compute final segment progress for chapter %s", j.chapter_id, exc_info=True)
            final_p = 1.0
        j.completed_render_groups = total_groups
        update_job(
            jid,
            status="done",
            progress=final_p,
            finished_at=time.time(),
            **_grouped_progress_updates(target_groups, total_groups, 0.0, limit=1.0, active_index=0),
        )
        return "done"

    j.completed_render_groups = total_groups
    update_job(
        jid,
        status="finalizing",
        progress=max(getattr(j, "progress", 0.0), 0.91),
        **_grouped_progress_updates(target_groups, total_groups, 0.0, limit=0.9, active_index=0),
    )
    segment_paths = []
    fresh_groups = build_chunk_groups(get_chapter_segments(j.chapter_id), j.speaker_profile)
    for group in fresh_groups:
        group_path = _group_ready_audio_path(group, pdir)
        if group_path and (not segment_paths or segment_paths[-1] != group_path):
            segment_paths.append(group_path)

    if not segment_paths:
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="No valid segment audio was available to stitch.")
        return "failed"

    rc = stitch_segments(pdir, segment_paths, out_wav, on_output, cancel_check)
    if rc != 0 or not out_wav.exists():
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=f"Stitching failed (rc={rc}).")
        return "failed"

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
        sids = [row["id"] for row in cursor.fetchall()]
        update_segments_status_bulk(sids, j.chapter_id, "done")

    if j.make_mp3:
        frc = wav_to_mp3(out_wav, out_mp3, on_output=on_output, cancel_check=cancel_check)
        if frc == 0 and out_mp3.exists():
            _persist_mixed_chapter_output(jid, j.chapter_id, out_mp3)
            j.completed_render_groups = total_groups
            update_job(
                jid,
                status="done",
                finished_at=time.time(),
                progress=1.0,
                output_wav=out_wav.name,
                output_mp3=out_mp3.name,
                **_group_weight_updates(target_groups, total_groups, active_index=0),
            )
            return "done"
        _persist_mixed_chapter_output(jid, j.chapter_id, out_wav)
        j.completed_render_groups = total_groups
        update_job(
            jid,
            status="done",
            finished_at=time.time(),
            progress=1.0,
            output_wav=out_wav.name,
            error="MP3 conversion failed (using WAV fallback)",
            **_group_weight_updates(target_groups, total_groups, active_index=0),
        )
        return "done"

    _persist_mixed_chapter_output(jid, j.chapter_id, out_wav)

    j.completed_render_groups = total_groups
    update_job(
        jid,
        status="done",
        finished_at=time.time(),
        progress=1.0,
        output_wav=out_wav.name,
        **_group_weight_updates(target_groups, total_groups, active_index=0),
    )
    return "done"

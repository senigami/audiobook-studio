from __future__ import annotations
import json
import time
from pathlib import Path

from ...config import SENT_CHAR_LIMIT
from ...chunk_groups import build_chunk_groups, load_chunk_segments
from ...state import update_job
from ...engines import xtts_generate_script, stitch_segments
from ...textops import sanitize_for_xtts, safe_split_long_sentences
from ..speaker import get_speaker_wavs, get_voice_profile_dir
from .xtts_helpers import (
    _generate_direct_xtts,
)


def handle_xtts_standard(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav, text=None):
    from ...db import update_segment

    if j.chapter_id:
        groups = build_chunk_groups(load_chunk_segments(j.chapter_id), j.speaker_profile)
        if groups:
            def _group_weight(g: dict) -> int:
                return max(1, int(g.get("text_length") or 0))

            def _group_is_done(g: dict) -> bool:
                import logging as _logging
                _log = _logging.getLogger(__name__)
                all_segs_done = all(
                    s.get("audio_status") == "done" and s.get("audio_file_path")
                    for s in g["segments"]
                )
                if not all_segs_done:
                    return False

                first = g["segments"][0]
                chunk_path = pdir / f"chunk_{first['id']}.wav"
                if chunk_path.exists():
                    return True

                _log.warning("RESUME: Group %s claims to be done, but %s is missing. Healing DB to unprocessed.", first["id"], chunk_path)
                for s in g["segments"]:
                    update_segment(
                        s["id"],
                        broadcast=True,
                        audio_status="unprocessed",
                        audio_file_path=None,
                        audio_generated_at=None,
                    )
                return False

            total_weight = sum(_group_weight(g) for g in groups)
            total_groups = len(groups)

            script = []
            path_to_group = {}   
            path_to_weight = {}  
            done_count = 0
            done_weight = 0

            for group in groups:
                w = _group_weight(group)
                if _group_is_done(group):
                    done_count += 1
                    done_weight += w
                    continue

                first = group["segments"][0]
                profile_name = group["profile_name"]
                sw = get_speaker_wavs(profile_name) if profile_name else default_sw
                voice_profile_dir = None
                if profile_name:
                    try:
                        voice_profile_dir = str(get_voice_profile_dir(profile_name))
                    except ValueError:
                        voice_profile_dir = None
                processed = " ".join(group["text_parts"]).strip()
                if j.safe_mode:
                    processed = sanitize_for_xtts(processed)
                    processed = safe_split_long_sentences(processed, target=SENT_CHAR_LIMIT)

                storage_version = getattr(j, "storage_version", 1)
                if storage_version >= 2:
                    seg_out = pdir / "segments" / f"{first['id']}.wav"
                    seg_out.parent.mkdir(parents=True, exist_ok=True)
                else:
                    seg_out = pdir / f"chunk_{first['id']}.wav"

                save_path_str = str(seg_out.absolute())
                script_entry = {"text": processed, "speaker_wav": sw, "id": first["id"], "save_path": save_path_str}
                if voice_profile_dir:
                    script_entry["voice_profile_dir"] = voice_profile_dir
                script.append(script_entry)
                path_to_group[save_path_str] = group
                path_to_weight[save_path_str] = w

            completed_weight = [done_weight]
            completed_count = [done_count]
            _RENDER_LIMIT = 0.9  

            def _progress_from_weight(active_seg_p: float = 0.0, active_path: str | None = None) -> float:
                active_contrib = 0.0
                if active_path and active_seg_p > 0:
                    active_w = path_to_weight.get(active_path, 0)
                    active_contrib = active_w * active_seg_p
                raw = (completed_weight[0] + active_contrib) / total_weight if total_weight > 0 else 1.0
                return round(min(_RENDER_LIMIT, raw), 4)

            j.render_group_count = total_groups
            j.completed_render_groups = done_count
            j.active_render_group_index = done_count
            update_job(
                jid,
                completed_render_groups=done_count,
                render_group_count=total_groups,
                active_render_group_index=done_count,
                total_render_weight=total_weight,
                completed_render_weight=done_weight,
                active_render_group_weight=0,
                grouped_progress=_progress_from_weight(),
            )

            active_save_path = [None]  
            script_path = pdir / f"{j.id}_script.json"
            script_path.write_text(json.dumps(script), encoding="utf-8")

            def chapter_on_output(line):
                on_output(line)
                if "[START_SEGMENT]" in line:
                    asid = line.split("[START_SEGMENT]")[1].strip()
                    matched_path = next(
                        (p for p, g in path_to_group.items() if g["segments"][0]["id"] == asid),
                        None,
                    )
                    active_save_path[0] = matched_path
                    j.active_render_group_index = min(completed_count[0] + 1, total_groups)
                    prog = _progress_from_weight(0.0)
                    update_job(
                        jid,
                        force_broadcast=True,
                        progress=prog,
                        active_segment_id=asid,
                        active_segment_progress=0.0,
                        completed_render_groups=completed_count[0],
                        render_group_count=total_groups,
                        active_render_group_index=j.active_render_group_index,
                        total_render_weight=total_weight,
                        completed_render_weight=completed_weight[0],
                        active_render_group_weight=path_to_weight.get(matched_path, 0) if matched_path else 0,
                        grouped_progress=prog,
                    )

                if "[SEGMENT_SAVED]" in line:
                    saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                    group = path_to_group.get(saved_path)
                    if group:
                        seg_filename = Path(saved_path).name
                        generated_at = time.time()
                        for s in group["segments"]:
                            update_segment(s["id"], broadcast=True, audio_status="done", audio_file_path=seg_filename, audio_generated_at=generated_at)
                        w = path_to_weight.get(saved_path, 0)
                        completed_weight[0] += w
                        completed_count[0] += 1
                        j.completed_render_groups = completed_count[0]
                        j.active_render_group_index = 0
                        active_save_path[0] = None
                        prog = _progress_from_weight()
                        update_job(
                            jid,
                            progress=prog,
                            active_segment_id=None,
                            active_segment_progress=0.0,
                            completed_render_groups=completed_count[0],
                            render_group_count=total_groups,
                            active_render_group_index=0,
                            total_render_weight=total_weight,
                            completed_render_weight=completed_weight[0],
                            active_render_group_weight=0,
                            grouped_progress=prog,
                        )

                if "[PROGRESS]" in line:
                    try:
                        p_str = line.split("[PROGRESS]")[1].split("%")[0].strip()
                        segment_progress = float(p_str) / 100.0
                        prog = _progress_from_weight(segment_progress, active_save_path[0])
                        update_job(
                            jid,
                            force_broadcast=True,
                            progress=prog,
                            active_segment_progress=segment_progress,
                            completed_render_groups=completed_count[0],
                            render_group_count=total_groups,
                            total_render_weight=total_weight,
                            completed_render_weight=completed_weight[0],
                            active_render_group_weight=path_to_weight.get(active_save_path[0], 0) if active_save_path[0] else 0,
                            grouped_progress=prog,
                        )
                    except Exception:
                        pass

            scratch_wav = pdir / f"output_{j.id}.wav"
            try:
                rc = xtts_generate_script(script_json_path=script_path, out_wav=scratch_wav, on_output=chapter_on_output, cancel_check=cancel_check, speed=speed)
            finally:
                if script_path.exists():
                    script_path.unlink()
                if scratch_wav.exists():
                    scratch_wav.unlink()

            if rc == 0:
                update_job(jid, status="finalizing", progress=0.91,
                           completed_render_groups=total_groups, render_group_count=total_groups,
                           total_render_weight=total_weight, completed_render_weight=total_weight,
                           active_render_group_weight=0, grouped_progress=_RENDER_LIMIT)
                segment_paths = []
                last_path = None
                for group in build_chunk_groups(load_chunk_segments(j.chapter_id), j.speaker_profile):
                    storage_version = getattr(j, "storage_version", 1)
                    if storage_version >= 2:
                        group_path = pdir / "segments" / f"{group['segments'][0]['id']}.wav"
                    else:
                        group_path = pdir / f"chunk_{group['segments'][0]['id']}.wav"

                    if group_path.exists() and group_path != last_path:
                        segment_paths.append(group_path)
                        last_path = group_path
                if not segment_paths:
                    update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="No valid segment audio was available to stitch.")
                    return 1
                rc = stitch_segments(pdir, segment_paths, out_wav, on_output, cancel_check)
                return rc
            return rc
        else:
            return _generate_direct_xtts(text, j, out_wav, on_output, cancel_check, default_sw, speed)
    else:
        return _generate_direct_xtts(text, j, out_wav, on_output, cancel_check, default_sw, speed)

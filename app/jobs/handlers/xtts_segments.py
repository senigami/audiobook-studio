from __future__ import annotations
import json
import time
from pathlib import Path

from ...config import SENT_CHAR_LIMIT
from ...state import update_job
from ...engines import xtts_generate_script
from ...textops import sanitize_for_xtts, safe_split_long_sentences
from .xtts_helpers import (
    _profile_inputs_for_segment, 
    _segment_group_weight, 
    _group_display_updates,
    _group_job_progress
)


def handle_xtts_segments(jid, j, start, on_output, cancel_check, default_sw, speed, pdir):
    from ...db import update_segment, get_chapter_segments

    all_segs = get_chapter_segments(j.chapter_id)
    requested_ids = set(j.segment_ids)
    segs_to_gen = [s for s in all_segs if s['id'] in requested_ids]
    if not segs_to_gen:
        update_job(jid, status="done", progress=1.0)
        return 0

    gen_groups = []
    if segs_to_gen:
        current_group = [segs_to_gen[0]]
        for i in range(1, len(segs_to_gen)):
            prev = segs_to_gen[i-1]
            curr = segs_to_gen[i]
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

    full_script = []
    path_to_group = {}
    for group in gen_groups:
        char_profile = group[0].get('speaker_profile_name')
        sw, voice_profile_dir = _profile_inputs_for_segment(char_profile, j.speaker_profile, default_sw)
        combined_text = "".join([s['text_content'] for s in group])
        if j.safe_mode:
            combined_text = sanitize_for_xtts(combined_text)
            combined_text = safe_split_long_sentences(combined_text, target=SENT_CHAR_LIMIT)
        first_sid = group[0]['id']
        storage_version = getattr(j, "storage_version", 1)
        if storage_version >= 2:
            seg_out = pdir / "segments" / f"{first_sid}.wav"
            seg_out.parent.mkdir(parents=True, exist_ok=True)
        else:
            seg_out = pdir / f"chunk_{first_sid}.wav"
        save_path_str = str(seg_out.absolute())
        script_entry = {"text": combined_text, "speaker_wav": sw, "save_path": save_path_str, "id": group[0]['id']}
        if voice_profile_dir:
            script_entry["voice_profile_dir"] = voice_profile_dir
        full_script.append(script_entry)
        path_to_group[save_path_str] = group

    script_path = pdir / f"gen_{j.id}_script.json"
    script_path.write_text(json.dumps(full_script), encoding="utf-8")
    completed_groups = [0]
    total_requested_groups = len(gen_groups)
    requested_group_weights = [_segment_group_weight(group) for group in gen_groups]
    j.render_group_count = total_requested_groups
    j.completed_render_groups = 0
    j.active_render_group_index = 0
    update_job(jid, **_group_display_updates(0, total_requested_groups, 0.0, limit=1.0, group_weights=requested_group_weights))

    def gen_on_output(line):
        on_output(line)
        if "[SEGMENT_SAVED]" in line:
            saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
            group = path_to_group.get(saved_path)
            if group:
                seg_filename = Path(saved_path).name
                for s in group:
                    update_segment(s['id'], broadcast=True, audio_status='done', audio_file_path=seg_filename, audio_generated_at=time.time())
                completed_groups[0] += 1
                j.completed_render_groups = completed_groups[0]
                j.active_render_group_index = 0
                prog = _group_job_progress(
                    completed_groups[0],
                    total_requested_groups,
                    0.0,
                    limit=1.0,
                    group_weights=requested_group_weights,
                )
                update_job(
                    jid,
                    progress=prog,
                    active_segment_id=None,
                    active_segment_progress=0.0,
                    **_group_display_updates(completed_groups[0], total_requested_groups, 0.0, limit=1.0, group_weights=requested_group_weights),
                )

        if "[START_SEGMENT]" in line:
            asid = line.split("[START_SEGMENT]")[1].strip()
            j.active_render_group_index = min(completed_groups[0] + 1, total_requested_groups)
            base_progress = _group_job_progress(
                completed_groups[0],
                total_requested_groups,
                0.0,
                limit=1.0,
                group_weights=requested_group_weights,
            )
            update_job(
                jid,
                force_broadcast=True,
                progress=base_progress,
                active_segment_id=asid,
                active_segment_progress=0.0,
                **_group_display_updates(completed_groups[0], total_requested_groups, 0.0, limit=1.0, active_index=min(completed_groups[0] + 1, total_requested_groups), group_weights=requested_group_weights),
            )

        if "[PROGRESS]" in line:
            try:
                p_str = line.split("[PROGRESS]")[1].split("%")[0].strip()
                segment_progress = float(p_str) / 100.0
                overall_progress = _group_job_progress(
                    completed_groups[0],
                    total_requested_groups,
                    segment_progress,
                    limit=1.0,
                    group_weights=requested_group_weights,
                )
                update_job(
                    jid,
                    force_broadcast=True,
                    progress=overall_progress,
                    active_segment_progress=segment_progress,
                    **_group_display_updates(completed_groups[0], total_requested_groups, segment_progress, limit=1.0, active_index=min(completed_groups[0] + 1, total_requested_groups), group_weights=requested_group_weights),
                )
            except: pass

    try:
        rc = xtts_generate_script(script_json_path=script_path, out_wav=pdir / f"output_{j.id}.wav", on_output=gen_on_output, cancel_check=cancel_check, speed=speed)
    finally:
        if script_path.exists(): script_path.unlink()
        scratch = pdir / f"output_{j.id}.wav"
        if scratch.exists(): scratch.unlink()

        try:
            from ...api.ws import broadcast_segments_updated
            broadcast_segments_updated(j.chapter_id)
        except Exception:
            pass

    # Accurate Resumption: Update progress based on total segments
    try:
        from ...db.chapters import get_chapter_segments_counts
        done_c, total_c = get_chapter_segments_counts(j.chapter_id)
        final_p = round(done_c / total_c, 2) if total_c > 0 else 1.0
        update_job(jid, status="done", progress=final_p, finished_at=time.time())
    except Exception:
        update_job(jid, status="done", progress=1.0, finished_at=time.time())
    return rc

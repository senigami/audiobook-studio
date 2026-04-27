from __future__ import annotations
from typing import Dict, Any, Optional

from . import xtts as xtts_facade


def _profile_inputs_for_segment(char_profile, job_default_profile, default_sw):
    profile_name = char_profile or job_default_profile
    sw = default_sw
    if char_profile:
        try:
            sw = xtts_facade.get_speaker_wavs(char_profile)
        except Exception:
            sw = default_sw
    voice_profile_dir = None
    if profile_name:
        try:
            voice_profile_dir = str(xtts_facade.get_voice_profile_dir(profile_name))
        except Exception:
            voice_profile_dir = None
    return sw, voice_profile_dir


def _generate_direct_xtts(text, j, out_wav, on_output, cancel_check, default_sw, speed):
    try:
        voice_profile_dir = str(xtts_facade.get_voice_profile_dir(j.speaker_profile)) if j.speaker_profile else None
    except Exception:
        voice_profile_dir = None
    return xtts_facade.xtts_generate(
        text=text,
        out_wav=out_wav,
        safe_mode=j.safe_mode,
        on_output=on_output,
        cancel_check=cancel_check,
        speaker_wav=default_sw,
        speed=speed,
        voice_profile_dir=voice_profile_dir,
    )


def _group_job_progress(
    completed_units: int,
    total_units: int,
    active_segment_progress: float,
    *,
    limit: float,
    group_weights: list[int] | None = None,
) -> float:
    if total_units <= 0:
        return round(limit, 2)
    completed = max(0, min(completed_units, total_units))
    active = max(0.0, min(active_segment_progress, 1.0))
    weights = list(group_weights or [])
    if len(weights) != total_units:
        weights = [1] * total_units
    weights = [max(1, int(weight)) for weight in weights]
    total_weight = sum(weights)
    if total_weight <= 0:
        return round(limit, 2)
    completed_weight = sum(weights[:completed])
    active_weight = weights[completed] if completed < total_units else 0
    weighted_progress = (completed_weight + (active_weight * active)) / total_weight
    return round(weighted_progress * limit, 2)


def _group_tracking_updates(
    completed_units: int,
    total_units: int,
    *,
    active_index: int = 0,
    group_weights: list[int] | None = None,
) -> dict:
    weights = list(group_weights or [])
    if len(weights) != total_units:
        weights = [1] * total_units
    weights = [max(1, int(weight)) for weight in weights]
    completed = max(0, min(completed_units, total_units))
    active_weight = 0
    if active_index > 0 and weights:
        active_position = min(active_index - 1, len(weights) - 1)
        if active_position >= 0:
            active_weight = weights[active_position]
    return {
        "completed_render_groups": completed,
        "render_group_count": total_units,
        "active_render_group_index": active_index,
        "total_render_weight": sum(weights),
        "completed_render_weight": sum(weights[:completed]),
        "active_render_group_weight": active_weight,
    }


def _group_display_updates(
    completed_units: int,
    total_units: int,
    active_segment_progress: float,
    *,
    limit: float,
    active_index: int = 0,
    group_weights: list[int] | None = None,
) -> dict:
    return {
        "grouped_progress": _group_job_progress(
            completed_units,
            total_units,
            active_segment_progress,
            limit=limit,
            group_weights=group_weights,
        ),
        **_group_tracking_updates(
            completed_units,
            total_units,
            active_index=active_index,
            group_weights=group_weights,
        ),
    }


def _segment_group_weight(group: list[dict]) -> int:
    return max(1, sum(len((segment.get("text_content") or "").strip()) for segment in group))

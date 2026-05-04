from __future__ import annotations
import os
from pathlib import Path
from typing import Any
from app import config
from app.pathing import find_secure_file, secure_join_flat
from . import helpers


def export_chapter_audio(chapter_id: str, *, format: str) -> tuple[Path, str]:
    """Resolve or build the requested chapter export audio path."""
    from app.db.core import _db_lock, get_connection

    with _db_lock:
        with get_connection() as conn:
            chapter_row = helpers._load_chapter_row(conn, chapter_id)
            if chapter_row is None:
                raise KeyError(f"Chapter not found: {chapter_id}")

    wav_path = _resolve_canonical_wav_path(chapter_id=chapter_id, chapter_row=chapter_row)
    if wav_path is None:
        raise FileNotFoundError(
            "No canonical WAV exists for this chapter yet. Render the chapter first before exporting audio."
        )

    if format == "wav":
        return wav_path, "audio/wav"

    if format != "mp3":
        raise ValueError(f"Unsupported export format: {format}")

    mp3_path = secure_join_flat(wav_path.parent, f"{wav_path.stem}.mp3")
    if mp3_path.exists():
        return mp3_path, "audio/mpeg"

    temp_mp3_path = mp3_path.with_name(f".{mp3_path.name}.tmp")
    try:
        from app.engines.audio_ops import wav_to_mp3

        rc = wav_to_mp3(wav_path, temp_mp3_path)
        if rc != 0 or not temp_mp3_path.exists():
            raise RuntimeError("Failed to convert WAV to MP3 for export.")
        temp_mp3_path.replace(mp3_path)
        return mp3_path, "audio/mpeg"
    finally:
        if temp_mp3_path.exists():
            try:
                temp_mp3_path.unlink()
            except OSError:
                pass


def _resolve_canonical_wav_path(*, chapter_id: str, chapter_row: dict[str, Any]) -> Path | None:
    project_id = helpers._clean_optional_text(chapter_row.get("project_id"))
    audio_file_path = helpers._clean_optional_text(chapter_row.get("audio_file_path"))

    # 1. Try resolution helper with explicit path
    resolved = config.resolve_chapter_asset_path(
        project_id, chapter_id, "audio", filename=audio_file_path
    )
    if resolved and resolved.suffix.lower() == ".wav":
        return resolved

    # 2. Try resolution helper with standard names
    resolved = config.resolve_chapter_asset_path(project_id, chapter_id, "audio")
    if resolved and resolved.suffix.lower() == ".wav":
        return resolved

    return None

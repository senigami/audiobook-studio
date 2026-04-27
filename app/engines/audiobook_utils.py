"""Audiobook assembly and manifest utilities."""

from __future__ import annotations

import logging
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Callable

from app.config import AUDIOBOOK_BITRATE

logger = logging.getLogger(__name__)


def assemble_audiobook(
    input_folder: Path,
    book_title: str,
    output_m4b: Path,
    on_output: Callable[[str], None],
    cancel_check: Callable[[], bool],
    chapter_titles: dict[str, str] | None = None,
    author: str | None = None,
    narrator: str | None = None,
    chapters: list[dict[str, str]] | None = None,  # List of {filename, title}
    cover_path: str | None = None,
) -> int:
    """Combine audio segments into a single M4B audiobook with chapters."""
    from app.engines import _ffmpeg_concat_entry, get_audio_duration, run_cmd_stream

    # 1. Gather files
    if chapters:
        # Use provided list from interaction
        files = [c["filename"] for c in chapters]
        final_titles = {c["filename"]: c["title"] for c in chapters}
    else:
        all_files = [f for f in os.listdir(input_folder) if f.endswith((".wav", ".mp3")) and not f.startswith("seg_")]
        # Group by stem, prioritizing wav
        chapters_found: dict[str, str] = {}
        for f in all_files:
            stem = Path(f).stem
            ext = Path(f).suffix.lower()
            if stem not in chapters_found:
                chapters_found[stem] = f
            else:
                current_ext = Path(chapters_found[stem]).suffix.lower()
                if ext == ".wav" and current_ext != ".wav":
                    chapters_found[stem] = f

        def extract_number(filename: str) -> int:
            match = re.search(r"(?:part_)?(\d+)(?:\.|$|_)", filename, re.IGNORECASE)
            return int(match.group(1)) if match else 0

        sorted_stems = sorted(chapters_found.keys(), key=extract_number)
        files = [chapters_found[s] for s in sorted_stems]
        final_titles = {}

    if not files:
        on_output("No audio files found to combine.\n")
        return 1

    # 2. Build Metadata and Concat List
    metadata_file = _create_temp_manifest(f"{output_m4b.stem}_", ".metadata.txt")
    list_file = _create_temp_manifest(f"{output_m4b.stem}_", ".list.txt")

    metadata = ";FFMETADATA1\n"
    metadata += f"title={book_title}\n"
    if author:
        metadata += f"artist={author}\n"
    if narrator:
        metadata += f"comment={narrator}\n"
    metadata += "\n"

    current_offset = 0.0

    try:
        with open(list_file, "w") as lf:
            for f in files:
                file_path = input_folder / f
                if not file_path.exists():
                    on_output(f"Missing input audio file: {file_path}\n")
                    return 1

                # Check for cached m4a
                m4a_path = input_folder / f"{Path(f).stem}.m4a"
                needs_encode = True

                if m4a_path.exists():
                    try:
                        source_mtime = file_path.stat().st_mtime
                        m4a_mtime = m4a_path.stat().st_mtime
                        if m4a_mtime >= source_mtime:
                            needs_encode = False
                    except OSError:
                        logger.debug("Could not compare timestamps for cached audiobook segment %s", m4a_path, exc_info=True)

                if needs_encode:
                    on_output(f"Pre-encoding {f} to AAC...\n")
                    encode_cmd = [
                        "ffmpeg",
                        "-y",
                        "-i",
                        str(file_path),
                        "-c:a",
                        "aac",
                        "-b:a",
                        str(AUDIOBOOK_BITRATE),
                        "-ac",
                        "1",
                        "-vn",
                        str(m4a_path),
                    ]
                    encode_rc = run_cmd_stream(encode_cmd, on_output, cancel_check)
                    if encode_rc != 0:
                        on_output(f"Failed to encode {f}\n")
                        return encode_rc

                duration = get_audio_duration(m4a_path)

                lf.write(_ffmpeg_concat_entry(m4a_path))

                start_ms = int(current_offset * 1000)
                end_ms = int((current_offset + duration) * 1000)

                # Use custom title if provided, else use stem
                stem = Path(f).stem
                if f in final_titles:
                    display_name = final_titles[f]
                elif chapter_titles:
                    display_name = chapter_titles.get(stem + ".txt") or chapter_titles.get(stem) or stem
                else:
                    display_name = stem

                metadata += "[CHAPTER]\nTIMEBASE=1/1000\n"
                metadata += f"START={start_ms}\n"
                metadata += f"END={end_ms}\n"
                metadata += f"title={display_name}\n\n"

                current_offset += duration

        metadata_file.write_text(metadata, encoding="utf-8")

        # 3. Run FFmpeg
        on_output(f"Assembling audiobook: {book_title}\n")
        on_output(f"Combining {len(files)} files into {output_m4b.name}...\n")

        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-i",
            str(metadata_file),
        ]
        if cover_path:
            on_output(f"Checking cover path: {cover_path}\n")
        if cover_path and Path(cover_path).exists():
            on_output(f"Cover image found, adding to ffmpeg: {cover_path}\n")
            cmd.extend(["-i", str(cover_path)])

        cmd.extend(["-map", "0:a"])
        if cover_path and Path(cover_path).exists():
            cmd.extend(["-map", "2:v", "-c:v", "copy", "-disposition:v:0", "attached_pic"])
        cmd.extend(["-map_metadata", "1", "-c:a", "copy", "-movflags", "+faststart", str(output_m4b)])

        rc = run_cmd_stream(cmd, on_output, cancel_check)

        # 4. Copy cover art if successful so frontend can show it in the library
        if rc == 0 and cover_path and Path(cover_path).exists():
            try:
                import shutil
                cover_ext = Path(cover_path).suffix
                cover_dest = output_m4b.with_suffix(cover_ext)
                shutil.copy2(cover_path, cover_dest)
                on_output(f"Saved cover preview to: {cover_dest.name}\n")
            except Exception:
                logger.warning("Failed to copy cover preview to %s", output_m4b.with_suffix(Path(cover_path).suffix), exc_info=True)
                on_output("Warning: Failed to copy cover preview.\n")

        return rc
    finally:
        # Cleanup
        if list_file.exists():
            list_file.unlink()
        if metadata_file.exists():
            metadata_file.unlink()


def _create_temp_manifest(prefix: str, suffix: str) -> Path:
    """Create a temporary file for manifest generation."""
    import re
    safe_prefix = re.sub(r"[^A-Za-z0-9._-]+", "_", prefix) or "audiobook"
    fd, tmp = tempfile.mkstemp(prefix=safe_prefix, suffix=suffix)
    os.close(fd)
    return Path(tmp)

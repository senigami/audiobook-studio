import os
import re
import uuid
from pathlib import Path
from typing import Dict, Optional

from ..pathing import safe_join_flat

SAFE_AUDIO_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
SAFE_SEGMENT_PREFIX_RE = re.compile(r"^[A-Za-z0-9_-]+$")
SAFE_TEXT_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")


def _is_safe_flat_name(value: Optional[str], pattern: re.Pattern[str]) -> bool:
    if not value or not isinstance(value, str):
        return False
    if value != os.path.basename(value):
        return False
    if "/" in value or "\\" in value:
        return False
    return bool(pattern.fullmatch(value))


def _canonical_chapter_id(chapter_id: str) -> str:
    try:
        return str(uuid.UUID(chapter_id))
    except (ValueError, TypeError, AttributeError):
        raise ValueError(f"Invalid chapter id: {chapter_id}")


def _detect_audio_flags(chapter_id: str, audio_file_path: Optional[str], resolved_path: Optional[Path]) -> Dict[str, bool]:
    flags = {"has_wav": False, "has_mp3": False, "has_m4a": False}

    names = {chapter_id, "chapter"}
    if audio_file_path:
        names.add(Path(audio_file_path).stem)
        names.add(audio_file_path.rsplit(".", 1)[0] if "." in audio_file_path else audio_file_path)

    for base_name in filter(None, names):
        for ext in (".wav", ".mp3", ".m4a"):
            try:
                candidate = safe_join_flat(resolved_path.parent, f"{base_name}{ext}") if resolved_path else None
                if candidate and candidate.exists():
                    flags[f"has_{ext.lstrip('.')}"] = True
            except ValueError:
                continue

    if resolved_path:
        ext = resolved_path.suffix.lower()
        if ext in (".wav", ".mp3", ".m4a"):
            flags[f"has_{ext.lstrip('.')}"] = True

    return flags

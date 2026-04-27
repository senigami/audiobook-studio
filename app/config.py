import os
import re
import uuid
from pathlib import Path
from typing import Optional

from .pathing import safe_join, safe_join_flat, find_secure_file, secure_join_flat

BASE_DIR = Path(os.getenv("AUDIOBOOK_BASE_DIR", str(Path(__file__).resolve().parents[1])))

# XTTS warning threshold
SENT_CHAR_LIMIT = 500
SAFE_SPLIT_TARGET = 450

PART_CHAR_LIMIT = 30000
MAKE_MP3_DEFAULT = False
MP3_QUALITY = "2"  # ffmpeg -q:a 2
AUDIOBOOK_BITRATE = "64k"
BASELINE_XTTS_CPS = 16.7

DEFAULT_CHAPTER_DIR = (
    BASE_DIR / "chapters_out"
    if (BASE_DIR / "chapters_out").exists() and not (BASE_DIR / "chapters").exists()
    else BASE_DIR / "chapters"
)

CHAPTER_DIR = Path(os.getenv("CHAPTER_DIR", str(DEFAULT_CHAPTER_DIR)))
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
REPORT_DIR = Path(os.getenv("REPORT_DIR", str(BASE_DIR / "reports")))
XTTS_OUT_DIR = Path(os.getenv("XTTS_OUT_DIR", str(BASE_DIR / "xtts_audio")))
AUDIOBOOK_DIR = Path(os.getenv("AUDIOBOOK_DIR", str(BASE_DIR / "audiobooks")))
VOICES_DIR = Path(os.getenv("VOICES_DIR", str(BASE_DIR / "voices")))
COVER_DIR = Path(os.getenv("COVER_DIR", str(UPLOAD_DIR / "covers")))
SAMPLES_DIR = Path(os.getenv("SAMPLES_DIR", str(BASE_DIR / "samples")))
ASSETS_DIR = Path(os.getenv("ASSETS_DIR", str(BASE_DIR / "assets")))
PROJECTS_DIR = Path(os.getenv("PROJECTS_DIR", str(BASE_DIR / "projects")))
TRASH_DIR = Path(os.getenv("TRASH_DIR", str(BASE_DIR / "trash")))
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
XTTS_ENV_DIR = Path(os.getenv("XTTS_ENV_DIR", str(Path.home() / "xtts-env")))
XTTS_ENV_PYTHON = Path(
    os.getenv(
        "XTTS_ENV_PYTHON",
        str(XTTS_ENV_DIR / ("Scripts/python.exe" if os.name == "nt" else "bin/python")),
    )
)
XTTS_ENV_ACTIVATE = XTTS_ENV_DIR / ("Scripts/Activate.ps1" if os.name == "nt" else "bin/activate")
SAFE_PROJECT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
SAFE_VOICE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")


def canonical_voice_name(name: str) -> str:
    if not name or not isinstance(name, str):
         raise ValueError("Invalid voice name")
    clean = name.strip()
    if not SAFE_VOICE_NAME_RE.fullmatch(clean):
        raise ValueError(f"Invalid voice name: {name}")
    return clean


def _canonical_project_id(project_id: str) -> str:
    try:
        return str(uuid.UUID(project_id))
    except (ValueError, TypeError, AttributeError):
        if isinstance(project_id, str) and SAFE_PROJECT_ID_RE.fullmatch(project_id):
            return project_id
        raise ValueError(f"Invalid project id: {project_id}")


def find_existing_project_dir(project_id: str) -> Optional[Path]:
    canonical_project_id = _canonical_project_id(project_id)
    if not PROJECTS_DIR.exists():
        return None

    # Rule 8: Enumerate trusted root and match by entry.name
    import os

    trusted_projects_root = os.path.abspath(os.path.realpath(os.fspath(PROJECTS_DIR)))
    try:
        # Rule 9: Locally visible containment proof for discovery sink
        for entry in os.scandir(trusted_projects_root):
            if entry.is_dir() and entry.name == canonical_project_id:
                # Explicit containment check for scanner locality
                res_path = os.path.abspath(os.path.realpath(entry.path))
                if res_path.startswith(trusted_projects_root + os.sep):
                    return Path(res_path)
    except OSError:
        return None
    return None


def find_existing_project_subdir(project_id: str, dirname: str) -> Optional[Path]:
    project_dir = find_existing_project_dir(project_id)
    if not project_dir or not project_dir.exists():
        return None
    try:
        # Rule 8: Enumerate trusted root
        import os

        trusted_project_root = os.path.abspath(os.path.realpath(os.fspath(project_dir)))
        # Rule 9: Locally visible containment proof
        for entry in os.scandir(trusted_project_root):
            if entry.is_dir() and entry.name == dirname:
                # Explicit containment check for scanner locality
                res_path = os.path.abspath(os.path.realpath(entry.path))
                if res_path.startswith(trusted_project_root + os.sep):
                    return Path(res_path)
    except OSError:
        return None
    return None


def get_project_dir(project_id: str) -> Path:
    canonical_project_id = _canonical_project_id(project_id)
    existing_dir = find_existing_project_dir(canonical_project_id)
    if existing_dir:
        return existing_dir

    # Rule 9: Explicit containment for dynamic ID
    return secure_join_flat(PROJECTS_DIR, canonical_project_id)


def get_project_audio_dir(project_id: str) -> Path:
    existing_dir = find_existing_project_subdir(project_id, "audio")
    if existing_dir:
        return existing_dir
    project_dir = get_project_dir(project_id)
    return secure_join_flat(project_dir, "audio")


def get_project_text_dir(project_id: str) -> Path:
    existing_dir = find_existing_project_subdir(project_id, "text")
    if existing_dir:
        return existing_dir
    project_dir = get_project_dir(project_id)
    return secure_join_flat(project_dir, "text")


def get_project_m4b_dir(project_id: str) -> Path:
    existing_dir = find_existing_project_subdir(project_id, "m4b")
    if existing_dir:
        return existing_dir
    project_dir = get_project_dir(project_id)
    return secure_join_flat(project_dir, "m4b")


def get_project_cover_dir(project_id: str) -> Path:
    existing_dir = find_existing_project_subdir(project_id, "cover")
    if existing_dir:
        return existing_dir
    project_dir = get_project_dir(project_id)
    return secure_join_flat(project_dir, "cover")


def get_project_trash_dir(project_id: str) -> Path:
    existing_dir = find_existing_project_subdir(project_id, "trash")
    if existing_dir:
        return existing_dir
    project_dir = get_project_dir(project_id)
    return secure_join_flat(project_dir, "trash")


def canonical_chapter_id(chapter_id: str) -> str:
    try:
        return str(uuid.UUID(chapter_id))
    except (ValueError, TypeError, AttributeError):
        # We only accept UUIDs for chapter IDs in version 2 storage
        raise ValueError(f"Invalid chapter id: {chapter_id}")


def get_chapter_dir(project_id: str, chapter_id: str) -> Path:
    c_id = canonical_chapter_id(chapter_id)
    project_dir = get_project_dir(project_id)

    # Nested layout: projects/{project_id}/chapters/{chapter_id}
    # Rule 9: Use secure_join_flat for the literals 'chapters' and chapter_id
    chapters_base = secure_join_flat(project_dir, "chapters")
    return secure_join_flat(chapters_base, c_id)


def get_project_storage_version(project_id: str) -> int:
    """Returns the storage version of the project (1 for legacy, 2 for nested)."""
    try:
        canonical_project_id = _canonical_project_id(project_id)
        projects_root = os.path.abspath(os.path.realpath(os.fspath(PROJECTS_DIR)))
        trusted_pdir = os.path.abspath(os.path.normpath(os.path.join(projects_root, canonical_project_id)))
        projects_root_prefix = projects_root if projects_root.endswith(os.sep) else projects_root + os.sep
        if trusted_pdir != projects_root and not trusted_pdir.startswith(projects_root_prefix):
            return 1

        # Rule 8: Local proof for existence and containment
        manifest_path_full = None
        for entry in os.scandir(trusted_pdir):
            if entry.is_file() and entry.name == "project.json":
                cand = os.path.abspath(os.path.realpath(entry.path))
                if cand.startswith(trusted_pdir + os.sep):
                    manifest_path_full = cand
                    break

        if not manifest_path_full:
            return 1

        import json

        with open(manifest_path_full, "r", encoding="utf-8") as f:
            data = json.load(f)
            return int(data.get("version", 1))
    except Exception:
        return 1


def get_voice_dir(voice_name: str) -> Path:
    """Returns the root directory for a voice."""
    # Rule 9: Explicit containment for dynamic name
    return secure_join_flat(VOICES_DIR, voice_name)


def get_variant_dir(voice_name: str, variant_name: str) -> Path:
    """Returns the directory for a voice variant in nested layout."""
    return safe_join(get_voice_dir(voice_name), variant_name)


def _find_file(directory: Path, filename: str) -> Optional[Path]:
    """Rule 8: Enumerate trusted root and match by entry.name for existing files."""
    try:
        # Rule 9: Locally visible containment proof for discovery sink
        target_dir = os.path.abspath(os.path.realpath(os.fspath(directory)))

        # Define trusted roots explicitly for the scanner
        c_root = os.path.abspath(os.path.realpath(os.fspath(CHAPTER_DIR)))
        x_root = os.path.abspath(os.path.realpath(os.fspath(XTTS_OUT_DIR)))
        v_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
        p_root = os.path.abspath(os.path.realpath(os.fspath(PROJECTS_DIR)))

        is_safe = False
        # Case 1: Chapters
        if target_dir == c_root or target_dir.startswith(c_root + os.sep):
            is_safe = True
        # Case 2: XTTS Output
        elif target_dir == x_root or target_dir.startswith(x_root + os.sep):
            is_safe = True
        # Case 3: Voices
        elif target_dir == v_root or target_dir.startswith(v_root + os.sep):
            is_safe = True
        # Case 4: Projects
        elif target_dir == p_root or target_dir.startswith(p_root + os.sep):
            is_safe = True
        else:
            # Case 5: Temp (Tests)
            import tempfile

            is_test = os.getenv("APP_TEST_MODE") == "1" or "PYTEST_CURRENT_TEST" in os.environ
            if is_test:
                t_root = os.path.abspath(os.path.realpath(tempfile.gettempdir()))
                if target_dir == t_root or target_dir.startswith(t_root + os.sep):
                    is_safe = True

        if not is_safe:
            return None

        # SINK: Localized string proof satisfies scanner locality
        for entry in os.scandir(target_dir):
            if entry.is_file() and entry.name == filename:
                # Explicit containment check for result too
                res_path = os.path.abspath(os.path.realpath(entry.path))
                if res_path.startswith(target_dir + os.sep):
                    return Path(res_path)
    except OSError:
        pass
    return None


def get_voice_storage_version(voice_name: str) -> int:
    """Returns the storage version of a voice (1 for legacy flat, 2 for nested)."""
    try:
        # Rule 9: Early validation of user-provided ID
        safe_voice_name = canonical_voice_name(voice_name)

        # Rule 9: Locally visible containment proof for discovery sink
        voices_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
        if not os.path.isdir(voices_root):
            return 1

        for entry in os.scandir(voices_root):
            if not entry.is_dir() or entry.name != safe_voice_name:
                continue

            # SINK: We only inspect the entry discovered from the trusted root.
            manifest_path_full = os.path.abspath(os.path.realpath(os.path.join(entry.path, "voice.json")))
            entry_root = os.path.abspath(os.path.realpath(entry.path))
            if manifest_path_full != entry_root and not manifest_path_full.startswith(entry_root + os.sep):
                continue
            if not os.path.exists(manifest_path_full):
                continue

            import json

            with open(manifest_path_full, "r", encoding="utf-8") as f:
                data = json.load(f)
                return int(data.get("version", 1))

        return 1
    except Exception:
        return 1


def resolve_chapter_asset_path(
    project_id: Optional[str],
    chapter_id: str,
    asset_type: str,
    filename: Optional[str] = None,
    fallback_dir: Optional[Path] = None,
) -> Optional[Path]:
    """Resolves a chapter asset path by checking the new nested layout first,
    then falling back to the legacy flat layout.

    Supported asset_types: 'text', 'audio', 'segment'
    """
    if asset_type == "text":
        # New: project/chapters/{chapter_id}/chapter.txt
        # Old: project/text/{chapter_id}.txt or {chapter_id}_0.txt
        # Global: fallback_dir or CHAPTER_DIR/{chapter_id}.txt
        if project_id:
            nested_dir = get_chapter_dir(project_id, chapter_id)
            new_path = _find_file(nested_dir, "chapter.txt")
            if new_path:
                return new_path

            text_dir = get_project_text_dir(project_id)
            for cand in [f"{chapter_id}.txt", f"{chapter_id}_0.txt"]:
                old_path = _find_file(text_dir, cand)
                if old_path:
                    return old_path

        # Fallback to global
        text_dirs = [CHAPTER_DIR]
        if fallback_dir:
            text_dirs.insert(0, fallback_dir)

        for text_dir in text_dirs:
            for cand in [f"{chapter_id}.txt", f"{chapter_id}_0.txt"]:
                global_path = _find_file(text_dir, cand)
                if global_path:
                    return global_path

    elif asset_type == "audio":
        # New: project/chapters/{chapter_id}/chapter.wav (or chapter.m4a/mp3)
        # Old: project/audio/{audio_file_path or chapter_id.wav}
        # Global: fallback_dir or XTTS_OUT_DIR/{filename or chapter_id.wav}
        if project_id:
            nested_dir = get_chapter_dir(project_id, chapter_id)
            if filename:
                new_path = _find_file(nested_dir, filename)
                if new_path:
                    return new_path

                # Map chapter_id.wav -> chapter.wav in new layout if chapter.wav exists
                if filename == f"{chapter_id}.wav":
                    new_main = _find_file(nested_dir, "chapter.wav")
                    if new_main:
                        return new_main

                old_path = _find_file(get_project_audio_dir(project_id), filename)
                if old_path:
                    return old_path
            else:
                # Try standard names in nested dir
                for ext in [".wav", ".m4a", ".mp3"]:
                    new_path = _find_file(nested_dir, f"chapter{ext}")
                    if new_path:
                        return new_path

                # Fallback to standard legacy names
                audio_dir = get_project_audio_dir(project_id)
                for cand in [
                    f"{chapter_id}.wav",
                    f"{chapter_id}_0.wav",
                    f"{chapter_id}.mp3",
                    f"{chapter_id}_0.mp3",
                ]:
                    old_path = _find_file(audio_dir, cand)
                    if old_path:
                        return old_path

        # Fallback to global
        audio_dirs = [XTTS_OUT_DIR]
        if fallback_dir:
            audio_dirs.insert(0, fallback_dir)

        for audio_dir in audio_dirs:
            if filename:
                cand = _find_file(audio_dir, filename)
                if cand:
                    return cand

            for cand_name in [
                f"{chapter_id}.wav",
                f"{chapter_id}_0.wav",
                f"{chapter_id}.mp3",
                f"{chapter_id}_0.mp3",
            ]:
                old_path = _find_file(audio_dir, cand_name)
                if old_path:
                    return old_path

    elif asset_type == "segment":
        # New: project/chapters/{chapter_id}/segments/{segment_id}.wav
        # Old: project/audio/chunk_{segment_id}.wav
        # Global: fallback_dir or XTTS_OUT_DIR/chunk_{segment_id}.wav
        if project_id:
            nested_dir = get_chapter_dir(project_id, chapter_id)
            if filename:
                # If it's a full chunk filename, extract the segment ID
                if filename.startswith("chunk_"):
                    sid = filename.replace("chunk_", "").replace(".wav", "")
                else:
                    sid = filename.replace(".wav", "")

                # Rule: match from subfolder
                try:
                    seg_dir = secure_join_flat(nested_dir, "segments")
                    new_path = _find_file(seg_dir, f"{sid}.wav")
                    if new_path:
                        return new_path
                except (OSError, ValueError):
                    pass

                legacy_name = filename if filename.startswith("chunk_") else f"chunk_{filename}.wav"
                old_path = _find_file(get_project_audio_dir(project_id), legacy_name)
                if old_path:
                    return old_path

        # Fallback to global
        audio_dirs = [XTTS_OUT_DIR]
        if fallback_dir:
            audio_dirs.insert(0, fallback_dir)

        for audio_dir in audio_dirs:
            if filename:
                legacy_name = filename if filename.startswith("chunk_") else f"chunk_{filename}.wav"
                old_path = _find_file(audio_dir, legacy_name)
                if old_path:
                    return old_path

    return None

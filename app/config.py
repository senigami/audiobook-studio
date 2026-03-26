import os
import re
import uuid
from pathlib import Path

BASE_DIR = Path(os.getenv("AUDIOBOOK_BASE_DIR", str(Path(__file__).resolve().parents[1])))

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


def _canonical_project_id(project_id: str) -> str:
    try:
        return str(uuid.UUID(project_id))
    except (ValueError, TypeError, AttributeError):
        if isinstance(project_id, str) and SAFE_PROJECT_ID_RE.fullmatch(project_id):
            return project_id
        raise ValueError(f"Invalid project id: {project_id}")


def find_existing_project_dir(project_id: str) -> Path | None:
    canonical_project_id = _canonical_project_id(project_id)
    if not PROJECTS_DIR.exists():
        return None
    try:
        for entry in PROJECTS_DIR.iterdir():
            if entry.is_dir() and entry.name == canonical_project_id:
                return entry.resolve()
    except OSError:
        return None
    return None


def find_existing_project_subdir(project_id: str, dirname: str) -> Path | None:
    project_dir = find_existing_project_dir(project_id)
    if not project_dir or not project_dir.exists():
        return None
    try:
        for entry in project_dir.iterdir():
            if entry.is_dir() and entry.name == dirname:
                return entry.resolve()
    except OSError:
        return None
    return None


def get_project_dir(project_id: str) -> Path:
    canonical_project_id = _canonical_project_id(project_id)
    existing_dir = find_existing_project_dir(canonical_project_id)
    if existing_dir:
        return existing_dir

    projects_root = os.fspath(PROJECTS_DIR.resolve())
    fullpath = os.path.abspath(os.path.normpath(os.path.join(projects_root, canonical_project_id)))
    if not fullpath.startswith(projects_root + os.sep) and fullpath != projects_root:
        raise ValueError(f"Invalid project id: {project_id}")
    return Path(fullpath)

def get_project_audio_dir(project_id: str) -> Path:
    existing_dir = find_existing_project_subdir(project_id, "audio")
    if existing_dir:
        return existing_dir
    project_dir = get_project_dir(project_id)
    return project_dir / "audio"

def get_project_text_dir(project_id: str) -> Path:
    existing_dir = find_existing_project_subdir(project_id, "text")
    if existing_dir:
        return existing_dir
    project_dir = get_project_dir(project_id)
    return project_dir / "text"

def get_project_m4b_dir(project_id: str) -> Path:
    existing_dir = find_existing_project_subdir(project_id, "m4b")
    if existing_dir:
        return existing_dir
    project_dir = get_project_dir(project_id)
    return project_dir / "m4b"

def get_project_cover_dir(project_id: str) -> Path:
    existing_dir = find_existing_project_subdir(project_id, "cover")
    if existing_dir:
        return existing_dir
    project_dir = get_project_dir(project_id)
    return project_dir / "cover"

# XTTS warning threshold you saw
SENT_CHAR_LIMIT = 500
SAFE_SPLIT_TARGET = 450

PART_CHAR_LIMIT = 30000
MAKE_MP3_DEFAULT = False
MP3_QUALITY = "2"  # ffmpeg -q:a 2
AUDIOBOOK_BITRATE = "64k"
BASELINE_XTTS_CPS = 16.7

import os
import re
from pathlib import Path

BASE_DIR = Path(os.getenv("AUDIOBOOK_BASE_DIR", str(Path(__file__).resolve().parents[1])))

CHAPTER_DIR = Path(os.getenv("CHAPTER_DIR", str(BASE_DIR / "chapters" if (BASE_DIR / "chapters").exists() else BASE_DIR / "chapters_out")))
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
SAFE_PROJECT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")

def get_project_dir(project_id: str) -> Path:
    if not SAFE_PROJECT_ID_RE.fullmatch(project_id):
        raise ValueError(f"Invalid project id: {project_id}")
    base_dir = os.path.abspath(os.path.normpath(os.fspath(PROJECTS_DIR)))
    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_dir, project_id)))
    if not fullpath.startswith(base_dir + os.sep) and fullpath != base_dir:
        raise ValueError(f"Invalid project id: {project_id}")
    d = Path(fullpath)
    d.mkdir(parents=True, exist_ok=True)
    return d

def get_project_audio_dir(project_id: str) -> Path:
    base_dir = os.path.abspath(os.path.normpath(os.fspath(get_project_dir(project_id))))
    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_dir, "audio")))
    if not fullpath.startswith(base_dir + os.sep) and fullpath != base_dir:
        raise ValueError(f"Invalid audio directory for project id: {project_id}")
    d = Path(fullpath)
    d.mkdir(parents=True, exist_ok=True)
    return d

def get_project_text_dir(project_id: str) -> Path:
    base_dir = os.path.abspath(os.path.normpath(os.fspath(get_project_dir(project_id))))
    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_dir, "text")))
    if not fullpath.startswith(base_dir + os.sep) and fullpath != base_dir:
        raise ValueError(f"Invalid text directory for project id: {project_id}")
    d = Path(fullpath)
    d.mkdir(parents=True, exist_ok=True)
    return d

def get_project_m4b_dir(project_id: str) -> Path:
    base_dir = os.path.abspath(os.path.normpath(os.fspath(get_project_dir(project_id))))
    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_dir, "m4b")))
    if not fullpath.startswith(base_dir + os.sep) and fullpath != base_dir:
        raise ValueError(f"Invalid m4b directory for project id: {project_id}")
    d = Path(fullpath)
    d.mkdir(parents=True, exist_ok=True)
    return d


# Your existing environments (adjust only if different)
XTTS_ENV_ACTIVATE = Path.home() / "xtts-env" / "bin" / "activate"

# XTTS warning threshold you saw
SENT_CHAR_LIMIT = 500
SAFE_SPLIT_TARGET = 450

PART_CHAR_LIMIT = 30000
MAKE_MP3_DEFAULT = False
MP3_QUALITY = "2"  # ffmpeg -q:a 2
AUDIOBOOK_BITRATE = "64k"
BASELINE_XTTS_CPS = 16.7

#!/usr/bin/env python3
import json
import re
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "audiobook_studio.db"
PROJECTS_DIR = ROOT / "projects"
BACKUP_DIR = ROOT / "reports"


M4B_TITLE_SUFFIX_RE = re.compile(
    r"_(?:[0-9a-f]{8})?_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$",
    re.IGNORECASE,
)


def backup_db() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"audiobook_studio_recovery_backup_{timestamp}.db"
    shutil.copy2(DB_PATH, backup_path)
    return backup_path


def ffprobe_tags(path: Path) -> dict:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration:format_tags=title,artist,album",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        data = json.loads(result.stdout)
        fmt = data.get("format", {})
        return {
            "duration_seconds": float(fmt["duration"]) if fmt.get("duration") else None,
            "title": (fmt.get("tags") or {}).get("title"),
            "artist": (fmt.get("tags") or {}).get("artist"),
            "album": (fmt.get("tags") or {}).get("album"),
        }
    except Exception:
        return {"duration_seconds": None, "title": None, "artist": None, "album": None}


def clean_heading(text: str) -> str:
    if not text:
        return ""
    text = text.strip()
    text = re.sub(r"^;+|;+$", "", text).strip()
    text = text.strip('"“”')
    text = re.sub(r"\s+", " ", text).strip()
    return text


def infer_project_name(project_id: str, project_dir: Path) -> tuple[str, str | None]:
    m4b_dir = project_dir / "m4b"
    if m4b_dir.exists():
        m4bs = sorted((p for p in m4b_dir.glob("*.m4b") if p.is_file()), key=lambda p: p.stat().st_mtime, reverse=True)
        for m4b in m4bs:
            tags = ffprobe_tags(m4b)
            title = clean_heading(tags.get("title") or "")
            if title:
                return title, tags.get("artist") or None
            stem = M4B_TITLE_SUFFIX_RE.sub("", m4b.stem)
            if stem:
                return stem, None

    text_dir = project_dir / "text"
    if text_dir.exists():
        for txt in sorted(text_dir.glob("*.txt"), key=lambda p: p.stat().st_mtime):
            for line in txt.read_text(encoding="utf-8", errors="replace").splitlines():
                line = clean_heading(line)
                if line:
                    return f"Recovered Project {project_id[:8]}", None

    return f"Recovered Project {project_id[:8]}", None


def infer_cover_path(project_id: str, project_dir: Path) -> str | None:
    m4b_dir = project_dir / "m4b"
    if not m4b_dir.exists():
        return None
    images = sorted(
        [p for p in m4b_dir.iterdir() if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not images:
        return None
    return f"/projects/{project_id}/m4b/{images[0].name}"


def infer_chapter_title(txt_path: Path) -> str:
    content = txt_path.read_text(encoding="utf-8", errors="replace")
    for line in content.splitlines():
        title = clean_heading(line)
        if title:
            return title[:160]
    return txt_path.stem


def audio_match_for_chapter(project_dir: Path, chapter_id: str) -> tuple[str | None, float | None, float]:
    audio_dir = project_dir / "audio"
    if not audio_dir.exists():
        return None, None, 0.0

    candidates = []
    for name in [
        f"{chapter_id}_0.mp3",
        f"{chapter_id}_0.wav",
        f"{chapter_id}_0.m4a",
        f"{chapter_id}.mp3",
        f"{chapter_id}.wav",
        f"{chapter_id}.m4a",
    ]:
        p = audio_dir / name
        if p.exists():
            tags = ffprobe_tags(p)
            return name, p.stat().st_mtime, tags.get("duration_seconds") or 0.0
        candidates.append(p)
    return None, None, 0.0


def text_counts(text: str) -> tuple[int, int, int]:
    char_count = len(text)
    word_count = len(re.findall(r"\b\w+\b", text))
    sent_count = len(re.findall(r"[.!?]+", text))
    return char_count, word_count, sent_count


def ensure_project_row(conn: sqlite3.Connection, project_id: str, name: str, author: str | None = None, cover_image_path: str | None = None) -> bool:
    existing = conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone()
    if existing:
        return False
    now = time.time()
    conn.execute(
        """
        INSERT INTO projects (id, name, series, author, cover_image_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (project_id, name, "Recovered", author, cover_image_path, now, now),
    )
    return True


def recover_project_folders(conn: sqlite3.Connection) -> dict:
    recovered_projects = 0
    recovered_chapters = 0

    for project_dir in sorted((p for p in PROJECTS_DIR.iterdir() if p.is_dir()), key=lambda p: p.name):
        project_id = project_dir.name
        name, author = infer_project_name(project_id, project_dir)
        cover_path = infer_cover_path(project_id, project_dir)
        if ensure_project_row(conn, project_id, name, author=author, cover_image_path=cover_path):
            recovered_projects += 1

        text_dir = project_dir / "text"
        if not text_dir.exists():
            continue

        existing_chapter_ids = {
            row[0]
            for row in conn.execute("SELECT id FROM chapters WHERE project_id = ?", (project_id,))
        }

        text_files = sorted(text_dir.glob("*.txt"), key=lambda p: (p.stat().st_mtime, p.name))
        next_sort = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM chapters WHERE project_id = ?",
            (project_id,),
        ).fetchone()[0]

        for txt in text_files:
            chapter_id = txt.stem.rsplit("_", 1)[0]
            if chapter_id in existing_chapter_ids:
                continue

            text = txt.read_text(encoding="utf-8", errors="replace")
            title = infer_chapter_title(txt)
            audio_file_path, audio_generated_at, audio_length_seconds = audio_match_for_chapter(project_dir, chapter_id)
            audio_status = "done" if audio_file_path else "unprocessed"
            char_count, word_count, sent_count = text_counts(text)
            conn.execute(
                """
                INSERT INTO chapters (
                    id, project_id, title, text_content, sort_order, audio_status, audio_file_path,
                    text_last_modified, audio_generated_at, char_count, word_count, predicted_audio_length,
                    audio_length_seconds, sent_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    chapter_id,
                    project_id,
                    title,
                    text,
                    next_sort,
                    audio_status,
                    audio_file_path,
                    txt.stat().st_mtime,
                    audio_generated_at,
                    char_count,
                    word_count,
                    0.0,
                    audio_length_seconds,
                    sent_count,
                ),
            )
            next_sort += 1
            recovered_chapters += 1

    return {"recovered_projects": recovered_projects, "recovered_chapters": recovered_chapters}


def recover_orphan_project_rows(conn: sqlite3.Connection) -> int:
    recovered = 0
    orphan_ids = conn.execute(
        """
        SELECT DISTINCT c.project_id
        FROM chapters c
        LEFT JOIN projects p ON p.id = c.project_id
        WHERE p.id IS NULL
        """
    ).fetchall()
    for (project_id,) in orphan_ids:
        chapter_titles = [r[0] for r in conn.execute("SELECT title FROM chapters WHERE project_id = ? ORDER BY sort_order, title", (project_id,))]
        if chapter_titles:
            base = clean_heading(chapter_titles[0]) or f"Recovered Project {project_id[:8]}"
            name = f"Recovered Import {project_id[:8]}"
            if len(chapter_titles) == 2 and all(t.lower().startswith("chapter_") for t in chapter_titles):
                name = f"Recovered Import {project_id[:8]}"
        else:
            name = f"Recovered Import {project_id[:8]}"
        if ensure_project_row(conn, project_id, name):
            recovered += 1

        # Normalize sort_order when older backups have duplicates like all 0.
        rows = conn.execute("SELECT id FROM chapters WHERE project_id = ? ORDER BY sort_order, title, id", (project_id,)).fetchall()
        for idx, row in enumerate(rows):
            conn.execute("UPDATE chapters SET sort_order = ? WHERE id = ?", (idx, row[0]))
    return recovered


def main() -> int:
    if not DB_PATH.exists():
        print(f"Database not found: {DB_PATH}", file=sys.stderr)
        return 1
    backup_path = backup_db()
    conn = sqlite3.connect(DB_PATH)
    try:
        folder_result = recover_project_folders(conn)
        orphan_projects = recover_orphan_project_rows(conn)
        conn.commit()
    finally:
        conn.close()

    print(f"Backup written to: {backup_path}")
    print(f"Recovered project rows from folders: {folder_result['recovered_projects']}")
    print(f"Recovered chapter rows from text files: {folder_result['recovered_chapters']}")
    print(f"Recovered orphan project rows from DB-only chapters: {orphan_projects}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

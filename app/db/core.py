import sqlite3
import os
import logging
import threading
import sys
import tempfile
from pathlib import Path

# Use a connection pool or a single connection with a lock
_db_lock = threading.RLock()
DB_PATH = Path(os.getenv("DB_PATH", "audiobook_studio.db"))
STUDIO_DB_PATH = Path(os.getenv("STUDIO_DB_PATH", "studio.db"))
logger = logging.getLogger(__name__)


def _running_under_test() -> bool:
    return (
        os.getenv("APP_TEST_MODE") == "1"
        or "pytest" in sys.modules
        or "PYTEST_CURRENT_TEST" in os.environ
    )


def get_db_path() -> Path:
    return Path(os.getenv("DB_PATH", os.fspath(DB_PATH)))


def get_studio_db_path() -> Path:
    return Path(os.getenv("STUDIO_DB_PATH", os.fspath(STUDIO_DB_PATH)))


def _assert_safe_db_path_for_tests(db_path: Path) -> None:
    if not _running_under_test():
        return

    db_name = db_path.name.lower()
    if "test" in db_name:
        return

    try:
        raw_db_path = db_path.expanduser()
        resolved_db_path = raw_db_path.resolve()
        raw_temp_root = Path(tempfile.gettempdir())
        resolved_temp_root = raw_temp_root.resolve()
        if (
            resolved_db_path.is_relative_to(resolved_temp_root)
            or resolved_db_path.is_relative_to(Path("/tmp").resolve())
            or resolved_db_path.is_relative_to(Path("/var").resolve())
        ):
            return
    except Exception:
        logger.debug("Failed to normalize DB path while validating test DB safety", exc_info=True)

    raise RuntimeError(
        f"Refusing to use non-test DB path while running tests: {db_path}. "
        "Set DB_PATH to a test-specific database filename."
    )

def get_connection():
    db_path = get_db_path()
    _assert_safe_db_path_for_tests(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def get_studio_connection():
    db_path = get_studio_db_path()
    _assert_safe_db_path_for_tests(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def verify_and_cleanup_legacy_tables(conn: sqlite3.Connection):
    """
    Safely checks if settings and render_performance_samples tables exist in audiobook_studio.db.
    Validates that studio.db has already initialized these tables, then drops them from audiobook_studio.db.
    """
    cursor = conn.cursor()
    # Check if legacy tables exist in the user project DB
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('settings', 'render_performance_samples');")
    existing_legacy_tables = {row[0] for row in cursor.fetchall()}
    if not existing_legacy_tables:
        return

    try:
        # Validate that the studio DB connection is active and contains the tables
        with get_studio_connection() as studio_conn:
            studio_cursor = studio_conn.cursor()
            studio_cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('settings', 'render_performance_samples');")
            studio_tables = {row[0] for row in studio_cursor.fetchall()}
        # Only drop if the studio DB has successfully initialized these tables
        if "settings" in studio_tables and "render_performance_samples" in studio_tables:
            for table in existing_legacy_tables:
                logger.info(f"Safely dropping legacy table '{table}' from project database after validation.")
                cursor.execute(f"DROP TABLE {table};")
            conn.commit()
    except Exception as exc:
        logger.warning(f"Failed to safely validate and cleanup legacy operational tables: {exc}", exc_info=True)


def init_db():
    global _db_lock
    with _db_lock:
        # 1. Initialize User/Project Database
        with get_connection() as conn:
            cursor = conn.cursor()

            # Projects table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    series TEXT,
                    author TEXT,
                    speaker_profile_name TEXT,
                    cover_image_path TEXT,
                    created_at REAL,
                    updated_at REAL
                )
            """)

            # Chapters table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS chapters (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    text_content TEXT,
                    speaker_profile_name TEXT,
                    sort_order INTEGER,
                    audio_status TEXT DEFAULT 'unprocessed',
                    audio_file_path TEXT,
                    audio_generated_at REAL,
                    audio_length_seconds REAL,
                    text_last_modified REAL,
                    predicted_audio_length REAL,
                    char_count INTEGER,
                    word_count INTEGER,
                    FOREIGN KEY (project_id) REFERENCES projects (id)
                )
            """)

            # Processing Queue table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS processing_queue (
                    id TEXT PRIMARY KEY,
                    project_id TEXT,
                    chapter_id TEXT,
                    split_part INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'queued',
                    created_at REAL,
                    started_at REAL,
                    completed_at REAL,
                    error TEXT,
                    FOREIGN KEY (project_id) REFERENCES projects (id),
                    FOREIGN KEY (chapter_id) REFERENCES chapters (id)
                )
            """)

            # Characters table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS characters (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    speaker_profile_name TEXT,
                    default_emotion TEXT,
                    color TEXT DEFAULT '#8b5cf6',
                    FOREIGN KEY (project_id) REFERENCES projects (id)
                )
            """)

            # Chapter Segments table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS chapter_segments (
                    id TEXT PRIMARY KEY,
                    chapter_id TEXT NOT NULL,
                    segment_order INTEGER NOT NULL,
                    text_content TEXT NOT NULL,
                    sanitized_text TEXT,
                    character_id TEXT,
                    speaker_profile_name TEXT,
                    audio_file_path TEXT,
                    audio_status TEXT DEFAULT 'unprocessed',
                    audio_generated_at REAL,
                    FOREIGN KEY (chapter_id) REFERENCES chapters (id),
                    FOREIGN KEY (character_id) REFERENCES characters (id)
                )
            """)

            # Speakers table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS speakers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    default_profile_name TEXT,
                    created_at REAL,
                    updated_at REAL
                )
            """)

            # Projects/User migrations
            def add_column_if_missing(sql: str, label: str):
                try:
                    cursor.execute(sql)
                except sqlite3.OperationalError as exc:
                    if "duplicate column name" not in str(exc).lower():
                        logger.warning("Failed to apply %s migration", label, exc_info=True)

            add_column_if_missing("ALTER TABLE chapter_segments ADD COLUMN speaker_profile_name TEXT", "chapter_segments.speaker_profile_name")
            add_column_if_missing("ALTER TABLE chapters ADD COLUMN speaker_profile_name TEXT", "chapters.speaker_profile_name")
            add_column_if_missing("ALTER TABLE projects ADD COLUMN speaker_profile_name TEXT", "projects.speaker_profile_name")
            add_column_if_missing("ALTER TABLE chapter_segments ADD COLUMN sanitized_text TEXT", "chapter_segments.sanitized_text")
            add_column_if_missing("ALTER TABLE processing_queue ADD COLUMN started_at REAL", "processing_queue.started_at")
            add_column_if_missing("ALTER TABLE processing_queue ADD COLUMN completed_at REAL", "processing_queue.completed_at")
            add_column_if_missing("ALTER TABLE processing_queue ADD COLUMN error TEXT", "processing_queue.error")
            add_column_if_missing("ALTER TABLE processing_queue ADD COLUMN custom_title TEXT", "processing_queue.custom_title")
            add_column_if_missing("ALTER TABLE processing_queue ADD COLUMN engine TEXT", "processing_queue.engine")

            # Migration: Ensure project_id and chapter_id allow NULLs for system tasks
            try:
                cursor.execute("PRAGMA table_info(processing_queue)")
                columns = cursor.fetchall()
                needs_migration = False
                for col in columns:
                    if col[1] == 'project_id' and col[3] == 1: # NOT NULL flag
                        needs_migration = True
                        break

                if needs_migration:
                    logger.info("Migrating processing_queue to remove NOT NULL constraints")
                    with conn:
                        cursor.execute("ALTER TABLE processing_queue RENAME TO _processing_queue_old")
                        cursor.execute("""
                            CREATE TABLE processing_queue (
                                id TEXT PRIMARY KEY,
                                project_id TEXT,
                                chapter_id TEXT,
                                split_part INTEGER DEFAULT 0,
                                status TEXT DEFAULT 'queued',
                                created_at REAL,
                                started_at REAL,
                                completed_at REAL,
                                error TEXT,
                                custom_title TEXT,
                                engine TEXT,
                                FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
                                FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE CASCADE
                            )
                        """)
                        cursor.execute("""
                            INSERT INTO processing_queue (id, project_id, chapter_id, split_part, status, created_at, started_at, completed_at, error, custom_title, engine)
                            SELECT id, project_id, chapter_id, split_part, status, created_at, started_at, completed_at, NULL, custom_title, NULL
                            FROM _processing_queue_old
                        """)
                        cursor.execute("DROP TABLE _processing_queue_old")
            except Exception:
                logger.warning("Failed to migrate processing_queue NULL constraints", exc_info=True)

            conn.commit()

        # 2. Initialize Studio Operational Database
        with get_studio_connection() as studio_conn:
            studio_cursor = studio_conn.cursor()

            studio_cursor.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)

            studio_cursor.execute("""
                CREATE TABLE IF NOT EXISTS render_performance_samples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT,
                    project_id TEXT,
                    chapter_id TEXT,
                    engine TEXT NOT NULL,
                    tts_model TEXT,
                    speaker_profile TEXT,
                    chars INTEGER NOT NULL,
                    word_count INTEGER DEFAULT 0,
                    segment_count INTEGER NOT NULL,
                    render_group_count INTEGER DEFAULT 0,
                    started_at REAL,
                    completed_at REAL NOT NULL,
                    duration_seconds REAL NOT NULL,
                    synthesis_duration_seconds REAL NOT NULL DEFAULT 0.0,
                    inter_group_overhead_seconds REAL NOT NULL DEFAULT 0.0,
                    sample_type TEXT,
                    cps REAL NOT NULL,
                    seconds_per_segment REAL NOT NULL,
                    audio_duration_seconds REAL,
                    make_mp3 INTEGER DEFAULT 0
                )
            """)

            studio_cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_render_performance_completed_at
                ON render_performance_samples (completed_at)
            """)

            # Operational migrations
            def add_studio_column_if_missing(sql: str, label: str):
                try:
                    studio_cursor.execute(sql)
                except sqlite3.OperationalError as exc:
                    if "duplicate column name" not in str(exc).lower():
                        logger.warning("Failed to apply %s migration", label, exc_info=True)

            add_studio_column_if_missing("ALTER TABLE render_performance_samples ADD COLUMN job_id TEXT", "render_performance_samples.job_id")
            add_studio_column_if_missing("ALTER TABLE render_performance_samples ADD COLUMN project_id TEXT", "render_performance_samples.project_id")
            add_studio_column_if_missing("ALTER TABLE render_performance_samples ADD COLUMN chapter_id TEXT", "render_performance_samples.chapter_id")
            add_studio_column_if_missing("ALTER TABLE render_performance_samples ADD COLUMN tts_model TEXT", "render_performance_samples.tts_model")
            add_studio_column_if_missing("ALTER TABLE render_performance_samples ADD COLUMN started_at REAL", "render_performance_samples.started_at")
            add_studio_column_if_missing("ALTER TABLE render_performance_samples ADD COLUMN audio_duration_seconds REAL", "render_performance_samples.audio_duration_seconds")
            add_studio_column_if_missing("ALTER TABLE render_performance_samples ADD COLUMN word_count INTEGER DEFAULT 0", "render_performance_samples.word_count")
            add_studio_column_if_missing("ALTER TABLE render_performance_samples ADD COLUMN make_mp3 INTEGER DEFAULT 0", "render_performance_samples.make_mp3")
            add_studio_column_if_missing("ALTER TABLE render_performance_samples ADD COLUMN synthesis_duration_seconds REAL NOT NULL DEFAULT 0.0", "render_performance_samples.synthesis_duration_seconds")
            add_studio_column_if_missing("ALTER TABLE render_performance_samples ADD COLUMN inter_group_overhead_seconds REAL NOT NULL DEFAULT 0.0", "render_performance_samples.inter_group_overhead_seconds")
            add_studio_column_if_missing("ALTER TABLE render_performance_samples ADD COLUMN sample_type TEXT", "render_performance_samples.sample_type")

            studio_conn.commit()


        # 3. Safe validation and clean up of legacy tables from user DB
        with get_connection() as conn:
            verify_and_cleanup_legacy_tables(conn)

        from .performance import apply_performance_retention_policy
        apply_performance_retention_policy()

"""Migration version 3: processing_queue_nullable_ids (#245).

Legacy databases created ``processing_queue`` with ``project_id`` and
``chapter_id`` NOT NULL, which system tasks (no project/chapter) cannot
satisfy. SQLite cannot drop a NOT NULL in place, so the table is rebuilt.
This used to run inside ``init_db`` behind a swallowing ``except``; on the
runner a failure now aborts boot and rolls the rebuild back.

A no-op on any table where ``project_id`` is already nullable (every fresh
database).
"""
from __future__ import annotations

import sqlite3

_COPY_COLUMNS = [
    "id",
    "project_id",
    "chapter_id",
    "segment_ids",
    "split_part",
    "status",
    "created_at",
    "started_at",
    "completed_at",
    "error",
    "custom_title",
    "engine",
]

# Used for a column the legacy table predates.
_DEFAULTS = {
    "split_part": "0",
    "status": "'queued'",
}


def migrate_003_queue_nullable_ids(conn: sqlite3.Connection) -> None:
    columns = conn.execute("PRAGMA table_info(processing_queue)").fetchall()
    if not any(col[1] == "project_id" and col[3] == 1 for col in columns):
        return

    conn.execute("ALTER TABLE processing_queue RENAME TO _processing_queue_old")
    conn.execute(
        """
        CREATE TABLE processing_queue (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            chapter_id TEXT,
            segment_ids TEXT,
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
        """
    )
    old_columns = {col[1] for col in conn.execute("PRAGMA table_info(_processing_queue_old)")}
    select_exprs = [
        column if column in old_columns else _DEFAULTS.get(column, "NULL")
        for column in _COPY_COLUMNS
    ]
    conn.execute(
        f"""
        INSERT INTO processing_queue ({", ".join(_COPY_COLUMNS)})
        SELECT {", ".join(select_exprs)}
        FROM _processing_queue_old
        """
    )
    conn.execute("DROP TABLE _processing_queue_old")
    # The old table's index went with it.
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_processing_queue_chapter_status
        ON processing_queue (chapter_id, status)
        """
    )

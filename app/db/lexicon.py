"""Pronunciation lexicon DB access.

Provides CRUD operations for the per-project ``lexicon`` table.
All SQL is parameterized.  All writes use the shared ``_db_lock``.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from .core import _db_lock, get_connection


def get_lexicon(project_id: str) -> list[dict[str, Any]]:
    """Return all lexicon entries for *project_id*, ordered by created_at."""
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM lexicon WHERE project_id = ? ORDER BY created_at ASC",
                (project_id,),
            )
            return [dict(row) for row in cursor.fetchall()]


def add_lexicon_entry(project_id: str, word: str, replacement: str) -> str:
    """Insert a new lexicon entry.  Returns the new entry's UUID."""
    entry_id = str(uuid.uuid4())
    created_at = time.time()
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO lexicon (id, project_id, word, replacement, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (entry_id, project_id, word, replacement, created_at),
            )
            conn.commit()
    return entry_id


def update_lexicon_entry(entry_id: str, *, word: str | None = None, replacement: str | None = None) -> bool:
    """Update word and/or replacement for *entry_id*.

    Returns True when a row was updated, False when the entry doesn't exist
    or no updatable fields were provided.
    """
    updates: dict[str, Any] = {}
    if word is not None:
        updates["word"] = word
    if replacement is not None:
        updates["replacement"] = replacement

    if not updates:
        return False

    fields = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [entry_id]

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f"UPDATE lexicon SET {fields} WHERE id = ?", values)
            conn.commit()
            return cursor.rowcount > 0


def delete_lexicon_entry(entry_id: str) -> bool:
    """Delete the lexicon entry with *entry_id*.

    Returns True when a row was deleted, False when not found.
    """
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM lexicon WHERE id = ?", (entry_id,))
            conn.commit()
            return cursor.rowcount > 0

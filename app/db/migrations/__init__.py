"""Versioned, transactional schema-migration runner (see #233).

``runner.py`` holds the mechanism (apply pending migrations in version
order, one transaction per step, backup-before-write, hard-stop on
failure). ``registry.py`` holds the ordered list of actual migrations —
empty today; #232 (chapter_segments redesign) is expected to be the
first entry.
"""
from app.db.migrations.runner import (
    Migration,
    MigrationError,
    backup_database,
    ensure_migrations_table,
    get_applied_versions,
    pending_migrations,
    run_migrations,
)

__all__ = [
    "Migration",
    "MigrationError",
    "backup_database",
    "ensure_migrations_table",
    "get_applied_versions",
    "pending_migrations",
    "run_migrations",
]

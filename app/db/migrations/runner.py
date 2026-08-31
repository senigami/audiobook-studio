"""Mechanism for the versioned schema-migration runner.

Replaces the swallow-and-commit pattern flagged in #233 (the
`processing_queue` NOT NULL rebuild in ``app/db/core.py`` and
``boot.py``'s blanket ``except Exception`` around migration) with one
that a future destructive migration (starting with #232) can build on
safely:

- Applied migrations are recorded in a ``schema_migrations`` table, so a
  migration never runs twice.
- Each migration executes inside one explicit transaction
  (``BEGIN IMMEDIATE`` ... commit-or-rollback) — a failure partway
  through a migration's own DDL/DML never leaves a half-applied change
  committed.
- A failure stops the run immediately and raises ``MigrationError``;
  migrations after the failed one are never attempted, and the caller
  (boot sequence) is expected to abort startup rather than swallow it.
- ``dry_run=True`` runs every pending migration's ``up`` and always
  rolls back, so a migration set can be validated with zero persisted
  effect.
- The database file is copied to a timestamped backup before the first
  write of a real (non-dry-run) run with pending migrations.
"""
from __future__ import annotations

import logging
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional, Sequence

logger = logging.getLogger(__name__)

MigrationFn = Callable[[sqlite3.Connection], None]


@dataclass(frozen=True)
class Migration:
    """One versioned schema change.

    ``version`` must be unique and is the ordering key — migrations run in
    ascending version order regardless of the order they're passed in.
    ``down`` is accepted for future rollback tooling but is not yet invoked
    by the runner itself (see #233 follow-up).
    """

    version: int
    name: str
    up: MigrationFn
    down: Optional[MigrationFn] = None


class MigrationError(RuntimeError):
    """A migration step failed; the underlying exception is chained via ``__cause__``."""


def ensure_migrations_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at REAL NOT NULL
        )
        """
    )
    conn.commit()


def get_applied_versions(conn: sqlite3.Connection) -> set:
    ensure_migrations_table(conn)
    cursor = conn.execute("SELECT version FROM schema_migrations")
    return {row[0] for row in cursor.fetchall()}


def pending_migrations(conn: sqlite3.Connection, migrations: Sequence[Migration]) -> list:
    applied = get_applied_versions(conn)
    return sorted((m for m in migrations if m.version not in applied), key=lambda m: m.version)


def backup_database(db_path: Path) -> Optional[Path]:
    """Consolidate and copy the SQLite database to a timestamped backup.

    Every connection in this codebase runs ``PRAGMA journal_mode=WAL``
    (``app/db/core.py``), so a recently committed write can still be sitting
    in the ``<db>-wal`` sidecar file rather than the main db file. A raw
    file copy never touches that sidecar, so it can silently produce a
    backup that predates committed work (#246) — the file opens fine, it's
    just stale, with no visible sign anything is wrong. ``sqlite3``'s
    online backup API reads through the WAL and writes a single
    self-contained, checkpointed file, so it's immune to this.

    The backup is written to a ``.partial`` path first and only renamed to
    the final name once the copy has fully succeeded, so a crash or error
    mid-backup can never leave a truncated file that looks like a valid,
    complete backup.

    Returns ``None`` (no-op) when ``db_path`` doesn't exist yet — a brand
    new install has no schema to protect.
    """
    if not db_path.exists():
        return None
    backup_path = db_path.with_name(f"{db_path.name}.backup-{int(time.time())}")
    partial_path = backup_path.with_suffix(backup_path.suffix + ".partial")
    source = sqlite3.connect(db_path)
    try:
        dest = sqlite3.connect(partial_path)
        try:
            source.backup(dest)
        finally:
            dest.close()
    finally:
        source.close()
    partial_path.replace(backup_path)
    logger.info("Migration: backed up %s to %s", db_path, backup_path)
    return backup_path


def run_migrations(
    conn: sqlite3.Connection,
    migrations: Sequence[Migration],
    *,
    db_path: Optional[Path] = None,
    dry_run: bool = False,
) -> list:
    """Apply all pending migrations in version order.

    Args:
        conn: an open sqlite3 connection. The caller owns its lifecycle
            (this function does not close it).
        migrations: the full known migration set, in any order.
        db_path: the on-disk path backing ``conn``, used only to take a
            pre-migration backup. Pass ``None`` to skip backup (e.g. an
            in-memory or throwaway test database).
        dry_run: apply and immediately roll back every pending migration,
            recording nothing and applying nothing. A failure still
            raises ``MigrationError``, so this doubles as a validation
            pass.

    Returns:
        The migrations actually applied and committed, in version order.
        Always empty when ``dry_run=True``.

    Raises:
        MigrationError: on the first migration whose ``up`` raises. The
            failing migration's own partial writes are rolled back; the
            transaction for that migration never commits, and no later
            migration in ``migrations`` is attempted.
    """
    to_run = pending_migrations(conn, migrations)
    if not to_run:
        logger.info("Migration: no pending schema migrations.")
        return []

    if db_path is not None and not dry_run:
        backup_database(db_path)

    applied: list = []
    for migration in to_run:
        label = f"{migration.version:04d}_{migration.name}"
        logger.info("Migration: applying %s%s", label, " (dry-run)" if dry_run else "")
        conn.execute("BEGIN IMMEDIATE")
        try:
            migration.up(conn)
            if dry_run:
                conn.rollback()
                logger.info("Migration: dry-run %s succeeded, rolled back.", label)
                continue
            conn.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                (migration.version, migration.name, time.time()),
            )
            conn.commit()
            applied.append(migration)
            logger.info("Migration: applied %s.", label)
        except Exception as exc:
            conn.rollback()
            logger.error("Migration: %s FAILED, rolled back: %s", label, exc)
            raise MigrationError(f"Migration {label} failed") from exc

    return applied

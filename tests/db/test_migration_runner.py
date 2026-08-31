"""Tests for the versioned, transactional schema-migration runner (#233).

Exercises app.db.migrations.runner in isolation against a throwaway sqlite
file — never against the shared test DB used by other suites.
"""
import sqlite3
from pathlib import Path

import pytest

from app.db.migrations.runner import (
    Migration,
    MigrationError,
    backup_database,
    ensure_migrations_table,
    get_applied_versions,
    pending_migrations,
    run_migrations,
)


@pytest.fixture
def conn(tmp_path):
    db_path = tmp_path / "runner_test.db"
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    yield connection
    connection.close()


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "runner_test.db"


def make_migration(version, name, table_name, should_fail=False):
    def up(c: sqlite3.Connection) -> None:
        if should_fail:
            c.execute(f"CREATE TABLE {table_name} (id INTEGER PRIMARY KEY)")
            raise RuntimeError("simulated failure mid-migration")
        c.execute(f"CREATE TABLE {table_name} (id INTEGER PRIMARY KEY)")

    return Migration(version=version, name=name, up=up)


def table_exists(c: sqlite3.Connection, table_name: str) -> bool:
    row = c.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
    ).fetchone()
    return row is not None


class TestEnsureMigrationsTable:
    def test_creates_schema_migrations_table(self, conn):
        ensure_migrations_table(conn)
        assert table_exists(conn, "schema_migrations")

    def test_idempotent(self, conn):
        ensure_migrations_table(conn)
        ensure_migrations_table(conn)  # must not raise


class TestPendingMigrations:
    def test_all_pending_when_none_applied(self, conn):
        migrations = [make_migration(1, "a", "t_a"), make_migration(2, "b", "t_b")]
        assert pending_migrations(conn, migrations) == migrations

    def test_excludes_already_applied(self, conn):
        ensure_migrations_table(conn)
        conn.execute(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, 'a', 0)"
        )
        conn.commit()
        migrations = [make_migration(1, "a", "t_a"), make_migration(2, "b", "t_b")]
        result = pending_migrations(conn, migrations)
        assert [m.version for m in result] == [2]

    def test_sorted_by_version_regardless_of_input_order(self, conn):
        migrations = [make_migration(3, "c", "t_c"), make_migration(1, "a", "t_a")]
        result = pending_migrations(conn, migrations)
        assert [m.version for m in result] == [1, 3]


class TestRunMigrations:
    def test_applies_pending_migrations_in_order(self, conn):
        migrations = [make_migration(2, "b", "t_b"), make_migration(1, "a", "t_a")]
        applied = run_migrations(conn, migrations)
        assert [m.version for m in applied] == [1, 2]
        assert table_exists(conn, "t_a")
        assert table_exists(conn, "t_b")
        applied_versions = get_applied_versions(conn)
        assert applied_versions == {1, 2}

    def test_records_applied_at_timestamp(self, conn):
        run_migrations(conn, [make_migration(1, "a", "t_a")])
        row = conn.execute(
            "SELECT version, name, applied_at FROM schema_migrations WHERE version=1"
        ).fetchone()
        assert row["name"] == "a"
        assert row["applied_at"] > 0

    def test_already_applied_migrations_are_skipped(self, conn):
        run_migrations(conn, [make_migration(1, "a", "t_a")])
        # Re-running with the same migration set (plus a new one) must not
        # re-execute migration 1's `up` (which would raise on CREATE TABLE
        # against an existing table) and must apply only what's new.
        applied = run_migrations(
            conn, [make_migration(1, "a", "t_a"), make_migration(2, "b", "t_b")]
        )
        assert [m.version for m in applied] == [2]

    def test_no_pending_migrations_returns_empty_list(self, conn):
        assert run_migrations(conn, []) == []

    def test_failed_migration_rolls_back_and_raises(self, conn):
        migrations = [make_migration(1, "bad", "t_bad", should_fail=True)]
        with pytest.raises(MigrationError):
            run_migrations(conn, migrations)
        # The partial DDL from the failed migration must not survive rollback.
        assert not table_exists(conn, "t_bad")
        assert get_applied_versions(conn) == set()

    def test_failure_stops_later_migrations_from_running(self, conn):
        migrations = [
            make_migration(1, "bad", "t_bad", should_fail=True),
            make_migration(2, "later", "t_later"),
        ]
        with pytest.raises(MigrationError):
            run_migrations(conn, migrations)
        assert not table_exists(conn, "t_later")
        assert get_applied_versions(conn) == set()

    def test_migration_before_failure_stays_committed(self, conn):
        migrations = [
            make_migration(1, "good", "t_good"),
            make_migration(2, "bad", "t_bad", should_fail=True),
        ]
        with pytest.raises(MigrationError):
            run_migrations(conn, migrations)
        assert table_exists(conn, "t_good")
        assert get_applied_versions(conn) == {1}

    def test_dry_run_applies_nothing(self, conn):
        migrations = [make_migration(1, "a", "t_a")]
        applied = run_migrations(conn, migrations, dry_run=True)
        assert applied == []
        assert not table_exists(conn, "t_a")
        assert get_applied_versions(conn) == set()

    def test_dry_run_surfaces_a_failing_migration(self, conn):
        migrations = [make_migration(1, "bad", "t_bad", should_fail=True)]
        with pytest.raises(MigrationError):
            run_migrations(conn, migrations, dry_run=True)
        assert not table_exists(conn, "t_bad")


class TestBackupDatabase:
    def test_backs_up_existing_file(self, tmp_path):
        db_path = tmp_path / "real.db"
        source = sqlite3.connect(db_path)
        source.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)")
        source.commit()
        source.close()
        backup_path = backup_database(db_path)
        assert backup_path is not None
        assert backup_path.exists()
        backup_conn = sqlite3.connect(backup_path)
        try:
            assert table_exists(backup_conn, "t")
        finally:
            backup_conn.close()

    def test_backup_includes_writes_still_only_in_the_wal_sidecar(self, tmp_path):
        """Regression test for #246.

        With ``PRAGMA journal_mode=WAL`` (set on every connection in
        ``app/db/core.py``), a committed write can live in the ``<db>-wal``
        sidecar file until a checkpoint moves it into the main db file. A
        raw ``shutil.copy2`` of just the main file silently produces a
        backup that predates that write — the restore looks fine (the file
        opens) but has quietly rewound past committed data.
        """
        db_path = tmp_path / "real.db"
        writer = sqlite3.connect(db_path)
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)")
        writer.commit()
        writer.execute("INSERT INTO t (id) VALUES (1)")
        writer.commit()
        # Do NOT close `writer` before backing up: closing the last
        # connection lets SQLite auto-checkpoint the WAL into the main
        # file, which would mask the bug this test exists to catch.
        try:
            assert (tmp_path / "real.db-wal").exists()

            backup_path = backup_database(db_path)

            backup_conn = sqlite3.connect(backup_path)
            try:
                rows = backup_conn.execute("SELECT id FROM t").fetchall()
            finally:
                backup_conn.close()
            assert rows == [(1,)], (
                "backup_database must consolidate the WAL before copying — "
                f"the committed row is missing from the backup, got {rows!r}"
            )
        finally:
            writer.close()

    def test_returns_none_when_no_file_exists_yet(self, tmp_path):
        db_path = tmp_path / "does_not_exist.db"
        assert backup_database(db_path) is None

    def test_run_migrations_backs_up_before_first_write(self, tmp_path, conn, db_path):
        run_migrations(conn, [make_migration(1, "a", "t_a")], db_path=db_path)
        backups = list(tmp_path.glob("runner_test.db.backup-*"))
        assert len(backups) == 1
        # The backup must predate migration 1's own DDL: it must not contain
        # the table that migration 1 creates.
        backup_conn = sqlite3.connect(backups[0])
        try:
            assert not table_exists(backup_conn, "t_a")
        finally:
            backup_conn.close()

    def test_dry_run_does_not_back_up(self, tmp_path, conn, db_path):
        run_migrations(conn, [make_migration(1, "a", "t_a")], db_path=db_path, dry_run=True)
        backups = list(tmp_path.glob("runner_test.db.backup-*"))
        assert backups == []

    def test_no_pending_migrations_does_not_back_up(self, tmp_path, conn, db_path):
        run_migrations(conn, [], db_path=db_path)
        backups = list(tmp_path.glob("runner_test.db.backup-*"))
        assert backups == []

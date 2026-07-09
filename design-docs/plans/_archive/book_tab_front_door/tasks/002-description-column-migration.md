# Task 002 — Additive `description` column + spec update

Status: complete — 2026-07-09

## Goal

Add a `description TEXT` column to the `projects` table, following the exact additive-migration idiom this repo already uses for `series_position`, and update the binding schema spec in the same change (per `CLAUDE.md`'s "behavior changes MUST update the matching spec" rule).

## Why it matters

This is the one piece of real backend work in the plan — everything else (Task 003 onward) depends on this column existing. `update_project()` is already fully generic (see map), so this task's blast radius is deliberately small: schema + spec, nothing else.

## Exact files

- `app/db/core.py` — `init_db()`, the `projects` table definition and its migration guard.
- `design-docs/specs/data-model.md` — the `### projects` table doc (binding spec).

## Target contract

Current state (`app/db/core.py:156-173`):
```python
# Projects table
cursor.execute("""
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        series TEXT,
        series_position INTEGER,
        author TEXT,
        speaker_profile_name TEXT,
        cover_image_path TEXT,
        created_at REAL,
        updated_at REAL
    )
""")
cursor.execute("PRAGMA table_info(projects)")
project_columns = {row[1] for row in cursor.fetchall()}
if "series_position" not in project_columns:
    cursor.execute("ALTER TABLE projects ADD COLUMN series_position INTEGER")
```

Target — add `description TEXT` to the `CREATE TABLE` statement (for fresh DBs) and a matching guarded `ALTER TABLE` (for existing DBs), following the identical shape as `series_position`:
```python
cursor.execute("""
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        series TEXT,
        series_position INTEGER,
        author TEXT,
        speaker_profile_name TEXT,
        cover_image_path TEXT,
        description TEXT,
        created_at REAL,
        updated_at REAL
    )
""")
cursor.execute("PRAGMA table_info(projects)")
project_columns = {row[1] for row in cursor.fetchall()}
if "series_position" not in project_columns:
    cursor.execute("ALTER TABLE projects ADD COLUMN series_position INTEGER")
if "description" not in project_columns:
    cursor.execute("ALTER TABLE projects ADD COLUMN description TEXT")
```

## Pattern to imitate

The `series_position` guard immediately above it in the same function — copy its shape exactly, don't invent a different migration mechanism.

## Steps

- [x] Add `description TEXT` to the `CREATE TABLE IF NOT EXISTS projects` statement in `app/db/core.py`.
- [x] Add the guarded `ALTER TABLE projects ADD COLUMN description TEXT` immediately after the `series_position` guard, following the identical `if "..." not in project_columns:` shape.
- [x] Update `design-docs/specs/data-model.md`'s `### projects` table (currently lines 126-138) to add a `description` row, matching the existing table format:
  ```
  | `description` | TEXT | Optional book description/synopsis shown on the Book tab; NULL when unset |
  ```
- [x] Add a changelog row to `design-docs/specs/data-model.md`'s changelog table (currently starting line 24), following the `1.7.0` row's format, and bump `spec_version` (currently `1.7.0` at line 4) to `1.8.0`.
- [x] Do **not** touch `app/domain/projects/manifest.py` or `app/db/migration.py`'s legacy v1→v2 column list — confirmed in `01-map.md`'s resolved risk note that neither needs this field (manifest is write-once at creation and doesn't sync later edits for any field; there's no legacy v1 data for a field that didn't exist in v1).
- [x] Do **not** add a `description` parameter to `create_project()` in `app/db/projects.py` — a book is created without a description and gets one added later via `update_project()`, matching how every other optional field already works.
- [x] Append a `docs/code-map/queue/` entry per the README's same-change rule.

## Acceptance criteria

- [x] Fresh DB: `init_db()` creates a `projects` table with a `description` column.
- [x] `tests/db/test_db_projects.py` (verified as the existing project-CRUD test file; `test_project_crud` at line 29 is the pattern to extend — it does NOT currently test the migration-guard branch specifically, only fresh-schema CRUD, so match that existing rigor level rather than inventing a separate migration-simulation test unless you judge it warranted) gets a small addition: create a project, call `update_project(project_id, description="...")`, assert `get_project(project_id)["description"]` round-trips correctly, including the empty-string and `None` cases.
- [x] `./venv/bin/python -m pytest tests/db/test_db_projects.py -q` passes.
- [x] `design-docs/specs/data-model.md` has the new column documented and a bumped `spec_version` with a changelog row.

## Dependencies

None — foundation task, parallel-safe with 001 and 005.

## Map links

- Part: **Description field (backend)** (`01-map.md` — The parts)
- Contract: **The migration pattern to copy exactly** (`01-map.md` — Connections & contracts)
- Invariant: **INV-3** (versioned, additive schema changes; spec updated in the same commit)
- Risk: `quality-sensitive` (schema/migration — errors here are hard to reverse on a user's existing DB), `multi-file` (code + spec must agree)

## Out of scope

- The API layer (Task 003).
- The frontend contract (Task 004).
- Any manifest.py or legacy-migration change (confirmed not needed — see map).

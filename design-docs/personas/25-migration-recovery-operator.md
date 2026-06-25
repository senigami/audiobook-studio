# 25 · "Phil Garrett" — Migration & Recovery Operator  ☆ INFERRED

**Identity:** "An enterprise deployment specialist who runs Studio upgrades for large libraries and needs every migration to be explicit, auditable, and safe to abort midway without leaving projects in a partially migrated state."

## Goals
- Run a schema migration and verify that all existing projects load correctly before signing off
- Identify exactly what stale or legacy data was ignored, migrated, or deleted during a cutover
- Detect partially migrated artifacts from an aborted update and resolve them without corrupting active state
- Document what changed in each migration run so future operators can reconstruct the history
- Establish a rollback or re-run path for migrations that fail partway through

## Context & environment *(INFERRED)*
- Linux server running Studio headlessly; occasionally accesses the web UI from a separate workstation for visual verification
- Came to Audiobook Studio through enterprise licensing: manages installations for publishing houses with libraries of 50–200 projects
- Work pattern: upgrades are scheduled maintenance windows; Phil runs them off-hours, verifies each project opens cleanly, then hands back to producers the next morning

## Key workflow moments
- **Pre-migration audit:** Before running migrations, exports a list of all project IDs and their current schema versions so he can diff against post-migration state
- **Migration execution:** Starts the app (which triggers `boot_studio()` → explicit DB migration), watches the log output for per-migration step confirmations, and checks for any warning about rows that could not be migrated
- **Artifact verification:** After migration, opens a sample of projects — especially ones with unusual segment counts or legacy character data — and confirms chapters render the segment list without errors
- **Legacy flag sweep:** Checks for any state.json keys or SQLite columns that were deprecated in this release (e.g., old `span_start`/`span_end` schema) and confirms they are no longer surfaced in the UI
- **Partial-migration recovery:** When a migration aborted midway (power loss, OOM), identifies which projects were migrated and which were not, and re-runs safely using the migration's idempotency guarantees

## Top friction points *(INFERRED)*
- **F1 — No per-migration step log:** The migration runner logs a single "migrations applied" line; there is no structured output showing which migration ran, how many rows it touched, and whether any rows were skipped with a reason
- **F2 — Mixed old/new state sources after abort:** If a migration aborts after partially updating SQLite but before updating state.json, the two sources disagree; there is no reconciliation report and no documented safe re-run path
- **F3 — Legacy flags resurfacing:** Occasionally a project loaded after migration still has a deprecated field populated (e.g., a legacy voice ID format) that was not swept by the migration; this only surfaces as a rendering error, not during migration
- **F4 — No dry-run mode:** Phil cannot preview what a migration will do without actually running it; he works from the source code to estimate impact, which is slow and error-prone at scale
- **F5 — Cutover documentation lives in code, not a migration manifest:** Understanding what changed requires reading the migration function in `app/db/`, not a structured changelog that operators can reference without a dev environment

## What they need from the studio
- A structured migration log: one line per migration step, with row counts and any rows skipped with a skip reason
- A migration manifest file (auto-generated or committed) that operators can read without opening source code
- A re-run guarantee: migrations are idempotent, and running the same migration twice on a partially migrated DB is safe and documented
- A post-migration health check command that opens each project, loads its segments, and reports any that fail validation
- A rollback or re-run path documented explicitly for each migration, even if rollback is "restore from backup and re-run"

## Review lens — questions they ask of any screen
- "What exact stale state does this migration ignore vs. migrate vs. delete — and is that documented somewhere I can hand to a producer?"
- "If I abort this migration midway and restart the app, will it re-run the incomplete step or skip it as already applied?"
- "Which SQLite tables and state.json keys are touched by this release — is there a diff I can review before running?"
- "After migration, how do I confirm that a project with legacy character data is now fully valid under the new schema?"
- "Is there a health check I can run against the full library without opening every project manually?"
- "If a migration added a column with a default, are existing rows backfilled or do they carry NULL until the project is opened?"

## Red flags that make them quit or distrust the app
- A migration that silently drops rows that do not match the new schema without logging what was lost
- A boot sequence that runs migrations inside `app/db/__init__.py` on import, making them impossible to script without starting the full app
- A migration that cannot be re-run safely on a partially migrated database
- No way to identify which projects were affected by a migration without reading raw SQL
- A post-migration app startup that appears successful but has deprecated fields still active in memory

**Evidence basis:** INFERRED. Interview DevOps or IT staff at mid-size publishers running self-hosted media tools; key open question is whether operators primarily work from scripts and logs or rely on the web UI to verify migration outcomes.

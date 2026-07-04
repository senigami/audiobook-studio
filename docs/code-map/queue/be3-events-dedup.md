# BE-3 — Dedupe events.py command sets (code-map queue entry)

Task: `design-docs/plans/active/simplification/05_backend_cleanup.md` BE-3 (target confirmed
by the 2026-07-01 audit correction as `app/api/contracts/events.py`, not `scheduler/events.py`).

Pure refactor, zero behavior change. No exported name, contract version, or wire shape changed.

## Files changed

- `app/api/contracts/events.py` — modified. `JobLifecycleCommand(str, Enum)` members already
  compare/hash equal to their raw string values, so the raw-string duplicates in
  `JOB_LIFECYCLE_COMMANDS` and each set inside `COMMAND_TOPIC_SCOPES`
  (`"jobs.lifecycle"`, `"queue.items"`, `"chapters.progress"`, `"segments.progress"`) were
  redundant "Allow string versions" entries. Removed them, keeping only the enum members, and
  added a short comment on `COMMAND_TOPIC_SCOPES` explaining why raw strings aren't needed.
  Also deduped `SEGMENT_SCOPED_COMMANDS`: removed the raw-string duplicates of the three enum
  members (`START_SEGMENT`, `SEGMENT_PROGRESS`, `SEGMENT_SAVED`) but **kept** the lowercase
  legacy reason codes (`segment_start`, `synthesis_progress`, `segment_saved`) since those are
  not enum members and are still real distinct members of the set.

## Verification

- `./venv/bin/python -c "..."` sanity check: confirmed raw strings (`"JOB_QUEUED"`,
  `"JOB_DONE"`, `"START_SEGMENT"`, `"SEGMENT_SAVED"`) still resolve `in` the relevant sets after
  the dedup, and that each set's `len()` dropped to the expected de-duplicated count
  (8/8/8/4 members respectively) — proving the raw strings were pure duplicates, not distinct
  members.
- `./venv/bin/ruff check app/api/contracts/events.py` — clean.
- `./venv/bin/python -m pytest -q tests/ -k events` — 5 passed, 0 failed.
- No other module (repo-wide `grep`, including `plugins/`) references
  `JOB_LIFECYCLE_COMMANDS` / `COMMAND_TOPIC_SCOPES` / `SEGMENT_SCOPED_COMMANDS` directly, and no
  test asserts on their `len()` or exact membership set, so there was nothing else to update.

## Flow impact

None — `is_command_allowed_for_topic` and all `build_*_event` helpers see identical membership
results before and after; wire shape and envelope version (`version: 1`) unchanged.

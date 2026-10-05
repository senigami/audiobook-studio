# ADR-0013: Segment-Audio Orphan Reconciliation — Per-Book on Open, DB as Truth

**Date:** 2026-06-23
**Status:** Accepted
**Deciders:** Studio owner

## Context

Rendering groups consecutive compatible segments into a **render group** and writes **one** WAV per group into `projects/<pid>/chapters/<cid>/segments/`, named `<batch_timestamp_ns>_<leader_segment_order_index>.wav`. On success that single filename is written as the `audio_file_path` of **every** member segment of the group — the **group→filename fan-out**: many `chapter_segments` rows share one bare filename.

A bug surfaced where a chapter had 145 group WAVs on disk but all of its segment rows were `unprocessed` with `audio_file_path = NULL` (the chapter-level `chapter.wav`/`.m4a` were intact). Root cause: the deletion helper `cleanup_chapter_audio_files` matches a segment file either by exact name (`explicit_files`) or by the `{segment_id}.*` prefix. Group files are named `<ts>_<index>`, never `{segment_id}`, so the prefix branch **structurally never matches them** — they are only deletable via `explicit_files`. A bulk reset (`update_segments_status_bulk('unprocessed')`, re-segmentation, reassignment) NULLs the rows without passing `explicit_files`, stranding the WAVs as **orphans** (on disk, referenced by no row). The pre-existing `cleanup_orphaned_segments` could not be reused: it keys on `file.stem` as a segment id, which would wrongly delete valid *shared* group files.

This raised a policy question — adopt the orphan files back into the DB, or delete them? — and a placement question — where should the reconciliation run?

## Decision

1. **The DB is the source of truth for segment artifacts; orphans are garbage-collected, never adopted.** This is the data-model invariant made concrete: *validated artifact metadata, not raw file existence*. Group WAVs carry no validation sidecar, and after re-segmentation the leader-index→segment mapping is no longer trustworthy, so adopting them by existence could bind wrong audio to text. The authoritative deliverable (`chapter.wav`/`.m4a`) is standalone and unaffected. If per-segment audio is wanted back, the safe path is a re-render, not orphan adoption.

2. **The GC is keyed on referenced filenames, not segment-id stems.** `reconcile_orphan_segment_files_for_project(project_id)` builds the keep-set `{basename(audio_file_path) for that chapter's rows}` and deletes only `segments/` files not in it, via the hardened `cleanup_chapter_audio_files(..., explicit_files=orphans, delete_chapter_outputs=False)`. It skips chapters with an active render (`_chapter_has_active_generation`) and never touches chapter-root outputs.

3. **It runs per-book, on book open — not library-wide at boot.** `GET /api/projects/{id}` schedules it via FastAPI `BackgroundTasks` (after the response, zero added latency). Segment state is never needed until a book is opened, so scanning one library item on demand is correct; scanning all N books on every launch — when ~all have nothing to collect — is wasteful.

## Why not boot-time

The first implementation wired the GC into `boot_studio()`. Because `run.sh` runs `uvicorn --reload`, editing source triggered a reload that re-ran boot — now including the destructive GC — against the real library, silently deleting the orphans before they could be observed. This exposed a general principle that refines [ADR-0006](ADR-0006-explicit-boot-sequence.md):

> **`boot_studio()` side effects re-run on every dev `--reload` restart. Boot MUST NOT host destructive or expensive-at-scale reconciliation.** Such work belongs on an explicit, on-demand trigger.

`cleanup_chapter_audio_files` hard-`unlink()`s (no trash), which makes the "don't run it unexpectedly" point load-bearing.

## Consequences

### Positive
- Startup stays fast and non-destructive regardless of library size.
- Reconciliation cost scales with what the user actually opens.
- DB-as-truth keeps the system from trusting unvalidated stray files.

### Negative / Trade-offs
- Orphans in a book are not collected until that book is next opened (acceptable: they are inert disk usage, never surfaced as state).
- The on-open GC re-runs on post-edit project reloads within a session; it is idempotent and one-book-cheap, so repeated runs are harmless (and catch mid-session orphans).

### Neutral
- A global `reconcile_orphan_segment_files()` remains for manual/CLI full sweeps and tests; it is not wired into boot.

## References
- [data-model.md § Segment audio artifacts & orphan reconciliation](../specs/data-model.md#segment-audio-artifacts--orphan-reconciliation)
- [api-conventions.md § Live reads & caching](../specs/api-conventions.md#live-reads--caching)
- `app/db/segment_gc.py`, `app/db/chapters_cleanup.py`, `app/api/routers/projects.py`

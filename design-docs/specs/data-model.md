# Data Model

```
spec_version: 1.13.2
status: active
updated: 2026-08-31
sources:
  - app/db/state.py
  - app/db/state_jobs.py
  - app/db/state_settings.py
  - app/db/state_performance.py
  - app/db/state_helpers.py
  - app/db/__init__.py
  - app/db/characters.py
  - app/db/lexicon.py
  - app/utils/text/lexicon.py
  - app/db/segment_gc.py
  - app/db/chapters_cleanup.py
  - app/db/performance.py
  - app/domain/chapters/timing.py
  - app/domain/chapters/timing_generator.py
  - app/domain/projects/models.py
```

> **TL;DR:** Studio 2.0 uses two complementary stores — volatile in-memory state.json for live job state and settings, and durable SQLite for project/chapter/queue history — with disk artifact state as the ultimate source of truth.

## Changelog

| Version | Date       | Change             |
|---------|------------|--------------------|
| 1.13.2  | 2026-08-31 | **Schema migrations now run synchronously before startup recovery (#247, prerequisite for #232).** `run_schema_migrations()` (extracted from `boot_studio()`) is now called directly from `startup_event()` (`app/api/web.py`) immediately after `init_db()`, before the recovery-context snapshot, DB reconciliation, and `run_startup_recovery()`. Previously `boot_studio()` — which runs migrations — was dispatched to a background daemon thread *after* recovery had already resubmitted interrupted jobs and the web server had started serving chapter/segment routes, so a schema migration reshaping segment state could run concurrently with real traffic and with jobs referencing pre-migration segment_ids. `boot_studio()` still calls `run_schema_migrations()` itself (now a cheap idempotent no-op when `web.py` already ran it) so other entry points (tests, CLI) that call `boot_studio()` directly are unaffected. |
| 1.13.1  | 2026-08-31 | **`backup_database()` now WAL-safe (#246).** Replaced the raw `shutil.copy2` with `sqlite3.Connection.backup()`, which reads through the live WAL and writes a single consolidated file — the old copy could silently omit a committed write still sitting only in the `<db>-wal` sidecar, producing a backup that opens fine but has quietly rewound past real work. Backups are now written to a `.partial` path and renamed to their final name only on success, so a crash mid-backup can't leave a truncated file mistaken for a complete one. That scratch path is unique per call and removed on failure — the final name has one-second resolution and `boot_studio()`'s `_booted` guard is an unsynchronized flag, so two overlapping migration runs would otherwise collide on one scratch file and all but one would fail on a locked database; and an orphaned `.partial` poisons any later backup landing on the same path. This is the entire rollback plan for #232's destructive migration, so it had to actually be correct before that migration ships. |
| 1.13.0  | 2026-08-28 | **Versioned, transactional schema-migration runner (#233).** New `app/db/migrations/` package: `Migration`/`run_migrations`/`schema_migrations` tracking table, one real transaction per migration with explicit rollback-and-raise on failure, pre-migration DB backup, and a `dry_run` mode. `boot_studio()` now runs this **before** the legacy one-shot data migrations and does NOT swallow its failure — a failed schema migration aborts boot rather than starting on a half-migrated schema, replacing the previous blanket `except Exception` around migration. `registry.py::MIGRATIONS` is empty for now; #232 (chapter_segments redesign) is expected to add the first real entry. The legacy `app/db/migration.py` data migrations are unchanged and still best-effort/swallowed. |
| 1.12.0  | 2026-07-17 | **Chapter timing sidecar (synced-reader plan) + backup `bundle_version`.** New § documenting the self-describing, versioned `<chapter_wav_stem>.timing.json` sibling artifact (`chapter_segment_timing` schema, `version: 1`) written by `app/domain/chapters/timing_generator.py::build_chapter_timing` whenever a chapter WAV finishes stitching, and validated at load time by `app/domain/chapters/timing.py::validate_timing_sidecar`. Served read-only (never lazily recomputed, unlike the peaks sidecar) via `GET /api/projects/{project_id}/chapters/{chapter_id}/timing`. Also documents the new `bundle_version` field (default `1`) added to `ProjectBackupBundleModel` (`app/domain/projects/models.py`) — the model previously had no version field at all — plus the paired `timing_path` backup-bundle chapter-map entry and the new `POST /projects/{project_id}/backups/{filename}/restore` endpoint that can recover a chapter's audio + timing sidecar from a backup even when per-segment WAVs were never archived. |
| 1.11.0  | 2026-07-16 | **W-PERF safe-foundation: additive performance-metadata columns.** `chapter_segments` gets `performance_data`/`speaker_confidence`/`speaker_basis`/`speaker_evidence`/`needs_review`/`review_reasons`/`locked`/`ai_suggested`; `characters` gets the parallel set plus `display_name`/`role`/`character_type`/`aliases`/`source_presence`/`source_profile`/`voice_guidance`. All additive, nullable/defaulted, forward-only migration — existing rows read back with documented defaults, nothing reads these columns yet (no behavior change). No `span_start`/`span_end`/`sentence_index` columns added — `segment_order` remains the ownership unit (see corrected `03-db-schema-changes.md`). AI extraction pipeline and export layer explicitly deferred per 2026-07-10 owner decision. |
| 1.10.1  | 2026-07-10 | **Chapter peaks sidecar density raised 8→60 peaks/sec, `version` 1→2.** Example JSON and version-bump note updated to match `PEAKS_PER_SEC`/`SIDECAR_VERSION` in `app/engines/audio_ops.py`. Fixes visibly "low resolution" waveform at the tape's tightest zoom (3 s window vs. the tape's 180-bar render budget). Existing version-1 sidecars are transparently recomputed on next request via the loader's already-documented staleness check — no migration needed. |
| 1.10.0  | 2026-07-10 | **Chapter peaks sidecar (derived artifact, not a DB/manifest field).** New § documenting the self-describing, versioned `<chapter>.peaks.json` sibling file that lets the global player's tape (`audio-player.md` §5.4) render long chapters without a full browser decode. Computed lazily on first request by the chapter-asset serving route (never at production time — the original orchestrator-chokepoint design was found to miss this app's default-engine render path entirely), staleness detected by comparing the sidecar's `source` stat stamp against the live WAV's current stat. No existing table/manifest changes. |
| 1.9.0   | 2026-07-09 | **`lexicon`: reject case-insensitive duplicate words on add.** `add_lexicon_entry()` now raises `ValueError` (surfaced by `POST /api/projects/{project_id}/lexicon` as a 400 `{"status": "error", "message": ...}`) when the project already has an entry whose `word` matches case-insensitively. Prevents two entries for the same word from silently chaining through `apply_lexicon`'s sequential-substitution pass (e.g. `read`→`red` then `red`→`reed` turning `read` into `reed`). Editing an existing entry's word (`update_lexicon_entry`) is unchanged — this only guards entry creation. |
| 1.8.0   | 2026-07-09 | **Book tab front door: `projects.description`.** Add the optional `description` column to the durable `projects` table (additive migration, same idiom as `series_position`) and document it as part of the canonical schema. `update_project()` round-trips the field with no special-casing (plain string, unlike `series_position`'s null-vs-empty handling); no manifest or legacy v1→v2 migration change is needed (write-once manifest, no legacy source data for a field that didn't exist in v1). |
| 1.7.0   | 2026-07-08 | **Library project usability: `projects.series_position`.** Add the optional `series_position` column to the durable `projects` table and document it as part of the canonical schema. Project create/update flows now round-trip the field, and update requests reject invalid `series_position` values with a structured 400 instead of crashing the handler. |
| 1.6.0   | 2026-07-03 | **W-PAR task 007 — `tts_parallel_cap` / `tts_engine_caps` settings fields.** New `settings` keys documenting the cap-default-1 toggle surfaced as a real Studio setting (see `queue-jobs.md §7.3b`). No storage schema change beyond the two new keys; existing `state.json` files without them fall back to the documented defaults via `_normalize_settings`. Parent/child job shape and validated-artifact completion fields are unchanged by task 007 (confirmed no drift — those were introduced by W-PAR tasks 002/003/005, already documented in prior versions of this spec). |
| 1.5.0   | 2026-07-02 | **`model_load_seconds` is now consumed, not just recorded (W-MIX-LA load-aware ETA).** Doc catch-up for `app/db/performance.py::expected_model_load_seconds(engine, tts_model)`, which reads a trimmed mean of `render_performance_samples.model_load_seconds` (filtered to `>= 1.0`, treating smaller values as warm-reuse noise, and to matching `tts_model` when known) to produce the load term the orchestrator adds to the live chapter ETA during a cold-engine dispatch (`live-events.md` 1.8.0 `pre_load_eta` / `LOADING_MODEL` frames). Returns `None` on no cold-load history — callers must not inject a load term in that case (no-fabrication principle). See render_performance_samples below. |
| 1.4.1   | 2026-06-25 | Clarify render-performance samples are orchestrator-owned and `synthesis_duration_seconds` is synthesis-only (engine-confirmed group time), excluding load windows and inter-group overhead; align the mixed render contract with the single-writer path |
| 1.4.0   | 2026-06-23 | Sharpen source-of-truth invariant to *validated metadata, not raw file existence*; add § Segment audio artifacts & orphan reconciliation (group→filename fan-out, orphan GC keyed on referenced filenames, per-book on-open sweep); see [ADR-0013](../decisions/ADR-0013-segment-orphan-reconciliation.md) |
| 1.3.1   | 2026-06-21 | Correct lexicon application-point docs: xtts/voxtral apply it in per-plugin text-prep handlers, NOT in `SynthesisTask.to_bridge_request()` (api_synthesis path only) |
| 1.3.0   | 2026-06-21 | Add `lexicon` table (per-project pronunciation substitutions); document `apply_lexicon` pre-synthesis application point |
| 1.2.0   | 2026-06-21 | Add `chapter_id` column to `characters` table for chapter-scoped temp characters; document scope rule (NULL=book, set=chapter-temp) and promote semantics |
| 1.1.0   | 2026-06-16 | Clarify `finalizing` is a transient phase coerced to `running` on persist in both `put_job` and `update_job`; not a stored value |
| 1.0.0   | 2026-06-10 | Initial canonical spec |

---

## Overview

Audiobook Studio maintains two tracking stores:

| Store | File | Durability | Purpose |
|-------|------|-----------|---------|
| **state.json** (in-memory) | `state.json` | Volatile — lost on crash | Live job state, settings, event listeners |
| **SQLite** | `audiobook_studio.db` | Durable | Projects, chapters, segments, characters, speakers, queue history, performance samples |

**Source of truth invariant:** **validated artifact metadata** is the canonical source of truth — *not raw file existence*. An on-disk artifact is authoritative only when a durable DB row validates it (e.g. a `chapter_segments.audio_file_path` pointing at it); a file present on disk but referenced by no DB row is an **orphan**, never promoted to "done" on the strength of existing alone. Reconciliation enforces this. `state.json` is volatile and MUST NOT be treated as authoritative after a process restart. See [§ Segment audio artifacts & orphan reconciliation](#segment-audio-artifacts--orphan-reconciliation) and [ADR-0013](../decisions/ADR-0013-segment-orphan-reconciliation.md).

---

## state.json

Managed by `app/db/state.py`, which is a facade over decomposed modules:

- `state_jobs` — job map, status transitions, listener callbacks
- `state_settings` — runtime settings
- `state_performance` — ETA/performance samples
- `state_helpers` — RLock, atomic writes, corruption-resistant persistence

All access is RLock-guarded. Writes are atomic (write to a temp file, rename into place).

### Top-level shape

```json
{
  "jobs": { ... },
  "settings": { ... }
}
```

### jobs

Each key is a job UUID. Values conform to:

| Field | Type | Values |
|-------|------|--------|
| `id` | string | Job UUID |
| `status` | string | `queued` \| `preparing` \| `running` \| `finalizing` \| `done` \| `failed` \| `cancelled` — note: `finalizing` is a transient phase only; both `put_job` and `update_job` coerce it to `running` before persisting, so it is never written to disk |
| `kind` | string | `synthesis` \| `assembly` \| `voice_build` \| `voice_test` \| `mixed` \| `generic` |
| `progress` | float | 0.0–1.0, rounded to 2 decimal places |
| `eta_seconds` | number \| null | Estimated seconds remaining |
| `chapter_id` | string \| null | Chapter UUID |
| `project_id` | string \| null | Project UUID |
| `engine` | string \| null | Engine ID |
| `created_at` | float | Unix epoch seconds |
| `started_at` | float \| null | Unix epoch seconds |
| `finished_at` | float \| null | Unix epoch seconds |
| `log` | string | Human-readable progress log |
| `error` | string \| null | Error message if `status` = `failed` |

**Invariants:**

- Progress MUST advance monotonically (never decrease for a given job).
- Progress broadcast MUST only fire when the new value advances ≥ 1% over the last broadcast value.
- A job in `done`, `failed`, or `cancelled` status MUST NOT transition to any other status.

### settings

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `default_engine` | string | `"xtts"` | Active TTS engine ID |
| `safe_mode` | bool | `true` | Enables extra sanitization guards |
| `tts_api_enabled` | bool | `false` | Enables the external `/api/v1/tts` sub-app |
| `tts_api_key` | string | `""` | Empty = open access (local-only) |
| `tts_api_rate_limit` | integer | `10` | Requests per window |
| `lan_binding_enabled` | bool | `false` | Binds to LAN interface |
| `api_priority_mode` | string | `"studio_first"` | `studio_first` \| `equal` \| `api_first` |
| `is_paused` | bool | `false` | Pauses the task queue |
| `default_speaker_profile` | string | `""` | Default voice profile name |
| `enabled_plugins` | object | `{}` | Map of engine ID → bool |
| `verified_plugins` | object | `{}` | Map of engine ID → bool |
| `tts_parallel_cap` | integer | `1` | W-PAR task 007: global per-engine concurrency cap; clamped to each engine's manifest `max_concurrent_workers` at claim-build time (never raises above it) |
| `tts_engine_caps` | object | `{}` | W-PAR task 007: map of engine ID → per-engine cap override; takes precedence over `tts_parallel_cap` for that engine |

Settings MUST be persisted to `state.json` on every mutation. Callers MUST NOT modify the settings dict directly — use the `state_settings` API.

---

## SQLite (audiobook_studio.db)

Managed by `app/db/`. The DB MUST NOT auto-migrate on import — callers invoke `migrate_state_json_to_db()` explicitly via `app/db/__init__.py`.

### projects

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `name` | TEXT | |
| `series` | TEXT | |
| `series_position` | INTEGER | Optional series index used for sorting and display; NULL when unset |
| `author` | TEXT | |
| `speaker_profile_name` | TEXT | Default voice for the project |
| `cover_image_path` | TEXT | Relative path to cover image |
| `description` | TEXT | Optional book description/synopsis shown on the Book tab; NULL when unset |
| `created_at` | REAL | Unix epoch seconds |
| `updated_at` | REAL | Unix epoch seconds |

### chapters

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `project_id` | TEXT FK | → projects.id |
| `title` | TEXT | |
| `text_content` | TEXT | |
| `speaker_profile_name` | TEXT | Overrides project default if set |
| `sort_order` | INTEGER | Display/processing order |
| `audio_status` | TEXT | `unprocessed` \| `processing` \| `done` \| `failed` |
| `audio_file_path` | TEXT | |
| `audio_generated_at` | REAL | Unix epoch seconds |
| `audio_length_seconds` | REAL | |
| `text_last_modified` | REAL | Unix epoch seconds |
| `predicted_audio_length` | REAL | |
| `char_count` | INTEGER | |
| `word_count` | INTEGER | |

### chapter_segments

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `chapter_id` | TEXT FK | → chapters.id |
| `segment_order` | INTEGER | Order within chapter |
| `text_content` | TEXT | Raw text |
| `sanitized_text` | TEXT | Sanitized for TTS |
| `character_id` | TEXT FK nullable | → characters.id |
| `speaker_profile_name` | TEXT | Resolved speaker for this segment |
| `audio_file_path` | TEXT | Bare filename (no path) of the segment's rendered audio under `chapters/<id>/segments/`; NULL until rendered. See § below. |
| `audio_status` | TEXT | `unprocessed` \| `processing` \| `done` \| `failed` |
| `audio_generated_at` | REAL | Unix epoch seconds |
| `performance_data` | TEXT (JSON) | W-PERF: sparse performance-script annotation blob, nullable; validated shape defined in `app/domain/chapters/performance_schema.py`. NULL on most rows and unread by any code path yet. |
| `speaker_confidence` | REAL | W-PERF: 0.0–1.0 AI speaker-assignment confidence; NULL = human-assigned. Unread by any code path yet. |
| `speaker_basis` | TEXT | W-PERF: `explicit_source` \| `inferred_from_context` \| `studio_override`, etc. Unread by any code path yet. |
| `speaker_evidence` | TEXT (JSON) | W-PERF: array of evidence quotes from AI extraction, nullable. Unread by any code path yet. |
| `needs_review` | INTEGER | W-PERF: boolean flag, default 0. Unread by any code path yet. |
| `review_reasons` | TEXT (JSON) | W-PERF: array of reason strings, nullable. Unread by any code path yet. |
| `locked` | INTEGER | W-PERF: boolean, default 0 — human has confirmed, AI must not overwrite. Unread by any code path yet. |
| `ai_suggested` | INTEGER | W-PERF: boolean, default 0 — row was AI-seeded, not yet confirmed. Unread by any code path yet. |

#### Segment audio artifacts & orphan reconciliation

Rendering groups consecutive compatible segments into a **render group** and synthesizes **one** WAV per group, written to `projects/<project_id>/chapters/<chapter_id>/segments/` and named `<batch_timestamp_ns>_<leader_segment_order_index>.wav`. On success that single filename is written as the `audio_file_path` of **every** member segment of the group (the **group→filename fan-out**): many `chapter_segments` rows share one bare filename.

Consequences and rules:

- **DB is the source of truth, not the disk.** A segment file is "live" only while at least one row references its basename. Reset paths (text re-segmentation, `update_segments_status_bulk('unprocessed')`, reassignment) NULL `audio_file_path` on rows; because the deletion helper (`cleanup_chapter_audio_files`) matches a segment file either by exact name (`explicit_files`) or by the `{segment_id}.*` prefix — and group files are named `<ts>_<index>`, never `{segment_id}` — a reset that does not pass `explicit_files` strands the group WAVs as **orphans** (on disk, referenced by no row).
- **Orphans are garbage-collected, never adopted.** `app/db/segment_gc.py::reconcile_orphan_segment_files_for_project(project_id)` deletes every file in a chapter's `segments/` dir whose basename is not in the keep-set `{audio_file_path basenames of that chapter's rows}`. It is keyed on **referenced filenames** (NOT on `file.stem` as a segment id — that mistake, still present in the legacy `cleanup_orphaned_segments`, would delete valid shared group files). It skips chapters with an active render (`_chapter_has_active_generation`) and never touches chapter-root outputs (`chapter.wav`/`.m4a`).
- **The GC runs per-book, on book open** (`GET /api/projects/{id}` schedules it via FastAPI `BackgroundTasks`), **not library-wide at boot.** Rationale and the boot-vs-on-open decision: [ADR-0013](../decisions/ADR-0013-segment-orphan-reconciliation.md).

### processing_queue

Records every job that has ever been submitted. This is the durable history; live status lives in `state.json`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | Job UUID |
| `project_id` | TEXT FK nullable | → projects.id |
| `chapter_id` | TEXT FK nullable | → chapters.id |
| `segment_ids` | TEXT | JSON array of segment UUIDs, or NULL |
| `split_part` | INTEGER | Default 0; chunk index for split jobs |
| `status` | TEXT | `queued` \| `preparing` \| `running` \| `finalizing` \| `done` \| `failed` \| `cancelled` — note: `finalizing` is listed for completeness but is coerced to `running` in the state layer before any DB sync, so it will not appear in durable rows |
| `created_at` | REAL | Unix epoch seconds |
| `started_at` | REAL | Unix epoch seconds |
| `completed_at` | REAL | Unix epoch seconds |
| `error` | TEXT | Error message if failed |
| `custom_title` | TEXT | Display title override |
| `engine` | TEXT | Engine ID used |

### characters

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `project_id` | TEXT FK | → projects.id |
| `name` | TEXT | Display name |
| `speaker_profile_name` | TEXT | Assigned voice |
| `default_emotion` | TEXT | |
| `color` | TEXT | Hex color, default `"#8b5cf6"` |
| `chapter_id` | TEXT nullable | Scope key: `NULL` = book-scoped (visible everywhere in the project); a chapter UUID = chapter-scoped temp (visible only within that chapter). Added via idempotent `ALTER TABLE` migration — existing rows default to `NULL`. |
| `display_name` | TEXT | W-PERF: rich-profile display name override, nullable. Unread by any code path yet. |
| `role` | TEXT | W-PERF: story role (e.g. `character`, `narrator`), nullable. Unread by any code path yet. |
| `character_type` | TEXT | W-PERF: character classification, nullable. Unread by any code path yet. |
| `aliases` | TEXT (JSON) | W-PERF: array of alternate names/references, nullable. Unread by any code path yet. |
| `source_presence` | TEXT (JSON) | W-PERF: where/how the character appears in source text, nullable. Unread by any code path yet. |
| `source_profile` | TEXT (JSON) | W-PERF: AI-inferred profile facts, nullable. Unread by any code path yet. |
| `voice_guidance` | TEXT (JSON) | W-PERF: default delivery/performance guidance for this character, nullable. Unread by any code path yet. |
| `needs_review` | INTEGER | W-PERF: boolean flag, default 0. Unread by any code path yet. |
| `review_reasons` | TEXT (JSON) | W-PERF: array of reason strings, nullable. Unread by any code path yet. |
| `locked` | INTEGER | W-PERF: boolean, default 0 — human has confirmed, AI must not overwrite. Unread by any code path yet. |
| `ai_suggested` | INTEGER | W-PERF: boolean, default 0 — row was AI-seeded, not yet confirmed. Unread by any code path yet. |

**Scope rule:** A character with `chapter_id IS NULL` is a book character and appears in all chapter contexts. A character with `chapter_id` set is a temporary character belonging to that chapter only.

**`get_characters(project_id, chapter_id=None)` semantics:**
- When `chapter_id` is `None` (default): returns all characters for the project regardless of scope (backwards-compatible).
- When `chapter_id` is supplied: returns `WHERE project_id = ? AND (chapter_id IS NULL OR chapter_id = ?)` — book characters plus that chapter's temps, but NOT other chapters' temps.

**Promote:** `promote_character(character_id)` sets `chapter_id = NULL`, converting a temp to a permanent book character. Exposed via `POST /api/characters/{character_id}/promote`.

### lexicon

Per-project pronunciation substitutions. Each entry maps a source word to a replacement string that is substituted **before** text is sent to the TTS engine.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `project_id` | TEXT FK | → projects.id |
| `word` | TEXT | Source word (matched whole-word, case-insensitive) |
| `replacement` | TEXT | Plain-text replacement |
| `created_at` | REAL | Unix epoch seconds |

**Application:** `app/utils/text/lexicon.apply_lexicon(text, entries)` is called with all entries for a project loaded once per render job. Application points by path:
- **xtts** (standard, bake, segments): loaded once then applied per group in `tts_engines/tts_xtts/plugin/studio/standard_handler.handle_xtts_standard()`, `bake.handle_xtts_bake()`, and `segments.handle_xtts_segments()`.
- **voxtral** (bake, segments): same pattern in `tts_engines/tts_voxtral/plugin/studio/bake.handle_voxtral_bake()` and `segments.handle_voxtral_segments()`; standard (single-text) path: applied in `handler.handle_voxtral_job()` after `render_text` is resolved.
- **mixed engine**: applied in `tts_engines/tts_mixed/handler.handle_mixed_job()` before each segment group is dispatched to `_render_segment`.
- **api_synthesis (bridge) path**: applied in `app/orchestration/tasks/synthesis.SynthesisTask.to_bridge_request()` for external TTS API requests.

**Zero-impact invariant:** when a project has no lexicon entries, the original text string is returned unchanged (no allocation, no regex compile). Existing renders for projects without a lexicon are byte-identical.

**Scope:** book/project only (no series/global). Plain-text substitution only (no IPA/SSML).

**Duplicate-word rejection:** `add_lexicon_entry(project_id, word, replacement)` raises `ValueError` when *project_id* already has an entry whose `word` case-insensitively matches *word*. `apply_lexicon` applies entries as sequential substitutions over the same running string in insertion order, so two entries for the same word would otherwise chain unpredictably (e.g. `read`→`red` followed by `red`→`reed` silently turns `read` into `reed`). This guards entry *creation* only — `update_lexicon_entry` does not re-check for collisions when a word is edited in place; general substitution-chaining semantics across *different* words are out of scope.

API: `GET/POST /api/projects/{project_id}/lexicon`, `PUT/DELETE /api/projects/{project_id}/lexicon/{entry_id}`. `POST` returns `400 {"status": "error", "message": "A lexicon entry for \"<word>\" already exists."}` on a duplicate word.

### speakers

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | Speaker profile name (used as identity key) |
| `name` | TEXT | Display name |
| `default_profile_name` | TEXT | |
| `created_at` | REAL | Unix epoch seconds |
| `updated_at` | REAL | Unix epoch seconds |

### render_performance_samples

Stores per-render timing samples used for ETA prediction. (Lives in the separate Studio operational DB, alongside a key/value `settings` table.)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTO | |
| `job_id` | TEXT | |
| `project_id` | TEXT | |
| `chapter_id` | TEXT | |
| `engine` | TEXT | |
| `tts_model` | TEXT | |
| `speaker_profile` | TEXT | |
| `chars` | INTEGER | Character count |
| `word_count` | INTEGER | |
| `segment_count` | INTEGER | |
| `render_group_count` | INTEGER | |
| `started_at` | REAL | Unix epoch seconds |
| `completed_at` | REAL | Unix epoch seconds |
| `duration_seconds` | REAL | Wall time |
| `synthesis_duration_seconds` | REAL | Synthesis-only render duration; excludes model load and inter-group overhead |
| `inter_group_overhead_seconds` | REAL | |
| `model_load_seconds` | REAL | Consumed by `expected_model_load_seconds()` (trimmed mean of samples `>= 1.0`, per engine + `tts_model`) to compute the live load-aware ETA term (`live-events.md` 1.8.0 `pre_load_eta` / `LOADING_MODEL`); samples `< 1.0` are treated as warm reuse and excluded |
| `sum_segment_render_seconds` | REAL | |
| `cps` | REAL | Characters per second |
| `seconds_per_segment` | REAL | |
| `audio_duration_seconds` | REAL | Output audio length |
| `sample_type` | TEXT | `chapter` \| `segment` \| `test` |

Index: `idx_render_performance_completed_at` on `completed_at`.

---

## Chapter peaks sidecar (derived, lazily-computed artifact)

Lets the global player's waveform tape (`audio-player.md` §5.4) render a scrub waveform for chapters whose WAV is over the browser-decode duration cap, without downloading/decoding the full file client-side.

**Not a database or manifest field.** The existing artifact-manifest layer (`app/domain/artifacts/`) is scaffold-only in production — no concrete repository implementation, no production caller ever supplies a manifest — so a field there would be dead weight. The sidecar is instead a **self-describing file**, a deterministic sibling of the chapter WAV (`<chapter>.peaks.json` next to `<chapter>.wav`), that carries its own version and validity stamp:

```json
{
  "version": 2,
  "peaks": [0.0, 0.41, "... one float per bucket, [0, 1] max-abs magnitude"],
  "duration_sec": 3723.4,
  "sample_rate": 24000,
  "channels": 1,
  "peaks_per_sec": 60,
  "source": { "filename": "chapter.wav", "size_bytes": 123456789, "mtime_ns": 1718000000000000000 }
}
```

- **`version`** — validated at load time (owner directive: every contract declares an explicit version). A mismatch is treated identically to a missing sidecar, so the route recomputes rather than serving stale data. Bumped 1→2 on 2026-07-10 alongside `peaks_per_sec` 8→60 (density raise; see `audio-player.md` §5.4 changelog 1.6.3) — every sidecar produced under version 1 is transparently recomputed at the new density on next request.
- **`source`** — the WAV's own `stat()` (size + mtime) at the moment the sidecar was computed. Since a chapter WAV is **overwritten in place** on re-render, a path-only reference can silently go stale; the serving route re-stats the live WAV on every request and treats any mismatch as "absent," never serving a stale sidecar.
- **`peaks`** are `[0, 1]` max-abs-per-bucket magnitudes (not `[-1, 1]`), matching the frontend's existing browser-decode peak provider's convention.

**Compute-on-request, not produced eagerly.** No render-pipeline task writes this file. It is computed **lazily by the serving route** (`GET /api/projects/{project_id}/chapters/{chapter_id}/assets/peaks?filename=<wav>`, `app/api/routers/chapters_assets.py`) the first time it's requested for a WAV that has no sidecar yet, or whose sidecar's `source` stamp no longer matches — then cached (atomic write) as that sibling file for subsequent requests. This was a deliberate design correction: an earlier draft computed peaks at an orchestrator completion chokepoint, but that chokepoint does not fire for this app's default engines (their chapter-fanout render path bypasses it entirely) — compute-on-request covers every producer, every engine, and the entire back-catalog of already-rendered chapters by construction, with no orchestrator coupling.

**Missing is never a hard requirement.** No sidecar (not yet requested, computation failed, or the chapter predates this feature) means the route returns 404 and the frontend falls back to browser-decode (under the duration cap) or a plain, non-scrubbable bar (over it) — exactly today's pre-sidecar behavior. Nothing retroactively mutates old artifacts.

Cross-reference: `audio-player.md` §5.4.

---

## Chapter timing sidecar (derived, finalization-produced artifact)

Lets the Book-tab player-piano read-along reader (shipped; see `wiki/Changelog.md`) track which rendered **chunk group** (the render unit consecutive same-character `chapter_segments` rows are merged into — see `app/domain/chunk_groups.py`) is currently playing, without any word-level estimation or forced alignment.

**Not a database or manifest field**, same reasoning as the peaks sidecar above: a self-describing, versioned sibling file, `<chapter_wav_stem>.timing.json` next to the chapter WAV.

```json
{
  "schema": "chapter_segment_timing",
  "version": 1,
  "chapter_id": "ch_abc123",
  "audio_file": "chapter_ch_abc123.wav",
  "audio_generated_at": 1699999999.0,
  "audio_duration_ms": 754320,
  "generated_at": 1699999999.0,
  "group_count": 42,
  "groups": [
    {
      "group_id": "grp_0001",
      "segment_ids": ["seg_0001", "seg_0002"],
      "order": 0,
      "start_ms": 0,
      "end_ms": 3180,
      "duration_ms": 3180
    }
  ]
}
```

- **`schema` / `version`** — validated at load time by `app/domain/chapters/timing.py::validate_timing_sidecar` (owner directive: every contract declares an explicit version). A schema mismatch, a `version` other than the current `1`, or any malformed shape is treated identically to a missing sidecar — the serving route 404s and the reader falls back to its "sync unavailable" state; re-rendering the chapter regenerates the sidecar for free.
- **`groups[]`** — one entry **per rendered chunk group** (not per raw `chapter_segments` row), ordered by `order`, `[start_ms, end_ms)` **tiling the timeline gaplessly**: `groups[i].end_ms == groups[i+1].start_ms`, first `start_ms == 0`, last `end_ms == audio_duration_ms`. `segment_ids[]` lets the frontend join text/character per member; if a member segment is later deleted the entry just carries a shorter/stale list — the reader still has real timing, only text lookup degrades. Both the gapless-tiling and the ordering invariants are enforced structurally by the pydantic model, not just documented.
- **`audio_generated_at`** — copied from the chapter's own `audio_generated_at` at generation time. The serving route treats a mismatch against the chapter's *current* `audio_generated_at` as "no usable timing" (404) — a **staleness binding** that guarantees a sidecar is never served against audio it wasn't measured from, independent of the schema/version check.
- No `sample_rate`, `char_count`, or `engine_id` at the sidecar root — a chapter can mix engines/rates across groups, so a single root-level value would be misleading; per-group duration is measured directly from each group's own WAV header.

**Duration measurement — no estimation.** `app/domain/chapters/timing_generator.py::build_chapter_timing` reads each contributing group's WAV duration from its WAV header (stdlib `wave`, no ffprobe subprocess), accumulating an integer-millisecond offset to avoid float drift, then reconciles the summed group durations against the assembled chapter WAV's own measured duration (tolerance `DRIFT_WARN_TOLERANCE_MS = 50`, hard ceiling `DRIFT_HARD_CEILING_MS = 250`). Drift beyond the hard ceiling raises `TimingReconciliationError` and the caller skips writing a sidecar for that render — no sidecar is safer than a wrong one.

**Produced at chapter-WAV finalization, not lazily.** Hooked into `TaskOrchestrator._emit_chapter_timing_sidecar` (`app/orchestration/scheduler/orchestrator.py`, sibling to the existing `_emit_chapter_peaks_sidecar` hook), covering every chapter-stitch finalization path. Generation failure is logged and swallowed — it must never fail the render itself. Unlike the peaks sidecar, the serving route (`GET /api/projects/{project_id}/chapters/{chapter_id}/timing`, `app/api/routers/chapters_assets.py`) does **not** lazily recompute on a miss: timing is a finalization-time product, and recomputing on GET could disagree with the audio if segments changed since the render. Missing/invalid/stale → 404; the reader shows its explicit "sync unavailable" state.

**Portability: export, backup, and restore.** The sidecar travels alongside the chapter WAV in single-chapter audio export and in project backup bundles (`app/api/routers/projects_helpers.py::_create_backup_archive`), written under `chapters/<sanitized-text-stem>.timing.json` to match the WAV's own sanitized arc name, recorded as `timing_path` in the bundle's per-chapter `chapter_map` entry. `ProjectBackupBundleModel` (`app/domain/projects/models.py`) gained a validated `bundle_version` field (default `1`) — the model previously had **no version field at all**, so this is an addition, not a bump of a prior value. A new `POST /projects/{project_id}/backups/{filename}/restore` endpoint (`app/api/routers/projects_backups.py`) extracts a backup's chapter WAV and paired `.timing.json` (validating it through the same `validate_timing_sidecar`) back into the chapter's audio directory — proving the sidecar survives a round trip even when the backup contains no per-segment WAVs. Restore is scoped to chapter audio + timing for chapters that already exist in the project; it does not restore chapter text, does not reconstruct characters, speakers, or queue state, and never restores a `chapter_id` into a project other than the one it came from.

**Interaction with existing GC.** The per-book orphan-segment GC (`reconcile_orphan_segment_files_for_project`, `app/db/segment_gc.py`, see § Segment audio artifacts & orphan reconciliation above) only deletes files under a chapter's `segments/` dir — it does not touch chapter-level `.timing.json` sidecars living alongside the chapter WAV.

Cross-reference: `wiki/Changelog.md` (read-along reader shipped 2026-07-17).

---

## Voice Directory Layout (V2)

```
voices/
  {VoiceName}/
    voice.json              # { version: 2, name, id, default_variant }
    {VariantName}/
      profile.json          # { variant_name, engine, speaker_id }
      1.wav .. 5.wav        # Reference audio samples
      latent.pth            # Engine-specific cached state (optional)
```

Voice bundles for export/import are MP3. Reference audio samples (`.wav`) are only used internally. The `voice.json` manifest MUST declare `version: 2` — callers MUST reject bundles without a valid version field.

---

## Migration

Two independent migration mechanisms run at boot, in order:

1. **Versioned schema-migration runner** (`app/db/migrations/`, added #233) — the mechanism any
   future destructive schema change (starting with #232's `chapter_segments` redesign) MUST use.
   - `runner.py::Migration(version, name, up, down=None)` — one migration per version number,
     never reordered or renumbered once shipped. `registry.py::MIGRATIONS` is the ordered list;
     append, never edit or remove a past entry.
   - `runner.py::run_migrations()` applies every migration whose `version` isn't yet recorded in
     the `schema_migrations` table, in ascending version order, **one real transaction per
     migration** (`BEGIN IMMEDIATE` → the migration's `up` → commit-and-record, or
     rollback-and-raise `MigrationError` on any exception). A failure stops the run immediately —
     later migrations in the set are never attempted.
   - Before the first write of a run with pending migrations, the DB is backed up to a timestamped
     `<db>.backup-<unix-ts>` sibling (`backup_database()`) via `sqlite3.Connection.backup()`
     (an online, WAL-consolidating copy) rather than a raw file copy — every connection in this
     codebase runs `PRAGMA journal_mode=WAL` (`app/db/core.py`), so a recently committed write can
     still be sitting only in the `<db>-wal` sidecar and a raw copy would silently produce a
     backup that predates it (#246). The backup is written to a `.partial` path first and renamed
     to its final name only on success, so a crash mid-backup can't leave a truncated file that
     looks complete. That `.partial` path is unique per call and is deleted if the backup fails:
     the final name has one-second resolution, so two overlapping backups would otherwise share
     one scratch file, and a leftover `.partial` makes a later backup targeting that path fail
     outright (`sqlite3` opens a junk file, then fails the copy). No backup is taken when there is
     nothing pending, in `dry_run` mode, or when the DB file doesn't exist yet (fresh install).
   - `dry_run=True` runs every pending migration's `up` and unconditionally rolls back —
     validates a pending set with zero persisted effect, and still raises `MigrationError` on
     failure.
   - `run_schema_migrations()` (extracted from `boot_studio()` in #247) wraps the transaction
     above and is called **synchronously from `startup_event()`** (`app/api/web.py`) immediately
     after `init_db()` — before the recovery-context snapshot, stuck-job clearing, DB
     reconciliation, and `run_startup_recovery()`. This ordering is load-bearing: recovery
     resubmitting an interrupted job, or a request reaching a chapter/segment route, while a
     migration reshaping that same state is still in flight is exactly the race #247 closes
     (a prerequisite for #232's destructive `chapter_segments` redesign). Not wrapped in a
     swallowing `try/except` — a failure here aborts app startup entirely.
   - `boot_studio()` (`app/core/boot.py`) also calls `run_schema_migrations()`, before setting its
     idempotency flag, so entry points that call `boot_studio()` directly without going through
     `web.py`'s `startup_event()` (tests, CLI) still get migrations applied. Because migrations are
     recorded in `schema_migrations` and never re-run, this second call is a no-op once `web.py`
     already applied them. `boot_studio()` likewise **does not catch `MigrationError`** — a failed
     schema migration aborts boot entirely rather than starting the app on a half-migrated schema.
     This intentionally reverses the previous `except Exception: logger.exception(...)` swallow
     around migration (#233); `_booted` is left `False` on failure so a corrected migration can be
     retried by calling `boot_studio()` again.
   - Rollback tooling (invoking a migration's own `down`) is not yet implemented by the runner —
     `down` is accepted on `Migration` for forward-compatibility but unused; recovery from a failed
     migration today is via the pre-migration backup file.

2. **Legacy one-shot data migrations** (`app/db/migration.py`, pre-#233, unversioned) —
   `migrate_state_json_to_db()`, `migrate_legacy_project_covers()`, `migrate_voice_profiles()`.
   Each is self-guarding on a data condition (idempotent, not tracked in `schema_migrations`) and
   remains best-effort: `boot_studio()` still wraps these in `except Exception: logger.exception(...)`,
   unchanged by #233. `app/db/__init__.py` exposes `migrate_state_json_to_db()` for explicit
   invocation. The DB MUST NOT run migrations on import — `boot_studio()` in `app/core/boot.py`
   is responsible for triggering both migration mechanisms at startup, in the order above.

---

## Cross-references

- Job lifecycle and status transitions: [queue-jobs.md](queue-jobs.md)
- Live progress broadcasting rules: [live-events.md](live-events.md)
- Path safety for file columns: [api-conventions.md](api-conventions.md)
- System architecture and boot sequence: [system-architecture.md](system-architecture.md)

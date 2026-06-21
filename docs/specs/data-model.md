# Data Model

```
spec_version: 1.3.1
status: active
updated: 2026-06-21
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
```

> **TL;DR:** Studio 2.0 uses two complementary stores — volatile in-memory state.json for live job state and settings, and durable SQLite for project/chapter/queue history — with disk artifact state as the ultimate source of truth.

## Changelog

| Version | Date       | Change             |
|---------|------------|--------------------|
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

**Source of truth invariant:** disk/validated-artifact state is the canonical source of truth. Reconciliation enforces this on restart. `state.json` is volatile and MUST NOT be treated as authoritative after a process restart.

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
| `author` | TEXT | |
| `speaker_profile_name` | TEXT | Default voice for the project |
| `cover_image_path` | TEXT | Relative path to cover image |
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
| `audio_file_path` | TEXT | |
| `audio_status` | TEXT | `unprocessed` \| `processing` \| `done` \| `failed` |
| `audio_generated_at` | REAL | Unix epoch seconds |

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
- **xtts** (standard, bake, segments): loaded once then applied per group in `plugins/tts_xtts/plugin/studio/standard_handler.handle_xtts_standard()`, `bake.handle_xtts_bake()`, and `segments.handle_xtts_segments()`.
- **voxtral** (bake, segments): same pattern in `plugins/tts_voxtral/plugin/studio/bake.handle_voxtral_bake()` and `segments.handle_voxtral_segments()`; standard (single-text) path: applied in `handler.handle_voxtral_job()` after `render_text` is resolved.
- **mixed engine**: applied in `plugins/tts_mixed/handler.handle_mixed_job()` before each segment group is dispatched to `_render_segment`.
- **api_synthesis (bridge) path**: applied in `app/orchestration/tasks/synthesis.SynthesisTask.to_bridge_request()` for external TTS API requests.

**Zero-impact invariant:** when a project has no lexicon entries, the original text string is returned unchanged (no allocation, no regex compile). Existing renders for projects without a lexicon are byte-identical.

**Scope:** book/project only (no series/global). Plain-text substitution only (no IPA/SSML).

API: `GET/POST /api/projects/{project_id}/lexicon`, `PUT/DELETE /api/projects/{project_id}/lexicon/{entry_id}`.

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
| `synthesis_duration_seconds` | REAL | |
| `inter_group_overhead_seconds` | REAL | |
| `model_load_seconds` | REAL | |
| `sum_segment_render_seconds` | REAL | |
| `cps` | REAL | Characters per second |
| `seconds_per_segment` | REAL | |
| `audio_duration_seconds` | REAL | Output audio length |
| `sample_type` | TEXT | `chapter` \| `segment` \| `test` |

Index: `idx_render_performance_completed_at` on `completed_at`.

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

`app/db/__init__.py` exposes `migrate_state_json_to_db()` for explicit invocation. The DB MUST NOT run migrations on import. `boot_studio()` in `app/core/boot.py` is responsible for triggering migration at startup.

---

## Cross-references

- Job lifecycle and status transitions: [queue-jobs.md](queue-jobs.md)
- Live progress broadcasting rules: [live-events.md](live-events.md)
- Path safety for file columns: [api-conventions.md](api-conventions.md)
- System architecture and boot sequence: [system-architecture.md](system-architecture.md)

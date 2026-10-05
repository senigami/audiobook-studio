# Task 001 — Additive schema migration (chapter_segments + characters)

Status: done (2026-07-16, W-PERF safe-foundation PR)

Risk: none (purely additive nullable/defaulted columns, no data migration)

## What shipped

Per task 000's ratified shape, added to `app/db/core.py` (both the `CREATE TABLE IF NOT EXISTS`
blocks and the `add_column_if_missing` migration list — verified present at both locations):

- **`chapter_segments`**: `performance_data` (TEXT/JSON, nullable), `speaker_confidence` (REAL),
  `speaker_basis` (TEXT), `speaker_evidence` (TEXT/JSON), `needs_review` (INTEGER DEFAULT 0),
  `review_reasons` (TEXT/JSON), `locked` (INTEGER DEFAULT 0), `ai_suggested` (INTEGER DEFAULT 0).
- **`characters`**: `display_name`, `role`, `character_type`, `aliases` (JSON), `source_presence`
  (JSON), `source_profile` (JSON), `voice_guidance` (JSON), plus the same
  `needs_review`/`review_reasons`/`locked`/`ai_suggested` set.
- **Deliberately not added**: `span_start`/`span_end`/`sentence_index` — the original proposal's
  premise that these were needed was confirmed false (`00-overview.md`'s Schedule decision);
  `segment_order` remains the ownership/position unit.
- `characters.default_emotion` and `characters.color` left unchanged.

Confirmed via `grep -n "performance_data\|speaker_confidence\|...\|" app/db/core.py`: all columns
present in both the CREATE TABLE DDL and the `add_column_if_missing` list.

## Map links

Part A in `01-map.md` (prerequisite for B/C/D/E). INV-1 (no second migration). `02-roadmap.md`'s
Workload 1 / M1.

## Dependencies

Task 000 (ratified the column shape this task implements).

## Out of scope (still true, downstream work)

Encode/decode JSON helpers (task 002), the `render` column's consumption in the render pipeline
(sibling plan's task 006), any frontend API/type exposure of these columns (task 002+).

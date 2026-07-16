# PR 06 — W-PERF: safe foundation only (Workloads 1–3)

**Branch:** `studio2/wperf-safe-foundation`
**Target:** `studio-2.0`
**Size:** M — additive DB columns + a JSON format + a plugin-contract flag.
**Gate:** the owner **already decided** (2026-07-10): build the safe parts now, **hold the AI
pipeline and export layer.** No new gate to clear — just stay inside the scope line below.
**Runs solo:** no. Additive-only; parallel-safe.

## Why + the decision (read this, it defines the scope)

W-PERF is per-span performance metadata, rich character profiles, an AI extraction pipeline, and a
multi-target export layer. The 2026-07-10 owner decision recorded in the overview:

> **Safe parts only for now, AI pipeline deferred.** Schedule Workloads 1–3 (DB schema, canonical
> JSON format, plugin-contract SSML flag — roadmap tasks 000–004) immediately: all additive, safe,
> independently useful. **Hold Workload 4 (AI extraction, tasks 005–009) and Workload 5 (export
> layer, tasks 010–011)** until reliability/cost is separately validated — do not start task 005
> without a fresh owner check-in. Workload 6 (review UI, task 012) is on hold too.

Also note the overview's correction: the old "must ship with sub-sentence assignment or the DB
migrates twice" premise is **false** — W-PERF's columns are independent, additive, nullable columns;
sub-sentence assignment added zero columns. No migration-ordering blocker.

## Authoritative source

- `design-docs/plans/active/performance_script_model_execution/00-overview.md` (the decision + scope).
- `.../02-roadmap.md` — **tasks 000–004 only** are in scope for this PR.
- Proposal docs: `.../proposals/performance_script_model/01-canonical-json-format.md`,
  `03-db-schema-changes.md`. ⚠️ `03`'s claim that spans "replace sentence-level position as the
  ownership unit" (line ~46) is now **factually wrong** given sub-sentence assignment's shipped
  implementation — correct that doc line as part of this PR; don't act on it.

## Scope (Workloads 1–3 / tasks 000–004 ONLY)

- **DB schema (additive, nullable):** add W-PERF's columns — `performance_data`,
  `speaker_confidence`/`speaker_basis`/`speaker_evidence`, `needs_review`/`review_reasons`/`locked`/
  `ai_suggested` on `chapter_segments`, and the parallel set on `characters`. **Do NOT** add
  `span_start`/`span_end` byte-offset columns — the proposal originally assumed them but they're not
  needed (sub-sentence assignment splits `text_content` + shifts `segment_order` instead). Migration
  must be forward-only and additive; nothing reads these yet.
- **Canonical performance-script JSON format:** define + version the format per doc 01. Add its
  schema with an explicit version (per the versioned-contracts owner directive).
- **Plugin-contract addition:** add the `behavior` block fields `export_format`,
  `supports_per_span_voice`, `supports_emotion_style` to the plugin contract (they're not in the
  contract yet — TASKS.md line ~344). Bump the plugin-contract spec version.

**Out (HARD stop — do not build):** the AI extraction pipeline (tasks 005–009), the multi-target
export layer (tasks 010–011), the review-state UI (task 012). If the work starts pulling you toward
sending manuscript text to a cloud LLM, you've crossed the line — stop.

## Guardrails

- Every contract/schema declares an explicit version validated at load (owner directive).
- Additive columns must not change any existing behavior — existing reads/writes untouched.
- No engine-ID branching; contract fields are declarative.

## Verify

- Migration test: applies cleanly forward on a v1→v2 DB and on a fresh DB; existing rows get NULLs;
  nothing reads the new columns yet (so no behavior change) — assert that.
- `./venv/bin/python -m pytest -q` + `ruff check .` green.
- Plugin-loader still validates every bundled engine's manifest with the new optional contract
  fields (absent = fine; present = validated).
- Specs bumped: `data-model.md`, plugin-contract spec, + the new JSON-format spec. Changelog rows.

## Definition of done

- Additive columns + versioned JSON format + contract fields landed; AI/export explicitly untouched.
- The stale `03-db-schema-changes.md` line corrected.
- Suites green, specs + wiki changelog + code-map changelog-queue entry.
- PR via `write-pr` → `studio-2.0`, body noting "foundation only, AI pipeline deferred per
  2026-07-10 owner decision."

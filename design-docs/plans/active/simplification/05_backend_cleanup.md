# Phase 4 — Backend cleanup (`app/`)

> Map: [00_overview.md](00_overview.md). Dead code, duplicated math, wasteful re-queries, and the
> mis-named-but-live `app/jobs` package. All behavior-preserving; `pytest -q` (incl. plugin suites)
> green per task. The backend is broadly sound — this is targeted debt removal, not restructuring.

**Done:** BE-1 (4 of 5 sub-items; the 5th confirmed invalid), BE-4. Still open: BE-2, BE-3, BE-5,
BE-6.

---

## BE-1 — Remove confirmed backend dead code — DONE (2026-07-04)
Removed the `REPORT_DIR`/`UPLOAD_DIR` web.py alias + fixed the analysis test patch target
(`2c0b6f83`), deleted `tts_generate_stub` (`2c0b6f83`), replaced the dead `isinstance(dict)` dual-mode
job-access ladder and deleted the `_should_emit()` public shim (`bfbbdf02`, revert-checked). The 5th
sub-item (`schema_data` vars in `tts_server/server.py`) was **confirmed live** (consumed by
`isinstance(schema_data, dict)` validation) and not touched. Full backend suite unchanged
(2221 passed / 3 skipped).

---

## BE-2 — Replace dead `INTENDED_*/FORBIDDEN_*` constants

**Why:** module-level tuples (`INTENDED_UPSTREAM_CALLERS`, `INTENDED_DOWNSTREAM_DEPENDENCIES`,
`FORBIDDEN_DIRECT_IMPORTS`) are read **nowhere** — pure documentation that silently rots. Present in
~12 modules (e.g. `progress/service.py`, `scheduler/orchestrator.py`, `engines/bridge_utils.py`,
the `domain/*/service.py` files, `core/logging.py`, `app/infra/subprocess/__init__.py`,
`app/infra/db/__init__.py`, the two plugin `app_adapter.py` files).

**Two options:**
- (a) Replace each with a one-line comment (`# Upstream: orchestrator only; no direct router/engine imports.`), **or**
- (b) **Better:** turn the intent into an enforced `pytest` import-boundary test (one test that
  parses imports and asserts the forbidden edges), then delete the tuples. This makes
  `modular_architecture.md`'s boundaries *executable* instead of decorative.

Recommend (b) for the load-bearing boundaries (orchestration ↔ routers/engines), (a) elsewhere.
**Effort:** S (a) / M (b) · **Risk:** low. **Spec:** none (optionally note the new boundary test in
`code-organization.md` §8).

---

## BE-3 — Dedupe `events.py` command sets

**Why:** `JobLifecycleCommand(str, Enum)` members already compare equal to their string values, yet
`JOB_LIFECYCLE_COMMANDS` and `COMMAND_TOPIC_SCOPES` in `app/api/contracts/events.py` list each
command **twice** — enum member *and* raw string ("Allow string versions" comments). The raw
duplicates are redundant.

**Steps:** remove the raw-string duplicates; keep enum members. Add/confirm a test that a raw string
(e.g. `"JOB_QUEUED" in JOB_LIFECYCLE_COMMANDS`) still resolves true (it does, via `str` enum) so the
dedup is provably behavior-preserving (revert-check: the test passes before and after).
**Effort:** S · **Risk:** low. **Spec:** `live-events.md` if it documents these sets — verify, no
behavior change.

---

## BE-4 — Remove duplicate segment-timing math — DONE (2026-07-04, `0cba74d8`)
Shared formula extracted to `app/utils/render_timing.py` (outside both `app.tts_server` and
`app.orchestration`, to respect the two-process boundary); `_record_render_stats_inner` now prefers
the server response's precomputed `timing` fields, falling back to the shared derive only when
absent. `model_load_seconds` deliberately **not** unified — a real pre-existing divergence (server
defaults `None`, orchestrator `0.0`) was preserved, not silently merged. Full suite unchanged;
timing/ETA suites green.

---

## BE-5 — Stop recomputing `_resolved_segment_profiles` per request

**Why:** in `app/api/routers/generation.py`, `_resolved_segment_profiles(chapter_id)` (a DB query +
per-segment profile resolution) is called 3× in `api_add_to_queue` (287, 349, 354), 3× in
`api_bake_chapter` (474, 482, 491), plus inside `_validate_generation_engines` — same `chapter_id`,
same result, multiple times per request.

**Steps:** resolve once at the top of each endpoint, pass the list into the downstream helpers
(`_validate_generation_engines`, `resolve_tts_engine_for_profiles`, `_engines_for_profiles`).
**Verify:** `pytest -q` (queue/bake API tests); behavior identical, fewer queries. **Effort:** S ·
**Risk:** low. **Spec:** none.

---

## BE-6 — Rename/move the live-but-mis-named `app/jobs` package

**Why:** `design-docs/plans/master_agnostic_tasks.md:141` flags it and the audit confirms: `worker_metrics`,
`worker_voice`, `worker_helpers`, `registry`, `handlers/bridge_helpers`, `handlers/audiobook` are
**live** (not the legacy worker loop) — the name misleads readers into thinking it's the deleted v1
worker. Real callers:
- `worker_metrics.record_engine_sample` ← `plugins/tts_mixed/handler.py:82`
- `handlers/bridge_helpers.generate_via_bridge` ← `app/studio_plugin_sdk/context.py:291`
- `registry.get_handler_registry`/`initialize_default_handlers` ← re-exported by
  `orchestration/scheduler/orchestrator_helpers.py:24`
- `worker_voice.handle_voice_job` ← wired via the registry

**Steps (one coordinated commit):**
- Move `bridge_helpers` + `worker_voice` → `app/studio_plugin_sdk/`.
- Move `worker_metrics.record_engine_sample` → `app/orchestration/scheduler/` (next to the other
  recording logic).
- Move `JobHandlerRegistry` → `app/orchestration/`.
- Update **all** importers in the same commit, including the plugins (`tts_mixed`, `tts_xtts`).
- Delete the empty `app/jobs/` once nothing imports it.

**Verify:** full `pytest -q` **including plugin suites** (`plugins/*/tests`); grep confirms no
`app.jobs` / `app/jobs` references remain. **Effort:** M · **Risk:** med (cross-package imports +
plugin coupling — the riskiest item in this phase; do it alone, not bundled). **Spec:**
`code-organization.md` module map + `modular_architecture.md` if either names `app/jobs`; changelog.

> Sequencing note: BE-6 is independent of the others but is the highest-risk; land BE-2/BE-3/BE-5
> first to bank easy wins, then do BE-6 in isolation.

---

### Phase 4 done-check
`ruff check .` · full `pytest -q` (incl. plugin suites) green. No `app.jobs` references remain after
BE-6. Specs updated for BE-6 (and BE-2 if the boundary test path is documented). Dated
`wiki/Changelog.md` entry.

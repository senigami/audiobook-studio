# Phase 4 — Backend cleanup (`app/`)

> Map: [00_overview.md](00_overview.md). Dead code, duplicated math, wasteful re-queries, and the
> mis-named-but-live `app/jobs` package. All behavior-preserving; `pytest -q` (incl. plugin suites)
> green per task. The backend is broadly sound — this is targeted debt removal, not restructuring.

> **AUDIT CORRECTION (2026-07-01):** (1) **BE-1's `schema_data` claim is WRONG** — those variables
> are consumed by `isinstance(schema_data, dict)` validation checks; they are live code, not dead.
> Do NOT delete. (2) **BE-3's target file** is `app/api/contracts/events.py` (not
> `scheduler/events.py`); the duplication itself is still present. (3) **BE-2 scope grew** from ~10
> to 12 modules: `app/infra/subprocess/__init__.py` and `app/infra/db/__init__.py` (created after
> this plan) inherited the same dead `INTENDED_*`/`FORBIDDEN_*` constants pattern. (4) BE-4/BE-5
> still valid (line anchors drifted, shape unchanged). (5) BE-6 still valid and still the
> highest-risk item: `app/jobs/` unchanged, 97 live references across ~40 files. (6) `speakers.py`
> still one 669-line file.

---

## BE-1 — Remove confirmed backend dead code *(done 2026-07-04 — 4 of 5 sub-items; the 5th is confirmed invalid, not attempted)*

One commit; each item verified to have zero live callers.

| Item | Location | Action |
|------|----------|--------|
| `REPORT_DIR`/`UPLOAD_DIR` import + `REPORT_DIR = REPORT_DIR` alias | `app/api/web.py:13,25` | Remove. `UPLOAD_DIR` only appears in a docstring; the endpoint uses `COVER_DIR`. Fix `tests/api/test_api_analysis_extended.py:65` to patch `app.api.routers.analysis.REPORT_DIR` (the web.py patch is a no-op today). **DONE, `commit 2c0b6f83`** — the analysis test's patch-target fix landed too; flagged that `app.core.config.REPORT_DIR` (a third, pre-existing patch line in the same test) is what actually drives the tested behavior, so the fixed line is correct but still redundant — not expanded beyond the instructed change. |
| `tts_generate_stub` | `app/api/web.py:412-414` | Delete. Docstring claims tests patch it; no such test exists (grep: only the declaration). **DONE, `commit 2c0b6f83`.** |
| Dead dual-mode (`isinstance(..., dict)`) job access | `app/orchestration/progress/service.py:487-538` | `get_jobs()` always returns `Job` dataclasses; replace the `hasattr/isinstance` ladder with direct attribute access (`existing_job.speaker_profile or "default"`, etc.). **DONE, `commit bfbbdf02`** — both occurrences (the ladder + a second inline dead-pattern in the `voice_event` call) replaced; revert-checked against `tests/api/test_websocket_broadcast.py::test_voice_test_job_telemetry_isolation`. |
| `_should_emit()` public shim | `app/orchestration/progress/service.py:1339-1357` | Delete. No test calls it (refs are comments/docstrings; tests assert via `publish()` return). **Do before LF-6.** **DONE, `commit bfbbdf02`** — zero real callers reconfirmed before deletion. |
| Unused `schema_data` vars | `app/tts_server/server.py:892-900, 1045-1053, 1165-1173` | **INVALID (2026-07-01 audit correction) — do NOT delete; these are live validation code (`isinstance(schema_data, dict)` checks). Not attempted.** |

**Verify:** `pytest -q`; revert-check the dict-mode removal by confirming an existing voice-test
job path still publishes correctly. **Risk:** low (low-med for the service.py edits — covered by
the progress suite). **Spec:** none.

*(Full backend suite after both BE-1 commits: 2221 passed, 3 skipped — no change from baseline.)*

---

## BE-2 — Replace dead `INTENDED_*/FORBIDDEN_*` constants

**Why:** module-level tuples (`INTENDED_UPSTREAM_CALLERS`, `INTENDED_DOWNSTREAM_DEPENDENCIES`,
`FORBIDDEN_DIRECT_IMPORTS`) are read **nowhere** — pure documentation that silently rots. Present in
~10 modules (e.g. `progress/service.py:26-39`, `scheduler/orchestrator.py:41-57`,
`engines/bridge_utils.py:8-22`, the `domain/*/service.py` files, `core/logging.py:7-14`, the two
plugin `app_adapter.py` files).

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
`JOB_LIFECYCLE_COMMANDS` (30-47) and `COMMAND_TOPIC_SCOPES` (49-103) list each command **twice** —
enum member *and* raw string ("Allow string versions" comments). The raw duplicates are redundant.

**Steps:** remove the raw-string duplicates; keep enum members. Add/confirm a test that a raw string
(e.g. `"JOB_QUEUED" in JOB_LIFECYCLE_COMMANDS`) still resolves true (it does, via `str` enum) so the
dedup is provably behavior-preserving (revert-check: the test passes before and after).
**Effort:** S · **Risk:** low. **Spec:** `live-events.md` if it documents these sets — verify, no
behavior change.

---

## BE-4 — Remove duplicate segment-timing math *(done 2026-07-04, `commit 0cba74d8`)*

**Why:** `app/tts_server/server.py:651-714` computes `model_load_seconds`,
`synthesis_duration_seconds`, `sum_segment_render_seconds`, `inter_group_overhead_seconds` and ships
them in the response's `timing` dict — then `app/orchestration/scheduler/orchestrator_helpers.py:174-262`
(`_record_render_stats_inner`) **re-derives the same values** from the raw segment list. Both also
define an identical local `get_val(obj, key)`.

**Steps:** have `_record_render_stats_inner` read the pre-computed `timing` fields from the server
response instead of re-deriving. If a defensive re-derive must stay (older response without
`timing`), extract `get_val` + the formula into one shared util (e.g. `app/orchestration/progress/`
or a timing helper) imported by both — single source of truth.
**Verify:** `pytest -q`; the timing/performance-sample tests must show identical recorded values
(revert-check against a captured response fixture). **Effort:** M · **Risk:** med (touches recorded
performance samples that feed ETA). **Spec:** none.

*(Executor note: the shared formula landed in `app/utils/render_timing.py` — deliberately outside
both `app.tts_server` and `app.orchestration`, since either side importing the other's internals
would violate the two-process boundary in `system-architecture.md`. `_record_render_stats_inner`
now prefers `timing_payload`'s precomputed `synthesis_duration_seconds`/`sum_segment_render_seconds`/
`inter_group_overhead_seconds` when present, falling back to the shared derive function only when
absent. `model_load_seconds` was deliberately NOT unified — a real, pre-existing divergence was
found: server.py defaults it to `None` with no engine-activity timestamp, orchestrator_helpers has
always defaulted it to `0.0`. Preserved exactly rather than silently merged. Full suite 2221
passed/3 skipped, identical to pre-change; timing/ETA-specific suites green.)*

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

> Sequencing note: BE-6 is independent of the others but is the highest-risk; land BE-1..BE-5 first
> to bank easy wins, then do BE-6 in isolation.

---

### Phase 4 done-check
`ruff check .` · full `pytest -q` (incl. plugin suites) green. No `app.jobs` references remain after
BE-6. Specs updated for BE-6 (and BE-2 if the boundary test path is documented). Dated
`wiki/Changelog.md` entry.

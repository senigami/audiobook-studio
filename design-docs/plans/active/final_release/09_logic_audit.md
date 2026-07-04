# 09 — Logic Error & Redundancy Audit

Code-verified findings from a 2026-06-10 audit of the backend (`app/`, `plugins/`) and frontend (`frontend/src/`). Each item is a standalone fix task: file:line, the problem, the fix, and an acceptance check. Fix Critical items before the release gate; Likely-bug items during Phase 12.2; redundancy/dead-code items belong with [06_code_organization_cleanup.md](06_code_organization_cleanup.md) and are listed here only where not already covered there.

Owner policy applies throughout: legacy code is deleted, not preserved (see `01_discrepancies_and_corrections.md`); only the v1→v2 migration path survives.

---

## Backend — Critical

- [x] **B1. Broadcast race in `put_job`** — `app/db/state_jobs.py:63-116`. `existing_job` / `is_terminal_reset` / `previous_status` are computed from state captured under `_STATE_LOCK` but the `broadcast_job_updated` call runs after the lock is released, so a concurrent `update_job` can interleave broadcasts out of order. **Fix:** snapshot `previous_status` and `is_terminal_reset` into local plain values before releasing the lock; pass only the snapshots to the broadcast.
  *Accept:* broadcasts for a rapid put_job/update_job pair always report correct `previous_status`; add a threaded unit test exercising concurrent put/update on the same job id.

- [x] **B2. `previous_status` clobbered in `update_job`** — `app/db/state_jobs.py:155-169,408-409`. `current_status` is re-assigned inside the field loop, so the websocket broadcast can report `previous_status == new_status` and `status_changed == False` right after a real status change. **Fix:** capture `pre_update_status = j.get("status")` once before the loop; use it for both `previous_status` and `status_changed`.
  *Accept:* unit test — update status queued→running, broadcast payload must have `previous_status == "queued"`, `status_changed == True`.

- [x] **B3. Chapter status flipped to `unprocessed` for completed chapters in reconcile** — `app/db/queue.py:329-338`. The chapter-sync UPDATE selects chapters with `cancelled` queue rows but does not exclude chapters that also have a `done` row outside `active_ids`/`terminal_ids`; a chapter with a stale stuck row plus a newer done row can be reset to `unprocessed`. **Fix:** exclude chapters having any `done` row in `processing_queue` (or derive chapter status from the most recent row per chapter).
  *Accept:* regression test — chapter with one old `running` row and one `done` row keeps `audio_status='processed'` after `reconcile_queue_status()`.

- [x] **B4. Unsynchronized `_cancelled_tasks` read in cancel_check** — `app/tts_server/server.py:525`. The lambda reads the set without `_state_lock` (writes at 460/538 take it). Works today only via the GIL. **Fix:** use a per-task `threading.Event` (or take the lock in a small helper) and document the contract.
  *Accept:* grep shows no bare `in _cancelled_tasks` outside lock-holding helpers.

## Backend — Likely bugs

- [x] **B5. `terminal_reset` discards caller-supplied values** — `app/db/state_jobs.py:188-193`. The reset branch `continue`s, so an explicit new `started_at` passed alongside `status="queued"` is dropped. **Fix:** after clearing, still apply the caller's value when the key is present in `updates`.
- [x] **B6. Self-identical fallback path** — `plugins/tts_voxtral/plugin/studio/app_adapter.py:66-75`. `local_path` is the same expression as `schema_path`; on a read/decode error the fallback re-raises instead of returning `{}`. **Fix:** delete the fake fallback; wrap once with `except Exception: return {}` (and log).
- [x] **B7. Double profile-dir resolution diverges** — `app/jobs/worker_voice.py:88-101`. `get_voice_profile_dir` is called twice; the second call can set `voice_profile_dir = None` even though `pdir` resolved. **Fix:** resolve once, reuse.
- [x] **B8. Paragraph breaks destroyed by splitter** — `app/utils/text/textops_splitting.py:198-207`. `safe_split_long_sentences` collapses all blank lines (`\n{2,}` → `\n`), destroying paragraph/scene-break structure. **Fix:** track blank input lines and restore paragraph boundaries after rejoin.
  *Accept:* test — input with `para1\n\npara2` keeps a blank-line boundary in output.
- [x] **B9. `pack_text_to_limit` emits oversized chunks** — `app/utils/text/textops_cleaning.py:253-260`. A single line longer than `limit` is assigned to a chunk unsplit, violating the declared cap (500-char segment limit downstream). **Fix:** run oversized lines through `split_sentences` before packing.
  *Accept:* test — every returned chunk `<= limit` for adversarial inputs.
- [x] **B10. Bare `except: pass` in progress handlers** — `plugins/tts_xtts/plugin/studio/bake.py:147` and `plugins/tts_xtts/plugin/studio/segments.py:151`. Swallows everything incl. `KeyboardInterrupt`; refactor errors leave jobs stuck silently. **Fix:** `except Exception:` + `logger.warning(...)` minimum. (Superseded by the SDK migration in `02_plugin_communication_contract.md`, but fix immediately anyway.)
- [x] **B11. Live HTTP call on every registry read + ineffective cache_clear** — `app/engines/registry.py:33-38,406`. `load_engine_registry` hits the TTS Server `/engines` endpoint on every call; `cache_clear` only clears the (legacy) local path. **Fix:** short-TTL cache on the remote result. Note: the legacy local path itself (`_load_builtin_engines`/`_load_plugin_engines`) is scheduled for deletion in doc 06 — do that first; this item then reduces to "TTL-cache the remote call".

## Frontend — Critical

- [x] **F1. Socket listener churn drops live events** — `frontend/src/app/App.tsx:69-75`. Five inline callback props to `useJobs` are new references each render; `useJobs`' subscribe effect lists them as deps, so every App render tears down/re-creates the socket subscription, silently dropping events in the gap (and double-firing the `onJobComplete` effect). **Fix:** wrap all five in `useCallback`; audit `useJobs` deps.
  *Accept:* React DevTools/profiler shows one stable subscription across renders; no resubscribe on queue-count change.
- [x] **F2. WebSocket reconnect leak + stale URL** — `frontend/src/hooks/useWebSocket.ts:48-54`. `onclose` schedules `connect` after unmount cleanup (leaked timer, setState-after-unmount) and captures a stale `connect`/`url`. **Fix:** guard with a `mountedRef`/`socketRef.current !== null` before scheduling; clear timer in cleanup; re-read current url at fire time.
- [x] **F3. Events dropped during bootstrap hydration** — `frontend/src/hooks/useQueueSync.ts:39-47,80-128`. Subscription is live before the first snapshot exists; `updateDerivedState` early-returns on null snapshot, so lifecycle/progress events during the initial fetch are discarded and never replayed. **Fix:** buffer events (or re-run merge from the overlay store) once the snapshot lands.
  *Accept:* simulated test — event arriving mid-bootstrap is reflected after snapshot set.
- [x] **F4. Concurrent hydrations clobber each other on reconnect** — `frontend/src/hooks/useQueueSync.ts:136-148`. Fast connect/disconnect/reconnect before bootstrap completes runs two `getProcessingQueue` fetches in parallel; last-to-finish wins. **Fix:** single in-flight hydration guard ref.
- [x] **F5. Unchecked `res.ok` on core fetches** — `frontend/src/api/index.ts:16-34,287-289`. `fetchHome`, `fetchProjects`, `fetchProject`, `fetchChapters`, `fetchChapter`, `getProcessingQueue` parse error bodies as data (a 503 becomes "queue items"). **Fix:** route every method through the existing `parseApiResponse`.
  *Accept:* grep — no `res.json()` without a preceding `res.ok` check or `parseApiResponse` in `api/index.ts`.

## Frontend — Likely bugs

- [x] **F6. Ref mutation during render in PredictiveProgressBar** — `frontend/src/components/progress/PredictiveProgressBar/PredictiveProgressBar.tsx:384-401`. `doneTransitionRef` is set/cleared in the render body; StrictMode double-render yields a wrong `startTimeMs` for the done animation. **Fix:** move into the prop-sync `useEffect` (~line 429).
- [x] **F7. `showToast` untracked timeout + unstable reference** — `frontend/src/app/App.tsx:123-126`. setState after unmount possible; new reference per render. **Fix:** `useCallback` + timeout id stored in ref, cleared on unmount.
- [x] **F8. Duplicate identical `getVal` reads** — `frontend/src/hooks/useJobs.ts:392-426`. `rawStartedAt`/`rawStarted` are the same call feeding two fields; unify to prevent silent divergence.
- [x] **F9. Duplicated terminal-field-nulling logic diverging between stores** — `frontend/src/hooks/useQueueSync.ts:107-118` vs `frontend/src/hooks/useJobs.ts:290-301`. Same copy-pasted block, but `useJobs` has `STATUS_PRIORITY` guards `useQueueSync` lacks — queue panel and progress bar can disagree on the same job. **Fix:** extract one shared `applyTerminalReset(job)` helper used by both; align the status-priority guard.

## Dead code (delete — supplements doc 06)

- [x] **D1.** `frontend/src/components/progress/PredictiveProgressBar/predictiveProgressBarEngine.ts` — self-documented obsolete, `export {}` only. *(already fixed — file deleted; verified 2026-07-01)*
- [ ] **D2.** `frontend/src/hooks/useSegmentProgressLifecycle.ts` — exported, zero import sites.
- [x] **D3.** `app/engines/registry.py:282-284` `_load_plugin_engines` — unconditional `{}` stub (goes with the legacy-path deletion in doc 06). *(already fixed — `_load_plugin_engines` stub no longer exists; verified 2026-07-01)*
- [ ] **D4.** Already in doc 06: `api/client.ts`, `api/queries/index.ts`, `shared/*` stubs, `.burger` CSS — cross-check they're covered before closing this doc.

## Redundancy (consolidate — coordinate with docs 02/06)

- [x] **R1.** `_ensure_plugin_package_hierarchy` duplicated verbatim — `app/tts_server/plugin_loader.py:710-733` and `app/jobs/registry.py:197-214`. Extract to `app/utils/plugin_import.py`. (Also tracked in doc 02 migration step.) *(already fixed — both callers import shared `ensure_plugin_package_hierarchy` from `studio_plugin_sdk`; verified 2026-07-01)*
- [ ] **R2.** Four identical adapter helpers + MP3-conversion boilerplate duplicated — `plugins/tts_xtts/plugin/studio/app_adapter.py:420-458` vs `plugins/tts_voxtral/plugin/studio/app_adapter.py:396-436`. Resolve via the shared SDK base in doc 02 rather than a one-off base class.
- [ ] **R3.** Voxtral `synthesize` vs `preview` duplicated staging/cleanup blocks — `plugins/tts_voxtral/plugin/studio/app_adapter.py:195-298,301-375`. Extract `_run_voxtral_generate(...)` helper/context manager.
- [ ] **R4.** Input styling defined four ways — `frontend/src/theme/components.css:216-249,384-399` + `GlassInput.tsx:53-66` inline overrides. Owner confirmed `.form-input` + `GlassInput` as canonical on 2026-06-14; delete `.input-field`, `.input-group input`. (Owned by doc 06; listed for traceability.)
- [ ] **R5.** `components/VoicesModals.tsx` pure forwarding wrapper over `pages/Voices/components/*` modals — remove the wrapper, render sub-modals in `VoicesPage.tsx`. (Owned by doc 06.)
- [ ] **R6.** `useQueueSync` + `useJobs` both subscribe to `jobs.lifecycle`/`queue.items`/`chapters.progress` with parallel overlay logic — longer-term: one live-overlay store consumed by both views (see F9 for the immediate fix).

## Addendum — orchestrator's personal review of the queue/segment progress pipeline (2026-06-10)

- [x] **B12 (Likely bug). Segment group text joined without separators** — `plugins/tts_xtts/plugin/studio/segments.py:58` synthesizes `"".join([s['text_content'] for s in group])` while the grouping size check at line 41-42 assumes `" ".join` (+1 per separator), and every other handler (`bake.py:56`, `standard_handler.py:83`, `synthesis_mixed/handler.py:249`) uses `" ".join`. If stored `text_content` is stripped (segment sync compares `.strip()`ed at `app/db/segments.py:488`), adjacent sentences concatenate as `…end.Next…`, which can audibly alter TTS prosody. **Fix:** use `" ".join(...)` (or verify trailing whitespace is guaranteed) and align with the limit calculation.
  *Accept:* unit test — grouped segments synthesize with exactly one separator between segment texts; group-size check and join use the same separator convention.
- [x] **F10 (Inconsistency). Backward-detection differs between bar code paths** — `PredictiveProgressBar.tsx:277` gates on `allowBackwardProgress === true` while line 283 (the startedAt-present path) gates on `effectiveAllowBackward`. A caller passing `authoritativeFloor={false}` without `allowBackwardProgress` gets backward correction on one path only. Use `effectiveAllowBackward` in both.
- [x] **F11 (Dead code). Unreachable duplicate ETA branch** — `PredictiveProgressBar.tsx:120-123` repeats the `remaining_from_update` branch already returned at lines 107-110. Delete.
- [x] **F12 (Stale doc/comment). `evidenceWeightFraction` labeled "No-op for compatibility"** (`PredictiveProgressBar.tsx:197`) but is used as lane-migration confidence at line 327. Fix the comment (or remove the prop if no caller passes < 1).
- [x] **F13 (Hygiene). Module-level `progressMemory` Map grows unboundedly** across jobs (keyed `persistenceKey:startedAt`); entries are only removed via `resetPredictiveProgressMemory`. Audit callers; evict terminal jobs' keys.
- [x] **B13 (Clarity). Contradictory broadcast flags** — `segments.py` passes both `force_broadcast=True` and `_SKIP_LIVE_BROADCASTS` (`skip_studio_job_event`, `skip_job_updated`) to `update_job` for START_SEGMENT/PROGRESS updates. Document the intended topic routing in `state_jobs.py` (which topics each flag suppresses) — this is exactly the topic-ownership tuning Memory/state.json lists as a next step, and it's where future regressions will hide.

## Addendum 3 — found while writing the canonical specs (2026-06-10, doc 18 SP1/SP4/SP6)

- [x] **B18 (FIXED 2026-06-10, incl. startup wiring + STUDIO_RECOVER_ON_STARTUP gate + per-chapter dedup) (CRITICAL — silent no-op). Restart recovery never recovers anything** — `app/orchestration/scheduler/recovery.py:52` imports `list_jobs_by_status` from `app.db.queue`, but no such function exists anywhere in the codebase; the `except ImportError` swallows it and returns `[]`, so post-restart task recovery is a silent no-op. **Fix:** implement `list_jobs_by_status` in `app/db/queue.py` (SELECT from processing_queue by status) or point recovery at the real query; add a REAL test that creates a dangling running row, restarts recovery, and asserts a recovered context. Owner decision on timing: fixing this CHANGES behavior (jobs will start recovering after restarts).
- [x] **B19 (FIXED 2026-06-10 — manifest get_text_chunk_limit is the render-time source of truth in all xtts handlers). XTTS grouper ignores manifest chunk limit** — `plugins/tts_xtts/plugin/studio/segments.py:5` budgets groups with the constant `DEFAULT_SENT_CHAR_LIMIT` instead of `get_text_chunk_limit(engine_id)` from manifest `behavior.text_chunk_limit`. Both are 500 today, so no live impact — breaks the moment any engine declares a different limit. Fix alongside the doc 02 SDK migration.
- [x] **B20 (FIXED 2026-06-10 — requeue uses the standard terminal-reset path). `requeue()` bypasses the terminal-reset branch** — it nulls fields manually with `force_broadcast=True` instead of triggering `update_job`'s terminal-reset path, so no `reason_code=JOB_RESET_TO_ACTIVE` or queue_update broadcast is emitted on requeue. Unify on the terminal-reset branch. (Spec: design-docs/specs/queue-jobs.md Known Gaps G4.)

## Addendum 2 — production bugs surfaced by the full test audit (2026-06-10, doc 17 T3/T4)

- [x] **F14 (Bug, FIXED 2026-07-04). ScriptView crashes on undefined `data.paragraphs`** — `frontend/src/pages/ChapterEditor/components/ScriptView.tsx:460` calls `data.paragraphs.map(...)` without guarding `data`; the App.test.tsx chapter-route test logs the unhandled exception but still passes. **Fix:** null-guard `data`/`data.paragraphs` (render empty/loading state) or wrap in an error boundary; make the test assert no console error. *(still valid; line citation drifted — file restructured; note: `ChapterEditor` is LIVE-ROUTED, the "maybe-dead tree" caveat does not apply)* *(FIXED: `renderBook`/`renderScript` now guard `data?.paragraphs`/`data?.spans` and return `null` instead of throwing; R1 revert-checked regression test in `ScriptView.test.tsx`.)*
- [x] **F15 (Bug, FIXED 2026-07-04). `useInitialData` never signals fetch failure** — on rejection the hook only logs and stays `loading: true` forever → infinite spinner. **Fix:** add an `error` state, surface a retryable error UI in App. *(FIXED: `useInitialData` now exposes an `error` string state, cleared on success; `App.tsx` renders a retryable error banner — "Couldn't reach Audiobook Studio" + Retry now button — in place of the silent spinner while `initialError` is set. R1 revert-checked in `useInitialData.test.tsx` and `App.test.tsx`.)*
- [ ] **B14 (Test-env). `test_voice_bridge_describes_remote_registry_by_default` is environment-dependent** — passes only when a live TTS server is running; would fail in clean CI. Needs a mock TTS-server fixture (or skip-unless marker) — flagged in audits/test_audit_backend_misc.md.
- [ ] **B15 (Coverage gap). `ETA_PROJECTION_SKIP_REASONS` suppression has no real test** — the deleted vacuous test named this contract (segment-boundary events must not project bad ETA) but only checked set membership. Write an end-to-end test through `update_job`.
- [ ] **B17 (Flaky test). `tests/orchestration/test_submit.py::TestOrchestratorProgressTransitions::test_bridge_tasks_wait_for_resources_before_dispatching` failed once in a full-suite run (2026-06-10), passes in isolation and on rerun — order/timing sensitivity in resource-gate setup. Investigate with `pytest -p no:randomly` repetition or add explicit gate synchronization.
- [ ] **B16 (Test-infra). Hardcoded `/tmp/*.db` fixture paths** — tests/db conftest + tests/api voice fixtures use fixed /tmp paths; collide under parallel runs. Migrate to `tmp_path`-based fixtures.

## Verification gate for this doc

- [ ] `pytest` green after backend fixes; new regression tests for B2, B3, B8, B9 included.
- [ ] `cd frontend && npm run build && npm test` green after frontend fixes.
- [ ] grep checks: no `except: pass` (bare) under `app/` or `plugins/`; no unchecked `res.json()` in `frontend/src/api/index.ts`.

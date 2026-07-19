# Frontier Calibration — findings summary (Phase 1 Fable references)

These are the actionable findings from the 6 Fable reference analyses (2026-07-18). They are **real
analysis of Studio 2.0**, and each routes toward the roadmap. **Benchmark integrity:** a finding is
implemented only *after* the twins have run that scenario (Phase 2) — implementing early would alter
the code the twins analyze. Status below reflects that hold.

| # | Finding (Fable reference) | Value to Studio 2.0 | Routes to | Implement status |
|---|---|---|---|---|
| **RC-1** | Sub-sentence span data loss: root cause is the whole-sentence-equality preservation check at `app/db/segments.py:523` in `sync_chapter_segments`, fired on **every** text save via `update_chapter` (not just explicit resync); split fragments can never satisfy it, so they're recreated with `character_id=None`, indices shift, and downstream assignments wipe. | Fixes a real data-loss bug in the flagship sub-sentence-casting feature. | The re-anchoring fix (its blast radius is scenario BR-2 in the menu); a fix plan under `design-docs/plans/`. | HOLD until RC-1 twin run |
| **AR-1** | OOM-prevention design: a boot-started `MemoryPressureMonitor` exposing a pure `get_pressure_penalty()`, applied inside `resolve_effective_cap` (`cap_settings.py:156`); asymmetric hysteresis; visible throttle via `broadcast_studio_event`; sampling-failure fails open (freeze, never grow). Open question flagged: can the Studio process read CUDA memory, or must sampling ride the TTS-server `/health` heartbeat? | Prevents mid-render OOM crashes; unlocks safe higher parallelism. | A design proposal → `FUTURE_WORK.md` "Concurrency / rendering". (New plan doc — draftable earlier; still prefer twin-run-first.) | HOLD (soft) until AR-1 twin run |
| **BR-1** | `app/jobs` move blast radius: 9 runtime wiring sites, 34 test files (mostly `patch("app.jobs…")` strings), 4 boundary-guard files encoding the old name as forbidden; sharpest hazards = boot.py exception-swallowing (a missed rename boots green with zero handlers) and attribute-patch targets that silently un-mock. Safe path: 5-stage `sys.modules`-shim sequence, shim deleted last. | De-risks the BE-6 namespace-cleanup milestone everyone is afraid to touch. | REMAINING_TASKS "Milestone 3 (005) — BE-6" as the execution plan. | HOLD until BR-1 twin run |
| **AD-2** | 5 concurrency findings, incl. **F3** (strongest new bug): a mid-flight `ENGINE_CLASS_ADMISSION` toggle leaks class/id/global semaphore slots across mismatched reserve/release paths. Also F4 (per-engine live limit wrongly applied to the shared class semaphore → latent sibling-starvation) and F5 (empty `tts_engine_caps` dict can't override the env var — a requested-setting-no-effect path). | Hardens a subsystem with a documented history of silent no-op bugs. | Real bugs → `REMAINING_TASKS.md` + FUTURE_WORK "Settings UI silent-clamp warning"; F3 warrants a scoped fix. | HOLD until AD-2 twin run |
| **PL-2** | Standalone-plugin extraction plan (8 slices, "never touch the bundled in-tree copy until the final clean-machine test"). Flags that **much of doc 05 is already shipped** (SDK inversion, distribution blocks, tts_mixed rename/registration, backend install/trust E2E) — the genuinely open work is repo creation + §5.3 UI acceptance + §5.1 clean-machine E2E + Group 6 docs. | Realizes the plugin-marketplace promise; reconciles an overclaiming/underclaiming plan doc. | Doc 010 / doc 05 reconciliation (an Edda/archivist task) + the execution plan. | Plan doc — draftable; reconcile doc 05 after PL-2 twin run |
| **SD-1** | The first always-on lesson claims the engine-class admission gate defaults **OFF** (renders sequential); the code (`resources.py:67-68`) defaults **ON** since 2026-07-06 (`7c3d5b9d`, no revert). The lesson is **stale**, not a regression — it misleads every session into thinking parallel rendering is off. | An auto-loaded lesson actively misinforms every future session. | Correct `.agent/lessons/INDEX.md` (past-tense the incident, keep the Apply meta-lesson). | HOLD until SD-1 twin run |

## Notes

- **SD-1 and AD-2/F2 corroborate** (both independently find the gate defaults ON / the lesson is
  stale) — a good cross-check that the references are grounded.
- Several findings carry **open verification items** Fable flagged honestly (AR-1: can Studio read
  CUDA memory; AD-2: do tests toggle the gate mid-reservation; PL-2: license/org/template-path).
  These are exactly the kind of thing the twins' map-ritual and a `runtime-verifier` pass should
  resolve in Phase 2.
- **Phase 2 will re-surface these from the twins' side**, and the gap between twin and Fable on each
  is what drives the "what mechanism brings us closer" catalog.

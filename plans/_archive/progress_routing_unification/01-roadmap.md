# Roadmap — Progress Routing Unification (v2.1 — post 2nd adversarial review)

> v2.1 folds 10 execution-safety corrections (lock hierarchy/deadlock, grouped→1.0 terminal, 003a seed source, 004/005 builder coverage, 006 seg-confidence producer, 009 load signal, read-only enrich, 010 latch+reconcile, B8 real-render task 012, 002 tests).

> **TL;DR:** 12 ordered tasks (adds 012). The v1 spine ("wire `enrich` at `broadcast_job_updated`, the universal
> chokepoint") was **wrong** — direct code verification (`00-architecture-map.md` v2.1 §0) shows Path A
> deliberately *bypasses* `broadcast_job_updated` (`orchestrator_publish.py:240` sets
> `skip_job_updated=True`) and wires its own sink (`web.py:358`). **The true convergence point both paths
> cross is the event builders in `app/api/contracts/events.py`.** So the corrected spine is: extract one
> `enrich()` kernel → make `ProgressService` one RLock-guarded singleton → **thread the enriched values
> into every `build_*_event(...)` call site in BOTH producers** → delete the `compute_progress_confidence`
> echo. Parity is proven by a **CI-runnable unit test** (one synthetic shared-state job dict through both
> producers, value-equality with injected clocks), not a live capture — live capture is owner manual
> evidence only.

Read `00-architecture-map.md` (v2.1) first; it is the source of truth and supersedes any v1 framing left in
older docs. Where this roadmap and the map disagree, the map wins.

## What changed from v1 (so an executor doesn't re-do the wrong thing)
- v1's Task 004 "invoke `enrich` at `broadcast_job_updated`" assumed that function is the universal
  chokepoint. It is not — Path A bypasses it. The corrected Task 004 threads enriched values into **all**
  `build_*_event` call sites in **both** `service.py` AND `ws.py`.
- v1's D5 (idempotency for Path-A re-entry into `broadcast_job_updated`) guarded a path that does not
  exist. **Deleted** — no idempotency/re-entry machinery in the corrected plan.
- v1's golden-frame gate was "byte-identical." Corrected: **dict value-equality with injected
  deterministic clocks** (confidence math uses wall-clock + floats; byte/JSON identity is unachievable).
- The v1.4.0 ETA/confidence helpers in `eta.py` are **committed dead code**, not "uncommitted." Two of
  them (`compute_eta_confidence`, `EtaSampleRing`) are in fact *already wired* into `service.py`
  (`service.py:14,80,635,654`); only `crossfade_eta` and `apply_eta_ceiling` are genuinely unwired.
- New tasks the panel surfaced that v1 lacked: bootstrap-cps ETA (003a), §4A.3/§4A.5 ETA composition +
  convergence-trust PI7 (006), cold-load UX (009), and a re-scoped B8 freeze characterization (008).

## Sequencing rationale
Foundation first: extract the math into one callable (`enrich`, 001), then make `ProgressService` a single
RLock-guarded singleton both producers resolve (002) — the precondition for shared per-job state to be
correct under concurrency. In parallel, build the ETA bootstrap (003a) and integrate the existing
crossfade/ceiling helpers into `enrich` (003b) so ETA is never null on a cold render. **Convergence** is
004: thread the enriched values into every `build_*_event(...)` call in both producers — this is where the
contract becomes single-source. Only after the binding **unit parity test** in 004 passes do we delete the
`compute_progress_confidence` echo (005) — deletion before the values are wired everywhere would turn
Path-A confidence into `None`, a worse regression. The dependent correctness items (006 ETA composition,
007 snapshot hydration, 008 B8 characterization, 009 cold-load UX, 010 throttle reconciliation) land after
their deps. Docs/ADR/plan reconciliation (011) is last so it records the design as actually built.

## Dependency graph
```
001 (extract enrich kernel) ─► 002 (RLocked singleton) ─► 004 (forward into all build_*_event) ─► 005 (delete echo) ─► 011 (specs/ADR)
                          └─► 003b ┐
003a (bootstrap cps) ─► 003b (wire crossfade/ceiling into enrich) ─► 004
002 ─► 007 (snapshot/REST hydration uses enrich, PI6)
002 ─► 010 (throttle/emission reconciliation under the lock)
004 ─► 006 (§4A.3 segment→chapter ETA composition + §4A.5 trust, PI7)
008 (B8 freeze characterization) ─► 012 (engine/relay marker emission — blocked on 008 verdict)
009 (cold-load UX) — independent (frontend + frame shape)
012 (engine/relay per-segment marker emission + credit) — blocked on 008
```
Critical path: **001 → 002 → 004 → 005 → 011**, with **003a → 003b → 004** joining at 004.

## Workloads & tasks

### WL-A — Foundation (the kernel + the singleton)
- **001 — Extract the `enrich()` kernel** (M). Pull the §4A contract math out of
  `_build_progress_payload` and fold in the committed-but-unwired `eta.py` helpers
  (`crossfade_eta`/`apply_eta_ceiling`; `compute_eta_confidence`/`EtaSampleRing` are already wired). One
  `enrich(job_id, payload)`; `publish` calls it. Gate = dict **value-equality** with injected clocks.
  Blocks 002, 003b, 004.
- **002 — One RLock-guarded `ProgressService` singleton** (M, ← 001). Boot-wire a single main-process
  instance (`boot.py`); orchestrator + `ws.broadcast_job_updated` + the snapshot serializer resolve it.
  Add an `RLock` over per-job state (producers run on different threads). Conftest autouse reset; reconcile
  tests that build their own service. Behavior change from per-orchestrator ownership — call it out.
  Blocks 004, 007, 010.

### WL-B — ETA bootstrap + convergence
- **003a — Bootstrap cps + velocity reader** (M, ← 001). Add a `seconds_per_char` reader to
  `state_performance` that seeds from `predicted_audio_length / char_count` (cold render: `engine_cps`
  empty) or a per-engine manifest default. Blocks 003b.
- **003b — Wire crossfade/ceiling into `enrich`** (M, ← 003a). Integrate the existing tested
  `crossfade_eta`/`apply_eta_ceiling` for null/cold/sparse frames so ETA is never null (PI3). Blocks 004.
- **004 — Forward enriched values into ALL `build_*_event` call sites** (L, ← 002, 003b). The true
  convergence. Thread enriched `confidence`/`eta_seconds`/`eta_basis`/`estimated_end_at`/`grouped_progress`
  into EVERY builder call in `service.py` (304/328/367/422/463) AND `ws.broadcast_job_updated`. **Binding
  gate = CI unit parity test.** Blocks 005, 006.
- **005 — Delete `compute_progress_confidence`** (S, ← 004). Delete the echo (`events.py:179/199`);
  builders require non-None confidence and fail-loud (real test) on a progress frame with
  `confidence=None`. Blocks 011.

### WL-C — Dependent correctness + UX
- **006 — §4A.3 segment→chapter ETA composition + §4A.5 convergence-trust (PI7)** (M, ← 004). Share-weighted
  blend so a late high-confidence segment ETA dominates; a converging ETA *raises* confidence. Revert-checked.
- **007 — Snapshot/REST hydration uses `enrich` (PI6)** (M, ← 002). `jobs_snapshot` (`web.py:219`) + queue
  snapshot call `enrich` so snapshot matches live frames.
- **008 — B8 freeze characterization (re-scoped)** (M, independent). Synthetic-marker-stream unit test
  against `log_listener` to determine whether a clean marker stream advances within-group. Credit machinery
  already exists; the captured freeze had **zero markers** (cold load + sub-second synth). No-marker case =
  separate engine/relay task. Don't conflate the two captures.
- **009 — Cold-load UX** (M, independent). ~36s XTTS model load reads as a frozen 0% bar; no enrich can
  fix it (no velocity). Add a distinct indeterminate `preparing` "loading voice model…" presentation using
  `model_load_seconds`. Spec the frame + frontend treatment.
- **010 — Throttle/emission reconciliation under the lock** (S, ← 002). Keep `_should_emit`/terminal-latch
  as emission policy (out of `enrich`); RLock-guard `_last_payload_by_job` so two producers don't
  race/double-suppress.

### WL-D — Lock the contract in docs + reconcile plans
- **011 — Specs + ADR + plan reconciliation** (M, ← 005). Amend `live-events.md` (single contract
  authority via the builder layer; retire dual-path allowance), confirm `progress-presentation.md` §4A
  wiring + the client-vs-server monotonic-floor reconciliation (D5), add an ADR ("enrich kernel at the
  event-builder layer, one RLocked ProgressService"), fold/retire scattered plans per `02-plan-reconciliation.md`.
- **012 — Engine/relay per-segment marker emission + credit during real synthesis** (TBD, ← 008 verdict).
  **Blocked** on 008. If 008 shows a clean synthetic marker stream advances but real renders emit zero
  `[START_SEGMENT]`/`[PROGRESS]`/`[SEGMENT_SAVED]` markers, own getting those markers to flow and be
  credited during a real multi-segment render. See `tasks/012-engine-marker-emission.md`.

## Verification rule (corrected)
- **Binding gate = a CI-runnable unit parity test.** Feed one synthetic shared-state job dict through BOTH
  producers (`ProgressService.publish` and `ws.broadcast_job_updated`) and assert the enriched
  `confidence`/`eta_seconds`/`grouped_progress` **match between paths** AND differ from `progress` /
  are non-null on a **cold/sparse frame** (Path-B-shaped: progress + status only). Golden-frame comparisons
  are **dict value-equality with injected deterministic clocks**, never byte/JSON-string identity.
- **Live event-stream capture is owner manual evidence**, not the autonomous gate. The baseline captures in
  `debug/` are regression references, not the pass/fail gate.
- R1 revert-check per `docs/specs/testing-standards.md` applies to every bug-fix test (005, 006, 008). For
  pure refactors (001) the "revert-check" is: the value-equality snapshot matches a capture taken on the
  pre-refactor `service.py`.

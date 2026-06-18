# Progress Routing Unification

Make **`ProgressService` the single authoritative source** for the progress contract so every frame the
UI receives — no matter which path emitted it — honors `docs/specs/progress-presentation.md` §4A
(numeric confidence, char-weighted calculated→observed ETA, grouped→1.0, monotonic, terminal latch).

This exists because progress is currently emitted from **two uncoordinated paths** (orchestrated via
ProgressService, and handler-direct via `state_jobs`/the TTS-subprocess plugin SDK), so contract fixes
made in ProgressService never reached the frames the UI actually shows.

## Read in order
1. `00-architecture-map.md` (**v2.1 — source of truth**) — real topology, what v1 got wrong, the target
   **enrich-at-the-event-builder-layer** design, decisions D1–D7, invariants PI1–PI8, the file surface.
2. `01-roadmap.md` — the 12 ordered tasks (001, 002, 003a, 003b, 004–012), corrected dependency graph,
   workloads WL-A..WL-D, and the corrected verification rule.
3. `02-plan-reconciliation.md` — how this folds/retires the scattered progress plans.
4. `tasks/NNN-*.md` — self-contained tasks.

## Execution rules
- TDD + R1 revert-check per `docs/specs/testing-standards.md`.
- **The true convergence point is the event builders** in `app/api/contracts/events.py`, NOT
  `broadcast_job_updated` (Path A bypasses it via `skip_job_updated=True`). Both producers `enrich`, then
  thread the enriched values into every `build_*_event(...)` call.
- **Binding gate = the CI unit parity test (Task 004):** one synthetic shared-state job dict through BOTH
  producers → enriched values match (dict value-equality, injected clocks) AND differ from `progress` /
  non-null on a cold/sparse frame. Only after it is green does Task 005 delete the `compute_progress_confidence`
  echo. **Live event-stream capture is owner manual evidence, not the autonomous gate.**
- Single main-process **RLock-guarded** `ProgressService` singleton; per-job contract state lives only there.
- Status legend: `not-started | in-progress | blocked | done`. Update each task's Status as work lands.
- Baseline/regression evidence (references, not the gate): `debug/event-stream.txt`, `debug/queue.txt`,
  `debug/chapter-segment.txt`.

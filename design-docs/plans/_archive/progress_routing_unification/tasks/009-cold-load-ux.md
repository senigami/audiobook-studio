# 009 — Cold-load UX (indeterminate "loading voice model…" state)

- **Status:** done (manifest field deferred; §2.6 spec text v1.4.2 ready for 011)
- **Workload:** WL-C correctness · UX
- **Severity / type:** major · UX
- **Effort:** M
- **Blocked by:** nothing (independent of the enrich chain)
- **Blocks:** nothing

## Goal
During the ~36s XTTS model cold-load there is **no velocity** to estimate from, so the bar reads as a frozen
0% with a null ETA — and **no `enrich` change can fix it** (there is genuinely nothing to compute). Add a
distinct **indeterminate `preparing` presentation** ("loading voice model…") using an `indeterminate` flag
+ `reason_code`, plus the matching frame shape on the backend so the frontend can render it. Note:
`model_load_seconds` is NOT available during the `preparing` window (see Context — FIX 6).

## Why this matters
The captured "freeze" is partly this: the first render of an engine spends ~36s loading the model before any
synthesis markers appear. A 0% determinate bar with null ETA looks broken. The honest fix is a separate
*indeterminate* state for the model-load window, not a fake ETA. See `../00-architecture-map.md` §4
(acknowledged scope: cold-load UX).

## Context an executor needs
- Status flow: `preparing` is already a lifecycle status (`StudioJobStatus`, `events.py:202`;
  `service.py:213-215` maps `finalizing`→`running`, and `publish` guards `preparing`→`running` at 210-211).
  The model-load window is within `preparing` before the first `[START_SEGMENT]`.
- **`model_load_seconds` availability (corrected — FIX 6):** `model_load_seconds` is computed only at the
  first `[START_SEGMENT]` marker (`orchestrator_helpers.py:624-628`) — i.e. AFTER the load window closes.
  It is `null` during `preparing`. Therefore **do NOT attempt a soft progress hint driven by live
  `model_load_seconds`** — that data is unavailable during the window this task addresses.
  - Instead, emit `indeterminate:true` + `reason_code:"LOADING_MODEL"` during `preparing`.
  - Optionally include an elapsed counter from `engine_activity_started_at` (which IS available) so the
    frontend can show "loading… (12s)".
  - A true load-duration estimate requires a NEW manifest field `expected_model_load_seconds` in
    `plugins/*/manifest.json` `behavior`. **State this as explicit new work, not "check if available."**
    If introducing the manifest field, add it in this task (it is a spec change — document it). If not
    introducing it, document the decision and use the elapsed counter only.
- Frame shape: the progress frame needs a flag (e.g. `indeterminate: true` + `reason_code:
  "LOADING_MODEL"`) so the frontend renders an indeterminate bar instead of a 0% determinate one.
- Frontend surfaces that render the bar: `frontend/src/app/layout/RailBookBlock.tsx` (reads `job.progress`)
  and the ChapterList (prefers `grouped_progress`) — they need to switch to an indeterminate animation when
  the flag is set. Live overlay state belongs to the frontend store (`.agent/rules/frontend-state.md`).
- `design-docs/specs/progress-presentation.md` (spec the new state here; bump in 011) and `live-events.md`.

## Target shape / contract
- Backend: while in `preparing` and before the first synthesis marker, emit a frame carrying
  `indeterminate:true` + `reason_code:"LOADING_MODEL"`, optionally an elapsed counter from
  `engine_activity_started_at`. No fabricated determinate ETA. No live `model_load_seconds`-driven hint
  (unavailable during the window — see Context). If a manifest `expected_model_load_seconds` field is
  introduced, document it explicitly as new work and add it to the relevant manifest(s).
- Frontend: when the flag is present, render an **indeterminate** bar + "loading voice model…" label on the
  rail block and chapter row; transition to the determinate bar once real progress arrives.
- Spec the frame fields and the frontend treatment in this task (the spec bump lands in 011).

## Steps
1. Decide on `expected_model_load_seconds` manifest field: introduce now (add to
   `plugins/*/manifest.json` `behavior` block, read via behavior helper) or explicitly defer. Document
   the decision.
2. Backend: emit the indeterminate `preparing` frame (`indeterminate:true` + `reason_code:"LOADING_MODEL"`,
   optionally elapsed from `engine_activity_started_at`) before first marker; unit-test the frame shape
   (R2: mock only the engine/clock boundary). Do NOT use `model_load_seconds` (post-load data).
3. Frontend: render indeterminate state in `RailBookBlock.tsx` + ChapterList when the flag is set; vitest
   test using a contract-shaped frame via `frontend/src/api/contracts/liveEvents.ts` +
   `publishStudioSocketMessage` (R3), fake timers (R4).
4. Frontend lint + targeted vitest: `npm -C frontend run lint`,
   `npm -C frontend run test -- --run <file> --maxWorkers=1`.
5. Backend: `./venv/bin/python -m pytest tests/orchestration/ tests/api/ -q` and `ruff check`.

## Acceptance criteria
- [ ] The model-load window emits a distinct indeterminate `preparing` frame (`indeterminate:true` +
      `reason_code:"LOADING_MODEL"`), no fabricated determinate ETA, no live `model_load_seconds`-driven hint.
- [ ] `RailBookBlock.tsx` + ChapterList render an indeterminate "loading voice model…" state on that frame
      and switch to determinate on first real progress (vitest, contract-shaped frame, fake timers).
- [ ] The decision on `expected_model_load_seconds` manifest field is documented (introduce or explicitly
      defer); if introduced, the manifest is updated and the backend reads it via the behavior helper.
- [ ] `model_load_seconds` is acknowledged as POST-load-window data; the task does not attempt to use it
      for the indeterminate hint.
- [ ] Frame + frontend treatment are specced (text ready for the 011 spec bump).
- [ ] Backend + frontend lint/tests green (targeted, `--maxWorkers=1`).

## Out of scope
- Any `enrich`/confidence/ETA math change (this is explicitly the case enrich cannot fix).
- The marker-credit characterization — 008 (related; 008 may file the engine-side marker task).

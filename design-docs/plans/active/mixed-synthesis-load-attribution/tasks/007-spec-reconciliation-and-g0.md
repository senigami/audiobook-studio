# Task 007 — Spec reconciliation + G0 re-check

**Workstream:** W-MIX-LA · **Depends on:** 004 (+ 005/006 if done) · **Blocks:** resuming W-PAR · **Status:** Not started

> Read [`../01-map.md`](../01-map.md) invariant **INV-5** (joint spec authority). This lands the spec bumps for behavior changed in 002–006 and runs the owner 👁 G0 re-check that gates W-PAR.

## Concrete scope (2026-07-01)

- **Already landed in-tree:** `progress-presentation.md` 1.8.2 (rows 1.8.0/1.8.1/1.8.2 — the load-aware ETA presentation contract + the §4A.3 composition fix are already documented).
- **Owed:**
  - `live-events.md` (still 1.7.1) — document the `pre_load_eta` `reason_code` + a positive `eta_seconds` on a preparing/indeterminate frame (this is a wire-contract change, not yet reflected).
  - `queue-jobs.md` (still 1.6.0) — `QueueItem` `preparingWithEta` retention behavior.
  - `data-model.md` (still 1.4.1) — `render_performance_samples.model_load_seconds` is now actively consumed by the ETA predictor (previously recorded-but-unread).
  - `wiki/Changelog.md` — dated entry for the load-aware-ETA landing (the existing W-MIX-LA changelog entry there covers only the earlier no-fabrication work).
- **Likely NOT owed:** `system-architecture.md` — no new marker contract was introduced in this slice (006 reuses the existing `MODEL_LOAD_STARTED` marker from 002/003); confirm before bumping and, if truly unchanged, add a changelog row noting "reviewed, no change" rather than skipping silently.
- **TASKS.md cleanup:** done 2026-07-01 (stale duplicate 005/006 lines removed).
- **Owner 👁 G0 re-check must include:** a real cold XTTS render showing a `pre_load_eta` countdown frame in the UI before synthesis starts — the proactive path (dispatch-time `pre_load_eta`) has unit coverage only, no live proof yet.
- **This task gates W-PAR resume** — see [`../../parallel-segment-rendering/README.md`](../../parallel-segment-rendering/README.md).

## Goal

Reconcile every spec touched by this workstream (bump `spec_version` + add a changelog row, same-change discipline), run the full quality gate, and re-run the G0 visual check to confirm the sequential core is now visually honest about model loading.

## Spec updates (only those whose behavior actually changed)

| Spec (current version) | Update when… |
|---|---|
| `live-events.md` (1.7.1) | the load-marker → frame contract changed (002/003): segment-tagged `LOADING_MODEL` attribution, the scope semantics for `active_segment_id` on a load frame (004). |
| `queue-jobs.md` (1.6.0) | chapter-level load presentation / progress-hold semantics changed (005), or the per-job load-window status surface changed (003). |
| `progress-presentation.md` (now 1.8.2 — 006's rows already landed in-tree) | the preparing-tier attribution rules changed (003/004), or load-aware ETA presentation landed (006). |
| `data-model.md` (1.4.1) | the `model_load_seconds` consumption / cold-vs-warm semantics changed (006), or the marker/segment-id contract is documented as a data shape. |
| `system-architecture.md` (1.5.0) | the log-marker contract (segment-tagged load markers, watchdog `segment_id` extraction) changed (002) — document the hardened log contract that W-PAR 006 depends on. |

For each changed spec: bump per existing convention (match how W-MIX/W-PAR bumps were done), add a dated changelog row (2026-xx-xx) describing the W-MIX-LA change, and ensure code↔spec agree (joint authority).

## Steps

1. For each task 002–006 that landed, update its matching spec(s) above. Don't bump a spec whose behavior didn't change.
2. Run the full gate:
   - `./venv/bin/python -m pytest -q`
   - `ruff check .`
   - `npm -C frontend run lint && npm -C frontend run test -- --run && npm -C frontend run build`
3. Update [`../../TASKS.md`](../../TASKS.md): mark the W-MIX-LA tasks done and ML-1…ML-4 status.
4. 👁 **G0 re-check (owner):** re-run the mixed-render visual check (the six points from the original G0 — see `../../TASKS.md` ~L44-51), specifically confirming:
   - Voxtral→XTTS: the XTTS segment shows the **preparing pulse** during its cold load (not frozen-first-letter), then animates.
   - XTTS-first still pulses-then-animates; Voxtral-only shows Working immediately (no flash); a warm XTTS group does not flash preparing.
   - (If 005 landed) chapter/queue reflects the load window per the chosen semantics.
5. On G0 pass: this workstream is complete and **W-PAR may resume** (002/003).

## Acceptance criteria

- [ ] Every behavior change from 002–006 has a matching spec bump + changelog row (INV-5); no un-reconciled drift.
- [ ] Full backend + frontend gate green.
- [ ] `../../TASKS.md` updated (tasks + milestones).
- [ ] 👁 G0 re-check passes on a live mixed render (owner-confirmed).

## Map links

- Invariant **INV-5** (joint spec authority); ties off connections **C1/C2/C3/C5**.

## Out of scope

- W-PAR work itself (resumes after this passes).

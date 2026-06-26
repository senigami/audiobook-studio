# Task 007 — Spec reconciliation + G0 re-check

**Workstream:** W-MIX-LA · **Depends on:** 004 (+ 005/006 if done) · **Blocks:** resuming W-PAR · **Status:** Not started

> Read [`../01-map.md`](../01-map.md) invariant **INV-5** (joint spec authority). This lands the spec bumps for behavior changed in 002–006 and runs the owner 👁 G0 re-check that gates W-PAR.

## Goal

Reconcile every spec touched by this workstream (bump `spec_version` + add a changelog row, same-change discipline), run the full quality gate, and re-run the G0 visual check to confirm the sequential core is now visually honest about model loading.

## Spec updates (only those whose behavior actually changed)

| Spec (current version) | Update when… |
|---|---|
| `live-events.md` (1.7.1) | the load-marker → frame contract changed (002/003): segment-tagged `LOADING_MODEL` attribution, the scope semantics for `active_segment_id` on a load frame (004). |
| `queue-jobs.md` (1.6.0) | chapter-level load presentation / progress-hold semantics changed (005), or the per-job load-window status surface changed (003). |
| `progress-presentation.md` (1.6.0) | the preparing-tier attribution rules changed (003/004), or load-aware ETA presentation landed (006). |
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

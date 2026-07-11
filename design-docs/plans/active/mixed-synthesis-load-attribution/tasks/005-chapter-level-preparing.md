# Task 005 — Chapter/queue-level preparing *(optional)*

**Workstream:** W-MIX-LA · **Depends on:** 003 · **Blocks:** — · **Status:** SUPERSEDED (owner decision 2026-06-26) — "pausing for loading does not make sense." The chapter-level answer is **don't pause**: the progress bar holds still (no creep — that's the 004 indeterminate fix) and the **ETA clock keeps counting down with the load time added** (task 006). No chapter-level "pause/hold" UI is built. The option-(a) "hold progress" idea here is retained only as the no-creep behavior in 004; the option-(b) "reserve time in ETA" is the chosen path → 006.

> Read [`../01-map.md`](../01-map.md) parts **P-C/P-F**, risk **R-E**, invariant **INV-2**. Owner 👁 decision required on semantics before building.

## Goal

Surface the model-load window at the **chapter / queue** level, not just the per-segment span — so the observed "the chapter queue progressed immediately and didn't pause during loading" reads honestly. Today the load handling clears the ETA and sets the segment indeterminate, but chapter progress (`_get_grouped_progress`, `orchestrator_helpers.py:506-516`) has no load gate, and the queue row shows no preparing state.

## Open decision (R-E) — resolve with owner before implementing

Pick the chapter-level behavior during a load window:
- **(a) Indeterminate styling, progress held:** the chapter/queue bar shows a "preparing" treatment and holds its percentage (doesn't advance) during the load — closest to "pause". Risk: a long hold can read as "stuck".
- **(b) Reserved-time ETA:** progress keeps its value but the ETA explicitly reserves the expected load time (ties to task 006). Honest countdown, no visual stall.
- **(c) Badge only:** a "Loading voice model…" badge on the queue row, progress untouched.

Recommend **(a)** for the active chapter + **(c)** for the queue list, but **get the owner's call** — it's a visible UX choice.

## Files to touch (pending decision)

| File | Anchor | Change |
|------|--------|--------|
| `app/orchestration/scheduler/orchestrator_helpers.py` | `_get_grouped_progress` `:506-516`, the `LOADING_MODEL` publish in 003 | If (a): gate chapter progress to hold during an active load window for the chapter's active segment. Must not violate the monotonic-progress contract (`queue-jobs.md`) — holding is allowed, regressing is not. |
| Frontend queue/chapter components | (locate the queue row + chapter header progress consumers of the job overlay) | Render the chosen preparing treatment from the existing `reason_code`/`indeterminate` fields (no new contract if reusing them). |

## Tests (TDD)

- Backend: during a load window, chapter progress does not advance (if (a)) and does not regress; resumes on synthesis confirm. R1 revert-check against current always-advancing behavior.
- Frontend: queue row / chapter header reflects the preparing treatment from a contract-shaped `LOADING_MODEL` frame (R3); clears on resume. INV-2: no chapter-level preparing for warm/cloud groups.

## Acceptance criteria

- [ ] Owner has chosen the chapter-level semantics (R-E); the choice is recorded here.
- [ ] Chapter/queue presentation reflects the load window per the chosen option; monotonic-progress contract preserved.
- [ ] Warm/cloud groups produce no chapter-level preparing (INV-2).
- [ ] Tests green (R1/R3/R4); specs noted for 007.

## Map links

- Parts **P-C/P-F**; risk **R-E** (semantics); invariant **INV-2**.

## Out of scope

- The ETA math itself → **task 006** (referenced if option (b) is chosen).

# Task 003 — ETA suspension + per-group preparing phase (durable status monotonic)

**Workstream:** W3  ·  **Depends on:** 001  ·  **Blocks:** 004 (frontend consumption)  ·  **Status:** Not started

> Read [`../01-map.md`](../01-map.md) (surface **C**, invariants **INV-1**, **INV-5**) and
> [`../00-overview.md`](../00-overview.md) (Layer 3 root cause) before starting. This task assumes
> task 001 has landed so the load window is detectable for mixed.

## Goal
During the model-load window of a mixed render, **suspend** the per-group ETA clock: a null
`eta_seconds` must **clear** the persisted ETA (today it sticks, because only non-null values are
persisted), the frame is emitted with `indeterminate=true` and cleared segment/chapter ETA, the
authoritative progress is left unchanged, and emission is **forced** so the bar visibly flips to a
preparing state. The load window is carried as a per-group **phase** (`reason_code` =
`SEGMENT_PENDING` / `LOADING_MODEL`) while the durable job `status` stays `"running"` (monotonic —
never regress `running→preparing`).

## Why it matters
This is **Layer 3** in `00-overview.md`. Two presentation bugs make the bar "keep going" during load:
1. A **null ETA does not clear** the prior ETA — `orchestrator_publish.py` persists `eta_seconds`
   only when non-null, so the queue/segment bar animates the last positive ETA through the entire load
   window.
2. The pacing/phase distinction is not forced through, so nothing tells the UI "this is preparing,
   stop pacing" at segment granularity.
Per `live-events.md`, `SEGMENT_PENDING` is **announcement-only** (frontends must not pace on it), and
durable status must stay monotonic (`queue-jobs.md`) — so the fix is ETA suspension + a per-group
phase, **not** a `running→preparing` status regression (INV-1; this rejects the prior
`allow_progress_regression` approach).

## Files to touch
| File | Current anchor (file:line) | Change |
|------|----------------------------|--------|
| `app/orchestration/scheduler/orchestrator_publish.py` | `_publish` persists ETA only when non-null: `if eta_seconds is not None: updates["eta_seconds"] = eta_seconds` at **L237-238**; the new-job branch sets `eta_seconds=eta_seconds` at **L199** | Make a **null `eta_seconds` clear** the persisted ETA during the preparing window. Add an explicit way to signal "clear ETA" (e.g. always assign `updates["eta_seconds"] = eta_seconds` when an explicit clear is requested, or a `clear_eta: bool` param) so the existing job's `eta_seconds` is set to `None`. Preserve current behavior for normal progress frames (don't clobber a good ETA with an incidental `None`). |
| `app/orchestration/scheduler/orchestrator_publish.py` | `eta_seconds == 0` guard at **L110-111**; `indeterminate` / `loading_elapsed_seconds` already plumbed through `self.progress_service.publish(...)` at **L180-181** | During the load window emit `indeterminate=true` and clear `active_segment_eta_seconds` / chapter `eta_seconds` while leaving `progress` (authoritative) unchanged. Reuse the existing `indeterminate` / `loading_elapsed_seconds` fields (INV-5 — do not invent a new channel). |
| `app/orchestration/scheduler/orchestrator_helpers.py` | `SEGMENT_PENDING` frame published in the `[START_SEGMENT]` branch at **L743-760** (`reason_code="SEGMENT_PENDING"`, `active_segment_eta_seconds=None`); the dispatch-time preparing frame at **L429-439** (`status="preparing"`, `reason_code="LOADING_MODEL"`, `indeterminate=True`, `force=False`) | Carry the load window as a per-group **phase**: keep durable `status="running"` while the frame's `reason_code` marks `SEGMENT_PENDING`/`LOADING_MODEL`. **Clear** segment + chapter ETA on these frames (pass the explicit ETA-clear) and **force** emission so the bar updates even with no progress delta. Do **not** set `allow_progress_regression` and do **not** regress durable status (INV-1). |

## Target shape / contract
- **Null clears:** when the orchestrator publishes a preparing frame with `eta_seconds=None` (and an
  explicit clear signal), the persisted job `eta_seconds` becomes `None`; the queue/segment bar stops
  animating a stale positive ETA.
- **Indeterminate window:** preparing frames carry `indeterminate=true` and
  `loading_elapsed_seconds` (already supported in `_publish` → `progress_service.publish`), with
  `active_segment_eta_seconds=None` and chapter `eta_seconds` cleared.
- **Progress unchanged:** authoritative `progress` / `grouped_progress` is not regressed during the
  window (existing anti-regression at **L140-142** still applies); only the ETA is suspended.
- **Forced emission:** preparing frames pass `force=True` so the UI flips to preparing even when the
  progress delta is below the normal broadcast threshold (`backend-progress.md`: broadcast only when
  advancing ≥ 1%).
- **Monotonic durable status (INV-1):** durable `status` stays `"running"` across the window; the
  preparing state is expressed purely via `reason_code` (per-group phase). `[START_SYNTHESIS]` / first
  `[PROGRESS]` confirmation then resumes pacing from a **fresh** ETA (the existing `_publish_segment_started`
  / progress paths at **L512-553** / **L805-856**), re-anchoring from 0 rather than snapping from a
  stale value (risk noted in `01-map.md`).

## Steps (ordered)
1. **Write the failing tests first** (see Tests). Confirm red on current code.
2. In `orchestrator_publish.py`, add an explicit ETA-clear path so a preparing frame with
   `eta_seconds=None` sets the persisted `eta_seconds` to `None` (existing-job branch at L237-238 and
   the new-job branch at L199). Keep normal frames from clobbering a good ETA with an incidental `None`.
3. In `orchestrator_helpers.py`, on the `SEGMENT_PENDING` / load-window frames (the `[START_SEGMENT]`
   branch at L743-760 and the dispatch preparing frame at L429-439), pass the ETA-clear + `force=True`,
   keep `status="running"`, `indeterminate=true`, `active_segment_eta_seconds=None`, and leave
   `progress` unchanged.
4. Ensure confirmation (`[START_SYNTHESIS]` / first `[PROGRESS]`) resumes a fresh ETA — verify the
   existing resume paths re-anchor cleanly after a cleared ETA.
5. Revert-check (R1) for each test: stash the fix, confirm red, restore.
6. Update specs (W6): `docs/specs/live-events.md` (preparing window / ETA suspension semantics) and
   `docs/specs/queue-jobs.md` (per-group phase vs monotonic status); bump versions + changelog rows.

## Tests (TDD — write first)
- **Failing test A — null ETA clears (R1):** in `tests/orchestration/` (near
  `test_indeterminate_loading_model.py` / `test_inter_group_gap_eta.py`), publish a frame with a
  positive `eta_seconds`, then a preparing frame with `eta_seconds=None` + clear signal; assert the
  persisted job `eta_seconds` is `None` after the second publish. On current code it remains the prior
  positive value (L237-238 skips the update) → red.
- **Failing test B — preparing window suspends pacing, status monotonic (R1):** drive a mixed render's
  `[START_SEGMENT]` (announce) → load window for an XTTS group; assert the published/persisted frames
  show `reason_code` in {`SEGMENT_PENDING`,`LOADING_MODEL`}, `indeterminate=true`,
  `active_segment_eta_seconds=None`, chapter `eta_seconds` cleared, `status=="running"` throughout
  (never `"preparing"` on the durable status), and that emission was forced (frame observed despite no
  progress delta). On confirmation, assert a fresh ETA resumes. On current code the ETA persists and/or
  no forced preparing frame is emitted → red.
- **R2 (mock boundaries only):** assert against the real state-store job (`get_jobs()` / persisted
  `eta_seconds`) and the real `progress_service` publish path; mock only the watchdog/broadcast
  boundary and the engine/bridge stdout. Do **not** mock `_publish` or `progress_service` internals —
  they are the unit under test.
- **R3 (contract-shaped frames):** this task is backend; assertions are on the published event
  payload fields (`reason_code`, `indeterminate`, `eta_seconds`) that `app/api/contracts/events.py`
  defines. The matching frontend R3 socket-frame tests live in **task 004** (W4), built via
  `frontend/src/api/contracts/liveEvents.ts` through `publishStudioSocketMessage`.
- **R4:** feed marker lines synchronously; no sleeps. Use explicit timestamps where elapsed is asserted.
- **Commands:**
  `./venv/bin/python -m pytest tests/orchestration -q -k "indeterminate or eta or preparing or pending or loading_model"`
  ; `ruff check app/orchestration/scheduler/orchestrator_publish.py app/orchestration/scheduler/orchestrator_helpers.py`

## Acceptance criteria
- [ ] A null `eta_seconds` (with the explicit clear) sets the persisted job `eta_seconds` to `None`;
      the bar stops animating a stale ETA during load.
- [ ] Load-window frames carry `indeterminate=true`, `reason_code` ∈ {`SEGMENT_PENDING`,`LOADING_MODEL`},
      cleared segment + chapter ETA, and unchanged authoritative `progress`.
- [ ] Preparing frames are force-emitted so the UI flips even below the 1% broadcast threshold.
- [ ] Durable job `status` stays `"running"` across the window — never regresses to `preparing`
      (INV-1).
- [ ] On engine confirmation, pacing resumes from a fresh ETA (re-anchored from 0, not snapped from a
      stale value).
- [ ] No new event channel invented — reuses existing `indeterminate` / `loading_elapsed_seconds` /
      `reason_code` fields (INV-5).
- [ ] Specs updated (`live-events.md`, `queue-jobs.md`) with version bumps + changelog rows.

## Map links
- `01-map.md` surface **C** (ETA suspension + status/phase — orchestrator); invariants **INV-1**
  (monotonic durable status), **INV-5** (preserve existing signals). Depends on surface **A**
  (task 001); consumed by surface **D** (frontend, task 004).

## Out of scope
- Per-active-group marker resolution → **task 001** (prerequisite).
- Synthesis-only duration / single writer → **task 002**.
- Frontend preparing tier, `reasonCode` threading, relabel, killing the synthetic 120 s lane →
  task 004 (W4). This task only emits the corrected backend signals.
- Mixed `ResourceClaim` (W5) — deferred.

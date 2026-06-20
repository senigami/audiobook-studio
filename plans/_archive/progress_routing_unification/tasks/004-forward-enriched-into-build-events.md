# 004 — Forward enriched values into ALL `build_*_event` call sites

- **Status:** done
- **Workload:** WL-B convergence
- **Severity / type:** critical · architecture (THE convergence)
- **Effort:** L
- **Blocked by:** 002, 003b
- **Blocks:** 005, 006

## Goal
Make the event builders in `app/api/contracts/events.py` the **single source** of the contract by threading
the **enriched** `confidence`/`eta_seconds`/`eta_basis`/`estimated_end_at`/`grouped_progress` into **every**
`build_*_event(...)` call in **both** producers: `ProgressService.publish` (`service.py`) AND
`ws.broadcast_job_updated` (`ws.py`). Each producer calls the singleton `enrich` (001/002) on its raw
state, then passes the enriched values into the builders — so neither path lets the builder invent values.

## Why this matters — the corrected convergence point
v1 assumed `broadcast_job_updated` was the universal chokepoint to wire. **It is not.** Verified in code:
- Path A suppresses it — `orchestrator_publish.py:240` calls
  `update_job(..., skip_studio_job_event=True, skip_job_updated=True, ...)`, and `web.py:358` wires Path A's
  sink directly (`configure_progress_broadcaster(lambda payload, _: manager.broadcast(payload))`).
- **Neither** producer currently passes a `confidence` to the builders (verified: zero `confidence=` kwargs
  in any `build_*_event(...)` call in `service.py` or `ws.py`), so **both** fall back to the
  `compute_progress_confidence` echo (`events.py:179/199` = `coverage_ratio × progress`).

The **single point both progress paths cross is the builders** (`app/api/contracts/events.py`). That — not
`broadcast_job_updated`, not `manager.broadcast` (too late; events already built) — is where the contract
must be made single-source. See `../00-architecture-map.md` v2 §0–§2, D2/D3.

## Context an executor needs
- The builders accept `confidence: float | None = None` already and only fall back when it is `None`:
  `build_queue_item_status_event` (events.py:424, confidence param 444, fallback 452-454),
  `build_chapter_progress_event` (531, param 547, fallback 563-565),
  `build_segment_progress_event` (599, param 616, fallback 633-635),
  `build_job_lifecycle_event` (371, param 383).
- **Path A builder call sites in `service.py`** that must receive enriched values:
  - `build_queue_item_status_event` at 304 (status-change mirror) and 422 (voice_test).
  - `build_segment_progress_event` at 328 (segment-close) and 367 (segment tick).
  - `build_chapter_progress_event` at 463.
  These already read `payload.get("eta_seconds")`/`payload.get("grouped_progress")` (the enriched payload)
  but pass **no `confidence=`** — add `confidence=payload.get("eta_confidence")` and forward
  `eta_basis`/`estimated_end_at` where the builder/contract carries them.
- **Path B builder call sites in `ws.broadcast_job_updated`** (`ws.py:283`):
  `build_job_lifecycle_event` (331), `build_segment_progress_event` (355, 420, 469),
  `build_queue_item_status_event` (383, 527), `build_chapter_progress_event` (441). `broadcast_job_updated`
  must first call the singleton `enrich` (resolved per 002) on its merged job dict, then pass enriched
  values into each of these.
- **Additional call sites that must be explicitly handled (FIX 4):** `broadcast_segment_progress`
  (`ws.py:555`) and `broadcast_test_progress` (`ws.py:569`) call builders with no `confidence=` and are NOT
  wired through `enrich`. After Task 005 deletes the echo and adds the fail-loud guard, these LIVE paths
  will crash if they reach a progress-bearing builder with `confidence=None`. Decision required here:
  **Option A** — add `confidence=` param to `build_voice_test_progress_event` (events.py:743) and route
  both `broadcast_segment_progress`/`broadcast_test_progress` through `enrich` before building.
  **Option B** — document them as OUT of the enriched-confidence contract (they carry their own `progress`
  directly and do not go through the §4A math); scope the Task 005 fail-loud guard so it does NOT fire on
  frames from these two paths. **Pick one in this task and record the decision in the PR.**
- Bypass paths NOT via builders (leave for their own tasks, do not wire here): `jobs_snapshot`
  (`web.py:219`, → 007), `broadcast_tts_log_line` (ws.py:141 → out of scope).
- Contract: `docs/specs/progress-presentation.md` §4A; `docs/specs/live-events.md` (builder = producer
  obligation).

## Target shape / contract
- `ws.broadcast_job_updated` resolves the singleton `ProgressService` (002) and calls
  `enrich(job_id, merged)` after the terminal-latch check (`ws.py:314`) and before building any event; it
  passes the enriched `confidence`/`eta_seconds`/`eta_basis`/`estimated_end_at`/`grouped_progress` into
  every builder call.
- `ProgressService.publish` already enriches via `_build_progress_payload`/`enrich`; add
  `confidence=payload.get("eta_confidence")` (and forward the other enriched ETA fields) to each builder
  call at 304/328/367/422/463.
- No builder is allowed to fall back to `compute_progress_confidence` for a progress-bearing frame after
  this task (005 then deletes the fallback).

## Binding gate — CI unit parity test
- One synthetic **shared-state job dict** is run through **both** producers (`publish` and
  `broadcast_job_updated`) with injected deterministic clocks. Assert:
  1. enriched `confidence`, `eta_seconds`, `grouped_progress` **match between the two paths** (dict
     value-equality, not byte/JSON identity);
  2. on a **cold/sparse frame** (progress + status only) the emitted `confidence` **differs from
     `progress`** and `eta_seconds` is **non-null** (proves the echo is gone and 003b is reached).
- This unit test is the **autonomous pass/fail gate**. The live event-stream capture is **owner manual
  evidence only**, not the gate (`../00-architecture-map.md` §5).
- **No D5 / idempotency / re-entry machinery** — Path A does not re-enter `broadcast_job_updated`, so there
  is nothing to guard against double-enrichment across paths for the same frame.

## Steps
1. Write the unit parity test first (new `tests/orchestration/test_progress_parity.py` or extend
   `test_progress_contract_v140.py`): shared-state dict → both producers → value-equality + cold-frame
   non-echo assertions. Confirm it fails today (confidence echoes `progress`).
2. In `ws.broadcast_job_updated`: resolve the singleton, call `enrich`, thread enriched values into all
   listed builder calls.
3. In `service.py`: add `confidence=`/enriched-ETA kwargs to the builder calls at 304/328/367/422/463.
4. Run the parity test green; re-run the 001 value-equality snapshot (Path-A frames now carry a numeric
   confidence instead of the echo — update the baseline and document the diff).
5. `./venv/bin/python -m pytest tests/orchestration/ tests/api/ -q` and `ruff check`.

## Acceptance criteria
- [ ] Every `build_*_event` call in `service.py` (304/328/367/422/463) and `ws.broadcast_job_updated`
      (331/355/383/420/441/469/527) receives the enriched `confidence` (and enriched ETA fields where the
      contract carries them).
- [ ] `ws.broadcast_job_updated` calls the singleton `enrich` before building events.
- [ ] `broadcast_segment_progress` (ws.py:555) and `broadcast_test_progress` (ws.py:569) are handled per
      the Option A/B decision: either wired through `enrich` + builders with `confidence=`, or explicitly
      documented as outside the enriched-confidence contract. Decision recorded in PR.
- [ ] The CI unit parity test passes: both paths' enriched values match AND differ from `progress` /
      are non-null on a cold/sparse frame (PI1, PI3, PI4).
- [ ] No D5/idempotency code introduced.
- [ ] `pytest tests/orchestration/ tests/api/` and `ruff check` green.

## Out of scope
- Deleting `compute_progress_confidence` (the now-unused fallback) — 005.
- Snapshot serializer enrichment — 007.
- Segment→chapter ETA composition / convergence-trust — 006.

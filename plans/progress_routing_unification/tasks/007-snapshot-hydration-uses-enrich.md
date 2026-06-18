# 007 — Snapshot / REST hydration uses `enrich` (PI6)

- **Status:** not-started
- **Workload:** WL-C correctness
- **Severity / type:** major · correctness
- **Effort:** M
- **Blocked by:** 002
- **Blocks:** nothing

## Goal
Make the snapshot/hydration paths emit contract-correct values by routing them through the singleton
`enrich` (002). The `jobs_snapshot` WebSocket handler currently serializes raw `asdict(job)` with **no**
enrichment, and the queue snapshot has the same gap — so on page load / reconnect the UI shows raw progress
with an echoed/absent confidence and a possibly-null ETA, which then "jumps" once live frames arrive.

## Why this matters
The snapshot path bypasses the event builders entirely (`../00-architecture-map.md` §1 "Bypass paths"):
`web.py:219-236` does `asdict(j)` → `websocket.send_json` with no §4A math. So the first thing a user sees
on load does not match the live frames that follow (PI6 fails: snapshot must match live). Routing snapshots
through the same `enrich` kernel closes the last gap where the contract is not single-source.

## Context an executor needs
- `jobs_snapshot` handler: `app/api/web.py:219-236` — handles `jobs_snapshot_request`, does
  `[asdict(j) for j in get_jobs().values()]`, strips `log` for non-running jobs, sends `jobs_snapshot`.
- The singleton `ProgressService` + `enrich` from 002 (resolve it here; do **not** construct a new one).
- The queue snapshot serializer — find the REST/WS path that builds the queue list (grep for the queue
  snapshot/list endpoint in `app/api/routers/queue.py` and any `queue_snapshot`/`build_queue_*` snapshot
  serializer). Apply the same `enrich` pass.
- `enrich` takes a `sample` kwarg (Task 001): call `enrich(job_id, payload, sample=False)` for snapshots —
  this computes values WITHOUT mutating the per-job ETA ring or monotonic floor (PI8). No need to
  snapshot/restore state; the `sample=False` mode is the designed mechanism. Add a test that confirms the
  ring/floor are unchanged after a `sample=False` call.
- `docs/specs/live-events.md` (snapshot vs live frame shape); `.agent/rules/frontend-state.md` (canonical
  hydration must not be clobbered by drafts — server snapshot is canonical).

## Target shape / contract
- The `jobs_snapshot` handler enriches each job dict via the singleton `enrich(job_id, payload, sample=False)`
  before `send_json`, so each snapshot row carries numeric `eta_confidence`, contract ETA fields, and
  `grouped_progress` identical in shape to live frames.
- The queue snapshot serializer does the same.
- Enrichment is **read-only w.r.t. live per-job state** (`sample=False`), verified by a test that checks
  the ring and monotonic floor are unchanged after the snapshot call.

## Steps
1. Test first: request a `jobs_snapshot` for a job mid-render; assert each row's `eta_confidence` is numeric
   and equals what a live frame for the same state produces (value-equality), and that calling the snapshot
   path does **not** change the live job's monotonic floor / ETA ring (uses `sample=False` from Task 001).
2. Route `web.py:219-236` to call `enrich(..., sample=False)` for each job dict.
3. Route the queue snapshot serializer through the same pattern.
4. `./venv/bin/python -m pytest tests/api/ tests/orchestration/ -q` and `ruff check`.

## Acceptance criteria
- [ ] `jobs_snapshot` and the queue snapshot rows carry enriched §4A values matching live frames (PI6).
- [ ] Snapshot enrichment does not mutate live per-job state (asserted test).
- [ ] Resolves the singleton (002); constructs no new `ProgressService`.
- [ ] `pytest tests/api/ tests/orchestration/` and `ruff check` green.

## Out of scope
- The live producer wiring — 004 (this reuses the same kernel for the snapshot path).
- Cold-load indeterminate presentation — 009.

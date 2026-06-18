# 005 — Delete `compute_progress_confidence` (the echo)

- **Status:** done
- **Workload:** WL-B convergence
- **Severity / type:** major · correctness · cleanup
- **Effort:** S
- **Blocked by:** 004
- **Blocks:** 011

## Goal
Delete `compute_progress_confidence` (`events.py:179-199`) and its three fallback call sites
(`events.py:452-454`, `563-565`, `633-635`). After 004 every producer threads the enriched numeric
confidence into the builders, so the fallback is dead. The builders must then **require** a non-None
confidence for a progress-bearing frame and **fail loudly** (a real, asserted test — not a comment) if one
arrives with `confidence=None`.

## Why this matters
`compute_progress_confidence` returns `coverage_ratio × progress` (`events.py:199`) — the "confidence echoes
progress" bug at the root of this plan (`../00-architecture-map.md` §0/D3). While it exists as a fallback,
any future builder call that forgets to pass `confidence=` silently regresses to the echo. Removing it
makes a missing enriched value a **loud failure** instead of a silent contract violation (PI1).

## ⚠️ Ordering hazard (why this is blocked by 004)
Deleting the fallback **before** 004 wires confidence into all call sites would make Path-A confidence go
`None` — a **worse** regression than the echo (the frame would carry no confidence at all). This task may
only land after 004's parity test is green. Re-verify, at the start of this task, that **every**
`build_*_event` call in `service.py` (304/328/367/422/463) and `ws.broadcast_job_updated`
(331/355/383/420/441/469/527) passes a non-None `confidence` — grep for `build_*_event(` and confirm each
has `confidence=`. If any lacks it, fix in 004 first.

## Context an executor needs
- `events.py`: `compute_progress_confidence` def (179-199); call sites inside
  `build_queue_item_status_event` (452-454), `build_chapter_progress_event` (563-565),
  `build_segment_progress_event` (633-635) — each is `resolved_confidence = confidence; if
  resolved_confidence is None: resolved_confidence = compute_progress_confidence(...)`.
- `build_job_lifecycle_event` (events.py:371) takes `confidence` but is a **lifecycle** event, not
  progress-bearing — it may legitimately have `confidence=None`. The fail-loud rule applies to
  **progress-bearing** frames (those carrying a `progress` value), not lifecycle/status-only frames. Scope
  the assertion accordingly.
- **`broadcast_segment_progress` (ws.py:555) and `broadcast_test_progress` (ws.py:569) (FIX 4):** the
  Task 004 decision determines whether these paths pass `confidence=`. If they were declared OUT of the
  enriched-confidence contract (Option B), the fail-loud guard must NOT fire on frames that arrive via
  these paths — scope the guard so it only applies to the wired call-sites. Verify the Option B scoping
  explicitly at the start of this task (grep + confirm).
- The CI parity test from 004 already proves both wired paths pass numeric confidence.

## Target shape / contract
- Remove `compute_progress_confidence` entirely and the three `if ... is None: compute_...` fallbacks.
- In the progress-bearing builders, when a `progress` value is present and `confidence is None`, raise a
  clear error (e.g. `ValueError("progress frame reached <builder> with confidence=None — producer must
  enrich")`). Status-only / lifecycle frames with no `progress` are exempt.
- Update any other importer of `compute_progress_confidence` (grep the repo) — there should be none in
  runtime after 004, but tests may import it; delete/repoint those.

## Steps
1. Re-verify all builder call sites pass `confidence=` (grep). If not, stop — finish 004.
2. Write the fail-loud test first (revert-check, R1): call a progress-bearing builder with
   `confidence=None, progress=0.5` and assert it raises. On pre-change code this returns the echo (no
   raise) → red. Confirm red, then implement.
3. Delete `compute_progress_confidence` + the three fallbacks; add the fail-loud guard scoped to
   progress-bearing frames.
4. `grep -rn compute_progress_confidence` → only the deletion remains; repoint/delete any test imports.
5. `./venv/bin/python -m pytest tests/api/ tests/orchestration/ -q` and `ruff check app/api/contracts/`.

## Acceptance criteria
- [ ] `compute_progress_confidence` and its three fallbacks are deleted; `grep` finds no runtime callers.
- [ ] Progress-bearing builders fail loudly on `confidence=None` (asserted test, revert-checked red on
      pre-change code).
- [ ] Lifecycle/status-only frames without `progress` still build without raising.
- [ ] The 004 parity test still passes (confidence numeric on both paths, ≠ `progress`).
- [ ] `pytest tests/api/ tests/orchestration/` and `ruff check` green.

## Out of scope
- Any further confidence-formula change / convergence-trust — 006.
- Spec/ADR updates recording the single-authority builder layer — 011.

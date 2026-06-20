# 001 — Extract the `enrich()` contract kernel

- **Status:** done
- **Workload:** WL-A Foundation
- **Severity / type:** major · architecture
- **Effort:** M
- **Blocked by:** nothing
- **Blocks:** 002, 003b, 004

## Goal
Pull the §4A contract math currently inlined in `ProgressService._build_progress_payload` (numeric
`eta_confidence`, monotonic progress clamp, grouped→1.0 clamp, ETA-field assembly, terminal zeroing) into a
single method `enrich(job_id, payload) -> dict`, and **fold in the committed-but-unwired `eta.py` helpers**
(`crossfade_eta`, `apply_eta_ceiling`) so the kernel owns the full ETA assembly. `publish` then calls
`enrich`. This is a refactor that creates the one callable that 003b/004 wire both producers through.

## Why this matters
Today the §4A math lives **only** on Path A (`publish` → `_build_progress_payload`,
`service.py:524-698`). Path B (`ws.broadcast_job_updated`) and the snapshot serializer never touch it.
Worse, **neither path passes a confidence to the builders** (verified: no `confidence=` kwarg in any
`build_*_event(...)` call in `service.py` or `ws.py`), so both fall back to the
`compute_progress_confidence` echo (`events.py:179/199`). Extracting one callable is the precondition for
making §4A single-source (PI4) — you cannot wire two producers to one math implementation until that math
is one callable. See `../00-architecture-map.md` v2 §0–§2.

## Context an executor needs
- Target design + decisions D2 (kernel signature) and D6 (emission stays separate): `../00-architecture-map.md` §2.
- Contract the kernel enforces: `docs/specs/progress-presentation.md` §4A.2 (numeric confidence), §4A.4
  (terminal zeroing / mechanical ceiling), §4A.7 item-5 (grouped→1.0 at done), §4A.8 (calculated→observed
  crossfade), B7/B9/B10.
- Current math to extract — `app/orchestration/progress/service.py`:
  - `_build_progress_payload` (524-698): terminal clearing (578-581), progress rounding + clamp (583-585),
    `eta_updated_at` dedupe (587-597), ETA field assembly (612-623), numeric confidence + ETA ring sampling
    (625-659), grouped→1.0 clamp (690-697).
  - `_normalize_monotonic_progress` (486-522) — the monotonic clamp (called from orchestrator helpers, keep
    callable).
  - Per-job state already on `self`: `_eta_rings`, `_eta_last_sample_time`, `_last_progress_by_job`
    (76-82). The kernel reads/writes these via `self`.
  - `publish` calls `_build_progress_payload` at `service.py:216-243`; emission + fan-out follow (244-483).
- `eta.py` helpers (all exist, `app/orchestration/progress/eta.py`):
  - **Already wired** into service.py: `compute_eta_confidence` (eta.py:36, used service.py:654),
    `EtaSampleRing` (eta.py:155, used service.py:80,635). Do NOT re-implement — keep calling them.
  - **Unwired dead code to fold in now:** `crossfade_eta` (eta.py:67), `apply_eta_ceiling` (eta.py:119).
    These are the kernel's ETA-assembly helpers. Their *integration into live ETA* is 003b; this task may
    leave their call sites behind a flag/no-op if 003a's bootstrap isn't ready — but the kernel must be the
    place they will be called.

## Target shape / contract
- New method `ProgressService.enrich(self, job_id: str, payload: dict, *, sample: bool = True) -> dict`
  that takes a raw progress dict and returns it with contract-correct `progress`, `grouped_progress`,
  `eta_seconds`, `eta_basis`, `estimated_end_at`, `eta_updated_at`, `eta_confidence`.
  - When `sample=True` (normal live path): mutates per-job state (`_eta_rings`, `_eta_last_sample_time`,
    monotonic floor) on `self`. The ring is pushed **at most once per call** — no double-sampling.
  - When `sample=False` (snapshot/hydration — PI8): computes all values WITHOUT mutating the per-job ring
    or monotonic floor. `jobs_snapshot` (Task 007) uses this mode.
- **Terminal forcing (verified bug fix):** when payload status is terminal (`done`/`error`/`cancelled`),
  `enrich` MUST set `grouped_progress = 1.0` (not merely `min(gp, 1.0)` — the existing upper clamp at
  `service.py:690-697` does not force 1.0 and is the verified source of `status:done, grouped_progress:0.9`
  in `debug/chapter-segment.txt:48`). Revert-check: a terminal frame with `completed==total` but
  `grouped_progress=0.9` must come out `1.0` after this change; pre-change it stays `0.9` → red.
- `_build_progress_payload` becomes a thin wrapper that packs kwargs into a dict and calls `enrich`, OR
  `publish` packs the dict and calls `enrich` directly — either way the §4A math has exactly ONE home.
- Confidence/ETA stay computed exactly as today in this task (call `compute_eta_confidence` / the ring
  exactly where 625-659 does now). Do NOT change the confidence formula here (that is 006). Do NOT add the
  bootstrap-cps ETA here (that is 003a/003b).
- Keep `_build_progress_payload` **callable** so `test_progress_logic.py:90-138` still works (it calls it
  directly and asserts the `source` stack-walk at line 115) — OR update that test in this task. Pick one and
  state which in the PR.

## Steps
1. Write the **value-equality snapshot test first** (TDD) in `tests/orchestration/test_progress_contract_v140.py`
   (the file already exists — extend it): drive a representative Path-A sequence through `publish` with
   injected `monotonic_clock`/`wall_clock`, capture every broadcast payload, snapshot them. This is the
   regression baseline. Assert **dict value-equality** (not byte/JSON identity).
2. Extract `enrich(job_id, payload)` onto `ProgressService`, moving the math from
   `_build_progress_payload` (577-697) verbatim. Keep state reads/writes on `self`.
3. Repoint `publish` (216-243) to build the raw dict and call `enrich`; make `_build_progress_payload` a
   wrapper (or inline into `publish`) so no duplicate math remains.
4. Re-run the snapshot test: assert value-equality to the step-1 baseline (no behavior change).
5. `./venv/bin/python -m pytest tests/orchestration/ -q` and `ruff check app/orchestration/progress/`.

## Acceptance criteria
- [ ] `enrich(job_id, payload, *, sample=True)` exists on `ProgressService` and is the single home of the
      §4A math (no contract math left inline in `publish`).
- [ ] When `sample=False`, `enrich` computes values without mutating the per-job ETA ring or monotonic
      floor — asserted by a test that calls `enrich(..., sample=False)` then checks ring is unchanged.
- [ ] The ETA ring is pushed at most once per `enrich` call (PI8).
- [ ] Terminal status forces `grouped_progress = 1.0` (revert-checked: `status:done, grouped_progress=0.9`
      input → `1.0` output; pre-change stays `0.9` → red).
- [ ] `publish` produces payloads **dict-value-equal** to the pre-refactor baseline (PI4 seam created with
      no behavior change), verified with injected deterministic clocks.
- [ ] `crossfade_eta`/`apply_eta_ceiling` are imported into and reachable from `enrich` (their live
      integration is 003b).
- [ ] Per-job state (`_eta_rings`, `_eta_last_sample_time`, monotonic floor) is read/written only through
      `enrich`/`self`.
- [ ] `_build_progress_payload` is still callable (test_progress_logic.py:90 passes) OR that test is updated
      in this change; the PR states which.
- [ ] `pytest tests/orchestration/` and `ruff check` green.

## Out of scope
- Bootstrap-cps ETA when the frame has no `eta_seconds` — 003a/003b.
- Making `ProgressService` a singleton / adding the RLock — 002.
- Threading enriched values into `build_*_event` call sites — 004.
- Deleting `compute_progress_confidence` — 005.
- Changing the confidence formula / convergence-trust — 006.

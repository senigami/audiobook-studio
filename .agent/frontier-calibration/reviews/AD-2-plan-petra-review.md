# AD-2 plan review — Tamsin (empirical / bottom-up panelist)

**Reviewed:** `design-docs/plans/active/ad2_cap_resolution_hardening/00-plan.md`
**Ground truth loaded:** code-map core + shards for `resources.py`, `cap_settings.py`; symbol-traced
`reserve_task_resources` / `release_task_resources` callers and all release call sites; read the
clamp chain (`resolve_effective_cap`, `get_engine_semaphore`, `get_engine_id_semaphore`).
**Method note:** map ritual run; conclusions below are grounded in `path:line` traces, not the plan's
self-description. Dispatched here as a lone review pass (no twin/judge) — output is **un-ensembled**;
flagged per contract.

**Verdict: APPROVE WITH CHANGES.** F3 and F4 are correctly diagnosed and the fix *directions* are
right. But the F3 fix as worded ("record in the reservation result itself") will not actually fix two
of the four release call sites, and F4 rests on an unenforced `engine_class ⇒ engine_id` invariant
that the fix would silently convert into a cap-enforcement hole. Both are addressable inside the plan;
neither invalidates it.

---

## Confirmed correct

- **F3 leak mechanism is real, both directions (traced).** Reserve reads
  `_engine_class_admission_enabled()` at `resources.py:657`; release re-reads it at `:783`.
  - **ON→OFF between reserve and release:** reserve took the semaphore path (acquired global-cap +
    class-sem + engine-id-sem, `:677/:698/:705`); release hits `:783` (`enabled == False`) and only
    releases `_exclusive_gate` (a no-op, never held), returning before `:787`. Global/class/id slots
    leak permanently. Confirmed.
  - **OFF→ON:** reserve acquired only `_exclusive_gate` (`:659`); release skips `:783`, runs `:787`
    releasing class/id/global gates it never held (idempotent no-ops) and **never** releases the
    exclusive gate → exclusive gate wedged at cap=1 forever. Confirmed.
  Diagnosis and severity ranking (highest) are right.

- **F4 starvation is real (traced).** `:699` passes `limit=live_limit` (a *per-engine* effective cap)
  to the *class* semaphore, whose active count mixes every engine in the class. A same-class sibling's
  activity pushes the class active count to/above the throttled engine's per-engine limit and denies
  it at the class gate even when its own id-sem (`:705-706`) has room. Fix direction (live limit →
  id-sem only; class sem gates on its grow-only structural cap) is correct and complete *for engines
  that carry engine_id* — see gap F4-b below.

- **F5 clamp chain (`resolve_effective_cap`) is sound.** `min(requested, manifest_ceiling)`, floor 1,
  manifest as hard ceiling (`cap_settings.py:149-156`). No defect; plan correctly scopes F5 to the
  settings/env precedence bug at `:94`, not the arithmetic.

---

## Findings the plan misses or under-specifies

### P1 — F3 fix is under-specified and, as worded, misses two of four release sites (HIGH)
`release_task_resources` receives `resource_claims`, **not** the reservation result the plan says to
"record the path in." So "record in the reservation result itself" does not, by itself, reach release
at all. Worse, there are **four** release call sites and they do not share one object:
- `orchestrator.py:220` and `:260` reuse the *same local* `claim_dict` that reserve got (`:176`).
- `orchestrator.py:796` (the **cancel** path) **rebuilds `claim_dict` fresh** from
  `task.resource_claim` via `_claim_to_dict` — it has no access to the reserve-time result or the
  reserve-time local dict.
- `segment_synthesis.py:197` reuses its local `claim_dict` (`:154`), OK.

A stamp written onto the reservation result — or even onto the local reserved dict — is invisible to
the cancel path at `:796`, which will still re-read the env and leak/wedge on a mid-flight toggle.
And `ResourceClaim` is **frozen** (map contract), so you can't stamp the path onto the claim object
either. **Prescribe explicitly:** have reserve return an opaque admission-path token; the orchestrator
stores it on the *task object* (a mutable attribute, not the frozen claim); every release site
(including `:796` and `segment_synthesis.py:197`) passes that token, and release branches on the token
— never on `_engine_class_admission_enabled()`. The plan's Task 1 test must exercise the **cancel**
release path under toggle, not just the normal completion path, or it will pass while `:796` stays
broken.

### P2 — F4 fix rests on an unenforced `engine_class ⇒ engine_id` invariant (MEDIUM)
Moving the live limit off the class sem means live-cap enforcement lives **only** in the id-sem block
(`:700-717`), which is entirely skipped when `engine_id == ""`. Today the synthesis claim builder
populates `engine_id` on both the normal and fallback paths (`synthesis.py:95, :111`), so a claim with
`engine_class` set but `engine_id` empty appears not to occur in practice. But nothing enforces it —
`ResourceClaim.engine_id` defaults `""` and the map explicitly documents engine_id as opt-in/additive
(`resources.py:392-396`). If any future claim sets `engine_class` without `engine_id`, the F4 fix
silently drops all live-cap enforcement for it — the exact "latent, not observable today" failure
class F4 exists to kill. **Prescribe:** in Task 2, either assert `engine_class ⇒ engine_id` at claim
build / reserve entry, or keep the class-sem live limit as a fallback *only when engine_id is absent*.
Don't ship the unguarded version.

### P3 — Tasks 1 and 2 edit the same lines; "independent" is feature-level only (LOW)
The plan says Tasks 2-4 are independent of Task 1. True functionally, but Task 1 (release branching)
and Task 2 (`:699`/`:706` limit routing) both rewrite the reserve/release body. If executed as
separate slices/PRs they will conflict. Sequence them or land together; note it so an executor doesn't
parallelize them blindly.

### P4 — Restart/recovery interaction with the F3 token (LOW, verify-only)
The admission-path token must be re-derived on re-reserve after restart, not persisted stale.
Semaphores are in-memory and reset on a fresh process, so the leak itself doesn't survive restart —
but recovery must go through `reserve_task_resources` again (re-stamping), not release a persisted
claim directly. Confirm `recovery.py` re-reserves; if it does, no work needed, just state it.

---

## Blast radius (from the trace, not asserted)
`reserve_task_resources` callers: `orchestrator.py:176`, `segment_synthesis.py:173`.
`release_task_resources` callers: `orchestrator.py:220, :260, :796`, `segment_synthesis.py:197` — the
`:796` cancel path is the one the F3 fix as-worded misses. `resolve_effective_cap` also feeds
`progress/service.py` and `api/routers/engines.py` (read-only cap display) — F5's precedence change
will change what those surfaces report; harmless but worth a glance so the displayed cap stays
consistent with the enforced one.

## Confidence & falsifier
High on P1 and the F3/F4 mechanisms — each traced to `path:line` and the release-site divergence is
directly readable in the source. Medium on P2's real-world reachability (depends on whether any
non-synthesis claim ever sets engine_class; I verified the synthesis path only). **What would change
the call:** if release is refactored to receive the reservation result at all four sites (not just the
local-dict sites), P1 collapses to "already handled"; if a guard already enforces engine_id presence
somewhere I didn't trace, P2 collapses. Neither appears present today.

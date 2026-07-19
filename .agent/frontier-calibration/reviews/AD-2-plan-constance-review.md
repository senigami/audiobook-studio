# AD-2 plan review — Constance (structural / top-down panelist)

**Role:** repo-grounded structural panelist. This is a **lone, un-converged pass** (Petra not
dispatched, no neutral judge) — flagged per contract: this verdict did not get the reliability
that convergence buys. Treat it as one framed opinion, not an ensemble result.

**Framed question:** Are the F3/F4 fixes in `ad2_cap_resolution_hardening/00-plan.md` correct and
complete, and does the plan miss anything in the clamp/admission chain?

## Ground truth loaded

- Code-map core (auto-injected) + shards for `resources.py` and `cap_settings.py` (via `lookup.sh`).
  The map's own notes flagged **Task 014 (2026-07-11)** as the last refactor of this exact reserve
  path — the live-limit resolution the plan's F3/F4 both touch.
- Read in full: `resources.py:1-800`, `cap_settings.py:1-157`, the AD-2 reference (F1-F6),
  and the reserve→release **data channel**: `orchestrator.py:176/220/260/796`,
  `segment_synthesis.py:154/173/197`, `state_settings.py:_normalize_settings:120-140`.

## Verdict

**APPROVE WITH REQUIRED AMENDMENTS.** The plan correctly identifies the two real defects and its
directional fixes are sound, but **two of the three code tasks are incomplete as written** —
each rests on a premise the plan did not check against the recorded shape:

- **F3 (Task 1): the stated fix mechanism does not connect to `release`.** Real gap, must be fixed.
- **F5 (Task 3): the fix mechanism is partly infeasible and the reachability is mis-stated**,
  because `_normalize_settings` always materializes these keys. Must be re-scoped.
- **F4 (Task 2): correct and complete.** Confidence high.

## Finding-by-finding

### F3 (Task 1) — fix is directionally right but **incomplete**: the record can't reach `release`

The bug is real: `_engine_class_admission_enabled()` is read independently at reserve
(`resources.py:657`) and release (`resources.py:783`); a mid-flight env flip leaks the class /
engine-id / global-backstop slots (ON→OFF) or wedges the exclusive gate (OFF→ON). Confirmed by
trace.

**The gap:** the plan says "record which admission path was taken *in the reservation result
itself* … and release by that record." But `release_task_resources(*, task_id, resource_claims)`
**never receives the reservation result** — every one of the four call sites passes `claim_dict`,
not the `reservation` dict:

- `orchestrator.py:220`, `:260`, `:796` → `release_task_resources(task_id=…, resource_claims=claim_dict)`
- `segment_synthesis.py:197` → same.

So "record in the reservation result" closes nothing unless the plan **also** does one of:
1. stamp the admission mode into the mutable `claim_dict` during `reserve` (release already reads
   that same object), or
2. change `release_task_resources`'s signature to take the record and update all 4 call sites.

The plan mentions neither. **This is the blast radius the plan owes `path:line` evidence for** and
doesn't give: option 2 touches 2 files / 4 sites plus both functions; option 1 is a one-object
mutation but is an input-mutation side effect. Either is fine, but the plan must name it.

**Lower-blast-radius alternative the plan didn't consider — recommend it.** Every gate's
`release()` is documented idempotent (no-op for a `task_id` it isn't holding —
`EngineClassSemaphore.release` `resources.py:252-271`; the wrapper gates delegate to it). Task IDs
are globally unique. Therefore `release_task_resources` can **unconditionally release from all
gates a synthesis claim could ever have taken** — `_exclusive_gate`, the class semaphore, the
engine-id semaphore, and `_global_cap_gate` — and the gates the task never held are safe no-ops.
This eliminates the reserve/release-must-agree coupling **entirely**, needs **zero caller
changes**, and is robust to *any* env toggle (not just the tested one). I traced both flip
directions against this and it holds:
- OFF→ON: task held only `_exclusive_gate`; release-all frees it, others no-op. No leak.
- ON→OFF: task held global+class(+id); release-all frees them, exclusive no-ops. No wedge.

I also verified `release` is only ever reached for tasks that were **admitted** (both reserve loops
break on admit; the only non-dispatch release, `orchestrator.py:220`, is guarded by
`admitted=True`), so release-all never double-frees a denied task's phantom slots.

**Recommendation:** adopt release-from-all (smallest correct diff), OR keep the record approach but
add the plumbing task explicitly. The regression test the plan describes (toggle env between reserve
and release, assert correct release) is good and validates either fix; keep the R1 red-first step.

### F4 (Task 2) — **correct and complete.** Confidence: high.

The plan's fix — apply `live_limit` to the per-engine-id semaphore only, leave the class semaphore
on its grow-only structural cap — is right. I checked the one regression risk that would sink it:
*does removing `live_limit` from the class gate drop live throttling for any real claim?* No.
`live_limit` is resolved **only when `engine_class and engine_id` are both set**
(`resources.py:626`), and the id-gate (which carries `live_limit` after the fix) runs on exactly
that same condition (`:700`). A claim with `engine_class` but no `engine_id` gets `live_limit=None`
today too — so the class gate never did live throttling for it. No behavior is lost; the M7
live-throttle (Task 014) is fully preserved by the id-gate. The sibling-starvation is genuinely
fixed. The plan's need for a synthetic second same-class engine in the test is correct; the test
must also grow the class structural cap ≥ 2 (via `ensure_min_cap`) or the throttled engine has no
structural room to prove admission — a test-construction note, not a plan defect.

Minor sequencing note: F3 and F4 edit adjacent lines (`:698-706`). Independent, non-conflicting;
if landed as separate commits the second rebases trivially.

### F5 (Task 3) — real bug, but the plan **mis-states both the mechanism and the reachability**

The bug is real and *more* reachable than "medium": `set_engine_cap(last_engine, None)`
(`state_settings.py:185+`) empties the dict to `{}`, and `get_engine_caps` `cap_settings.py:94`
(`if isinstance(raw, dict) and raw:`) treats `{}` as absent → env `TTS_ENGINE_CAPS` wins. So an
operator clearing the last override in a running instance keeps the env override. Live bug.

**But the plan's proposed mechanism — "a sentinel or a presence flag" to distinguish
no-override-stored from explicitly-cleared — is infeasible as stated.** `_normalize_settings`
(`state_settings.py:129-138`) **always** materializes `tts_engine_caps` as a dict and
`tts_parallel_cap` as an int. In the running system the key is *always present*, so presence can
never distinguish "cleared" from "never set," and you can't smuggle a sentinel into a
`dict[str,int]` field. The correct fix is simpler: **drop the `and raw` truthiness gate** — treat
an explicit `{}` from a provided settings mapping as authoritative ("cleared → empty, don't consult
env"), i.e. `if isinstance(raw, dict): return _coerce_engine_caps(raw)`. Env then only fires when
the key is genuinely absent (`raw is None`) — bare/test settings only, which matches the module's
own documented precedence.

**Second correction:** the plan's "same shape, smaller, for a malformed `tts_parallel_cap`"
sub-fix targets a path `_normalize_settings` **already forecloses** — a malformed value is coerced
to the default at normalization time (`:125-127`) and never reaches `cap_settings` malformed in the
live runtime; it's reachable only via a sparse `settings=` dict in tests. The plan should confirm
that variant is worth a fix+test before spending one on it.

### F1 (Task 4) / F2 (Task 5) — no structural objection

F1 write-time warning: reuses `effective_cap` (`engines_registry.py`), sound. One caveat the plan
should carry: the **global-backstop** warning is *not* a per-engine comparison —
`MAX_GLOBAL_CONCURRENT_SYNTHESIS` is a host-total (and an import-time env read,
`resources.py:44-46`, so runtime env changes to it don't take effect either). A per-engine cap of 4
under a backstop of 8 is not "exceeded"; the backstop only bites on the *sum* of concurrent claims.
Don't implement the backstop warning as a naive `requested > backstop` per engine.

F2 is a doc dependency-check on SD-1; no code risk. Fine.

## Blast-radius summary (from the trace, not asserted)

| Task | Files/sites actually touched | Plan acknowledges? |
|---|---|---|
| F3 record approach | `resources.py` (4 return sites + helper) **+ the reserve→release channel: `release_task_resources` sig + `orchestrator.py:220/260/796` + `segment_synthesis.py:197`** | **No — the channel is unaddressed** |
| F3 release-all (recommended) | `release_task_resources` only; zero callers | n/a (not considered) |
| F4 | `resources.py:699` (one arg) | Yes |
| F5 | `cap_settings.py:94` (+ optionally `:72-77`) | Partly — wrong mechanism |

## The call, with confidence and falsifier

- **F3 fix:** directionally correct, **incomplete as written** — the record can't reach `release`.
  Fix by adopting release-from-all (recommended, smallest diff) or by adding the plumbing task.
  Confidence: **high** (traced all 4 call sites and both flip directions).
  *Falsifier:* if `release_task_resources` were already being passed the reservation result at some
  call site I missed, the gap shrinks — grep confirms it is not (all pass `claim_dict`).
- **F4 fix:** correct and complete. Confidence **high**. *Falsifier:* a real claim carrying
  `engine_class` without `engine_id` that expected class-gate live throttling — none exists, since
  `live_limit` resolution itself requires `engine_id` (`:626`).
- **F5 fix:** bug real and live; plan's **mechanism is infeasible** (normalization always
  materializes the key) and the malformed-`tts_parallel_cap` variant is likely unreachable in the
  runtime. Re-scope to "drop the truthiness gate." Confidence **high** on mechanism
  (`state_settings.py:129-138` is unambiguous).

## Escalation

None of this is past my ceiling — these are traceable structural calls, not frontier-hard
judgment. The one thing I'd genuinely want before this lands: **Petra's independent empirical pass**
(does the F3 leak actually reproduce under CI; does clearing engine caps observably let env win),
since this is a lone un-converged review and the F3/F5 corrections change what the tests must prove.

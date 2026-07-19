# All 6 calibration scenarios — plan review findings & what Fable/twins suggested

All 6 scenarios now have: a Fable root-cause/design reference (Phase 1), a plan built from it
(Phase 2), and independent Fable + Constance + Petra plan reviews (Phase 3) — RC-1 additionally
went through a full correction-and-reverify cycle (rounds 1-2, see `reviews/RC-1-v2-plan-comparison.md`).
The other 5 got one review round each, applied now, given the session's time/token budget.

## RC-1 — sub-sentence span data loss (full 2-round cycle — see prior summary)

Plan corrected across 2 rounds; final state build-ready pending one more read. Key twin catches
Fable missed: a blocker (plan's Task 0 contradicted a frozen test whose assertion encoded the bug),
and a correctness bug (fragment-run cap of 3 was wrong — unbounded is real). Full detail already
reported; see `reviews/RC-1-v2-plan-comparison.md`.

## AR-1 — VRAM-aware concurrency auto-throttle

**Fable's review: faithful**, two minor findings (wording ambiguity on the fail-open fallback;
regression scope should name the ETA bracket as a dependent caller).

**What the twins found that Fable didn't:**
- **Constance resolved the plan's one blocking open question**: Studio can't read CUDA in-process
  (`torch` isn't a declared root dependency; where present it's CPU/MPS-only) — recommended the
  TTS-server `/health` heartbeat as the sampling transport.
- **Petra found a real arithmetic bug**: the design subtracted the penalty *before* the
  manifest-ceiling clamp, which lets `min()` silently swallow the penalty whenever the configured cap
  exceeds the manifest ceiling — insidious because it looks correct at the default cap. Fixed:
  subtract after the clamp.
- **Petra also disagreed with Constance on transport** — NVML/`nvidia-smi` from the Studio daemon
  (reads global board memory, correct even if synthesis moves remote) vs. Constance's `/health`
  heartbeat. **Genuine, productive twin disagreement — escalated to the plan as an owner/engineer
  build-time choice rather than picked for them**, exactly the "disagreement is the ceiling-signal"
  design working as intended.
- **Petra flagged a goal-honesty gap**: the mechanism can only stop *new* admissions, not evict a
  running worker — so it's OOM *mitigation* (smooths ramp-up), not OOM *prevention*. Now stated
  plainly in the plan rather than oversold.
- **Petra flagged an ETA-jitter regression risk**: the same chokepoint feeds the ETA bracket, so a
  fluctuating penalty could visibly jump ETAs — needs an explicit decision, now added to the plan.

**Applied to the plan:** the arithmetic fix, the resolved transport question (with the disagreement
recorded as a build-time choice), the goal-honesty reframe, and the ETA-jitter flag.

## BR-1 — `app/jobs` package move blast radius

**Fable's review: faithful formalization**, one real gap — the plan dropped the reference's caveat
that grep can't catch a fully dynamic/string-built import; no stage gate covers a runtime
`sys.modules` sweep to positively confirm the importer set.

**What the twins found that Fable didn't — both independently, strong convergence:**
- **Both Constance and Petra caught the same critical defect**: the plan's cited shim precedent
  (`app/studio_plugin_sdk/__init__.py`) is a plain symbol re-export that does NOT preserve
  module-object identity — copied literally, it builds exactly the naive shim the plan's own Hazard
  3 warns silently un-mocks tests. The correct mechanism is `_import_utils.py:36-50`'s actual
  `sys.modules` aliasing pattern. **Applied to the plan** — corrected precedent, and the identity/
  mock-bite gates now loop over every moved submodule, not just one.
- **Constance flagged an architecture trade the plan defaulted past**: the recommended destination
  (`app/orchestration/handlers/`) moves the package *into* the layer the boundary guards protect,
  turning a testable cross-package ban into an unenforceable intra-package convention — a real
  owner decision, not a default.
- **Petra found the Stage-5 gate is unsatisfiable as written**: repo-wide `grep "app\.jobs"`
  returning zero can never pass because ~30 stale worktrees under `.claude/worktrees/` each contain
  `app/jobs` — the original reference correctly path-scoped the grep; the plan's paraphrase dropped
  the scoping.
- Minor: Petra also caught an off-by-one (7 vs. actual 8 `tts_engines` import sites).

**Not yet applied (flagged, time-boxed out of this pass):** the Stage-5 grep-scoping fix, the
Stage-0 architecture-tradeoff note, and the dynamic-import sweep. These are all concrete, cheap
fixes — next touch of this plan should apply them before build.

## AD-2 — cap-resolution/admission clamp-chain hardening

**Fable's review: 3 amendments needed.** Traced actual call sites and found the F3 fix phrasing
("record in the reservation result") was ambiguous between two non-equivalent implementations, and
that `release_task_resources` never actually receives the reservation result at all call sites.

**What the twins found — both independently confirmed and deepened Fable's catch, then diverged
on the fix, with Constance's converging as strictly better:**
- **All three reviewers agree**: F3 as originally worded doesn't reach the cancel path
  (`orchestrator.py:796`, which rebuilds its claim dict fresh) — a naive fix would silently leave the
  worst release path (cancellation) still broken.
- **Petra's proposed fix**: an opaque admission-path token stored on the (mutable) task object,
  threaded through every release site.
- **Constance's proposed fix — simpler, adopted**: since every gate's `release()` is already
  idempotent, just have `release_task_resources` unconditionally attempt release on *every* gate a
  claim could hold, and never branch on re-reading the env at release time at all. Zero plumbing,
  zero new state, robust to the env flipping at any point. **This is the fix applied to the plan.**
- **Both twins also caught a second real gap in F4** (the class-vs-id semaphore fix): it silently
  relies on an unenforced invariant (`engine_class` implies `engine_id` is set) — ship a guard/assert
  or the fix recreates the exact latent-hole class it's meant to close. **Applied.**
- **Constance found the F5 fix mechanism was infeasible as specified**: normalization always
  materializes the settings dict, so a sentinel/presence-flag can't distinguish cleared-from-absent.
  Simpler fix: just drop the truthiness gate. **Applied**, plus a note to verify the malformed-value
  sub-bug is even reachable before spending effort on it.

## PL-2 — standalone plugin repo extraction (addendum to doc 05)

**Fable's review: approve**, independently re-verified all 5 items against disk (not re-trusted from
the write-up) — including confirming the manifest actually validates and that no sync-guard exists
today. Two minor gaps (spec version needs re-check at execution; the `built_in` item is a correction
to existing text, not a new field to add).

**What the twins found that Fable didn't — both independently, strong convergence on the same miss:**
- **Both Constance and Petra caught the same material omission**: doc 05 §3's "KEEP `plugins/`"
  decision is now completely inverted by reality (the `tts_engines/` rename already shipped) — a
  bigger, unaddressed drift than the two small items the addendum did flag. Petra additionally found
  broken find-replace artifacts in doc 05's prose ("GitHub changed from GitHub to GitHub").
- **Constance found the sync-guard item (new Slice 4) is under-specified**: the registry has no
  `version` field at all — only the URL half is currently checkable.
- **Petra found the in-tree version already drifted from doc 05's stated version** (`1.0.1` vs.
  `2.0.0`) — a live instance of exactly the drift the new sync-guard is meant to catch, happening now.

**Not yet applied (flagged, time-boxed out of this pass):** correcting doc 05 §3, fixing the
find-replace artifacts, and scoping the sync-guard to what's actually checkable today (URL, not
version) — all concrete, cheap fixes for the next touch.

## SD-1 — stale always-on lesson correction

**Full 3-way APPROVE**, the cleanest consensus of the six. All three independently re-verified the
gate's actual default from code and git history rather than trusting the finding. Two small, matching
notes from both twins: edit against the lesson's real text (not a paraphrase), and explicitly
triage — not silently ignore — a couple of other doc locations that repeat the same phrase
correctly-historically.

---

## Overall calibration result across all 6 scenarios

The pattern held everywhere it was tested: **the twins, together, consistently found real issues a
single Fable pass did not** — a resolved blocking question (AR-1), a critical wrong-precedent defect
found independently by both twins (BR-1), a materially better and simpler fix than either Fable's or
one twin's proposal (AD-2's release-idempotency insight), and a bigger drift than the addendum
flagged (PL-2, again both twins independently). Fable's passes were consistently *faithful and
correct* but consistently narrower than the combined twin coverage — reinforcing round 2's finding
on RC-1 rather than being a one-off.

The productive twin *disagreement* on AR-1's sampling transport is worth calling out on its own: it's
the design working exactly as intended — surfaced as a decision point, not averaged into a guess.

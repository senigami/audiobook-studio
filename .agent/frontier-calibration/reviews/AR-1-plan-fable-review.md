# Review — AR-1 plan (`design-docs/plans/active/ar1_concurrency_throttle/00-plan.md`) vs. the AR-1 design reference

Reviewer: the same session that authored `.agent/frontier-calibration/references/AR-1.md`.
Review only — no plan edits, no implementation.

## Verdict

**Faithful.** The plan correctly captures all five load-bearing pieces of the design
(chokepoint-only integration, penalty-based hysteresis, visibility trio, fail-open-freeze),
correctly preserves the two explicit rejections (per-worker VRAM estimation, a separate
pressure gate), and correctly promotes the reference's single open question (process-boundary:
can Studio read CUDA at all) into a blocking Task 1 — which is the right sequencing decision,
not just a faithful transcription.

## Point-by-point correctness check

1. **Chokepoint integration (plan lines 21-24 vs. reference §2).** Correct and, if anything,
   stated more sharply than my reference: "This is the ONLY integration point" — matches my
   rejection of a separate pressure gate in `reserve_task_resources`. Correctly cites
   `cap_settings.py:156` and the three downstream beneficiaries (admission re-resolution,
   ETA bracket, engines API) that fall out "for free." No overclaim — the plan doesn't assert
   this is *proven*, and Task 3 correctly demands it be confirmed by test rather than assumed
   from the design doc (line 53) — good discipline, catches a way a plan could otherwise ship
   an unverified claim from a design doc as if it were fact.

2. **Hysteresis (plan lines 25-26, Task 4 line 54-56 vs. reference §3).** Numbers transcribed
   correctly (90%/2 samples/~6s down; 75%/10 samples/~30s + 60s dwell recovery). Task 4 correctly
   identifies that the thing to *prove* is the anti-oscillation property, not the individual
   thresholds — this matches my own framing that the specific watermarks are the soft part of
   the design (reference confidence 0.6) while the *shape* of the rule (fast asymmetric down,
   slow single-step up, dwell-gated) is the load-bearing part. Good judgment to test the
   property rather than pin brittle threshold-exact assertions.

3. **Visibility (plan lines 27-29, Task 5 vs. reference §4).** All three surfaces present:
   `concurrency_throttle` studio-event, honest `waiting_reason`, pressure state on the
   engines/settings payload — and it correctly notes the payload addition also serves the
   adjacent FUTURE_WORK "silent-clamp warning" item, which was my own aside in §4.3. No gaps.

4. **Fail-open fallback (plan lines 30-31, Task 6 vs. reference §5) — the one soft spot.**
   The plan's one-line summary ("fail-open to the configured cap — penalty stays, doesn't
   grow") slightly compresses two distinct behaviors from the reference that Task 6's test
   plan (line 61-62) does get right but the summary line doesn't separately name:
   - *Penalty freeze*: an already-active penalty is held, not released, while sampling is down
     (my reference's explicit correction of "fail-open" to "fail-open but freeze active
     penalty" — reference §5, last paragraph).
   - *No new throttle from failure itself*: a sampler outage must not itself be misread as
     "no pressure" (penalty→0) NOR as "certain pressure" (penalty grows). The plan's Task 6
     test list covers both directions correctly ("existing penalty holds, doesn't grow"), so
     this is a documentation-crispness gap in the summary bullet, not a substantive miss. I'd
     ask the plan author to make the summary bullet (line 30) say "freezes at whatever
     penalty was last computed" instead of the more ambiguous "fail-open to the configured
     cap," since a literal reading of "fail-open to the configured cap" could be misimplemented
     as "reset penalty to 0" by an implementer who reads the summary but not the reference.

5. **Sequencing — process-boundary question blocking Task 2.** Correct call, and stronger than
   what my reference left implicit. The reference flagged the CUDA-importability-in-Studio-
   process question as something I "could not determine" and noted it "would change the
   design materially" (module location: `memory_pressure.py` vs. riding `/health`). The plan
   is right to make this a hard gate before any `MemoryPressureMonitor` code is written,
   because the two answers produce genuinely different Task 2 diffs (new standalone thread +
   direct CUDA/psutil calls, vs. extending `app/tts_server/health.py`'s existing heartbeat
   payload and having the watchdog relay it) — starting Task 2 before resolving this risks
   throwaway work or, worse, a monitor built in-process when torch isn't actually importable
   there, silently degrading to the "no CUDA available" fallback path everywhere and never
   surfacing that the design's primary sampling source never engaged. Sequencing is correct.

6. **Out of scope (plan lines 68-70).** Matches my two explicit rejections verbatim in intent
   (per-worker VRAM manifest field; separate pressure gate). No drift.

## Findings

- **No incorrect claims about the design.** Nothing in the plan misrepresents chokepoint,
  hysteresis, visibility, or fallback as I specified them.
- **Minor:** tighten the Task 6 summary line (plan line 30) to say "freezes the last-computed
  penalty" rather than "fail-open to the configured cap," to prevent an implementer from
  literal-reading it as "reset to 0 on sampler failure" — a regression relative to the
  reference's actual intent. Low severity since Task 6's own test bullets already specify the
  correct behavior; this is belt-and-suspenders for whoever reads only the summary.
- **Minor / worth adding:** Task 7 ("full regression... unaffected when the monitor reports 0
  penalty") should explicitly include the `resolve_effective_cap` unit tests and the
  `_resolve_pool_cap` / ETA-bracket tests in `progress/service.py`, since those are the two
  *other* callers of `resolve_effective_cap` that the reference identified as automatic
  beneficiaries (and therefore automatic regression risks) of the chokepoint change. The plan
  doesn't name them specifically; a generic "existing scheduler/resources tests" pass could
  miss the progress-service caller if its test file lives outside that directory.
- **Not a finding, just confirmation:** the plan's engine-neutrality (INV-5) is preserved by
  construction, same as the reference — the monitor never sees an engine_id, and Task 2/3
  don't introduce one. No engine-ID branching risk in this plan.

## Confidence

High. This is a review of a plan against a design I authored moments earlier with the actual
call sites open; no new code-reading was needed to adjudicate the two findings above, both of
which are about clarity/completeness of the plan's task descriptions, not about the design
itself being wrong.

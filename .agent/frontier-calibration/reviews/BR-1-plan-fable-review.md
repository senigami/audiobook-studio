# Review — `design-docs/plans/active/br1_jobs_package_move/00-plan.md` vs BR-1 reference

**Reviewer basis:** `.agent/frontier-calibration/references/BR-1.md` (own prior output, this session). Review only — no plan edits made.

## Verdict

**Faithful formalization.** All 6 ordering hazards, the Stage 0–5 sequence, every stage's gate, the destination recommendation, and all three open items carry over accurately from the reference. No new correctness issues introduced by the rewrite. One completeness gap: a residual-risk caveat from the reference's confidence section was dropped and should be re-added as an explicit gate.

## Cross-check detail

**Numbers verified against source, not just against my own memory of the reference:**
- Plan claims "~60 test monkeypatch strings" (Stage 3). I re-ran `grep -c 'patch("app.jobs' tests/` fresh: **59** — the plan's number is more precise than my reference's coarser "34 test files" count (which counted files, not patch-string occurrences). Not an error; an improvement.
- "9 cross-repo lazy-import call sites (2 SDK, 7 plugin)" in the Problem section matches reference Class A exactly (context.py:398,682 + 7 tts_engines sites).
- "3 boundary-guard tests" (Problem section) is correctly scoped to the three test files only; `modular_architecture.md:24` (the 4th guard-adjacent reference in my Class C) is correctly bucketed separately under Stage 4 "paperwork," not miscounted as a test.

**Hazards:** all six reproduced with their load-bearing specifics intact — boot's exception-swallowing (boot.py:97), side-effect-free `__init__.py`, the patch-target identity/false-green risk (with the "naive `from new import *`" example preserved verbatim), boundary guards going vacuous rather than failing, lazy-import call-time (not import-time) failure, and singleton duplicate-load risk. No hazard lost, none invented.

**Stages:** Stage 0 (destination, blocking) → 1 (shim + identity check + deliberate-break-then-fix mock test) → 2 (runtime rewire + real boot/render smoke, correctly labeled a runtime-verifier job not a pytest-green claim) → 3 (mechanical test-string migration) → 4 (guards + specs + code-map queue entry, with the fail-closed violating-import check) → 5 (shim deletion, gated on a zero-hit repo grep) — matches the reference's sequence and gates stage-for-stage.

**Open items:** destination name, the stale worktree check, and the shim-vs-clean-break framing question are all carried over with the reference's own recommendation (transient shim, not a shipped compat surface) preserved rather than flattened into a false certainty.

**Out of scope:** SDK extraction (task 010/PL-2) correctly noted as an ordering dependency that would shrink Stage 2's runtime set, matching the reference's confidence-section caveat (c).

## Gap found

The reference's confidence section flagged a residual risk explicitly: grep can't catch a fully dynamic/string-built `importlib.import_module("app.jobs" + computed)` call, and recommended a runtime `sys.modules` sweep after boot to close that gap. **This caveat does not appear anywhere in the plan** — not in the hazards list, not in any stage's gate, not in the open items. Given BR-1's own framing ("a missed importer is the failure mode here"), this is the one place the formalization is less complete than the source. Recommend folding it into Stage 2's or Stage 5's gate: after boot, inspect `sys.modules` for any `app.jobs*` entries not accounted for by the shim, to positively rule out a dynamic importer the static grep couldn't see.

## Other minor observations (not defects)

- The plan doesn't restate that `worker_helpers.py` has no external importers (only used internally by `worker_voice.py`/`worker_metrics.py`) — harmless omission, doesn't affect any stage's correctness since the whole package moves together.
- The plan doesn't carry forward the reference's methodological note that the code-map's `called_by` for `registry.py` was empty (grep, not the map, was the importer-set authority) — appropriate to drop for an execution-focused plan, worth keeping in mind if someone re-derives the import set from the map alone later.

## Confidence

High. This is a mechanical fidelity check against a document I authored in the same session; the one gap identified is concrete and independently verifiable (absence of any `sys.modules` sweep step in the plan text).

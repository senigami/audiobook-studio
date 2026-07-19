# SD-1 plan review — Petra (empirical / bottom-up)

**Verdict: APPROVE.** The plan's core factual claim is correct and independently verified from the
code and git history. One minor completeness note below; it does not block.

## Ground truth loaded (map ritual + source)

- Map shard for `app/orchestration/scheduler/resources.py` (via `lookup.sh`): notes record
  "ENGINE_CLASS_ADMISSION defaults ON as of 2026-07-06 (previously shipped dark/off)."
- Source read bottom-up, not from the docstring's word: `_engine_class_admission_enabled()`
  (`resources.py:49-68`) returns `raw not in {"0","false","no","off"}` where `raw` is
  `os.environ.get("ENGINE_CLASS_ADMISSION", "")`. **Unset → `"" not in {…}` → True.** The gate is
  ON by default. This is the actual admission-decision predicate, and its two call sites
  (`reserve_task_resources:657`, `release_task_resources:783`) both branch to the legacy exclusive
  gate only when it returns False. So default-ON means the new per-engine-class semaphore path is
  live. Confirmed at the call site, not just asserted by the docstring.
- Git: `7c3d5b9d` = "fix: ENGINE_CLASS_ADMISSION now defaults on (owner directive)", 2026-07-06.
  The commit hash the plan cites is real, correctly dated, and its subject matches the claim. No
  later commit reverts the predicate (`git log -S` on the module shows nothing since).

## The plan's correction text is accurate

The proposed replacement — "…still defaulted OFF — so renders stayed sequential regardless of the
cap setting. Fixed same day in `7c3d5b9d` (gate now defaults ON; parallel rendering is the shipped
default)" — is factually correct on every checkable point: past-tense framing of the incident,
correct commit, correct current default. Keeping the `Apply:` meta-lesson unchanged is the right
call — that guidance ("a raised cap with the gate still off changes nothing; grep for the admission
gate") is generically true independent of this incident's status.

Note the plan's Problem section paraphrases the current lesson as opening with "still defaulted
OFF"; the live `INDEX.md:7` actually opens "A 'default raised' commit doesn't mean a feature is
live…". The stale phrase appears mid-lesson. This does not affect the fix (the plan targets the
correct clause), but whoever applies it should edit against the real text, not the paraphrase.

## Minor finding (non-blocking, scope-adjacent)

The plan's step-2 grep (`grep -rn "defaulted OFF" .agent/ design-docs/`) is described as a
sanity check to confirm no *other* lesson repeats the claim. It will in fact surface a second
present-tense-readable instance the plan doesn't address:
`.agent/checklists/code-review.md:100` carries the same "still defaulted OFF … renders stayed
genuinely sequential regardless of the cap" narrative inside an HTML comment sourcing a checklist
item. It reads as a dated incident note rather than a live-status claim, so it's defensible to
leave it — but the plan should state explicitly whether it's in or out of scope rather than let
the grep surface it with no decision recorded. (The prior Fable review already flagged this same
hit; noting it independently here.) Blast radius of the actual edit is one line in one
auto-loaded doc — no code path touched, no test needed, correctly identified as documentation-only.

## Confidence

High. Falsifier: if `ENGINE_CLASS_ADMISSION` were set to a disabling value in the app's own
launch/env wiring (not just test toggles), the *effective* runtime default could differ from the
code default. I checked the predicate and its call sites, not the deployment env; but the lesson
and the plan both speak to the code default, which is unambiguously ON. Verifying observable
runtime parallelism is correctly scoped out to runtime-verifier.

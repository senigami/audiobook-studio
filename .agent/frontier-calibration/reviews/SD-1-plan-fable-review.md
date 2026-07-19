# Review — sd1_lesson_correction/00-plan.md

**Verdict: APPROVE.** The plan's diagnosis and exact-correction text are accurate and match
SD-1.md verbatim. One near-miss worth a note before executing step 2, and one thing to leave
alone.

## Findings

1. **Correction text is correct.** The plan's quoted replacement (lines 20-25) is an exact match
   for SD-1.md's "Exact correction" section — same wording, same past-tense reframe, same
   attribution to `7c3d5b9d`. No drift between the plan and its source reference.

2. **The Apply-sentence-stays decision is correct.** The generic meta-lesson ("grep for the
   admission gate when a cap is raised") is genuinely durable and independent of this incident's
   resolution — leaving it untouched is right.

3. **`grep -rn "defaulted OFF" .agent/ design-docs/` (step 2) will surface two more hits worth
   triaging explicitly, not just "confirmed none":**
   - `.agent/checklists/code-review.md:100` — the same incident narrative is embedded verbatim in
     an HTML comment illustrating a checklist item ("added 2026-07-06 ... still defaulted OFF ...
     stayed genuinely sequential regardless of the cap"). This one is lower-risk than the lesson:
     it's framed as a worked historical example backing a generic rule, not a present-tense status
     claim, and it isn't auto-loaded every session. Recommend leaving as-is (it's illustrating the
     pattern, correctly dated), but the plan should say so explicitly rather than silently pass
     over it — otherwise a future reader of the plan may wonder why the grep hit wasn't addressed.
   - `design-docs/specs/queue-jobs.md:29` — this is a changelog row (`1.11.6`) that already states
     the resolution in the same entry ("now defaults ON ... closing the gap left by 1.11.5"). It is
     self-resolving and needs no fix; it's the spec's changelog doing its job correctly. Also worth
     a one-line acknowledgment in the plan for the same reason as above.
   - Both are already inside the plan's declared grep scope (`.agent/`, `design-docs/`), so no scope
     change is needed — just add a line noting these two were found-and-triaged-as-fine, so the task
     isn't silently incomplete-looking when the grep output is reviewed later.

4. **Not a finding, just confirming scope:** `.agent/frontier-calibration/scenario-menu.md` and
   `.agent/frontier-calibration/references/AD-2.md` also contain the old phrasing, but those are
   the calibration benchmark's own scenario/reference artifacts (describing the *problem being
   graded*, not operational guidance) — correctly out of scope for this plan and should not be
   touched.

## Recommendation

Approve as-is; optionally add one sentence to Task 2 naming the two expected grep hits
(`code-review.md`, `queue-jobs.md`) and why each needs no further edit, so the step reads as
"triaged" rather than merely "ran a grep and saw nothing alarming."

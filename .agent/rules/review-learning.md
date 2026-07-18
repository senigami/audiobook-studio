# Review Learning — Extracting Process Lessons from Any Review

Use this file **every time any review happens**, no matter how small: an ad-hoc code review, `review-adversarial`, `review-pr`, `review-checklist`, a `fusion-reasoning` panel, or a `review-gate` (Fable) dispatch. "The user asked for a review" is the trigger, not "the review is a big one." This is not optional supplementary reading — treat it as part of the review procedure itself, the same way `verification.md`'s code-map queue rule is part of "definition of done."

## Why this exists

Frontier-tier review (Fable) and multi-persona fusion panels catch bugs our own review passes and the code map don't. That's expected — it's *why* we run them. What's not acceptable is catching the same *class* of bug the same way every time. Every confirmed finding is evidence that our standing checks have a hole. The hole is the valuable output, not just the one-off fix — and Fable's availability is time-limited, so any lesson left unharvested is lost for good.

## The procedure (mandatory, every dispatch)

1. **Before dispatching**, load the matching checklist(s) from `design-docs/checklists/` (see the `review-ratchet` skill) for the domain under review — `code-review.md`, `security-review.md`, `spec-drift-review.md`, `verification-standards.md` (verification-METHODOLOGY escapes — declaring something unverifiable, or under-verifying, when a simulated check was achievable — distinct from code-review.md's correctness escapes), or others as they're added — and include them in the reviewer's briefing as mandatory checks it must run, not just background reading.
2. **After the review returns, for every finding the review CONFIRMS as real** (not every finding raised — only ones verified true, per this repo's own R1-style discipline of not trusting a claim until checked):
   - If the review ran through a model/agent dispatch (fusion panel, Fable, a reviewer subagent), ask a same-turn follow-up to that reviewer, or a fresh same-model follow-up referencing the finding if the dispatch already ended: *"What check, test pattern, or process/rule change would have caught this before it shipped?"*
   - If the review was conducted inline (no separate dispatch — just reading the diff yourself), answer that same question yourself before moving on, with the same rigor as if a reviewer had answered it.
   - Do not paraphrase this into a vaguer question — the specific framing is what produces an actionable, generalizable answer instead of a restatement of the bug.
3. **Capture the answer in the same change, never deferred** — add it to the relevant `design-docs/checklists/<domain>.md` as either a new checkable line (single concrete instance) or a "Known Recurring Violation Patterns" entry (a recurring shape — second occurrence of the same underlying cause, or a first occurrence that's clearly a class). Follow `review-ratchet`'s own new-line-vs-new-pattern decision rule.
4. **Confirm the capture in one line** back to the user ("Added to `<domain>-review` checklist: …") so the ratchet is visibly clicking, per `review-ratchet`'s own guidance.
5. **This is proactive** — do it without being asked, for every future fusion-reasoning or Fable dispatch, not just large audits. A two-persona light panel that confirms one bug still gets this treatment; the harvesting is cheap relative to the review that produced it.

## Scope note

This captures **process/checklist lessons**, not just bug fixes. The bug fix itself is handled by normal TDD/R1 discipline (`verification.md`). This rule is specifically about the second-order question — "how do we stop missing this class of thing" — which is easy to skip once the bug is fixed and the pressure is off. Don't skip it.

## Governing mechanism

This rule is the trigger; `review-ratchet` (installed as a skill) is the mechanism that defines the checklist file format, the same-change-capture invariant, bidirectional sourcing (self-caught vs. user-flagged), and monotonic coverage (never delete a check because it "hasn't fired lately"). Read that skill's own guidance when in doubt about where a lesson belongs.

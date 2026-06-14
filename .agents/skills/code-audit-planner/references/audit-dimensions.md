# Audit dimensions

The full battery. Run only the dimensions the repo actually has surface for — a backend-only service has no UX/theming dimension; a static site has no API-contract dimension. When you skip one, say so and why. Each dimension's agent returns the finding schema from [orchestration.md](orchestration.md).

The throughline across all dimensions: **a finding names a real problem at a real location with a concrete target shape.** Taste-only observations ("this feels off") are not findings unless you can say what's wrong and what it should become.

## 1. DRY & reuse

Look for logic or UI reimplemented in more than one place, especially copies that have **diverged** — that's where bugs breed. Distinguish genuine duplication (same intent, should be one thing) from coincidental similarity (two functions that happen to look alike but mean different things; forcing them together couples unrelated code). For each real cluster, name the shared utility/component/hook it should collapse into and where it should live. Prefer extracting when: the logic is non-trivial, it appears 3+ times, or the copies have already started to drift.

## 2. Organization & boundaries

Files in the wrong layer, modules that import across boundaries they shouldn't, files that have grown past readability and should split, folders whose name no longer matches their contents, naming conventions that drift between areas. Measure against the repo's own stated organization (the code-organization spec if one exists) — not an abstract ideal. Propose the target location/split, and keep moves incremental: each becomes a task, not a big-bang reorg.

## 3. Logic errors & redundancy

Actual correctness problems: off-by-one and boundary bugs, unhandled null/empty/error paths, race conditions, swallowed exceptions, conditions that can't be true, branches that can't be reached, redundant recomputation, state that's updated in one place but read stale in another. Also contradictory logic — two code paths that disagree about the same rule. These are usually **critical/major**; verify each against the real code before raising it, and describe the failing scenario concretely (input → wrong output).

## 4. Test quality

The user is unsure their tests are good — so be honest and specific. Classify every test and flag:

- **Tautological** — asserts things that are always true (`expect(true).toBe(true)`, asserting on a value the test itself just set with no logic in between). Recommend deletion.
- **Mock-only** — mocks the thing under test or all its collaborators, so it proves the mock works, not the code. Recommend rewrite against real behavior.
- **Over-coupled** — asserts on implementation details (call counts, private internals) so it breaks on safe refactors without catching real regressions. Recommend re-targeting at observable behavior.
- **Smoke-only where more is warranted** — renders/boots and asserts nothing meaningful for logic that deserves real coverage.

Then name the **untested real scenarios** that matter: the core behaviors, edge cases, and error paths a user would actually hit. The plan's test tasks should describe the *scenario* to cover, not just "add a test." Anchor to the test strategy spec if one exists (what to mock vs. run real, where tests live).

## 5. Code-vs-spec drift

Only if a spec set exists. Find where the code contradicts the spec — wrong error shape, missing endpoint the spec promises, behavior that diverges, naming that violates the convention spec. Each gap is a finding with the `spec_ref`. If the **spec** looks wrong rather than the code, don't plan to "fix" the code to match — flag it as a spec-level discrepancy for the user to resolve, since the spec is the source of truth and changing it is their call.

## 6. UX & visual design (UI repos)

Critique through an Apple-style lens — clarity, deference, depth; hierarchy, harmony, consistency. Concretely:

- **Clarity & hierarchy** — is the primary action obvious on each screen? Is visual weight aligned with importance, or is everything competing? Is copy concise and human?
- **Consistency** — do the same concepts look and behave the same across screens (button styles, spacing rhythm, iconography, terminology)? Inconsistency is the most common and most fixable finding.
- **State completeness** — does every data view have designed loading, empty, and error states, or just the happy path? Empty states are a frequent gap and a high-leverage UX win.
- **Restraint & polish** — unnecessary chrome, borders, and shadows that add noise; spacing that doesn't breathe; motion that's absent where it would aid understanding or gratuitous where it distracts.
- **Affordances & feedback** — do interactive elements look interactive? Does every action give feedback? Are destructive actions guarded?

If a design system / design spec exists, measure against it and treat parallel ad-hoc styles as findings. Use the project's existing design-compliance skill if one is available rather than inventing parallel guidance.

## 7. Responsive & theming (UI repos)

- **Responsive** — does the layout hold from small mobile (~360px) through desktop? Are there fixed widths that overflow, tables that don't reflow, touch targets too small for fingers (aim ~44px), content that needs horizontal scrolling? Name the screens/components that break and at what width.
- **Light/dark theming** — is color driven by **semantic tokens** (e.g. `bg-surface`, `text-primary`) that re-theme automatically, or are there hardcoded hex/rgb values that won't flip with the theme? Hardcoded color is the usual root cause of broken dark mode — the pattern sweep surfaces the locations; this audit decides the target token for each and whether the token set itself has gaps. Check that both themes actually meet contrast in practice, not just that a dark class exists.

## Other audits worth running when relevant

Use judgment; add a dimension if the repo warrants it:

- **Accessibility** — semantic markup, labels, focus order, contrast (overlaps theming). If an a11y skill is available, lean on it.
- **Performance** — obvious N+1 queries, unmemoized expensive renders, oversized bundles, work in hot paths. Only raise concrete, located issues, not speculative micro-optimization.
- **Security** — unvalidated input at boundaries, secrets in code, missing authz checks. Anything here is at least major, usually critical.
- **Dependency & dead weight** — unused dependencies, dead files/exports, abandoned feature flags, commented-out code blocks.

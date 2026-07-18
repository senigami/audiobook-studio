# Code Review Rules

Use this file when the user asks for a review, PR review, review-comment triage, or risk assessment of a diff — whether run inline, via `review-adversarial`, `review-pr`, `review-gate` (Fable), or a `fusion-reasoning` panel.

**Before conducting any review of any kind or size, load `.agent/checklists/*.md`** (the domain files most relevant to what's being reviewed — `code-review.md`, `security-review.md`, `spec-drift-review.md`, or others as they're added) and run every line as a mandatory check, not optional background reading. This is the `review-ratchet` skill's checklist artifact — see [`review-learning.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/review-learning.md) for what to do with anything the checklist doesn't already cover.

## Review Posture

- Lead with findings ordered by severity. Summaries and praise are secondary.
- Review the actual changed hunks in the context of callers, data flow, side effects, and tests.
- Treat changed tests as production signal: flag weakened assertions, broad matchers, deleted coverage, or skips that hide a real failure.
- Prefer readable, maintainable, decoupled code over speculative abstractions.
- Verify whether TODOs, manual follow-ups, or accepted risks have clear ownership before treating them as resolved.

## Evaluation Criteria

- Correctness: valid inputs, invalid inputs, empty states, missing data, retries, failures, and recovery paths.
- Architecture: separation between route, service, orchestration, queue, plugin, and UI layers.
- Maintainability: flat control flow, clear names, minimal duplication, no dead code, and cohesive helpers.
- Security: user-derived paths, credentials, request validation, unsafe logging, and sensitive data exposure.
- Performance: hot-path I/O, repeated API calls, N+1 patterns, render churn, unnecessary blocking, and cache invalidation.
- UX and accessibility: loading/error states, focus, keyboard behavior, semantics, and responsive behavior.
- Observability: useful log levels and context without leaking secrets or noisy implementation detail.
- Verification: tests for changed behavior and important edge cases, plus the relevant lint/build/type checks.

## Output Shape

- For each issue, cite the file and tight line reference when possible.
- Include severity and the root cause, not just the symptom.
- Suggest the smallest corrective change that fits the surrounding code.
- If no actionable issues are found, say so clearly and list any verification gaps or residual risk.

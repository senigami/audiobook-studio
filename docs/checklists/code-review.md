# Code Review Checklist
<!-- Maintained by review-ratchet. Every check exists because something escaped once. -->
<!-- Seeded 2026-07-04 from a single session's fusion-reasoning adversarial review that found
     real bugs in every one of 4 shipped features (render monitor, audio player, AI casting UI,
     HuggingFace integration). See .agent/rules/review-learning.md for the process this feeds. -->

## Boundary & State-Combination Coverage

- [ ] For any component with more than one branching dimension (e.g. a count-tier AND a status enum), test the COMBINATION at each branch boundary, not each dimension independently. <!-- added 2026-07-04, source: self-caught (fusion review) — SegmentRenderMonitor's >60-segment summary view had zero failure indicator; the >60 test used only done/preparing segments, the failed-segment test used only <=60 segments, so the one combination that mattered was never exercised -->
- [ ] When a function has a "source larger than target" main path and a "source smaller than target" edge path (resize/downsample/pagination logic), write a fixture that hits the smaller-than-target case explicitly — don't assume the main-path fixture also covers it. <!-- added 2026-07-04, source: self-caught (fusion review) — usePeaks's downsample only had fixtures >= PEAKS_COUNT samples, so a padding bug that flatlined the tail of any shorter clip shipped untested -->
- [ ] When changing a threshold/boundary constant, grep existing tests for hardcoded values near the OLD boundary — they may silently start exercising a different code path than the one they were written to test, while still passing. <!-- added 2026-07-04, source: self-caught (final sign-off review) — two PlayerBar transport-control tests used duration=120 (the old DURATION_BOOTSTRAP value); when the constant changed to 30 they silently switched from the waveform path to the plain-bar path with no assertion noticing -->

## Reused Utilities at New Call Sites

- [ ] Before calling an existing shared utility from a new call site, enumerate its edge-case branches (empty/undefined/null inputs especially) and confirm each one is still the RIGHT behavior for the new caller — don't assume behavior tuned for existing callers transfers. <!-- added 2026-07-04, source: self-caught (fusion review) — getDefaultVoiceProfileName's engines=[] fallthrough was fine for display-only callers but let the new AI-casting caller silently assign a voice with unchecked engine readiness -->

## Spec/Doc-Value Provenance

- [ ] A code or test comment claiming a value is "per spec" or "spec-defined" must be checked against the literal spec text at the time it's written, not copied from an earlier draft or assumption. <!-- added 2026-07-04, source: self-caught (fusion review) — DURATION_BOOTSTRAP was 120 (4x the spec's ~30s), and the test file's own comment falsely asserted the value was spec-verified -->

## Known Recurring Violation Patterns

- **Plausible-but-unverified "spec-defined" claims** — a value gets carried forward (from an earlier draft, a different task, or plain assumption) with a comment asserting it matches the spec, and nobody re-opens the spec to check. The tell: a numeric/threshold constant with a comment citing a spec section but no direct quote of the spec's actual wording next to it. Fix pattern: require the comment to include the literal spec phrase, not just a section reference.
- **Draft plan docs speculating about an unbuilt dependency's interface** — a task file written before its dependency shipped assumes props/exports that never end up matching the real thing once built. The tell: a "Target shape" or "Contract" section in a task doc referencing a component/prop name that doesn't appear anywhere in the actual codebase yet. Fix pattern: flag such sections as speculative in the doc itself, and re-derive from the real shipped interface before executing the dependent task (see the stale-draft warning pattern added to design-docs/plans/active/audio_player_waveform_scrubber/tasks/008-*.md).

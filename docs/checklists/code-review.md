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

## Suppressing or Gating a Shared Chokepoint

- [ ] Before adding an early-return / suppression flag to a publish, broadcast, logging, or event chokepoint, enumerate EVERY signal multiplexed through that chokepoint and confirm each one is individually safe to drop — a chokepoint added for one channel (e.g. durable job rows) usually carries co-tenant channels (e.g. segment-scoped frames) whose consumers key on different ids and never cared about the channel being fixed. Trace each downstream consumer to its actual key, don't reason from the id that motivated the suppression. <!-- added 2026-07-04, source: self-caught (review-ratchet pass) — the W-PAR ephemeral early-return in orchestrator _publish correctly killed phantom job rows but also killed segments.progress frames flowing through the same call; the frontend keys the live per-segment bar by segmentId, so the phantom jobId was never load-bearing for those frames and they had to keep flowing -->
- [ ] A helper function shipped "for future call sites" with zero current callers must still land with a direct unit test in the same change — untested-and-uncalled code is unverified in every branch, including trivial ones like result-row column aliasing. Prefer wiring at least one real caller or deleting it. <!-- added 2026-07-04, source: self-caught (review-ratchet pass) — chapter_completion_by_size landed advertised in two specs and the changelog with no caller and no test; its sqlite3.Row["total_chars"] aliasing had never executed -->

## Known Recurring Violation Patterns

- **Fix-one-channel, kill-the-bus suppression** — a bug about ONE kind of output flowing through a shared emit path gets fixed by suppressing the WHOLE path for the offending source, silently dropping the other kinds of output multiplexed through it. The tell: a new `if <flag>: return` (or equivalent gate) placed above a function that emits to more than one topic/table/stream, justified by a comment that mentions only one of them. Fix pattern: push the flag INTO the emitter and suppress per-channel, keeping the channels whose consumers are keyed independently of the motivating bug; pin with a test asserting both "banned channel silent" AND "surviving channel still emits". <!-- added 2026-07-04, source: self-caught (review-ratchet pass, W-PAR ephemeral publish) -->


- **Plausible-but-unverified "spec-defined" claims** — a value gets carried forward (from an earlier draft, a different task, or plain assumption) with a comment asserting it matches the spec, and nobody re-opens the spec to check. The tell: a numeric/threshold constant with a comment citing a spec section but no direct quote of the spec's actual wording next to it. Fix pattern: require the comment to include the literal spec phrase, not just a section reference.
- **Draft plan docs speculating about an unbuilt dependency's interface** — a task file written before its dependency shipped assumes props/exports that never end up matching the real thing once built. The tell: a "Target shape" or "Contract" section in a task doc referencing a component/prop name that doesn't appear anywhere in the actual codebase yet. Fix pattern: flag such sections as speculative in the doc itself, and re-derive from the real shipped interface before executing the dependent task (see the stale-draft warning pattern added to design-docs/plans/active/audio_player_waveform_scrubber/tasks/008-*.md).

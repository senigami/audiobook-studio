# Task 006 — Text segmentation + speaker attribution pass

Status: pending

Risk: external-reference, quality-sensitive (LLM-pipeline reliability is a genuine open
question per R-B in `01-map.md`; depends on model behavior not fully knowable at planning
time — this task file is a plan for IF the owner proceeds, not a guarantee this approach
works as designed)

## Goal

Build the second stage of the AI extraction pipeline: given one chapter's raw text and the
character registry produced by 005 (character discovery + profile creation), call an LLM
to produce the `segments[]` array of the `audiobook_analysis_result` envelope — split the
chapter into ordered performance segments (narration, dialogue, attribution, stage
direction, action context, vocalization, sfx, etc. per
`design-docs/plans/proposals/performance_script_model/02-character-profiles-and-extraction-spec.md`
§5-6) and attribute each dialogue/vocalization segment to a speaker from the registry.

This task does NOT add performance annotation (emotion/delivery/acting_note — that's 007)
beyond what's structurally required by the segment envelope shape (the `performance` field
exists on the schema but stays `null` for nearly every segment here, per the spec's own
"most dialogue should not have performance metadata" rule).

## Why this matters

Speaker attribution is the highest-value, most user-visible output of this entire
pipeline — it's the thing a human reviewer actually judges the pipeline's usefulness by
("did it correctly figure out who said this line"). It's also where confidence scoring and
review-flagging carry the most weight: getting attribution wrong silently (high confidence,
wrong speaker) is worse than getting it right only 70% of the time with honest confidence
scores, because INV-3's whole review-queue design (009) depends on confidence being a
trustworthy signal for what needs a human look.

## What's already established (from 005 and the research)

- 005 should have already stood up (or depend on) the Anthropic client wrapper and
  verified the current structured-output/tool-use mechanism — reuse that, don't rebuild it.
- The research doc's finding that **event/plot-continuity and evidence-quote fields are
  less reliable extraction targets than personality/trait fields** applies here too:
  `dialogue_attribution.evidence` and `speaker.evidence` are exactly this kind of
  quote-grounded field — expect more noise here than in 005's trait fields, and calibrate
  review-flag thresholds accordingly (see Human-review rules below).
- The chunking/registry-carry-forward question (R-B, still open) is directly exercised by
  this task: attribution for chapter N needs chapter N's discovered characters (from 005)
  plus, ideally, the carried-forward registry from earlier chapters (008's job once it
  exists) so pronouns like "she" resolve to the right established character rather than a
  same-chapter guess. For this task, attribution against the current chapter's own registry
  is sufficient; cross-chapter registry correctness is 008's concern.

## Exact contract to produce

Per `02-character-profiles-and-extraction-spec.md` §5 and the matching schema in
`05-ai-extraction-agent-prompt.md`, each segment:

```json
{
  "id": "seg_000002",
  "sequence": 2,
  "kind": "dialogue",
  "text": "Don't open it.",
  "speaker": {
    "character_id": "char_marcus",
    "confidence": 0.86,
    "basis": "inferred_from_context",
    "evidence": [{"quote": "Marcus moved between her and the door.", "paragraph_index": 2, "sentence_index": 1}]
  },
  "dialogue_attribution": {"explicit": false, "attribution_text": null, "inferred_from_context": true},
  "performance": null,
  "rendering": {"standard_audiobook": "spoken", "enhanced_audiobook": "spoken", "audio_drama": "spoken"},
  "source_trace": {"paragraph_index": 2, "sentence_index": 2, "chapter_offset_start": null, "chapter_offset_end": null},
  "review": {"speaker_reviewed": false, "performance_reviewed": false, "needs_human_review": false, "review_reasons": [], "locked": false}
}
```

Segment `kind` values, `basis` values, and `rendering` values are fixed controlled
vocabularies in §6 of doc 02 — do not invent new ones. Use the narrator character ID
`char_narrator` for narration segments, per the extraction prompt's own rule.

**Important schema-shape note**: `03-db-schema-changes.md`'s original assumption that
spans need new `span_start`/`span_end` byte-offset columns "replacing sentence-level
position as ownership unit" is now known incorrect — per `00-overview.md`'s "Schedule
decision" finding, this project's actual sub-sentence mechanism (already shipped, in
`app/domain/chapters/operations.py`) achieves sub-sentence spans by splitting
`text_content` strings and shifting `segment_order`, never byte offsets. This task's
segmentation output must map onto `chapter_segments.segment_order` (the existing ownership
unit), not onto new offset columns — confirm this against whatever task 001 actually
migrated before assuming the offset-column shape from the original proposal doc.

## Human-review rules for this pass (§8 of doc 02)

Flag a segment `needs_human_review: true` when: speaker confidence is below 0.85, multiple
speakers are plausible, speaker is unknown, source attribution is ambiguous (no explicit
attribution tag and pronoun/context-only inference), or a vocalization/sfx classification
is itself inferred rather than explicit. Given the research finding that evidence/quote
fields are noisier, bias toward flagging when evidence is thin (a single ambiguous pronoun)
even if the raw confidence score the model returns is above 0.85 — do not treat the
model's self-reported confidence as fully trustworthy without a sanity check against how
much textual evidence actually backs it.

## Steps

1. **Spike first.** Run this pass's segmentation + attribution against the same 2-3 real
   chapters used in 005's spike (reuse the discovery output from that spike as the
   registry input). Manually review:
   - Is the chapter fully and correctly segmented (no dropped text, no duplicated text —
     concatenating all segments in order should reproduce the source text)?
   - Is dialogue correctly separated from narration/attribution?
   - How often is the speaker attribution actually correct, spot-checked line by line?
   - How often does the model's confidence score look calibrated (a 0.95 confidence wrong
     attribution is worse than an honest 0.5)?
   - Are segment kinds (vocalization/sfx/stage_direction) reasonable, or is the model
     over- or under-classifying them?
   Do not proceed to building the full production pipeline around this stage until a human
   has reviewed this spike's output and judged it acceptable.
2. Build the segmentation+attribution prompt, reusing 005's Anthropic client wrapper and
   verified structured-output mechanism.
3. Enforce the lossless-segmentation invariant in code, not just by prompting for it:
   after parsing the model's segment list, verify (programmatically) that concatenating
   `text` fields in `sequence` order reconstructs the source chapter text (allowing for
   whitespace normalization); if it doesn't, flag the whole chapter's output for review
   rather than silently accepting a lossy segmentation.
4. Implement the confidence-vs-evidence sanity check from the Human-review rules above —
   downgrade an implausibly high confidence score to trigger review when the evidence
   array is empty or weak (e.g., pronoun-only).
5. Add tests per `testing-standards.md`: mock the LLM boundary only (R2); assert the
   lossless-segmentation check actually fails the test suite when fed a deliberately lossy
   mock response (this is exactly the kind of invariant-check test that needs a
   revert-check-style verification — confirm it catches real corruption, not just green
   on well-formed mocks).

## Acceptance criteria

- [ ] Validation spike run against the same real chapters as 005; a human reviewer has
      confirmed segmentation is lossless and speaker attribution is usefully accurate on
      the sample — precondition for this task being done, not optional.
- [ ] Lossless-segmentation check is enforced in code (not just prompted for) and has a
      test proving it actually catches a lossy/corrupted mock response.
- [ ] Segments needing review are flagged per §8's rules, with the confidence-vs-evidence
      sanity check applied, not a bare pass-through of the model's own confidence number.
- [ ] Every AI-produced segment carries `review.speaker_reviewed: false` and
      `review.locked: false` — per INV-3, nothing here is auto-confirmed.
- [ ] Tests mock only the LLM API boundary (R2).
- [ ] `./venv/bin/python -m pytest -q` clean.

## Map links

Part C in `01-map.md` (AI extraction pipeline), step C-2 in `02-roadmap.md` Workload 4.
Invariant INV-3. Risk R-B.

## Dependencies

Depends on task 005 (character discovery pass) — needs a character registry to attribute
speakers against. Also depends on task 001 (schema) for whatever the actual segment
ownership/position columns turn out to be.

## Out of scope

Performance annotation beyond the structural `performance: null` default (007's job).
Cross-chapter reconciliation and registry merging (008's job). Any write path into the
live `chapter_segments` table (008's job, once reconciliation exists).

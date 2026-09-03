# Task 007 — Sparse performance annotation pass

Status: pending

Risk: external-reference, quality-sensitive (LLM-pipeline reliability is a genuine open
question per R-B in `01-map.md`; depends on model behavior not fully knowable at planning
time — this task file is a plan for IF the owner proceeds, not a guarantee this approach
works as designed)

## Goal

Build the third stage of the AI extraction pipeline: given one chapter's segmented,
speaker-attributed output from 006, call an LLM to add **sparse** performance metadata
(`performance.emotion`, `performance.delivery`, `performance.acting_note`) to segments
where — per
`design-docs/plans/proposals/performance_script_model/02-character-profiles-and-extraction-spec.md`
§9's own rule — "the source text or context clearly supports it." Most segments should
exit this pass with `performance: null` unchanged; this is explicitly not a "annotate
every line" pass.

## Why this matters, and why "sparse" is load-bearing

The spec is emphatic (§9, repeated in the prompt in `05-ai-extraction-agent-prompt.md`):
"Most dialogue should not have performance metadata. Only add performance metadata when
the source text or strong context indicates it." An over-eager model that annotates every
line with confident-sounding emotion/delivery data would be **worse** than one that
annotates nothing, because it would silently degrade the audiobook's rendering (every line
performed with invented emphasis) while looking maximally "complete" to a reviewer skimming
output volume rather than quality. This task's core engineering problem is enforcing
restraint against a model's natural tendency to fill in every field it's given a schema
slot for.

## Dependency on task 002 (parallel — reference only, don't assume its content)

This pass's exact output shape for `performance_data` must match the canonical JSON schema
being drafted in parallel by task **002 — canonical `performance_data` JSON schema +
validation** (`design-docs/plans/active/performance_script_model_execution/tasks/002-...md`,
exact filename TBD — it is being written concurrently by a different agent and its content
has not been read here). **Do not assume this task file's example JSON below is the final
contract** — before implementing, read task 002's actual output once it exists and
reconcile this pass's structured-output schema against it field-for-field. If task 002
hasn't landed yet when this task starts, treat that as a hard blocker (per `02-roadmap.md`'s
dependency graph: 007 depends on both 006 and 002) — do not invent a competing shape and
hope they match later.

**Update (2026-07-16, task 002 landed in the W-PERF safe-foundation PR):** the actual schema
is `app/domain/chapters/performance_schema.py`'s `PerformanceData`, validated via
`validate_performance_data(raw: dict) -> PerformanceData`. Critical gotcha for this task's
output-parsing code: `PerformanceData` uses Pydantic `extra="forbid"` and models **only**
the fields doc-01 puts on a segment that are *not* already promoted to dedicated
`chapter_segments` columns by task 001 (`speaker.confidence`, `speaker.evidence`,
`review.needs_human_review`, `review.locked`). This pass's structured-output parser MUST
strip `id`, `sequence`, `text`, `speaker`, and the promoted review fields from its raw model
output before calling `validate_performance_data()` — passing the full segment object
through unmodified will raise `PerformanceDataValidationError` on the first extra field.
See `design-docs/specs/performance-script-format.md` for the full shape and
`app/domain/chapters/performance_schema.py`'s module docstring for the review-object split
rationale.

## Exact contract to produce (from the proposal doc — subject to reconciliation with 002)

Per `02-character-profiles-and-extraction-spec.md` §5's dialogue example:

```json
"performance": {
  "emotion": {
    "primary": "fear",
    "secondary": ["urgency", "protectiveness"],
    "intensity": 0.76,
    "valence": -0.7,
    "arousal": 0.82,
    "confidence": 0.8,
    "basis": "inferred_from_context"
  },
  "delivery": {
    "pace": "fast",
    "volume": "hushed",
    "pitch": "low",
    "range": "restrained",
    "pause_before_ms": 100,
    "pause_after_ms": 300,
    "emphasis": [{"text": "Don't", "level": "strong"}]
  },
  "acting_note": "Urgent warning, controlled but frightened."
}
```

Controlled delivery vocabularies (§6 of doc 02): pace (very_slow…very_fast), volume
(silent…screaming), pitch (very_low…very_high), range (flat…dramatic). Vocalization types
(laugh, sob, gasp, etc.) apply when `kind: "vocalization"`.

## Steps

1. **Wait for and read task 002's actual schema output before writing the prompt or any
   parsing code** — this is not optional groundwork, it's the literal contract this pass
   must satisfy. If 002 isn't done yet, this task cannot meaningfully start beyond the
   spike step below (which can use the proposal doc's shape as a placeholder, clearly
   marked as such, and re-validated once 002 lands).
2. **Spike before full build.** Run this pass against the same 2-3 real chapters used in
   005/006's spikes (reusing their segmented/attributed output). Manually review:
   - What fraction of segments get performance annotation? If it's a large majority rather
     than a sparse minority, the "sparse" constraint isn't holding and the prompt needs
     tightening before any production build.
   - For segments that DO get annotated, is the annotation actually supported by the text
     (a genuinely emotional/urgent line) or is it generic filler ("intensity: 0.5,
     pace: medium" on an ordinary line)?
   - Does `basis`/`confidence` on the emotion block reflect real textual support, or is it
     copy-pasted boilerplate regardless of input?
   Do not build the full production pipeline around this stage until a human has reviewed
   this spike's output and confirmed the sparsity constraint and annotation quality are
   both acceptable.
3. Build the annotation prompt, reusing 005/006's Anthropic client wrapper. Consider an
   explicit two-step instruction inside the prompt (per the spec's own recommended
   processing order, §2): first decide *whether* a segment needs annotation at all, only
   then decide *what* the annotation is — this is exactly the kind of restraint that a
   flat one-shot "here's the schema, fill in what applies" prompt tends to erode.
4. Add a post-hoc sparsity check in code (not just a prompt instruction): if the fraction
   of newly-annotated segments in a chapter's output exceeds some sanity threshold (e.g.
   most dialogue segments getting non-null `performance`), flag the whole chapter's
   annotation output for mandatory human review rather than trusting it silently — this is
   a cheap, concrete guardrail against exactly the failure mode described in "Why this
   matters" above.
5. Add tests per `testing-standards.md`: mock the LLM boundary only (R2); assert the
   sparsity-check guardrail actually trips when fed a mock response that over-annotates
   (revert-check it — confirm the test fails without the guardrail code, passes with it).

## Acceptance criteria

- [ ] Task 002's actual `performance_data` schema has been read and this pass's structured
      output reconciled against it — no independently-invented shape shipped without that
      reconciliation.
- [ ] Validation spike run against real chapters; a human reviewer has confirmed both (a)
      the sparsity constraint holds in practice (most segments stay unannotated) and (b)
      annotations that do appear are genuinely text-supported, not generic filler — both
      are preconditions for this task being done.
- [ ] A code-level sparsity guardrail exists and has a test proving it trips on an
      over-annotating mock response.
- [ ] Every annotation carries `basis`/`confidence` and, where inferred, is flagged for
      review per the segment-level review rules already established in 006.
- [ ] Tests mock only the LLM API boundary (R2).
- [ ] `./venv/bin/python -m pytest -q` clean.

## Map links

Part C in `01-map.md` (AI extraction pipeline), step C-3 in `02-roadmap.md` Workload 4.
Also connects to Part B (canonical JSON format) via its dependency on task 002. Risk R-B.

## Dependencies

Depends on task 006 (segmentation + speaker attribution — this pass annotates its output)
and task 002 (canonical `performance_data` JSON schema — defines the exact output shape
this pass must produce; being drafted in parallel, reconcile against its actual content
once available, don't assume this task file's example JSON is final).

## Out of scope

Reconciliation and cross-chapter registry merge (008). Rendering-mode translation (003) —
this task only produces the canonical `performance_data`, not its per-target rendered
form. Deciding the 5 rendering-mode values per segment (`rendering.standard_audiobook`
etc.) beyond whatever default 006 already set — that mapping belongs to Part B/003, not
this annotation pass.

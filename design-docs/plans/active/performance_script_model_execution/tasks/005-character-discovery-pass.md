# Task 005 — Character discovery + profile creation pass

Status: pending

Risk: external-reference, quality-sensitive (LLM-pipeline reliability is a genuine open
question per R-B in `01-map.md`; depends on model behavior not fully knowable at planning
time — this task file is a plan for IF the owner proceeds, not a guarantee this approach
works as designed)

## Goal

Build the first stage of the AI extraction pipeline: given one chapter's raw text (and,
for chapters after the first, the running character registry carried forward from prior
chapters), call an LLM to produce the `characters[]` portion of the
`audiobook_analysis_result` envelope — character discovery (who appears) plus initial
profile creation (aliases, source_profile, voice_guidance, review flags) as specified in
`design-docs/plans/proposals/performance_script_model/02-character-profiles-and-extraction-spec.md`
§2 (steps 1-2) and §4, using the prompt shape in
`design-docs/plans/proposals/performance_script_model/05-ai-extraction-agent-prompt.md`.

This task does NOT do segmentation or speaker attribution (006) or performance annotation
(007) — its only output is the `characters[]` array (plus `document` envelope metadata),
scoped to one chapter's discovery/profile-creation pass.

## Why this matters

This is the foundation every later pipeline stage depends on: 006's speaker attribution
needs a character registry to attribute dialogue against, 008's reconciliation needs
per-chapter character lists to merge across the book. Get discovery wrong (miss a
character, duplicate one, hallucinate a trait) and the error propagates through every
downstream stage — this is exactly the kind of compounding risk `01-map.md` R-B flags.

## Critical scoping correction — no LLM client exists in this codebase yet

Before writing any prompt-calling code: this repo has **no existing LLM-client wrapper**.
Verified by grep (`anthropic`, `openai`, structured-output/tool-use call sites across
`app/` and `plugins/`) — nothing matches. The map's suggestion to imitate
`cast_voices()` in `app/domain/voices/metadata.py:332` as "the INV-3 precedent" is right
about the **suggestion/never-auto-apply pattern** (ranked recommendations + a
`needs_input`/review flag, never a direct write to confirmed state) but `cast_voices()`
itself makes **no LLM call at all** — it is a pure rules-based keyword/attribute scorer
(`_score_voice`, same file, lines 273-329). There is no existing LLM-client wrapper,
prompt-template mechanism, or structured-output plumbing anywhere in this codebase to
reuse. This task is the first one that has to build that plumbing (an Anthropic API
client wrapper — API key config, request/response handling, retry/error handling) from
scratch, or explicitly decide to depend on a shared "LLM client" task carved out before
this one starts. Flag this to the owner/executor before estimating this task's size —
it's a new category of external dependency (network call to a paid third-party API) that
nothing else in the backend currently has.

## What the research doc validated vs. left open (read before implementing)

`design-docs/plans/proposals/research_character_brief_extraction_and_persona_casting.md`
is the companion research gating this whole workload (R-B). Key points this task must
respect:

- **Use provider-native structured output / tool-use, not plain "return JSON" prompting.**
  The existing `05-ai-extraction-agent-prompt.md` prompt only says "Return JSON only... do
  not include markdown" — that's exactly the fragile unconstrained-JSON pattern the
  research found has documented failure modes (8-15% malformed-JSON rates without
  provider enforcement). OpenAI's constrained-decoding structured outputs is confirmed
  reliable (~100% schema adherence); **Anthropic's and Gemini's specific structured-output
  mechanisms were NOT confirmed either way in that research pass** (claims about both were
  refuted on verification). Since this repo would naturally call Anthropic's API, **verify
  Anthropic's current tool-use / structured-output mechanism directly against
  platform.claude.com docs before writing the extraction call** — do not assume the
  OpenAI-specific findings transfer.
- **The chapter-by-chapter rolling-registry chunking strategy (the proposal's own
  recommended workflow, §10 of doc 02) is neither validated nor debunked.** Real published
  systems use either human-in-the-loop merge (Portrayal) or hierarchical multi-agent
  pipelines (NexusSum), not a pure automatic rolling registry — this design has no
  confirmed prior art either way. Do not treat it as settled; the validation spike below
  is exactly where this gets tested against this project's own chapters.
- **LLMs extract personality/speech-style traits more reliably than
  event/plot-continuity or evidence-quote fields**, per one high-confidence primary
  source. Weight this task's review-flag defaults accordingly: `source_profile.age`,
  `accent_or_dialect`, and `evidence` arrays deserve tighter review gating than
  `personality_traits`/`speech_style`.
- **No confirmed cost/latency benchmark exists for this pipeline at book scale.** This
  must be measured empirically against this project's actual chapter lengths (see Steps
  below), not assumed from the literature.

## Exact contract to produce

Per `02-character-profiles-and-extraction-spec.md` §3-4 and the matching schema in
`05-ai-extraction-agent-prompt.md`, this pass's output is the `characters[]` array of the
`audiobook_analysis_result` envelope:

```json
{
  "schema": "audiobook_analysis_result",
  "schema_version": "0.1.0",
  "document": { "book_id": "...", "chapter_id": "...", "source_type": "novel", "language": "en", "analysis_scope": "chapter" },
  "characters": [
    {
      "id": "char_elena_marrow",
      "name": "Elena Marrow",
      "display_name": "Elena",
      "role": "major_character",
      "character_type": "fictional_person",
      "aliases": [{"value": "Elena", "type": "name", "confidence": 1.0}],
      "source_presence": {"first_seen": {"paragraph_index": 4, "sentence_index": 2}, "speaking_segment_count": 0, "mentioned_segment_count": 0},
      "source_profile": {"age": {...}, "gender": {...}, "accent_or_dialect": {...}, "speech_style": {...}, "personality_traits": [...], "physical_description": [...], "social_role": {...}},
      "voice_guidance": {"casting_notes": "...", "default_delivery": {...}, "accent": null, "avoid": [...]},
      "voice_casting": {"voice_profile_id": null, "casting_status": "unassigned", "reviewed": false},
      "review": {"needs_review": true, "review_reasons": [...], "locked": false}
    }
  ]
}
```

Controlled vocabularies (roles, character_type, alias types, basis values) are fixed lists
in `02-character-profiles-and-extraction-spec.md` §6 — do not invent new enum values.

Every `source_profile` claim must carry `basis` + `confidence` + `evidence` (quote +
paragraph/sentence index); per the spec's own rule (§1), if a fact isn't supported by the
text, the field must be `null` or omitted, never invented.

## Human-review rules for this pass (§8 of doc 02)

Flag a character `needs_review: true` when: age is inferred, accent is inferred, major
voice guidance is inferred, multiple aliases may refer to the same person, or character
identity may duplicate another character already in the registry. `locked: false` and
`ai_suggested: true` on every character this pass creates or updates — per INV-3
(`01-map.md`), this pass must never write directly into a confirmed state.

## Steps

1. **Spike first — do not build the full pipeline before this.** Hand-run (or script a
   minimal one-off call) this pass's prompt against 2-3 real chapters already in this
   repo's test fixtures or a real project's chapters. Manually review the output:
   - Are named characters actually found, with no hallucinated ones?
   - Are aliases/pronouns correctly attributed?
   - Does `source_profile` respect the "omit if unsupported" rule, or does the model
     invent age/accent/personality details not in the text?
   - Does the model's raw response actually parse as valid JSON matching the schema, and
     how often does it not?
   - Record actual token counts and per-call cost/latency for these real chapters — this
     is the empirical data the research doc says doesn't exist yet.
   Do not proceed to production-pipeline code until this spike's output quality has been
   reviewed by a human and judged acceptable (see Acceptance criteria).
2. Decide and build (or explicitly depend on a shared prerequisite task for) the Anthropic
   API client wrapper: API key from config/env (new `app/core/config.py` entry, following
   existing env-var-driven config patterns), request construction using Anthropic's
   current tool-use/structured-output mechanism (verified per above, not assumed),
   response parsing, and error handling (timeout, malformed response, rate limit) that
   degrades to a clear pipeline-level failure rather than a silent bad write.
3. Build the discovery/profile-creation prompt from `05-ai-extraction-agent-prompt.md`,
   adapted to use real structured-output enforcement instead of plain "return JSON"
   instruction text.
4. Wire in the registry-carry-forward input: for chapter N > 1, pass the existing
   character registry (from chapter N-1's reconciled state, once 008 exists — for this
   task, a stub/placeholder registry input is acceptable since 008 doesn't exist yet) as
   context, matching the "reuse existing character IDs, don't merge speculatively" rule.
5. Persist raw per-chapter discovery output somewhere inspectable (not yet written to the
   `characters` DB table — that's reconciliation's job in 008) so the validation spike and
   later stages can be manually reviewed before any DB write path exists.
6. Add unit/integration tests per `testing-standards.md`: mock the LLM call boundary (R2 —
   the LLM API is "outside the unit under test," mock it), assert the parsing/validation
   logic around a fixed mock response, and assert the `needs_review`/`ai_suggested`
   defaults are always set correctly regardless of what the mock LLM output says (INV-3
   enforcement should not depend on trusting the model's own review flags).

## Acceptance criteria

- [ ] Validation spike run against at least 2-3 real chapters; a human reviewer has looked
      at the raw discovery output and confirmed it is not hallucinating characters/traits
      and is usefully accurate on the sample — **this is a precondition for the rest of
      this task being considered done, not a nice-to-have**. If the spike reveals the
      approach doesn't work well enough, stop and report back rather than building
      production code around a bad pipeline.
- [ ] Anthropic client wrapper (or confirmed shared dependency) exists, uses verified
      current structured-output/tool-use mechanism, and handles malformed-response /
      timeout / rate-limit failure paths without silent data loss.
- [ ] Discovery pass produces `characters[]` matching the schema in
      `02-character-profiles-and-extraction-spec.md` §4, with every AI-created character
      carrying `ai_suggested: true`, `locked: false`, and appropriate `needs_review`
      flags per §8's rules.
- [ ] No field is populated when the source text doesn't support it (`basis: "not_stated"`,
      `value: null`) — spot-checked against the spike's real chapters, not just unit-test
      mocks.
- [ ] Tests mock only the LLM API boundary (R2), not this module's own parsing/validation
      logic.
- [ ] Empirical cost/latency numbers for the spiked chapters are recorded somewhere
      reviewable (even a plain note in this task file's own change) — closes the open
      question the research doc flagged.
- [ ] `./venv/bin/python -m pytest -q` clean.

## Map links

Part C in `01-map.md` (AI extraction pipeline), step C-1 in `02-roadmap.md` Workload 4.
Invariant INV-3 (never auto-apply). Risk R-B (pipeline reliability/cost is unresolved).

## Dependencies

Depends on task 001 (additive schema migration) landing first — this pass's output must
map cleanly onto the `characters` table's new columns, but this task itself only needs the
columns to exist, not the reconciliation write-path (008) to exist yet.

## Out of scope

Segmentation, speaker attribution (006), performance annotation (007), cross-chapter
reconciliation/registry merge logic (008), and any write path into the live `characters`
DB table (that's 008's job, once reconciliation exists to decide what "confirmed" means).
Building a general-purpose LLM client abstraction for the whole codebase is in scope only
as far as this pipeline needs it — do not over-engineer a multi-provider abstraction layer
speculatively; Anthropic-only is fine for now per the research doc's own recommendation.

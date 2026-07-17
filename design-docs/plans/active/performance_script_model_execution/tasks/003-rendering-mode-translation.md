# Task 003 — Rendering-mode translation layer (5 modes × 8 values)

Status: done (2026-07-16, W-PERF safe-foundation PR)

Risk: multi-file — this is the single translation layer every downstream exporter must go through;
per INV-2 (`01-map.md`), no exporter is allowed its own ad-hoc interpretation of raw
`performance_data`. Getting this layer's resolution logic wrong propagates identically into all 5
exporters (task 011) and the degradation-rules engine (task 010).

## Goal

Build the translation layer that takes a segment's canonical, validated `performance_data` (the
types task 002 defines) plus its `kind` and any per-segment `RenderingOverride`, and resolves — for
each of the 5 rendering modes doc 01 specifies — which of the 8 rendering values applies, following
doc 01's precedence chain. This is pure resolution logic: it decides *what should happen* to a
segment in a given mode (speak it, omit it, convert it, hide it). It does **not** produce
engine-specific output (SSML tags, Polly JSON, etc.) — that is task 011's job, gated behind task
010's capability/degradation matrix, both of which consume this layer's output rather than reading
`performance_data` directly.

## Why this matters

`01-map.md`'s Connections: *"B ↔ D: the canonical JSON format (B) is the single source every
exporter (D) reads from — D's 5 exporters must never read raw `performance_data` directly with
their own ad-hoc interpretation; they all go through B's rendering-mode translation layer."* This is
INV-2 verbatim. Without this task, task 011's 5 exporters (`proposals/performance_script_model/
04-export-targets.md`'s `PlainScriptExporter`, `SSMLExporter`, `AzureSSMLExporter`,
`PollySSMLExporter`, `ElevenLabsPromptExporter`, `OpenAISpeechExporter`, `ReviewScriptExporter` —
7 named exporters in the proposal, `01-canonical-json-format.md:420-430`, spanning the 5 provider
targets the roadmap groups as "SSML, Polly, Azure, ElevenLabs, Google") would each reimplement their
own rendering-mode logic, guaranteeing drift between what the script view shows a human and what
actually gets synthesized.

## Exact files

- New backend module: `app/domain/chapters/rendering.py` — the resolution function(s) + the
  precedence-chain logic. Depends on task 002's models
  (`app/domain/chapters/performance_schema.py`'s `RenderingMode`, `RenderingValue`,
  `RenderingOverride`, `PerformanceAnnotation`, `SegmentKind`) — import them, do not redefine them.
- No frontend changes in this task — mode/value resolution is a backend-only concern feeding
  server-side exporters (task 011) and the export/preview API. If a future task surfaces resolved
  decisions to the frontend (e.g. for `script_view`/`review_view` rendering in the UI), that is a
  consumer of this layer's output, not part of building the layer itself (see Out of scope).

## Current shape (verified)

- Nothing exists yet — there is no rendering-mode resolution code in this repo today. This is new,
  self-contained domain logic sitting on top of task 002's types.
- Doc 01 gives the mode/value vocabulary in full (§8, `01-canonical-json-format.md:313-338`) but
  only **partial, per-example** mode→value mappings, not an exhaustive kind × mode matrix:
  - Attribution (§5.3, `:142-147`): `standard_audiobook: spoken`, `enhanced_audiobook: spoken`,
    `audio_drama: omit`. Only 3 of 5 modes covered; `script_view`/`review_view` not shown.
  - Action context (§5.4, `:168-173`): `standard_audiobook: spoken`, `enhanced_audiobook: spoken`,
    `audio_drama: convert_or_omit` — note `convert_or_omit` is **not** one of the 8 canonical
    `RenderingValue`s listed in §8 (`:329-338`: `spoken`, `spoken_by_narrator`, `omit`,
    `convert_to_vocalization`, `convert_to_sfx`, `use_as_context_only`, `visible`, `hidden`). This is
    a genuine inconsistency in the proposal doc itself — resolve it in this task (most likely
    `convert_or_omit` should map to `use_as_context_only`, matching the segment's own
    `inferred_state` mechanism, but confirm against the doc's intent rather than assuming; flag to
    the owner if ambiguous rather than silently picking one).
  - Vocalization (§5.5, `:200-204`) uses a different shape entirely — `spoken_text: null` +
    `export_strategy: "engine_vocalization_or_prompt"` — not a mode→value map at all. This task must
    decide how vocalization's `export_strategy` composes with the standard 5-mode matrix (does it
    replace mode resolution for this kind, or does it sit alongside it as an extra hint the resolver
    consults when the resolved value is `convert_to_vocalization`?).
  - `script_view` and `review_view` (2 of the 5 modes) **appear nowhere in a per-segment example** —
    only named in the §8 mode list. Their default resolution per segment kind is undefined by the
    doc and must be designed in this task (reasonable default: both are internal-UI modes, not
    synthesis targets, so most kinds default to `visible`; segments already `omit`ted from every
    audio mode might still resolve to `visible` in `review_view` so a human can see what was
    dropped — a real design decision, not a mechanical lookup).
  - §9's precedence chain (`:348-358`) is fully specified: `studio_override` > `explicit source fact`
    > `AI inference` > `character default` > `scene default` > `chapter default` > `book default` >
    `engine default`. This task must implement resolution walking down this chain, not just apply
    the segment's own `RenderingOverride` in isolation — "character default", "scene default",
    "chapter default", and "book default" imply defaults living somewhere above the segment (likely
    on `characters.voice_guidance` per `03-db-schema-changes.md:74`, and on chapter/book-level
    settings not yet modeled anywhere in this repo — flag any default tier that has no existing home
    as an open question rather than inventing new tables silently).

## Target shape

- `resolve_rendering(segment: CanonicalSegment, mode: RenderingMode, defaults: RenderingDefaults) ->
  RenderingDecision` where:
  - `CanonicalSegment` bundles the segment's `kind`, its parsed `performance_data`
    (`PerformanceAnnotation` + any `RenderingOverride`), and enough character/scene/chapter/book
    context to walk the §9 precedence chain (exact shape of `RenderingDefaults` is this task's to
    design — it's the "character default / scene default / chapter default / book default / engine
    default" tiers doc 01 names but doesn't structure).
  - `RenderingDecision` returns at minimum: the resolved `RenderingValue`, the `spoken_text` to use
    if the value implies speaking something (may differ from `text` — e.g. `spoken_by_narrator`
    substitutes narrator delivery, `convert_to_vocalization`/`convert_to_sfx` substitute a
    description or vocalization cue instead of the literal source text), and which precedence tier
    the decision came from (needed downstream by the review-state UI, task 012, to show *why* a
    segment renders the way it does — AI-suggested vs. studio-overridden).
- A full kind × mode default matrix, filling every cell doc 01's partial examples leave unspecified,
  documented in the module (not left to reviewer inference) — e.g. `narration`/`dialogue` default to
  `spoken` in every audio mode and `visible` in both view modes; `silence`/`sfx`/`music`/`ambience`
  interact with modes that don't render audio directives at all (`script_view`/`review_view`) by
  defaulting to `visible` with a description rather than `spoken`.
- One resolution entry point used identically by: (a) the export layer (task 010's degradation
  matrix consumes `RenderingDecision`, never `performance_data` directly — this is the INV-2
  boundary), and (b) any future preview/script-view surface that needs to show a human what a
  segment will do in a given mode before rendering.

## Steps

1. Confirm task 002 has landed and import its `RenderingMode`/`RenderingValue`/`RenderingOverride`/
   `SegmentKind`/`PerformanceAnnotation` types rather than redefining them here.
2. Design and document `RenderingDefaults` — the shape carrying character/scene/chapter/book/engine
   default tiers from §9's precedence chain. Identify which tiers already have a home in this repo
   (character defaults plausibly via `characters.voice_guidance`, task 001) and which don't (scene,
   chapter, book defaults) — flag the missing tiers rather than fabricating new schema for them in
   this task; a tier with no data source simply falls through to the next tier below it for now.
3. Build the full kind × mode default matrix (12 kinds × 5 modes = 60 cells), filling gaps doc 01's
   partial examples leave, with each non-obvious cell's reasoning documented inline.
4. Resolve the two doc-01 inconsistencies found above: `convert_or_omit`'s mapping onto one of the 8
   canonical values, and how vocalization's `export_strategy` composes with mode resolution. Don't
   silently paper over these — note the resolution and reasoning in the module docstring so a future
   reader (or the owner, if this needs a call) can see what was decided and why.
5. Implement `resolve_rendering()` walking the §9 precedence chain: segment-level `RenderingOverride`
   (studio_override / explicit source fact / AI inference tiers, distinguished via task 001's
   `ai_suggested`/`locked` columns) first, falling through the default matrix and `RenderingDefaults`
   tiers only when the segment has no explicit override for that mode.
6. Write tests covering: every doc-01 example segment resolves to the value the doc's own example
   shows for the modes it specifies; a segment with no `RenderingOverride` at all falls through to
   the kind × mode default matrix; a `locked` segment's studio override is never superseded by a
   lower-precedence tier.
7. Bump the relevant `design-docs/specs/` doc + changelog row per this repo's binding directive.

## Acceptance criteria

- [ ] `app/domain/chapters/rendering.py` exposes `resolve_rendering()` returning a `RenderingDecision`
      for any `(segment, mode)` pair across all 12 kinds and all 5 modes — no kind/mode combination
      raises or falls through unresolved.
- [ ] Every doc-01 per-segment rendering example (§5.3, §5.4, §5.5) resolves to the value(s) shown in
      the doc for the modes it specifies, verified by test.
- [ ] The precedence chain (§9) is implemented and tested: a `locked`/studio-overridden decision is
      never overridden by AI inference or any default tier.
- [ ] The `convert_or_omit` inconsistency and vocalization's `export_strategy` composition are both
      resolved with documented reasoning, not left ambiguous in code comments as a TODO.
- [ ] No exporter code exists yet that reads `performance_data` directly (there shouldn't be any —
      tasks 010/011 haven't started) — this task's job is only to make `resolve_rendering()` the
      obvious, well-tested single entry point for them to consume later.
- [ ] `./venv/bin/python -m pytest -q` clean; relevant spec file bumped with a changelog row.
- [ ] A code-map changelog-queue entry appended (new module + INV-2's enforcement point).

## Map links

Part B (`B-render`) in `01-map.md`'s Parts table and `02-roadmap.md`'s Workload 2. Directly
implements INV-2 (*"One canonical format, many renderers... never a target-specific
reinterpretation of raw `performance_data`"*). Feeds task 010 (capability matrix + degradation-rules
engine) and, through it, task 011 (the 5 exporters) — **both 010 and 011 are separate tasks another
agent is drafting; this task's `RenderingDecision` output is their required input, not something
this task builds consumers for.** Also feeds task 012 (review-state UI) via the precedence-tier
field on `RenderingDecision`, and relates to Risk R-D (`01-map.md`: *"Export layer's 5 targets have
very different capability surfaces... needs a clear per-target capability matrix before
implementation"*) — R-D's capability matrix is task 010's concern, downstream of this task's
mode/value resolution, not this task's.

## Dependencies

Task 002 (canonical JSON schema) — hard dependency, imports its types directly. Transitively depends
on task 001 (schema migration) and task 000 (cross-plan reconciliation) through 002.

## Out of scope

- The capability matrix and degradation-rules engine (task 010) — this task resolves *what* should
  happen to a segment in a given mode; task 010 decides *how* a specific engine's limited capability
  surface approximates that decision when it can't do exactly what was resolved (e.g. no prosody
  support → convert to acting-note text).
- The 5 exporters themselves (task 011: SSML/Polly/Azure/ElevenLabs/Google, or the 7 named
  exporters in `04-export-targets.md`) — this task produces `RenderingDecision` objects; task 011
  turns them into actual engine-specific output (SSML markup, provider JSON, prompt text). Do not
  write any exporter code here, even a minimal one, as a "proof it works" — that duplicates task 011
  and risks the two diverging.
- Wiring resolved decisions into the frontend script/review view (task 012) — this task's output is
  consumable by a future frontend surface, but building that surface is task 012's job.
- New scene/chapter/book default-tier schema/tables for the §9 precedence chain's upper tiers — if
  those tiers have no existing data source, this task documents the gap and falls through to the
  next tier; it does not design new persistence for them.

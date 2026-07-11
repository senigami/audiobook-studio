# Overview — Performance Script Model Execution

## The task

Build W-PERF: per-span performance metadata (SSML-ish rate/pitch/volume/style directives on
segments), rich character profiles (aliases, source-text traits, voice guidance), an AI extraction
pipeline that populates both from a raw chapter, and a multi-target export layer (SSML, Polly,
Azure, ElevenLabs, Google) with capability-aware degradation.

## Schedule decision — read this first, this is the real gate

`TASKS.md`'s W-PERF entry says: *"Design decision: schedule it? Shares the span/DB model with
sub-sentence assignment (012) — the two must ship together or the DB migrates twice."*

**This session's research (2026-07-10) found that premise is false.** Verified by reading the actual
`chapter_segments`/`characters` DDL (`app/db/core.py:219-246`) against both the W-PERF proposal
(`proposals/performance_script_model/03-db-schema-changes.md`) and sub-sentence assignment's actual
shipped implementation:

- Sub-sentence assignment (`app/domain/chapters/operations.py:385-502`, `_apply_range_assignment` /
  `_split_segment_at_offset`) achieves sub-sentence spans by **splitting the `text_content` string
  and shifting integer `segment_order`** — it added **zero new columns**. There is no "first
  migration" for W-PERF to avoid duplicating; sub-sentence assignment never needed one.
- W-PERF's proposed columns (`performance_data`, `speaker_confidence`/`speaker_basis`/
  `speaker_evidence`, `needs_review`/`review_reasons`/`locked`/`ai_suggested` on `chapter_segments`;
  a parallel set on `characters`) are **independent, additive, nullable columns** — they don't touch
  `segment_order` and don't need the `span_start`/`span_end` byte-offset columns the proposal
  originally assumed (`03-db-schema-changes.md:46`, "replaces sentence-level position as ownership
  unit" — this line is now factually wrong and should be corrected in the proposal doc, not acted
  on).

**What this means:** the scheduling decision is no longer blocked on migration-ordering. It's now a
genuine, real-merits question: **is this large body of work (see Scope/Size below) worth doing now,
does the owner accept the AI-extraction pipeline's reliability/cost unknowns, and — caught in
adversarial review, a real addition to this decision, not just an implementation detail — is the
owner comfortable with this pipeline sending full manuscript text to a third-party cloud LLM API
(Anthropic)?** This project's own positioning elsewhere treats "local-first, no-cloud" as a real
product stance, and this is the first pipeline in the codebase that would send raw manuscript
content off-device. Task 005 requires an explicit consent gate (matching the existing HuggingFace
voice-import consent pattern) before this runs on real content — but whether to build this workload
*at all* is partly a question of whether that trade-off (a cloud call on manuscript text, even
consent-gated) fits this product's direction, not purely an engineering cost question. Flag this to
the owner alongside the reliability/cost unknowns the research doc already flagged (see
proposal's own companion research doc as needing validation)? This plan is written so it's ready to
execute the moment that answer is yes — but this overview does not answer it for the owner.

## Scope and realistic size

This is **large, multi-milestone work**, not a quick addition — confirmed by reading all 5 proposal
docs in full:

1. **DB schema (small, safe, genuinely ready now)** — purely additive `ALTER TABLE ... ADD COLUMN`
   on two tables, no data migration, matches this repo's existing migration pattern exactly.
2. **Canonical JSON format + rendering-mode logic (medium)** — the `performance_data` contract and
   its 5 rendering modes × 8 rendering values (proposal doc 01 §8).
3. **Character profiles + AI extraction pipeline (large — the biggest single chunk)** — a multi-pass
   LLM pipeline (character discovery → segmentation → speaker attribution → performance annotation
   → reconciliation), a large structured-output schema, chapter-by-chapter registry-carry-forward,
   and review-queue UX for surfacing AI suggestions to a human. This alone is realistically
   multi-week, with genuine reliability/cost unknowns the proposal's own companion doc
   (`research_character_brief_extraction_and_persona_casting.md`) flags as needing validation before
   committing engineering time.
4. **Multi-target export layer (medium-large)** — 5 distinct exporters (W3C SSML, Polly, Azure,
   ElevenLabs, Google), a degradation-rules engine, and a new plugin-manifest `behavior` block field
   that "is not yet defined in the plugin contract" (proposal doc 04 §, also an open `TASKS.md`
   line item) — this is new plugin-contract surface area, not just internal application code.
5. **Frontend review-state UI (cross-cutting)** — AI-suggested vs. human-confirmed visual treatment,
   locked/needs-review flows — shares real estate in `ScriptView.tsx` with sub-sentence assignment
   and the chapter-editor-catalog-completion plan's Cast mode work (see `01-map.md`'s Risks).

## In scope / out of scope

**In scope:** all 5 areas above, decomposed into ordered workloads (`02-roadmap.md`).

**Out of scope:** actually deciding to schedule this (owner call, see above); the companion research
validation of the AI-extraction approach itself (that's the job of
`research_character_brief_extraction_and_persona_casting.md`, already written — this plan assumes
its conclusions, doesn't re-derive them); building the plugin-manifest `behavior` block additions
for engines OTHER than declaring SSML-capability fields the export layer needs (a broader plugin-SDK
contract change is a separate, bigger conversation than this plan's export-layer task).

## Success criteria

Each of the 5 scope areas is either fully built and live-verified, or explicitly and visibly
deferred with a reason (not silently dropped) if the owner descopes part of it after seeing this
plan's real size. The DB schema (area 1) can land and be verified independently of whether the
owner ultimately greenlights the full AI-extraction pipeline — it's useful groundwork either way
(manual performance-annotation entry, e.g. via the chapter-editor-catalog-completion plan's Cue
Editor, doesn't require the AI pipeline to exist).

## Cross-plan connection worth knowing

The `engine_directives`/`performance_data` shape this plan proposes for segments **overlaps
conceptually with the sibling `chapter_editor_catalog_completion` plan's Stage Direction/Performance
Cue work** (that plan's task 005 adds `render`/`engine_directives` fields to `chapter_segments` for
manually-authored cues). **These two plans should reconcile their schema before either lands** —
building two independent, slightly-different JSON blobs for "per-segment performance metadata" on
the same table would be a real, avoidable duplication. See `01-map.md`'s Risks section.

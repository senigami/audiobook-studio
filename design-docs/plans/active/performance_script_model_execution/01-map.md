# Implementation Map — Performance Script Model Execution

## Big picture

```
Chapter raw text
      │
      ▼
AI extraction pipeline (multi-pass LLM, Part C)
   character discovery → segmentation → speaker attribution →
   performance annotation → reconciliation
      │                                    │
      ▼                                    ▼
characters (rich profile columns, Part A)   chapter_segments (performance_data +
                                             review columns, Part A)
      │                                    │
      └──────────────┬─────────────────────┘
                      ▼
        Review-state UI (Part E) — human confirms/edits AI suggestions
                      │
                      ▼
        Canonical JSON rendering (Part B) ──► Multi-target export layer (Part D)
                                                (SSML / Polly / Azure / ElevenLabs / Google)
```

## Parts

| # | Part | Files | Responsibility |
|---|---|---|---|
| A | DB schema | `app/db/core.py` (DDL + migration pattern, e.g. lines 219-289's existing `ALTER TABLE` additions to imitate) | Additive nullable columns on `chapter_segments` (`performance_data`, `speaker_confidence`, `speaker_basis`, `speaker_evidence`, `needs_review`, `review_reasons`, `locked`, `ai_suggested`) and `characters` (`display_name`, `role`, `character_type`, `aliases`, `source_presence`, `source_profile`, `voice_guidance`, plus the same review-flag set). **Confirmed safe, independent, no data migration needed** (see `00-overview.md`'s Schedule decision). |
| B | Canonical JSON format + rendering | `proposals/performance_script_model/01-canonical-json-format.md` (spec, read don't duplicate) | The `performance_data` contract shape; 5 rendering modes × 8 rendering values that translate the canonical format into engine-specific output. |
| C | AI extraction pipeline | New backend module (multi-pass LLM orchestration) | Character discovery → segmentation → speaker attribution → performance annotation → reconciliation, per-chapter with registry-carry-forward across chapters (a running character registry so chapter 5 knows about characters introduced in chapter 1). **Largest single part — see Risks.** |
| D | Multi-target export layer | New exporters (W3C SSML, Amazon Polly, Azure, ElevenLabs, Google) + a degradation-rules engine | Each engine/target has a different SSML/prosody capability subset; the degradation engine picks the best available approximation per target rather than failing or silently dropping data. |
| E | Review-state UI | `ScriptView.tsx` (shared with sub-sentence assignment and the chapter-editor-catalog-completion plan's Cast mode) | Visual treatment distinguishing AI-suggested vs. human-confirmed performance data; locked/needs-review flows surfaced to the user. |
| F | Plugin-contract addition | Plugin manifest `behavior` block schema (wherever engine capability flags are declared — check the existing manifest JSON-schema/validation, e.g. `app/tts_server/plugin_loader.py`'s manifest validation) | A new capability flag (e.g. `ssml_support`/`supports_per_span_voice`/`supports_emotion_style`) so the export layer and the render pipeline (shared with the sibling chapter-editor-catalog-completion plan's task 006) know which engines can consume performance directives. **Shared plumbing — see Connections.** |

## Connections

- **A is the prerequisite for everything else** — B, C, D, E all read/write the columns A adds. Land A first; it's small, safe, and independently useful even if C (the large AI pipeline) is later descoped or delayed.
- **C ↔ A**: the AI pipeline's structured output must match A's column shapes exactly — build A's exact JSON schema for `performance_data`/`source_profile`/etc. before writing C's LLM prompt/output-parsing code, or the pipeline will produce data the schema can't hold cleanly.
- **B ↔ D**: the canonical JSON format (B) is the single source every exporter (D) reads from — D's 5 exporters must never read raw `performance_data` directly with their own ad-hoc interpretation; they all go through B's rendering-mode translation layer.
- **F is shared plumbing with the sibling `chapter_editor_catalog_completion` plan's task 006** (that plan's Stage Direction/Performance Cue render-pipeline task also needs an engine SSML-capability flag). **Do not build two separate capability-flag mechanisms** — whichever plan lands first should define F once, and the other should consume it. Flag this explicitly to whoever executes either plan.
- **E ↔ chapter_editor_catalog_completion's Cue Editor (that plan's task 008)**: both write to segment-level performance/annotation data. **Reconcile the exact JSON shape between the two plans before either lands** (see Risks R-A below) — this is the single most important cross-plan coordination point in this entire multi-plan effort.

## Invariants

- **INV-1 — No second migration.** A's columns are additive and nullable; nothing in this plan should require a second schema pass or a data backfill of existing rows.
- **INV-2 — One canonical format, many renderers.** Every exporter (D) reads through B's canonical JSON + rendering-mode layer — never a target-specific reinterpretation of raw `performance_data`.
- **INV-3 — AI suggestions are never silently auto-applied.** Per this project's standing casting-contract precedent (`cast_voices()` in `app/domain/voices/metadata.py` — ranked suggestions only, never auto-apply), the AI extraction pipeline's output populates `ai_suggested`/`needs_review` flags for human confirmation — it must never write directly into a "confirmed" state.
- **INV-4 — Engines that can't consume a directive ignore it silently**, mirroring the sibling plan's INV-2 — no visible failure, no broken render, on an engine lacking a capability F declares.
- **INV-5 — One shared capability-flag mechanism (F), not two.** See Connections above.

## Risks & open questions

- **R-A (the most important cross-plan risk in this whole effort) — schema overlap with `chapter_editor_catalog_completion`.** That sibling plan's task 005 independently proposes `render`/`engine_directives` fields on `chapter_segments` for manually-authored Stage Direction/Performance Cue data. This plan's Part A proposes `performance_data` for AI-extracted performance metadata. **These may end up describing overlapping or duplicate concepts** (both are "per-segment performance/rendering metadata"). Before either plan's schema task executes, someone (the owner, or whichever executor picks up either plan's task 001/005 first) must read both plans' schema proposals side by side and decide: one unified JSON column serving both manual (Cue Editor) and AI-extracted (this plan) performance data, or two genuinely distinct columns with a documented reason they're separate. Do not let both land independently and silently diverge.
- **R-B — AI pipeline reliability/cost is a genuine open question**, not resolved by this plan. The proposal's own companion research doc exists specifically because this needs validation before committing to Part C's full scope. Treat Part C's task breakdown as a plan for IF the owner proceeds, not a guarantee it's the right approach — the companion research may recommend a different pipeline shape.
- **R-C — The plugin-manifest `behavior` block addition (F) is new SDK/contract surface**, which per this repo's binding directive ("every contract/manifest/schema declares an explicit version validated at load time") needs a version bump and validation, not an ad-hoc field addition — treat this with the same rigor as any other plugin-SDK contract change.
- **R-D — Export layer's 5 targets have very different capability surfaces** (Polly/Azure/Google support real SSML; ElevenLabs's prosody model is different; local engines like XTTS support none). The degradation-rules engine (D) needs a clear per-target capability matrix before implementation, not discovered ad hoc per exporter.

## Map links out

- Proposal docs (design source, not duplicated here):
  [`proposals/performance_script_model/`](../../proposals/performance_script_model/) (00-05, README).
- Companion research: [`research_character_brief_extraction_and_persona_casting.md`](../../proposals/research_character_brief_extraction_and_persona_casting.md).
- Sibling plan with schema overlap: [`chapter_editor_catalog_completion/01-map.md`](../chapter_editor_catalog_completion/01-map.md) (Parts E/F there).
- Precedent for INV-3 (no auto-apply): `app/domain/voices/metadata.py`'s `cast_voices()`.

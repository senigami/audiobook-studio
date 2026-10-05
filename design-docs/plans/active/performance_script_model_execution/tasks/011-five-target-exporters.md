# Task 011 — Five target exporters (SSML, Polly, Azure, ElevenLabs, Google)

Status: pending

Risk: multi-file — 5 separate exporters, each reading a different subset of the canonical
rendering-mode output and each with different capability assumptions (per task 010's matrix).

## Goal

Implement the 5 export targets `design-docs/plans/proposals/performance_script_model/
04-export-targets.md` specifies: W3C SSML 1.1 (baseline), Amazon Polly SSML, Azure Cognitive
Services SSML, ElevenLabs (plain text + API settings, not SSML), and Google Cloud TTS SSML. Each
exporter takes task 003's rendering-mode output, runs it through task 010's capability
matrix + degradation engine, and emits the target-specific payload the corresponding engine plugin
actually needs at render time.

## Why this matters

This is the payoff of Parts B and D from `01-map.md`: the canonical `performance_data` model only
has value once it can actually reach an engine in a form that engine understands. `INV-2` requires
every exporter to go through the rendering-mode translation layer (003) rather than reinterpreting
raw `performance_data` itself — this task is where that invariant is either honored or violated by
five separate pieces of code, so it needs deliberate shared scaffolding, not five independent
implementations that happen to look similar.

## Input dependencies

- **Task 010** (`010-capability-matrix-degradation-engine.md`, drafted alongside this file) — every
  exporter below calls into 010's capability matrix + degradation decision function rather than
  re-deriving its own "does this target support X" logic. Do not start an exporter's
  implementation before 010's matrix/engine interface is settled — read that file's actual shape
  once written, not just this file's description of it.
- **Task 004** (`004-ssml-capability-manifest-field.md`, being drafted in parallel by a different
  agent) — defines the plugin-manifest `behavior` block fields (`export_format`,
  `supports_per_span_voice`, `supports_emotion_style`, `supports_prosody`, `supports_break`, per
  doc 04 lines 110–121) that let an exporter be *selected* for a given engine at render time.
  This task's 5 exporters are the concrete implementations that field selects between; read
  004's final field names before wiring exporter selection, since this file's references to
  those field names are provisional (drawn from doc 04's example JSON, not yet a validated
  manifest schema).

## The 5 exporters are NOT equal effort — read this before estimating or splitting further

Doc 04's own structure (§1–§5) makes the size asymmetry explicit, and this task's steps below
weight accordingly:

- **W3C SSML (§1) — smallest.** A template emitting `<prosody>`, `<break>`, `<emphasis>`,
  `<phoneme>`, `<voice>`, `<say-as>`, `<speak>` from the rendering-mode values via the doc's value
  tables (pace→rate, volume→SSML volume, pitch→SSML pitch, lines 130–160). This is the foundation
  every SSML-based exporter below extends — build it first, and literally reuse its
  string-building for the others rather than re-templating from scratch.
- **Amazon Polly (§2) — small-to-moderate, built on W3C SSML.** Adds `<amazon:breath>`/
  `<amazon:auto-breaths>`, `<amazon:effect name="whispered">`, `<amazon:domain>`, and
  `<amazon:emotion name="excited|disappointed" intensity="...">` (2 emotions only, Neural voices
  only) on top of the W3C base. The one real wrinkle: "many `<prosody>` attributes have reduced
  support on Neural/long-form voices" (doc line 36) — this is a capability-matrix nuance (010),
  not new exporter logic, so Polly's exporter code itself stays close to W3C's size.
- **Azure (§3) — moderate, built on W3C SSML, richest tag surface.** Adds
  `<mstts:express-as style="" styledegree="" role="">` (the doc's own words: "the richest current
  support for emotion → delivery mapping," doc line 47), `<mstts:silence type="..." value="">`,
  and multilingual inline `<lang xml:lang="">`. More tags than Polly, but still a templated
  extension of the W3C base — the emotion→style value mapping table (doc lines 162–174, e.g.
  `fear`→`terrified`, `joy`→`cheerful`) is a lookup table this exporter owns, not new engine logic.
  `<mstts:viseme>` is explicitly out of scope per the doc ("lip-sync data (out of scope for
  audio-only)," line 44) — do not implement it.
- **Google Cloud TTS (§5) — small, W3C SSML baseline plus one extra.** Standard `<prosody>` via
  the W3C base, `<google:style-degree>` on **some voices only** (a real per-voice capability gap,
  not a blanket target capability — the exporter needs a way to represent "supported on this
  specific voice, not this target as a whole," which the other 4 targets don't need). Voice
  Cloning API custom-voice support is a **separate API from SSML entirely** and is out of scope
  for this exporter (it's a voice-provisioning concern, not a per-span export concern). Remember
  the capability-matrix gap flagged in task 010: doc 04's own Field Mapping Table doesn't include
  a Google column, so this exporter's supported-feature list is reconstructed from prose, not the
  table — implement conservatively and flag anything uncertain rather than assuming full W3C
  parity.
- **ElevenLabs (§4) — the largest and most divergent, roughly comparable in size to the other
  four combined.** Not a templated SSML extension at all — a genuinely different export shape:
  - Plain text output (no markup) sent to a named model (Multilingual v2 / Turbo v2.5).
  - A parallel **API settings payload** (`stability`, `similarity_boost`, `style`,
    `use_speaker_boost`) — this is structured data alongside the text, not embedded markup, so the
    exporter's output type is different from the other 4 (text + settings object, not a single
    markup string).
  - **Emotional prompting via prepended acting-note text** — per doc line 63, "the exporter should
    emit the acting note as a parenthetical before the line when `performance.acting_note` is
    set" — this is the exporter that receives the most degradation-engine traffic (task 010's
    rules 1 and 2 both convert into this exporter's acting-note slot for pace/pitch/volume/emotion
    when unsupported), so its acting-note accumulation logic needs the most care of the 5.
  - **Per-span voice** goes through the **Projects API (v2)**, described as "the closest
    ElevenLabs equivalent to our span model" (doc line 57) — richer scene/chapter-level voice
    assignment than the other 4 targets' simple `<voice name="">` tag. This may require its own
    payload shape (scene/chapter structure), not just a per-span field.
  - `<break time="">` is only "partially supported in some contexts" — the exporter must not treat
    ElevenLabs as break-capable uniformly; this interacts with task 010's degradation rules in a
    target-specific way the matrix needs to capture precisely (not just "ElevenLabs: break =
    partial" as a single boolean).

  **Recommendation: keep ElevenLabs inside this task (011) rather than splitting it into its own
  task file**, because it still shares task 010's degradation engine and task 004's manifest
  field as common infrastructure with the other 4 — splitting it wouldn't remove a real
  dependency, just relocate code. But size the work item accordingly: **budget roughly as much
  implementation + review effort for ElevenLabs alone as for the other 4 exporters combined**, and
  if whoever executes this task finds ElevenLabs's Projects API scene-mapping genuinely blocks
  progress on the other 4 (e.g. its output-shape decision is still unresolved), split it out as an
  `011b-elevenlabs-exporter.md` follow-up task rather than let it stall the 4 simpler ones — don't
  force one PR/session to cover both halves if the sizes turn out this lopsided in practice.

## Steps

1. Build the W3C SSML exporter first (§1) — the value-mapping tables (pace/volume/pitch, doc
   lines 130–160) live here as the shared base; Polly/Azure/Google extend this exporter's output
   rather than re-implementing the base tags.
2. Build Polly and Azure as extensions of step 1's SSML builder, layering their proprietary tags
   per doc §2/§3. Wire each through task 010's capability matrix so `<amazon:emotion>` (2-value,
   Neural-only) and `<mstts:express-as>` (richer, continuous `styledegree`) each reflect their
   actual, different capability ceilings rather than being treated as equivalent "emotion support."
3. Build the Google exporter as a thin extension of step 1, handling the per-voice (not
   per-target) `google:style-degree` capability gap explicitly — this needs a capability-matrix
   shape (010) that can express "supported on some voices," which a flat per-target boolean can't;
   flag this back to task 010 if its matrix doesn't already support per-voice granularity.
4. Build the ElevenLabs exporter last (it has no shared base with the others) — implement the
   dual-output shape (plain text + settings object), the acting-note accumulation logic (receiving
   inputs from task 010's degradation rules 1 and 2), and the Projects API v2 per-span-voice
   payload. If the Projects API's scene/chapter structure is still undefined at this point, land
   the plain-text + settings + parenthetical-note path first and treat per-span voice via Projects
   API as a tracked follow-up rather than blocking the rest.
5. Wire exporter selection through whatever `export_format` field task 004 defines on the plugin
   manifest's `behavior` block (doc lines 110–121) — confirm the field name/enum values against
   004's actual final shape, not this file's provisional reference to it.
6. Add tests per exporter asserting the actual emitted output for representative inputs (a
   segment with pace+pitch+emotion+acting_note set, run through each of the 5 exporters,
   asserting the concrete string/payload each produces) — not tests that just re-check the
   capability-matrix lookup in isolation (that belongs to task 010's test suite).
7. Update the export-targets spec doc with a version bump + changelog row reflecting the
   implemented exporters (per this repo's binding directive on contract/schema changes).

## Acceptance criteria

- [ ] All 5 exporters implemented and produce output matching doc 04's field-mapping table for
      every feature that target supports.
- [ ] W3C SSML, Polly, Azure, and Google share the common SSML-building base rather than each
      re-implementing tag emission independently.
- [ ] ElevenLabs's dual-output shape (text + settings object) and acting-note accumulation
      (receiving degraded output from task 010's rules 1 and 2) are implemented and tested
      separately from the SSML-family exporters.
- [ ] Google's per-voice (not per-target) `google:style-degree` gap is represented correctly, not
      collapsed into a single target-level boolean.
- [ ] `<mstts:viseme>` is explicitly not implemented (out of scope per doc).
- [ ] Exporter selection reads task 004's manifest `behavior.export_format` field (final name
      confirmed against 004, not assumed).
- [ ] Each exporter has tests asserting concrete emitted output, not self-referential matrix
      lookups.
- [ ] Spec doc updated with version bump + changelog row.

## Map links

Part D in `01-map.md` ("Multi-target export layer"); `INV-2` (all exporters go through the
canonical/rendering-mode layer, never raw `performance_data`); R-D (capability differences must be
resolved via the matrix, task 010, not ad hoc per exporter). Roadmap: Workload 5, task 011,
depends on 010 and 004.

## Dependencies

Depends on task 010 (`010-capability-matrix-degradation-engine.md`) and task 004
(`004-ssml-capability-manifest-field.md`), both referenced above — read their final shapes before
implementing rather than relying solely on this file's provisional description of their
interfaces.

## Out of scope

Do not implement `<mstts:viseme>` (lip-sync data — doc explicitly marks this out of scope for
audio-only). Do not implement the Voice Cloning API integration for Google or ElevenLabs's Projects
API scene-authoring UI — those are voice-provisioning/authoring concerns, not per-span export
concerns, and are separate work outside this plan's scope per `00-overview.md`. Do not build a 6th
generic/plain-text exporter beyond the 5 named here unless a future proposal doc adds a target.

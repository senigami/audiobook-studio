# Performance Script Model — Plan

**Status:** DESIGN DRAFT — not yet scheduled for implementation

## What this is

A plan for extending the Studio data model to support:

1. **Per-span performance metadata** — emotion, delivery, acting notes stored per segment/span, not just at character level
2. **Rich character profiles** — aliases, inferred traits, voice guidance, review state — beyond the current `name + color + default_emotion`
3. **AI-assisted extraction** — a multi-pass pipeline that analyzes source text and seeds the DB with characters + annotated segments
4. **Multi-target export** — translate the internal canonical JSON into whatever format a given TTS engine requires (SSML, Azure extensions, ElevenLabs prompt API, etc.)

## How it fits the existing roadmap

| Dependency | What it means |
|---|---|
| [[sub_sentence_speaker_assignment]] | The "span" model described here IS the sub-sentence plan. These docs add performance metadata and AI seeding on top of the same data shape. Both must ship together or the DB migrates twice. |
| [[book_view_redesign]] WL1 bugs (B1–B4) | Speaker assignment must be correct before AI-suggested assignments are useful. The extraction pipeline seeds suggestions; humans confirm them. |
| Engine plugin manifest `behavior` | Export targets (§04) depend on what each engine declares it supports — the exporter reads the manifest, not a hardcoded engine list. |

## Files in this folder

| File | Contents |
|---|---|
| `00-overview.md` | Problem, goal, scope, success criteria |
| `01-canonical-json-format.md` | The sparse annotation model — the internal canonical format |
| `02-character-profiles.md` | Rich character profile schema |
| `03-db-schema-changes.md` | What changes in the existing DB vs the current schema |
| `04-export-targets.md` | SSML, Azure, ElevenLabs, Polly — mapping from internal fields to engine formats |
| `05-ai-extraction-pipeline.md` | Multi-pass AI analysis pipeline + agent prompt |

## Source material

These documents were developed from an ad-hoc research session establishing that:
- Internal canonical format = **provider-neutral JSON** (not SSML, not TEI)
- SSML (and engine-specific variants) are **export targets only**, not the source of truth
- Reason: engines support different SSML subsets; a neutral internal model decouples literary analysis from synthesis plumbing

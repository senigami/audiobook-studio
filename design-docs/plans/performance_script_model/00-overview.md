# Performance Script Model — Overview

## Problem

The current Studio data model stores segments at sentence granularity with a single
`default_emotion` string per character. This is enough to assign a voice and render
audio, but it throws away information that makes audiobooks richer and more accurate:

- **No sub-sentence splits**: "I can't believe you did that," said Marcus — one sentence, two
  voices, no way to represent it today.
- **No per-span delivery data**: if a line should be whispered and urgent, the narrator's
  delivery intent is lost; the engine uses default voice settings.
- **No character knowledge**: aliases, inferred traits, first appearance, confidence — the
  system doesn't record how it knows a character exists or what kind of voice they need.
- **No export abstraction**: the system synthesizes directly to the engine it was built for,
  not to whatever engine is plugged in. Engine-specific formatting is scattered in the code.

## Goal

Design a data model and pipeline that:

1. Stores the **canonical literary record** (who says what, how, with what confidence) as
   provider-neutral JSON — never SSML, never engine-specific markup.
2. Supports **sub-sentence span splitting**: any text range can have its own speaker,
   down to word boundaries. (Extends [[sub_sentence_speaker_assignment]].)
3. Optionally stores **sparse performance metadata** per span — only annotated when the
   source text or human review demands it; most spans are unannotated.
4. Maintains **rich character profiles** alongside cast assignment — aliases, inferred traits,
   voice guidance, review flags.
5. Provides an **export layer** that translates the internal record to whatever format the
   active engine plugin declares it supports.
6. Supports an **AI extraction pass** that seeds the DB with characters and annotated spans
   from source text, for human review before use.

## What "canonical JSON" means

The internal format (Audiobook Performance Script JSON) stores:
- **Meaning** — who is speaking, what the emotional intent is, what delivery is needed
- **Confidence + evidence** — where the annotation came from and how certain it is
- **Review state** — whether a human has confirmed it

It does NOT store:
- SSML tags
- Engine-specific parameters (ElevenLabs stability scores, Azure style names)
- Phoneme-level markup

Those are generated at export time by an engine-specific exporter that reads the internal
record and the engine's plugin manifest.

## Scope

**In scope:**
- Span data model (extends the current `chapter_segments` table)
- Per-span performance metadata schema
- Character profile schema (extends the current `characters` table)
- Export target mapping (SSML, Azure, ElevenLabs, Polly)
- AI extraction pipeline + agent prompt

**Out of scope (defer):**
- Automatic audio stitching / multi-track assembly
- Word-level timing / phoneme alignment
- Full audio-drama production (music, ambience layers)
- Exporter implementations (those are engine plugin work)

## Success criteria

- A chapter can be represented as an ordered stream of spans with optional performance metadata
- Sub-sentence speaker assignment works (splitting a sentence creates ≥2 spans, losslessly)
- A character record captures name, aliases, voice guidance, review state — not just color
- The export layer can produce valid SSML from any annotated chapter
- AI extraction can seed a chapter with suggested characters + spans for human review
- Human overrides always take precedence over AI inference

## Relationship to existing work

| Existing plan | Relationship |
|---|---|
| `sub_sentence_speaker_assignment.md` | Spans ARE the sub-sentence model. This plan adds the performance layer on top. Ship together. |
| `book_view_redesign/` (WL1 bugs B1–B4) | B1 (voice-change invalidates audio) and B2 (409 adjacent paints) are prerequisites — span-level assignments amplify these bugs if not fixed first. |
| `quiet_studio_migration/` | UI for Voices mode (paint gestures) is the editor surface for span assignment — that work is downstream of this data model. |

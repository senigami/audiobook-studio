# ADR-0008: Nested Voice Directory Layout (V2)

**Date:** 2026-06-10  
**Status:** Accepted  
**Deciders:** Studio owner

## Context

V1 stored all voices flat: `voices/{VoiceName}/sample.mp3` with no engine distinction.
When Studio added a second TTS engine (Voxtral alongside XTTS), a single voice needed
engine-specific variant files: XTTS uses a speaker embedding generated from audio
samples; Voxtral uses a different profile format.

Storing both under a flat directory created naming collisions and made it impossible
to have per-variant metadata without per-engine special cases in the resolver.

Options considered:
1. Flat directory with engine prefix in filenames (`xtts_profile.json`,
   `voxtral_profile.json`) — works but makes the directory a bag of loosely-related
   files with no clear structure.
2. Engine-keyed sub-directory (`voices/{Name}/{engine_id}/`) — clean but ties the
   directory name to an engine ID, which breaks if an engine is renamed.
3. Named variants (`voices/{Name}/{VariantName}/`) — decouples variant identity from
   engine ID; a voice can have multiple variants for the same engine.

## Decision

V2 layout: `voices/{VoiceName}/{VariantName}/` with:
- `voice.json` at the voice root (`voices/{VoiceName}/voice.json`) — voice-level
  metadata including `default_variant`.
- `profile.json` per variant (`voices/{VoiceName}/{VariantName}/profile.json`) —
  variant-level metadata including which engine it targets and its configuration.

The `default_variant` field in `voice.json` selects which variant is used when a
caller specifies only a voice name. Callers that need a specific variant use the
"Voice Name - Variant" compound notation.

A migration step auto-runs on first boot of V2 to reshape V1 flat directories into
the new layout.

## Consequences

### Positive
- Clean multi-engine, multi-variant support without special cases in resolvers.
- Variant identity is decoupled from engine ID — renaming an engine doesn't require
  renaming directories.
- `voice.json` at the root provides a single place for voice-level metadata queries
  without scanning variant subdirectories.

### Negative / Trade-offs
- Migration is required on first boot; there is no rollback path to V1 layout.
- "Voice Name - Variant" compound notation must be parsed consistently everywhere
  (resolver, API, UI) — a shared parser is required.

### Neutral
- Voice samples (`sample.mp3`) and previews (`samples/preview.mp3`) are stored as MP3.
  Chapter and book render output is WAV. Portable voice bundles exported for sharing
  are MP3. (See audio format conventions.)

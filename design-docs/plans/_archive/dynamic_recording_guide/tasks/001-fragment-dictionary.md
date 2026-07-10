# Task 001 — Author the tone/timbre phrase-fragment dictionary

Status: complete — 2026-07-09 (authored directly, not delegated)

## Goal

Create a curated dictionary mapping every Tone value (**28** — corrected from this task's original estimate of 27; the taxonomy's actual count, verified programmatically against `taxonomy.ts`, is 28) and every Timbre value (24) from `design-docs/specs/voice-taxonomy.json` v2.0 to a short (one sentence or clause) recording-direction phrase — the raw material the composition fallback (Task 002) assembles into a full prompt when a voice's tag selection doesn't closely match one of the 39 curated archetypes.

## Source of truth for the vocabulary

Pull the exact Tone/Timbre value lists from `design-docs/specs/voice-taxonomy.json` (or the already-bundled `frontend/src/pages/Voices/components/metadata/taxonomy.ts`'s `tone`/`timbre` sections) — do not invent values not in the taxonomy, and do not omit any (all 28 Tone + all 24 Timbre values need an entry; a missing entry means the composer silently drops that tag from a generated prompt).

## Style guide for each phrase

Look at the existing 39-row table (`design-docs/reference/voice-archetypes/voice_archetypes.json`, `direction_note` column) and `wiki/Recording-Guide.md`'s 6 Prompt Packs for tone. Each fragment should:
- Be a short clause (5-15 words), written as **direction to the performer**, not a description of the voice (e.g. tone "gruff" → "with a rough, no-nonsense edge" — not "a gruff voice sounds rough").
- Be composable — assume it will be joined with other fragments via `', '` or as a short sentence list, so avoid a fragment that only makes sense as a complete standalone sentence.
- Avoid duplicating another fragment's wording — 51 entries with genuinely distinct, specific direction is the point (a generic "sound {tone}" for every entry defeats the feature).

## Exact files

- New: `design-docs/reference/voice-archetypes/tone_timbre_fragments.csv` — columns: `category` (`tone`|`timbre`), `value` (the taxonomy id, e.g. `gruff`), `fragment` (the direction phrase).
- New: `design-docs/reference/voice-archetypes/tone_timbre_fragments.json` — `{ "fragments": [{ "category": "tone", "value": "gruff", "fragment": "..." }, ...] }`, generated from the same data as the CSV (write one Python script that emits both from one in-memory list, exactly like the earlier `voice_archetypes.csv`/`.json` conversion in this same reference folder — don't hand-maintain two divergent files).
- Update: `design-docs/reference/voice-archetypes/README.md` — add a short section describing the new files, matching its existing style for the archetype table.

## Steps

- [x] Extract the full Tone (28) and Timbre (24) value lists from `taxonomy.ts` (mirrors `design-docs/specs/voice-taxonomy.json`).
- [x] Write one fragment per value (52 total) per the style guide above.
- [x] Generate both `tone_timbre_fragments.csv` and `.json` from one source list (`/tmp/gen_fragments.py`, one in-memory list emitting both — script itself not committed, per this folder's existing convention of committing only the generated output).
- [x] Update the reference README.
- [x] Verify count: exactly 28 tone + 24 timbre = 52 entries, zero duplicates in the `value` column, zero taxonomy values missing — verified programmatically (`set(tone_ids) == set(my_tone)` etc., both `True`), not by eye.

## Acceptance criteria

- [x] 52 entries, one per taxonomy Tone/Timbre value, zero missing, zero extras (programmatically verified against `taxonomy.ts`).
- [x] CSV and JSON are content-identical (generated from one source list).
- [x] Each fragment reads as performer direction, not a voice description (e.g. tone `menacing` → "lower the volume and let the threat live in the restraint"; timbre `velvety` → "let the low notes purr, soft-edged and plush").

## Dependencies

None.

## Map links

- Part: "Fragment dictionary (new content)" — `01-map.md`, "The parts"

## Out of scope

- The frontend-bundled TS version of this data (`recordingFragments.ts`) — that's Task 002, since it's consumed alongside the suggestion function's logic, not standalone content work.
- Class-opening-lines and Pace-rhythm-cues — small enough to author directly in Task 002's code file, not here.

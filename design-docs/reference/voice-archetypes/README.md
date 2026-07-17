# Voice Archetypes — Recording Guide Reference Data

Source data for the voice archetype → appearance → recording-prompt mapping. Delivered originally as `Voice_Archetype_Recording_Guide.xlsx` (still on the owner's Desktop) with 39 rows; this folder held those rows as machine-readable CSV/JSON so future planning/build work (the dynamic recording-guide feature, see `design-docs/plans/active/dynamic_recording_guide/`) could read it back without re-parsing the spreadsheet.

Expanded from 39 to 103 archetypes on 2026-07-17 (owner request: broader, genuinely distinct character-type coverage — gothic/horror, sci-fi, mythic creatures, folklore, historical/period, pulp/superhero, adventure archetypes, post-apocalyptic/cyberpunk — not job-title reskins). The 64 new rows are original content authored directly in JSON/CSV/TS; they have no corresponding rows in the source xlsx.

- `voice_archetypes.csv` — flat table, header row matches the xlsx column names verbatim.
- `voice_archetypes.json` — `{ title, description, source_taxonomy, headers_original, headers_key, archetypes: [...] }`. Each `archetypes[]` entry uses snake_case keys (`archetype_name`, `class`, `gender`, `age`, `dominant_tones`, `dominant_timbres`, `pace`, `appearance_creature_type`, `appearance_description`, `recording_prompt`, `direction_note`).

Source taxonomy: `design-docs/specs/voice-taxonomy.json` (v2.0). Every Tone/Timbre value in this table was manually verified against that spec when the table was built.

`Appearance Description` values are portrait-framed as of 2026-07-17: square head-and-shoulders/bust only (face, expression, hair/head coverings, collar-level wardrobe, ambient light) — no below-the-chest anatomy — so they can drive square avatar/icon image prompts directly. This diverges intentionally from the original xlsx column.

If the xlsx is ever revised, merge its changes into the JSON rather than regenerating wholesale — the JSON now also carries the 64 non-xlsx rows described above. `voice_archetypes.json` is the source of truth; regenerate `voice_archetypes.csv` and `recordingArchetypes.ts` from it (not the reverse) whenever any row changes, so all three stay content-identical.

## Tone/timbre phrase fragments

`tone_timbre_fragments.csv` / `.json` — 52 entries (28 Tone + 24 Timbre, the full taxonomy vocabulary), one short performer-direction phrase each (e.g. tone `gruff`-adjacent `menacing` → "lower the volume and let the threat live in the restraint"; timbre `velvety` → "let the low notes purr, soft-edged and plush"). This is the raw material `dynamic_recording_guide`'s composition fallback (Task 002) assembles into a full prompt when a voice's tag selection doesn't closely match one of the 103 curated archetypes above. Both files are generated from one source list — regenerate both together if a fragment is revised, don't hand-edit just one.

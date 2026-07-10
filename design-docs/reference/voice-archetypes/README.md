# Voice Archetypes — Recording Guide Reference Data

Source data for the voice archetype → appearance → recording-prompt mapping. Delivered originally as `Voice_Archetype_Recording_Guide.xlsx` (still on the owner's Desktop); this folder holds the same 39 rows as machine-readable CSV/JSON so future planning/build work (the dynamic recording-guide feature, see `design-docs/plans/active/dynamic_recording_guide/`) can read it back without re-parsing the spreadsheet.

- `voice_archetypes.csv` — flat table, header row matches the xlsx column names verbatim.
- `voice_archetypes.json` — `{ title, description, source_taxonomy, headers_original, headers_key, archetypes: [...] }`. Each `archetypes[]` entry uses snake_case keys (`archetype_name`, `class`, `gender`, `age`, `dominant_tones`, `dominant_timbres`, `pace`, `appearance_creature_type`, `appearance_description`, `recording_prompt`, `direction_note`).

Source taxonomy: `design-docs/specs/voice-taxonomy.json` (v2.0). Every Tone/Timbre value in this table was manually verified against that spec when the table was built.

If the xlsx is ever revised, regenerate these two files from it rather than hand-editing — they're meant to stay byte-identical in content to the spreadsheet, just reshaped for parsing.

## Tone/timbre phrase fragments

`tone_timbre_fragments.csv` / `.json` — 52 entries (28 Tone + 24 Timbre, the full taxonomy vocabulary), one short performer-direction phrase each (e.g. tone `gruff`-adjacent `menacing` → "lower the volume and let the threat live in the restraint"; timbre `velvety` → "let the low notes purr, soft-edged and plush"). This is the raw material `dynamic_recording_guide`'s composition fallback (Task 002) assembles into a full prompt when a voice's tag selection doesn't closely match one of the 39 curated archetypes above. Both files are generated from one source list — regenerate both together if a fragment is revised, don't hand-edit just one.

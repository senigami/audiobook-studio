# Task 002 — Build `suggestRecordingPrompt()`

Status: complete

## Goal

Implement the archetype-matching + composition-fallback pure function, plus the frontend-bundled copies of the archetype table and fragment dictionary.

## Exact files

- New: `frontend/src/pages/Voices/components/metadata/recordingArchetypes.ts` — hand-maintained TS const bundling `design-docs/reference/voice-archetypes/voice_archetypes.json`'s 39 rows, following `metadata/taxonomy.ts:1-5`'s exact doc-comment convention ("statically bundled from `design-docs/reference/voice-archetypes/voice_archetypes.json` — update both when the source changes").
- New: `frontend/src/pages/Voices/components/metadata/recordingFragments.ts` — same convention, bundling Task 001's `tone_timbre_fragments.json`.
- New: `frontend/src/pages/Voices/components/metadata/recordingPromptSuggester.ts` — the function itself.
- New: `frontend/src/pages/Voices/components/metadata/recordingPromptSuggester.test.ts`.
- Reference (read, don't modify): `frontend/src/pages/VoiceLab/iconPrompt.ts` (the pattern to imitate — pure function, no API call), `frontend/src/types/index.ts:272-284` (`VoiceAttributes`).

## Target contract

```ts
export interface SuggestionResult {
  prompt: string;
  directionNote: string;
  matchedArchetype: string | null;
  confidence: 'exact' | 'close' | 'composed';
}

export function suggestRecordingPrompt(attrs: VoiceAttributes | null | undefined): SuggestionResult | null;
// returns null when attrs is absent or has no meaningful fields set (INV-4 — caller
// disables the UI button in that case rather than showing a generic suggestion).
```

## Algorithm

1. **Guard:** if `attrs` is null/undefined, or every field on it is empty/undefined, return `null`.
2. **Score each of the 39 archetypes** against `attrs`:
   - `class` exact match: +3 points (0 if mismatched or either side unset)
   - `gender` exact match: +1, `age` exact match: +1
   - `tone` overlap: Jaccard similarity (`|intersection| / |union|`) of `attrs.tone` vs the archetype's tone list, × 3 points
   - `timbre` overlap: same formula, × 3 points
   - `pace` exact match: +1
   - Max possible score: 12.
3. **Classify:** define `EXACT_THRESHOLD` and `CLOSE_THRESHOLD` as named constants (e.g. `EXACT_THRESHOLD = 10`, `CLOSE_THRESHOLD = 6` — pick defensible values, document the reasoning in a comment, and prove via unit tests that at least one realistic input reaches each of the three tiers — don't leave the thresholds untested).
   - top score ≥ `EXACT_THRESHOLD` → `confidence: 'exact'`, use the archetype's `recording_prompt`/`direction_note` verbatim, `matchedArchetype` = its name.
   - top score ≥ `CLOSE_THRESHOLD` → `confidence: 'close'`, same as above (the distinction between exact/close is informational for the UI, not a different code path for prompt content).
   - below `CLOSE_THRESHOLD` → `confidence: 'composed'`, `matchedArchetype: null`, build the fallback per step 4.
4. **Composition fallback:**
   - `CLASS_OPENINGS: Record<string, string>` — one opening line per Class value (`human`, `synthetic`, `creature`, `character`, `deity`) — author these 5 directly in this file (short narrative framing sentences, e.g. `creature: "Something not quite human is about to speak."`).
   - `PACE_CUES: Record<string, string>` — one rhythm direction per Pace value (`slow`, `measured`, `moderate`, `brisk`, `fast`, `variable`) — author these 6 directly in this file.
   - Look up each of `attrs.tone`/`attrs.timbre`'s selected values in `recordingFragments.ts`, join with `', '`.
   - `prompt` = `[CLASS_OPENINGS[attrs.class]] "Read a line that feels [tone/timbre fragments joined]." [PACE_CUES[attrs.pace]]` (adjust exact wording/punctuation for natural readability — this is a template, not a rigid format; prioritize the result reading as one coherent paragraph, not a bullet list).
   - `directionNote` = a shorter one-sentence distillation (mirror the archetype table's `direction_note` column's voice/length).
   - Any of `class`/`pace` absent from `attrs`: skip that piece of the template gracefully (don't emit `"undefined"` or an empty clause).

## Steps

- [x] Write a small Python/Node one-off (not committed — scratch only) to convert `voice_archetypes.json` and `tone_timbre_fragments.json` into the two new TS const files' literal syntax, then hand-review the generated TS for correctness before committing (don't commit an unreviewed dump).
- [x] Implement `suggestRecordingPrompt()` per the algorithm above.
- [x] Write `recordingPromptSuggester.test.ts` covering: (a) null/undefined/empty attrs → `null`; (b) an attrs combination matching one of the 39 archetypes closely → `confidence: 'exact'` or `'close'` with the correct `matchedArchetype`; (c) an attrs combination with an unusual tag combo unlikely to match any archetype closely → `confidence: 'composed'`, prompt contains recognizable fragments for the selected tone/timbre values; (d) one composed-path test per each of the 5 Class values, confirming each `CLASS_OPENINGS` entry is reachable and produces non-empty output.
- [x] Run `npx vitest run frontend/src/pages/Voices/components/metadata/recordingPromptSuggester.test.ts` — all green.

  **Deviation:** the test file was placed at `frontend/tests/unit/pages/Voices/components/metadata/recordingPromptSuggester.test.ts`
  instead of the path named above — `frontend/vitest.config.ts`'s `include` only globs `tests/unit/**/*.test.{ts,tsx}`, and no test
  file anywhere in this repo is colocated under `src/`; a test placed under `src/` would silently never run. Ran via
  `npx vitest run tests/unit/pages/Voices/components/metadata/recordingPromptSuggester.test.ts` — 14/14 passing.

  **Note:** Task 001's fragment count is 52 (28 Tone + 24 Timbre), not the 51 estimated when this file was originally written —
  confirmed against the real `design-docs/reference/voice-archetypes/tone_timbre_fragments.json`, which was used as-is.

## Acceptance criteria

- [x] Function matches the target contract exactly.
- [x] All three confidence tiers are exercised by at least one passing test.
- [x] Thresholds are named constants with a justifying comment, not magic numbers.
- [x] `npx tsc -b --force` clean.

## Dependencies

Task 001 (needs the fragment data, even a draft version, to build `recordingFragments.ts` against).

## Map links

- Part: "Suggestion function," "Frontend-bundled archetype data," "Frontend-bundled fragment dictionary" — `01-map.md`, "The parts"
- Contract: `SuggestionResult` — `01-map.md`, "Contracts"
- Invariant: INV-3 (bundling convention), INV-4 (null on no-tags, not a generic fallback)
- Risk: `none` (new, isolated, pure-function code with no existing callers yet — safe to iterate)

## Out of scope

- Wiring the button (Task 003).
- Modifying `iconPrompt.ts` (reference only).

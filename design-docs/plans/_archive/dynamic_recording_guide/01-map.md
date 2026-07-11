# Implementation map

## The big picture

```
VoiceMetadata.attributes (class/gender/age/tone[]/timbre[]/pace)
        │
        ▼
suggestRecordingPrompt(attrs)   ← new pure function
        │
        ├── score against 39 curated archetypes → close match? → return archetype's recording_prompt/direction_note verbatim
        └── no close match → compose from: Class-opening-line + Pace-rhythm-cue + Tone/Timbre fragments (new dictionary)
        │
        ▼
ScriptEditor.tsx "Suggest from voice qualities" button → fills the testText textarea (not auto-saved)
```

## The parts

| Part | File(s) | Responsibility |
|---|---|---|
| Fragment dictionary (new content) | `design-docs/reference/voice-archetypes/tone_timbre_fragments.{csv,json}` | One short direction phrase per Tone value (27) and Timbre value (24) — e.g. tone `gruff` → "with a rough, no-nonsense edge"; timbre `velvety` → "let the low notes purr." Authored content, not derived. |
| Frontend-bundled archetype data (new) | `frontend/src/pages/Voices/components/metadata/recordingArchetypes.ts` | Hand-maintained TS const mirroring `design-docs/reference/voice-archetypes/voice_archetypes.json`, **following the exact convention of `taxonomy.ts`** (`metadata/taxonomy.ts:1-5`'s own doc comment: "statically bundled from design-docs/specs/... Update both this const and the source JSON when it changes"). Same convention applies here: this file's doc comment must say "statically bundled from design-docs/reference/voice-archetypes/voice_archetypes.json — update both when the source changes." |
| Frontend-bundled fragment dictionary (new) | `frontend/src/pages/Voices/components/metadata/recordingFragments.ts` | Same convention, mirrors `tone_timbre_fragments.json`. |
| Suggestion function (new) | `frontend/src/pages/Voices/components/metadata/recordingPromptSuggester.ts` | `suggestRecordingPrompt(attrs: VoiceAttributes): SuggestionResult` — pure, no API call, mirrors `iconPrompt.ts`'s `buildIconPrompt()` shape (`frontend/src/pages/VoiceLab/iconPrompt.ts:24`). |
| Wiring — attribute threading | `frontend/src/pages/Voices/VoicesPage.tsx:225` (`<VoicesModals>` call), `frontend/src/components/VoicesModals.tsx:163` (`<ScriptEditor>` call) | `VoicesPage.tsx` already builds `voiceMetadataMap` (lines 81-83) but does not pass it to `VoicesModals` — add the prop through both layers, resolving the specific profile's `VoiceMetadata` the same way `VoicesPage.tsx:118-119` already does (id-first, name-fallback). |
| UI — the button | `frontend/src/pages/Voices/components/ScriptEditor.tsx` | New `attributes?: VoiceAttributes` prop; a "Suggest from voice qualities" button beside the existing "Reset to Default" (`ScriptEditor.tsx:182-189`), disabled when `attributes` is absent/empty, calling `onTestTextChange(suggestRecordingPrompt(attributes).prompt)` on click. |

## Contracts

**`VoiceAttributes`** (`frontend/src/types/index.ts:272-284`, unchanged):
```ts
interface VoiceAttributes {
  class?: string; gender?: string; age?: string; accent?: string;
  language?: string[]; style?: string[]; tone?: string[]; timbre?: string[];
  pace?: string; use_case?: string[]; quality?: string[];
}
```

**New — `SuggestionResult`** (defined in `recordingPromptSuggester.ts`):
```ts
interface SuggestionResult {
  prompt: string;
  directionNote: string;
  matchedArchetype: string | null;
  confidence: 'exact' | 'close' | 'composed';
}
```

**Archetype scoring (this plan's core new logic — no existing precedent to port, design it in Task 002):** score = weighted match across `class` (exact, high weight), `gender`+`age` (exact, medium weight), `tone`/`timbre` (Jaccard-style set overlap, medium weight each), `pace` (exact, low weight). `exact` = every one-optional/one-required field matches AND tone/timbre overlap ≥ 0.6; `close` = top score above a tunable threshold; below threshold = `composed`. Exact threshold values are a design decision for Task 002's implementer to make explicit and unit-test against, not left implicit.

**Composition fallback (Task 002):** `[Class opening line] + " " + [Pace rhythm cue] + " " + [joined Tone/Timbre fragments] `. Class openings and Pace cues are small (5 and 6 entries respectively) — author them directly in `recordingPromptSuggester.ts` as local constants, not a separate data file (unlike the larger Tone/Timbre fragment dictionary, which is real content-authoring work and belongs in Task 001's data file).

## Invariants

- **INV-1 (suggestion, not replacement):** the button fills the textarea; it never calls the save/API path itself. The user's existing Save/Reset flow is unchanged.
- **INV-2 (no backend change):** confirmed unnecessary via research — `test_text` already round-trips through `POST /api/speaker-profiles/{name}/settings`. Do not add any backend endpoint for this feature.
- **INV-3 (bundling convention):** new frontend data files follow `taxonomy.ts`'s exact pattern (hand-maintained TS const, doc comment naming the source-of-truth JSON) — do not introduce a runtime JSON import mechanism that doesn't exist elsewhere in this codebase.
- **INV-4 (untagged voices):** `VoiceMetadata.is_untagged` (`types/index.ts:312`) or an attributes object with no meaningful fields must disable the button with an explanatory tooltip, not silently return a generic/empty suggestion (this matches `buildIconPrompt()`'s own explicit "nothing tagged" fallback behavior, `iconPrompt.ts:29`, but here we don't want a generic fallback — we want a disabled affordance, since a recording-prompt suggestion with zero real tag data would be actively misleading — this is stronger than the icon-prompt precedent, note the difference explicitly in Task 003).

## Risks

- `multi-file`: the prop-threading task (002) touches three files across two directories that must agree on the new prop's shape end-to-end.
- Open design decision (not a risk, a decision Task 002 must make and document): exact scoring weights/thresholds for exact/close/composed. No existing precedent in this codebase to copy — the implementer must choose defensible values, write them as named constants (not magic numbers), and justify them in a code comment, then prove the three tiers are reachable via unit tests (at least one input that hits each tier).

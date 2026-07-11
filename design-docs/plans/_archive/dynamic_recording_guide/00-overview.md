# Overview

## Task

Add a taxonomy-driven recording-prompt suggestion feature to the voice-profile Script Editor.

## Success criteria

1. A new pure function, `suggestRecordingPrompt(attrs: VoiceAttributes)`, returns `{ prompt: string; directionNote: string; matchedArchetype: string | null; confidence: 'exact' | 'close' | 'composed' }`:
   - `exact`/`close`: attrs closely match one of the 39 curated archetypes (`design-docs/reference/voice-archetypes/voice_archetypes.json`) — returns that archetype's `recording_prompt`/`direction_note` verbatim, `matchedArchetype` set to its name.
   - `composed`: no close archetype match — composes a prompt from a new tone/timbre phrase-fragment dictionary (this plan's Task 001) plus a Class-appropriate opening line and a Pace-appropriate rhythm cue, `matchedArchetype: null`.
2. `ScriptEditor.tsx` gains a "Suggest from voice qualities" button next to the existing "Reset to Default" button. Clicking it calls the suggester (using the voice's actual `VoiceMetadata.attributes`, threaded in via Task 002) and fills the textarea with the result — **does not auto-save**; the existing Save button still commits it, same as manually typed text.
3. If the voice has no tagged attributes yet (`VoiceMetadata.is_untagged === true` or attributes empty), the button is disabled with a tooltip explaining why (point the user at the metadata editor), not silently producing a generic/empty suggestion.
4. Unit tests cover the matching function's three confidence tiers and the composition fallback's coverage of at least one archetype from each `Class` value.
5. Full green gate (typecheck, lint, frontend test suite); live verification of the button in the Voices page Script Editor.

## Scope

**In scope:**
- `design-docs/reference/voice-archetypes/tone_timbre_fragments.{csv,json}` — new content (this plan's real creative-writing task).
- A new frontend-bundled copy of both the archetype table and the fragment dictionary (mirroring how `taxonomy.ts` bundles `voice-taxonomy.json` today — confirm the exact bundling mechanism during Task 001, don't assume).
- `frontend/src/pages/Voices/components/metadata/recordingPromptSuggester.ts` (new) — the matching/composition function + its tests.
- `frontend/src/pages/Voices/components/ScriptEditor.tsx` — new button + new `attributes` prop.
- `frontend/src/components/VoicesModals.tsx`, `frontend/src/pages/Voices/VoicesPage.tsx` — thread `voiceMetadataMap`/the resolved `VoiceMetadata` for the currently-edited profile down to `ScriptEditor`.

**Out of scope:**
- Any backend or database change (confirmed unnecessary — `test_text` already flows through the existing settings-save path).
- `frontend/src/pages/VoiceLab/components/TestSection.tsx`'s ephemeral test-text input (a real, smaller follow-on; not required for this plan's success criteria).
- Changing `buildIconPrompt()` itself (referenced as a pattern, not modified).

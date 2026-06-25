# 10 · "Isabel Costa" — Localization Lead  ☆ INFERRED

**Identity:** "Isabel adapts Portuguese audiobooks for the Brazilian market and needs the app to hold language, voice, and character assignments together across locales without silently breaking one when she edits another."

## Goals
- Manage a localized copy of a project without overwriting or polluting the source
- Assign voices per character per locale — the same character may need a different voice in PT-BR than in PT-PT
- Preserve segment-level pacing and markup when text changes during translation
- Handle mixed-language chapters (English dialogue inside Portuguese prose) without losing voice assignments
- Prevent auto-assignment logic from overriding her locale-specific voice decisions

## Context & environment *(INFERRED)*
- macOS, Brazilian Portuguese primary locale; keyboard layout and text input matter for special characters
- Runs Audiobook Studio alongside a CAT tool (e.g., OmegaT or Phrase) in split-screen
- Imports translated text into the app chapter by chapter, then adjusts voice assignments per character
- Works from a source project that was already cast and partially rendered by a producer in Portugal
- Her changes need to be reviewable without requiring the original producer to re-cast from scratch

## Key workflow moments
- **Project fork for locale:** Starts a localization pass by duplicating the source project for the target locale; wants confidence that character names, casting, and structure come over intact
- **Segment text replacement:** Pastes translated text into chapter segments; needs per-segment language tagging so the TTS engine knows which phoneme model to use
- **Voice re-assignment per locale:** Opens the casting panel to swap voices for locale-specific speakers; wants character-level voice overrides that don't affect the source project
- **Mixed-language segment handling:** For segments with English dialogue inside Portuguese prose, needs to tag the language boundary so the TTS engine doesn't mispronounce the switch
- **Locale review pass:** Plays back chapters to catch pronunciation errors on names, idioms, or culturally adapted references; flags individual segments for re-render

## Top friction points *(INFERRED)*
- **F1 — No locale-scoped voice assignment:** Voice assignments are per character globally; there is no concept of "this voice for this character in this locale," so Isabel either duplicates the whole character record or manually re-casts every time she opens the localized project
- **F2 — Mixed-language segments have no language tag:** Segments are plain text with no inline language marker; the TTS engine applies the project-level language setting to everything, producing badly accented English dialogue rendered in Portuguese phoneme rules
- **F3 — Project duplication is structural, not locale-aware:** Duplicating a project copies everything, but the copy has no persistent link to the source; if the source is re-cast or the producer fixes a voice, Isabel's localized copy doesn't inherit the change
- **F4 — Name and proper noun pronunciation is per-character, not per-locale:** A character named "Sebastião" may have correct phoneme hints set in the source project but those hints assume European Portuguese; Isabel has no place to enter a Brazilian Portuguese pronunciation variant
- **F5 — RTL and special characters are untested territory:** The segment editor may handle ç, ã, and ê correctly, but mixed-script segments with right-to-left text components (if the manuscript has Arabic quotations, for example) have no guaranteed behavior

## What they need from the studio
- Locale-scoped voice overrides per character — the ability to set "for this project locale, use this voice" without touching the canonical character record
- Per-segment language tagging that the TTS engine respects for phoneme routing
- A project-duplicate mode that preserves source linkage for cast and character records, so upstream cast fixes can be selectively pulled in
- Per-character, per-locale pronunciation hints for proper nouns
- A chapter-level language summary: which segments are tagged differently from the project default, and which voices will be used for each

## Review lens — questions they ask of any screen
- "Will changing this voice affect the source project or only this locale?"
- "How does the TTS engine know this segment is English, not Portuguese?"
- "If the original producer re-casts a character, will my localized version pick that up or stay frozen?"
- "Where do I enter a different pronunciation for this name in Brazilian Portuguese?"
- "Can I see which segments are flagged as mixed-language at a glance?"
- "Does pasting in new text here break the timing or voice assignment for this segment?"

## Red flags that make them quit or distrust the app
- Changing a voice in the localized project silently changes it in the source project too
- The TTS engine renders English dialogue with Portuguese phoneme rules and there is no way to correct it per segment
- Pasting translated text clears the voice assignment for that segment
- There is no way to see which voice will render each segment before triggering the queue
- Special characters in Brazilian Portuguese names are mangled in the segment editor or file export

**Evidence basis:** INFERRED. Interview audiobook localization coordinators who work on Latin American or European bilingual markets to validate how locale-voice coupling is currently managed and where the biggest production errors occur.

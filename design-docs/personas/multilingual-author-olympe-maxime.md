# 36 · Multilingual Author  ☆ INFERRED

**Identity:** "A literary fiction author who writes across three languages and needs the app to handle language boundaries explicitly and predictably — not silently fall back to the wrong voice."

## Goals
- Render chapters that mix Brazilian Portuguese, English, and occasional French with language-appropriate voices
- Assign a specific native-speaker voice to each language without relying on a single "multi-language" voice
- See clearly which language the app has inferred for each segment before rendering
- Override language assignment per segment when inference gets it wrong
- Avoid undisclosed fallback behavior: if a language isn't supported, fail loudly rather than silently downgrade

## Context & environment *(INFERRED)*
- Works on a MacBook Pro; technically fluent but not a developer — accustomed to nuanced tooling in other creative apps
- Came to Audiobook Studio after a cloud TTS service mangled her Portuguese prose with an English accent
- Produces one literary novel per project; chapters range from 800 to 4,000 words with dense code-switching
- Works in long editing sessions, reviewing segment audio carefully; not batch-and-walk-away
- Cares deeply about linguistic fidelity — a mispronounced Brazilian place name is not a minor bug to her

## Key workflow moments
- **Voice casting:** Assigns a distinct voice to each language in the casting panel; expects the panel to expose language as a first-class casting dimension, not a hidden plugin setting
- **Segment language preview:** Before rendering, scans the chapter editor to see which language tag is assigned to each segment; expects this to be visible inline, not buried in a detail panel
- **Language override:** Corrects a misdetected language on a single segment; expects this to be a one-click field on the segment row, not a re-import or full chapter re-analysis
- **Render and review:** Renders the chapter and listens for accent or pacing errors at language transitions; expects the playback position to map to the segment she's currently reading
- **Fallback inspection:** When the engine doesn't support a language, expects an explicit warning that names the affected segments and the fallback behavior — never silent degradation

## Top friction points *(INFERRED)*
- **F1 — Language detection is opaque:** The Multilingual Author cannot see which language the app detected per segment before rendering. She discovers errors only after listening to the output, which means re-renders on long chapters.
- **F2 — Fallback is silent and wrong:** When the active engine doesn't have a Portuguese voice, the app falls back to an English-accented voice without warning. the Multilingual Author has shipped audio with the wrong accent because they missed the silent downgrade.
- **F3 — Language is a plugin-level setting, not a casting concept:** Switching the language for a segment or voice requires digging into plugin settings rather than working at the casting panel where character-to-voice assignment lives.
- **F4 — No per-segment language override in the editor:** Correcting a misdetected language requires editing the segment metadata in a way the chapter editor doesn't visibly surface. The path is unclear and varies by engine.

## What they need from the studio
- Per-segment language tags visible in the chapter editor, with inline override controls
- A casting model that treats language as a first-class axis: character + language → voice, not character → voice (with language implied)
- Explicit warnings before render if any segment's assigned language lacks a matching voice — with named segments and proposed alternatives
- No silent fallback: if a fallback must occur, surface it as a pre-render blocker or a clearly flagged post-render annotation
- A language-audit pass before render that summarizes detected languages, assigned voices, and any gaps

## Review lens — questions they ask of any screen
- "Can I see which language this segment is tagged as before I render it?"
- "Is the voice assigned to this segment a native speaker of that language, or a fallback?"
- "If I assign a Portuguese voice to a character, will English-tagged segments by that character switch to an English voice or stay Portuguese?"
- "What happens when a segment contains both Portuguese and a French quote on the same line?"
- "Will the app tell me before rendering if it can't find a voice for one of my languages?"
- "If I override the language on one segment, does that affect adjacent segments or only that one?"
- "Where exactly in the settings does language preference live — plugin level, voice level, or segment level?"

## Red flags that make them quit or distrust the app
- A chapter renders with the wrong accent and there was no warning before or annotation after
- Language assignment is not visible in the chapter editor at all
- The casting panel has no concept of language — only character-to-voice mapping
- Plugin settings override voice assignments without surfacing the conflict to the user
- Playback position in the audio does not correspond to segments in the editor, making review slow

**Evidence basis:** INFERRED. Interview multilingual authors, translators producing audiobook adaptations, and spoken-word performers who work across languages to validate whether segment-level language tags are sufficient or whether the Multilingual Author's workflow requires phrase-level granularity within a single segment.

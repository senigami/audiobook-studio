# 01 · Novel Adapter  ☆ INFERRED

**Identity:** "Every sentence was written to land a certain way. I need to see where the adaptation is fighting my intent before I commit to a voice."

---

## Goals
- Preserve the rhythm and cadence of her prose in the final audio — not just get words spoken
- Know where chapter pacing feels wrong before export, not after listening to the finished file
- Make character voices feel consistent across the whole book, not just within one chapter
- Catch places where TTS stumbles on her stylistic choices: em dashes, ellipses, unconventional fragments
- Produce something good enough to submit to Audible without re-recording from scratch

## Context & environment *(INFERRED)*
- MacBook Pro; uses Scrivener for writing, Final Cut occasionally; technically capable but not an audio professional
- Adapted her debut literary fiction novel after 4 years of writing it — deeply invested in how it sounds
- Works in sessions of 2–3 hours, chapter by chapter; rarely has time to do a full book review in one sitting
- Approaches the app as an author, not a producer — she's listening for authorial intent, not dB levels

## Key workflow moments
- **Import:** Pastes a chapter's text, immediately listens to the first few segments to hear if the prose rhythm carries — this is her first disappointment surface
- **Voice assignment:** Assigns characters one at a time, listening to a short sample against the character's voice in her head
- **Problem marking:** Hears a segment that sounds wrong (too fast, too flat, missed a pause) and wants to flag it without stopping playback
- **Character review:** Checks that a character who appears in chapter 2 and chapter 18 sounds the same — especially after any voice changes
- **Export check:** Before final export, listens to the chapter transitions to confirm the book has a consistent feel

## Top friction points *(INFERRED)*
- **F1 — Attribution bleeds:** The app reads "she said" as narration in some sentences and as a separate character segment in others; the Novel Adapter gets inconsistent voice assignments without understanding why
- **F2 — No delivery annotation:** She can feel when a line should be slower or more hushed, but there's no way to encode that intent — the engine uses the same default delivery for everything
- **F3 — Shallow character profiles:** A character who speaks in 47 segments has only a name and a color in the character panel — no backstory, no voice guidance, no notes she's added
- **F4 — Stale renders are silent:** When she reassigns a character's voice, she has no clear indicator of which already-rendered chapters are now stale and need re-rendering
- **F5 — Scene flow is broken:** She can play individual segments, but can't play a full scene continuously to hear how dialogue flows — she has to advance segment by segment

## What they need from the studio
- An annotation layer for authorial intent: even a simple "softer / faster / pause before" note per segment that travels with the file
- Character profiles that persist voice guidance notes she writes ("sardonic, speaks in clipped bursts — no warmth")
- A staleness indicator on chapters: "3 segments use an outdated voice — re-render?"
- A "play scene" mode that plays through a block of consecutive segments without stopping
- Text-level pacing cues: the ability to mark a sentence as "slow down here" without changing the voice assignment

## Review lens — questions they ask of any screen
- "Can I tell which voice is reading this segment before it plays?"
- "Is this segment flagged because it failed to render, or because I marked it for my own review?"
- "What happens to already-rendered segments in other chapters if I change this voice now?"
- "Is there anywhere I can write what this character should sound like that persists beyond today's session?"
- "Can I play from this segment to the end of the scene without manually advancing each one?"
- "Does the character panel show me anything beyond a name and a color swatch?"
- "If I come back tomorrow after closing the tab, will my review marks still be here?"

## Red flags that make them quit or distrust the app
- Any screen that conflates "rendered" (audio exists) with "approved" (author checked it) — they're different states
- A voice picker that shows raw voice IDs or file paths instead of cast names she recognizes
- Re-rendering a chapter that silently overwrites audio she's already reviewed and accepted
- Character profiles that offer only a single emotion dropdown — her characters are more complex than one tag
- Progress states that don't distinguish between "this segment hasn't been rendered yet" and "this segment failed"

**Evidence basis:** INFERRED. Validate with literary fiction authors who've done their own audiobook adaptation — especially via Reedsy or ACX self-narration communities. Key question: how do authors describe delivery intent at the sentence level, and what language do they naturally use for it?

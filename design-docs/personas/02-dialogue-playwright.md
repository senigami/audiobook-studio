# 02 · "David Park" — Dialogue Playwright  ☆ INFERRED

**Identity:** "I write plays meant to be heard, not read — every bracket and colon in my script is a performance instruction, and if your parser flattens my stage directions into dialogue, you've just put garbage in my actors' mouths."

## Goals
- Preserve structural distinctions between spoken lines, stage directions, and scene narration during import
- Attribute every line to the correct character without manual cleanup after each paste
- Keep parenthetical tone cues (e.g., `[bitterly]`, `[aside]`) visible in the editor without mixing them into the TTS feed
- Confirm which segments are flagged as safe-to-render vs. structural metadata before committing to a cast
- Produce an audio drama where the chapter structure matches his original scene-act hierarchy

## Context & environment *(INFERRED)*
- MacBook Pro; writes in Final Draft or Fountain, exports to PDF or plain text for import
- Found Audiobook Studio through an audio drama community thread; his first attempt at adapting a stage play to audio production
- Works in focused sessions: imports a full act, reviews what the parser produced, fixes attribution errors manually, then moves to casting — a slow, frustrating loop when the parser misfires

## Key workflow moments
- **Import:** Pastes a Fountain-formatted script and expects character names on their own lines to become segment headers, not dialogue
- **Segment review:** Scans the chapter editor to confirm every line is attributed to the right speaker and every stage direction is excluded from the render queue
- **Voice paint:** Uses voice paint mode to tag ambiguous segments character-by-character when the parser guesses wrong
- **Preview:** Runs a single-segment preview to confirm a character line reads the way he intended before committing the full chapter
- **Export:** Expects the final audio to have natural silence where stage directions would have caused pauses

## Top friction points *(INFERRED)*
- **F1 — Direction collapse:** Stage directions like `[crosses to the window]` are ingested as narrator lines and appear in the render queue, creating unwanted audio artifacts
- **F2 — Attribution ambiguity:** Lines after a stage direction lose their character label if the parser doesn't see a newline-delimited cue, so a dozen lines render as "narrator" instead of a named character
- **F3 — No structural preview:** There's no way to see a diff between "what the script says is dialogue" and "what the app will actually send to the TTS engine" before hitting render
- **F4 — Parenthetical bleed:** Tone cues inside parentheses get read aloud by the TTS engine verbatim (`"bitterly"` spoken as text) because the app doesn't strip or annotate them as non-speech

## What they need from the studio
- A script import mode that recognizes Fountain / screenplay conventions (character cues, action lines, parentheticals) and routes them to the right bucket
- A visual indicator per segment distinguishing "will render as audio" from "structural annotation / skip"
- An inline filter in the chapter editor to show only renderable segments, only stage directions, or all
- A pre-render summary: N dialogue segments, M stage directions excluded, K ambiguous — review before proceeding
- The ability to mark any segment as "performance note only" so it never hits the TTS queue

## Review lens — questions they ask of any screen
- "Can I see at a glance which segments are dialogue versus stage direction without opening each one?"
- "Does the import parser understand character cue lines, or will I spend an hour fixing attribution?"
- "How do I mark a bracketed stage direction as excluded from render without deleting it?"
- "What happens if a character name appears mid-paragraph inside a prose block — does it split or merge?"
- "Can I run a preview on a single line before rendering the whole scene?"
- "Does voice paint mode let me re-attribute a block of consecutive lines in one gesture?"

## Red flags that make them quit or distrust the app
- Opening a freshly imported act and seeing stage directions in the render queue with no way to bulk-exclude them
- A character's spoken line rendered with the parenthetical tone cue read aloud as text
- No undo after accidentally re-attributing a segment in voice paint mode
- The chapter editor showing a flat unstructured wall of segments with no act or scene grouping
- Discovering mid-session that a prior render included a stage direction and having no way to pinpoint which one without re-listening to the whole chapter

**Evidence basis:** INFERRED. Interview audio drama producers and Fountain/Final Draft users who have attempted screenplay-to-audio adaptation; key open question is whether a dedicated import mode or in-editor annotation layer better fits the playwright's revision cadence.

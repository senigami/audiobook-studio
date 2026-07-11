# 04 · "Priya Nair" — Copy Editor  ☆ INFERRED

**Identity:** "I read every line as if I'm about to say it aloud, and when I see 'she would wound the clock each morning,' I already know the TTS engine is going to pick the wrong pronunciation — I need to fix it before it ever hits the queue."

## Goals
- Identify text that looks correct on the page but will sound wrong or ambiguous when spoken
- Flag punctuation errors that will cause the TTS engine to produce unnatural pauses or run-ons
- Correct homophone and heteronym traps before any segment is rendered
- Catch formatting inconsistencies introduced during import (smart quotes vs. straight quotes, em-dash variants, double spaces)
- Verify that sentence-level segmentation boundaries are clean — no fragments split awkwardly at a clause boundary

## Context & environment *(INFERRED)*
- MacBook Air; edits in a combination of the app's chapter editor and a plain text reference document she keeps alongside
- Hired by independent authors and small publishers to do a final proofread pass specifically for audio production; she is not the author and did not write the manuscript
- Works top-to-bottom through a chapter, reading each segment aloud quietly as she reviews it; she often uses the single-segment audio preview to double-check a line she suspects will misfire

## Key workflow moments
- **Import review:** Immediately after import, scans for typographic artifacts — smart quote encoding errors, stray HTML entities, inconsistent dash types — before reading content
- **Heteronym audit:** Reads for words whose pronunciation changes by part of speech or context (`read`, `wound`, `lead`, `tear`, `bow`); flags them with a note for TTS phonetic override
- **Punctuation pass:** Checks that dialogue punctuation closes inside quotes correctly, that em-dashes are unspaced, and that ellipses use the correct Unicode character rather than three periods that may produce triple micro-pauses
- **Preview spot-check:** Uses the single-segment preview to listen to a flagged line and confirm whether the TTS engine handled the ambiguity correctly or needs a phonetic annotation
- **Segmentation check:** Reads segment break points to confirm they don't split a sentence mid-clause in a way that disrupts prosodic flow

## Top friction points *(INFERRED)*
- **F1 — No inline text editing in context:** To fix a typo in a segment, Priya must click into the segment editor, make the change, save, and return to the list — there is no inline editing in the flat chapter view that would let her move efficiently from line to line
- **F2 — No phonetic annotation layer:** There is nowhere in the app to attach a phonetic hint or TTS override to a specific word without modifying the manuscript text itself, which would introduce discrepancies with the author's canonical document
- **F3 — Preview latency breaks the flow:** Running a single-segment preview requires waiting for the TTS engine to spin up and render, which breaks the read-aloud rhythm she uses to catch spoken awkwardness
- **F4 — Formatting artifacts are invisible:** Import normalizes some punctuation silently; Priya has no way to see what was changed during import or confirm whether her smart quotes and em-dashes survived intact
- **F5 — No flag-and-defer workflow:** She can't mark a segment "needs phonetic review" and come back to it — there's no annotation or flag system in the segment editor

## What they need from the studio
- Inline text editing directly in the chapter list view so she can fix a typo without navigating into a separate segment editor
- A per-word phonetic annotation field that the TTS engine reads at render time without modifying the displayed manuscript text
- A segment flag or note system — at minimum a "needs review" tag visible in the chapter editor
- An import report showing what typographic normalizations were applied during ingest (quote style, dash type, whitespace cleanup)
- A batch preview mode that renders a sequence of flagged segments so she can listen through without triggering each one individually

## Review lens — questions they ask of any screen
- "Can I edit a segment's text without leaving the chapter list view?"
- "How do I tell the TTS engine to pronounce 'wound' as a verb without changing the manuscript text?"
- "Does the app show me what punctuation was changed during import?"
- "Can I flag a segment as needing a second listen and come back to it later in the same session?"
- "What happens at a segment break that falls mid-sentence — does the TTS engine handle the prosodic boundary correctly?"
- "Can I run a preview on three specific segments back-to-back without rendering the whole chapter?"

## Red flags that make them quit or distrust the app
- Making a text edit and discovering it modified the source manuscript rather than a production copy, with no indication of the distinction
- Running a single-segment preview and hearing the TTS engine read a heteronym wrong with no path to fix it without altering the text
- Import silently stripping her carefully placed em-dashes and replacing them with hyphens
- No way to leave a note or flag on a segment — forces her to keep a separate document tracking problem lines
- A segment break that splits "She said, 'I know'" into two segments at the comma, producing an unnatural pause between "said" and the opening quote

**Evidence basis:** INFERRED. Interview copy editors who specialize in audiobook production preparation, particularly those with experience submitting manuscripts to ACX or Findaway; key open question is whether a phonetic annotation layer should live in the segment metadata or in a separate pronunciation dictionary keyed to the project.

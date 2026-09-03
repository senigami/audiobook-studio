# 11 · Sensitivity Reader  ☆ INFERRED

**Identity:** "The Sensitivity Reader reviews manuscripts for cultural accuracy and representation before production locks — they need to flag specific lines with notes that reach the production team without needing edit access to the text or the voice cast."

## Goals
- Isolate segments that require review for language, tone, or representation risk
- Attach a comment or flag to a specific line that travels with the project, not just a separate document
- Distinguish between text-level concerns (the words themselves) and performance-level concerns (how the voice renders them)
- See the full chapter in reading context, not broken into individual queue items
- Complete a review pass without accidentally triggering a render or modifying the production project

## Context & environment *(INFERRED)*
- Works remotely; receives access to a shared or exported project from the producer
- Uses the app in a read-focused review mode, not as a production operator
- Reviews 1–2 manuscripts per month per client; each pass is a structured read-through with annotations
- Not familiar with the TTS engine, casting workflow, or rendering queue — those are irrelevant to her work
- Delivers her findings as a structured list of flagged lines with context; the production team acts on them

## Key workflow moments
- **Initial orientation:** Opens the project and wants to read chapters in linear order without the casting panel, queue, or engine controls cluttering her view
- **Flag a line:** Selects or targets a segment, adds a comment (e.g., "stereotyped dialect — check with author"), and tags it with a review category (language, performance, representation)
- **Performance-specific concern:** Notes that a particular character's voice profile may render a line in a way that feels caricatured; needs to flag the voice-segment combination, not just the text
- **Review export:** At the end of the pass, exports or shares a structured list of flagged segments with her comments, so the producer can act on them without requiring the Sensitivity Reader to be in the room
- **Second-pass check:** After the production team responds to her flags, returns to verify that the flagged lines have been addressed — needs to see which flags are open vs. resolved

## Top friction points *(INFERRED)*
- **F1 — No comment or annotation layer:** The chapter editor is a production tool with no native way to attach a reviewer comment to a segment without editing the text itself; the Sensitivity Reader currently maintains a parallel spreadsheet with line references, which can drift from the actual project
- **F2 — Performance risk is invisible before render:** She can read the text, but she cannot preview how a specific voice will render a culturally sensitive line without triggering a render — there is no lightweight playback path for a single segment in review
- **F3 — No read-only mode:** Opening the app gives the Sensitivity Reader the same interface as the producer; they could accidentally modify text, re-cast a character, or queue a render without intending to; there is no review-only role or view
- **F4 — Category and severity are not part of the data model:** If she does manage to leave a note, she can only do so in plain text; there is no structured way to tag a concern as "language risk," "performance risk," or "representation flag" that the team can filter on
- **F5 — No flag-to-segment linking in exports:** Even if she builds her annotation list externally, there is no way to export a project report that links her comments to specific segment IDs or chapter positions the production team can navigate to directly

## What they need from the studio
- A read-only review mode that hides production controls and prevents accidental edits
- Per-segment annotation: attach a comment, category tag, and severity to any segment without touching the text
- Lightweight single-segment playback to evaluate how a voice renders a specific line before flagging it
- A review export: a structured list of all flagged segments with chapter position, segment text, comment, category, and status (open/resolved)
- Flag status tracking: the production team can mark a flag as resolved; the Sensitivity Reader can see the response on their next visit

## Review lens — questions they ask of any screen
- "Can I read this chapter without accidentally changing anything?"
- "How do I attach a note to this specific line without editing the text?"
- "Is there a way to hear how this voice will render this line before I flag it?"
- "When I finish this pass, how do I give my findings to the production team?"
- "Can I tell which of my previous flags have been addressed and which are still open?"
- "Does the app distinguish between a text concern and a voice-performance concern?"
- "Am I looking at the current production version or a draft that might change before render?"

## Red flags that make them quit or distrust the app
- Opening the project puts her in an edit mode with no way to switch to read-only
- There is no annotation feature; she has to maintain an external document and manually sync line references
- She accidentally triggers a render or deletes a segment and has no undo confirmation
- Her review comments are not linked to the segment; if the text is reordered her notes become orphaned
- The only way to preview voice rendering is to queue a full chapter render, which takes minutes

**Evidence basis:** INFERRED. Interview sensitivity readers and cultural consultants who work on audiobook or podcast productions to understand what annotation workflows they currently use and where project drift between their notes and the final production most often occurs.

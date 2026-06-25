# 31 · "Connor Brady" — Dyslexic Reader  ☆ INFERRED

**Identity:** "A self-published fantasy author with dyslexia who uses Audiobook Studio to narrate his own novels and relies on strong visual hierarchy, generous spacing, and a clear primary action on every screen to stay oriented and productive."

## Goals
- Read manuscript text in the chapter editor without eyestrain or tracking errors
- Identify the one primary action on each screen quickly without scanning crowded menus
- Spot segment issues (wrong voice, error state, skipped text) at a glance using shape and position, not only color
- Navigate between chapters and segments in a stable, predictable layout that does not rearrange on state change
- Finish a session without losing his place in a long chapter

## Context & environment *(INFERRED)*
- Has dyslexia; uses the Open-Dyslexic browser extension when available and sets his system to 150% display scaling
- Writes and self-publishes epic fantasy novels of 150,000+ words; his projects in Audiobook Studio are large, multi-chapter, long-session affairs
- Came to Audiobook Studio after a bad experience with a commercial tool that had tiny 10px labels and required reading dense configuration forms before he could start anything
- Works in 2–3 hour focused sessions; if a screen is too visually noisy in the first 30 seconds he abandons it and does something else, then has to re-engage the next day

## Key workflow moments
- **Opening a chapter:** Expects the chapter editor to present text in a single, clearly bounded column with generous line height and at least a 16px base font; walls of small text in narrow, cramped containers make word tracking difficult
- **Scanning the segment list:** Uses shape and position to scan segments quickly — expects consistent row height, a clear visual separator between segments, and error states communicated by both color and an icon or badge shape (not color alone)
- **Finding the primary action:** Expects one visually dominant button on each screen — e.g., "Render Chapter" should stand out from "Export," "Settings," and secondary toolbar controls; when everything looks equally weighted he cannot decide where to look first
- **Switching voices in Voice Paint mode:** Expects a clear visual distinction between "normal view" and "voice paint mode" — the mode switch should be an obvious visual state change, not a subtle toggle indicator he might miss
- **Recovering from an error:** Expects error messages to be short, plain-language, and positioned near the control that caused them — long error logs in small monospace type are unreadable

## Top friction points *(INFERRED)*
- **F1 — Dense segment tables with small text:** Segment lists rendered as compact data tables with 12–13px labels, no row breathing room, and cell content that runs together — visually exhausting after 5 minutes and nearly impossible to scan for a specific segment
- **F2 — Visual weight parity across actions:** Toolbar rows where primary, secondary, and tertiary actions are all rendered as equal-weight icon buttons — no dominant call-to-action, no clear visual hierarchy, forcing Connor to read every label before he can act
- **F3 — Color-only state signaling:** Error, warning, and complete states that differ only in hue (red/yellow/green status dots) with no shape, icon, or text variation — Connor's color discrimination is reliable but the cognitive load of resolving tiny colored circles in a list is high
- **F4 — Unstable layout on state change:** Panels that resize, reorder, or shift position when a render starts or a segment is selected — after the layout shifts he cannot find what he was just looking at
- **F5 — Jargon-heavy microcopy:** Labels like "Requeue failed artifact" or "Reconcile orphaned segments" without plain-language alternatives — he understands the concepts but the technical phrasing adds translation overhead he cannot afford mid-session

## What they need from the studio
- Body text in the chapter editor at a minimum 16px base size with 1.5× line height, with no truncation in segment rows
- One visually dominant primary action button per screen or panel state, clearly differentiated from secondary controls
- Error and status states communicated by icon shape and text label in addition to color
- Stable, non-reordering layouts — new content appends, it does not displace existing landmarks
- Plain-language error messages and action labels, maximum one short sentence

## Review lens — questions they ask of any screen
- "Where is the one thing I should do next on this screen, and is it visually obvious?"
- "Can I scan this list of segments and find a problem row in under 10 seconds without reading every cell?"
- "Is this text big enough and spaced enough that I can track a line without losing my place?"
- "If I look away for 30 seconds and come back, will the layout be in the same place?"
- "Does this error message tell me what happened and what to do, in plain words, in under 15 words?"
- "Is mode state (normal vs. voice paint) visible at a glance without reading fine text?"
- "Does this screen have a clear visual hierarchy, or does everything compete for attention equally?"

## Red flags that make them quit or distrust the app
- A screen with more than 3 visually equal-weight action buttons and no clear primary
- Segment rows so compact that he cannot tell where one ends and the next begins
- An error message longer than two sentences, written in technical jargon, in a small modal
- A layout that shifts when he queues a render, causing him to lose his place in the segment list
- Font size smaller than 14px anywhere that carries content he is expected to read and act on

**Evidence basis:** INFERRED. Conduct moderated usability sessions with 3–5 dyslexic self-published authors to measure time-to-first-action, segment scan accuracy, and error recovery time — and to determine whether font-size overrides via browser extensions break layout integrity.

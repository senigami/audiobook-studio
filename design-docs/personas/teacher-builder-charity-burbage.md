# 34 · Teacher Builder  ☆ INFERRED

**Identity:** "A high school English teacher who needs to produce consistent, classroom-ready audio files week after week without reconfiguring anything from scratch."

## Goals
- Convert lesson handouts and reading passages into audio for students with reading difficulties
- Maintain consistent narrator voice and quality across all files in a unit
- Batch-produce 5–10 short audio files per week without per-project setup
- Export to a predictable location students can access (shared drive, LMS folder)
- Keep the workflow simple enough that a substitute or aide could follow it

## Context & environment *(INFERRED)*
- Works on a school-issued Windows laptop, likely Chrome browser, moderate specs
- Discovered Audiobook Studio through a special-education colleague or teacher forum
- Has no audio production background; approaches the app as a document tool, not a studio
- Works in short sessions between classes or during prep periods — no long uninterrupted blocks
- Produces short projects (1–5 chapters each), many per semester, with heavy reuse of the same narrator voice

## Key workflow moments
- **Project setup:** Creates a new project for each lesson unit; expects voice settings to carry over from her template project or last session without manual re-entry
- **Segment review:** Scans chapter text quickly to catch pronunciation issues before rendering; doesn't want to listen to a full preview just to check one word
- **Batch render:** Queues all chapters at once and walks away; expects a clear summary when it's done, not per-segment notifications
- **Export:** Exports rendered WAV files to a consistent folder path; needs export to remember her last destination
- **Reuse:** Wants to start next week's files using the same voice profile and settings without cloning or reconfiguring

## Top friction points *(INFERRED)*
- **F1 — No project template or defaults memory:** The Teacher Builder re-selects the same narrator voice and settings every new project. There is no way to pin a default voice or duplicate a project as a starting template.
- **F2 — Export path amnesia:** The app does not remember her last export folder. Every export requires navigating back to the same shared drive subfolder.
- **F3 — Batch status is unclear:** When she queues five chapters and comes back 20 minutes later, there is no simple "3 of 5 done, 1 failed" summary — she has to inspect each job individually in the queue panel.
- **F4 — Pronunciation correction is buried:** Fixing a mispronounced word requires editing the segment text, re-rendering, and re-exporting rather than an inline pronunciation hint or substitution rule.

## What they need from the studio
- A way to save and reapply a project configuration (voice, export path, engine settings) as a reusable starting point
- A persistent export path preference per project or globally
- A batch-completion summary: how many files succeeded, which failed, and a single "re-render failed" button
- Inline pronunciation overrides without full segment re-edits
- A "this week's files" view or filtered project list so classroom work doesn't get buried in the project list

## Review lens — questions they ask of any screen
- "Can I start this week's files using last week's exact voice and settings?"
- "How many jobs finished and how many are still running?"
- "Where will this export go — the same folder as last time?"
- "If one chapter fails, do I have to re-render the whole project or just that chapter?"
- "Will a student be able to play this file directly, or does it need conversion first?"
- "Can I fix one word without re-doing the whole segment?"
- "How long will this batch take so I know if I can finish before next period?"

## Red flags that make them quit or distrust the app
- Voice selection resets every time she creates a new project
- Export drops files into an unexpected or hard-to-find location
- A render fails silently and she discovers it only when a student reports a missing file
- The queue panel shows raw technical job IDs rather than the chapter name she recognizes
- Setup takes more than five minutes per new lesson unit

**Evidence basis:** INFERRED. Interview special-education teachers and accessibility coordinators at K–12 schools to validate batch-workflow assumptions and confirm whether export-path memory is the top blocker or whether voice consistency across projects is the more acute pain.

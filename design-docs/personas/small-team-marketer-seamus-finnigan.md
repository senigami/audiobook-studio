# 35 · Small Team Marketer  ☆ INFERRED

**Identity:** "A startup marketer who needs his team to be confident that the audio they ship to subscribers is the approved, final version — not a draft that slipped through."

## Goals
- Convert weekly newsletters and product documentation into branded audio for subscribers
- Route finished renders to a manager for approval before publishing
- Distinguish clearly between draft renders and approved, publish-ready exports
- Reuse the same approved voice and settings across all content types without renegotiating them each time
- Avoid shipping the wrong version again — it has already happened twice

## Context & environment *(INFERRED)*
- Works on a modern Mac at a 5-person startup; shares project files over a common drive or Dropbox
- Found Audiobook Studio through a content-team Slack recommendation or indie maker community
- Uses the app 2–3 times per week in short focused sessions; not a power user but not a beginner
- Manager approves audio over Slack; the approval message references a file name, not a render timestamp or job ID
- The team has no dedicated audio engineer; the Small Team Marketer owns the full workflow from text to publish

## Key workflow moments
- **Render initiation:** The Small Team Marketer queues a chapter render, noting it is a draft; expects a clear "draft" status marker visible in the project and queue panel
- **Export for review:** Exports a render specifically for manager review; wants to label this export as "for review" vs. the prior week's approved file
- **Approval handoff:** Manager listens and approves; the Small Team Marketer needs a way to mark the specific render as approved without re-exporting or relabeling files manually
- **Final publish export:** Exports the approved render to the publish path; expects a hard warning if the file being exported does not match the one the manager reviewed
- **Voice and settings reuse:** Opens a new project for this week's newsletter; wants to load last week's voice profile and engine settings in one step

## Top friction points *(INFERRED)*
- **F1 — No render versioning or approval state:** The app has no concept of "this is the version under review" vs. "this is the approved version." the Small Team Marketer and their manager track this in Slack, which has broken down twice into shipped mistakes.
- **F2 — Export is stateless:** Exporting produces a file but doesn't mark the render as "exported for review" or "approved export." There is no way to know from inside the app which export was the one the manager heard.
- **F3 — Voice settings don't carry between projects:** Each new project starts from scratch. they re-select the same voice, the same engine, and the same quality settings every week — a 3-minute ritual that has caused one configuration error.
- **F4 — Queue shows jobs, not intent:** The queue panel lists render jobs but doesn't reflect whether a job is a draft pass, a review candidate, or the final approved render. All jobs look the same.

## What they need from the studio
- A lightweight render-state model: draft → submitted for review → approved, visible on the chapter or project level
- Export that stamps which render was exported and when, surfaced on re-open so the Small Team Marketer can confirm which file the manager heard
- A warning on export if the project has been modified since the last approved export
- One-click voice profile and settings carry-forward when creating a new project from a previous one
- A project note or comment field so the Small Team Marketer can log "approved by Jamie, 2026-06-20" without leaving the app

## Review lens — questions they ask of any screen
- "Can I tell at a glance whether this is the approved version or a draft?"
- "Is this the same render my manager listened to, or did I re-render since then?"
- "If I export right now, will I get the version she approved or the one I tweaked this morning?"
- "How do I carry last week's voice and settings into this new project?"
- "Where is the file I exported for review — and is it still the latest render?"
- "If I change one segment, does the app warn me that the approval is now stale?"

## Red flags that make them quit or distrust the app
- No indication whether the current render is newer or older than the last exported file
- Export silently overwrites the previous approved file with a re-render
- Voice profile disappears between sessions and the manager notices a voice change in the published audio
- The queue panel clears completed jobs before the Small Team Marketer checks whether the manager's version is still accessible
- There is no way to annotate or label a project with review status without using an external tool

**Evidence basis:** INFERRED. Interview small-team content producers and solo marketers at startups with a review-before-publish workflow to validate whether a lightweight approval state on the project level is sufficient or whether they need file-level versioning tied to export history.

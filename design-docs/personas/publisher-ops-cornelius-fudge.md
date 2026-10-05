# 09 · Publisher Ops  ☆ INFERRED

**Identity:** "The Publisher Ops role is the release gate for a small publisher — they need a checklist that tells them exactly what's complete, what's missing, and what will ship if they approve right now."

## Goals
- See a clear completion checklist before any project leaves the system for distribution
- Confirm cover art, metadata, and chapter files are all present and accounted for
- Control which version of a project gets exported — not the latest auto-save, the approved one
- Track multiple projects across different production stages without opening each one
- Catch last-minute content swaps before they reach the distributor

## Context & environment *(INFERRED)*
- Windows laptop, office environment; not an audio person or a tech person
- Manages 4–8 active audiobook titles at a time, each at a different stage
- Was handed Audiobook Studio by a producer who already set up the projects; the Publisher Ops role approves and exports
- Checks in on projects intermittently — daily progress reviews, not continuous sessions
- Does not render audio herself; she reviews what production has built and decides if it's releasable

## Key workflow moments
- **Morning status sweep:** Opens the project list and wants a status column — not "queued/rendering" but "incomplete / ready for review / approved for release"
- **Release checklist review:** Opens a project and looks for a structured completeness view: all chapters rendered, metadata fields filled, cover present, no pending errors
- **Version confirmation:** Before exporting, needs to know this is the approved version, not a draft someone edited last night without flagging it
- **Export approval:** Triggers the export or marks the project "approved" — she wants this to be a deliberate gate, not just a button that works whenever
- **Deliverable tracking:** After export, needs a record: what was exported, when, to what format — something she can reference in a release log

## Top friction points *(INFERRED)*
- **F1 — No high-level completeness view:** The project list shows titles and render status but not a release-readiness signal; the Publisher Ops role has to open each project and manually check chapters, metadata, and files to decide if it's shippable
- **F2 — No approval/version gate:** Export is available as soon as rendering finishes; there is no "mark as approved" step that separates production-complete from release-approved, so they have no place to put their sign-off
- **F3 — Missing metadata is invisible until export:** Cover art or narrator metadata fields that are empty don't surface as blockers until the export either fails or produces an incomplete package
- **F4 — No export record:** After a project is exported, there is no log of what was included, when, or by whom; the Publisher Ops role has no audit trail for their release records
- **F5 — Late content swaps are silent:** If a producer re-renders a chapter after the Publisher Ops role reviewed it, they have no notification and no render timestamp visible at the chapter level

## What they need from the studio
- A per-project release checklist: metadata complete, cover present, all chapters rendered, no failed segments, no pending re-renders
- An explicit approval gate — a "mark ready for release" action that is distinct from "export"
- Render timestamps at the chapter level, visible in the review flow
- A post-export log or manifest she can save as the deliverable record
- A project-list status column she can use to triage without opening each project

## Review lens — questions they ask of any screen
- "Is this project actually ready to export, or is something still missing?"
- "What changed since the last time I reviewed this project?"
- "If I export right now, what exactly gets included?"
- "Who approved this version and when?"
- "Are there any chapters that were re-rendered after I signed off?"
- "Where do I see whether the metadata is complete?"
- "Can I compare this version to the one I reviewed last week?"

## Red flags that make them quit or distrust the app
- Export succeeds but the resulting package is missing a chapter — with no warning
- No visible render timestamps; can't tell if audio is current or stale
- There is no concept of an "approved" state; every completed project looks the same as a draft
- Metadata errors only surface after export, not before
- Opening a project dumps her into the chapter editor with no summary or status overview

**Evidence basis:** INFERRED. Interview ops staff at small audiobook publishers or podcast production companies who manage release pipelines across multiple simultaneous titles to validate what a release checklist actually needs to contain.

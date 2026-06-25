# 12 · "Helen Novak" — Rights Manager  ☆ INFERRED

**Identity:** "Helen manages rights clearance for a publisher with multi-source licensed content — she needs the system to enforce which parts of a project can be exported and when, without relying on her remembering to check every time."

## Goals
- Mark individual chapters or segments as cleared, restricted, or territory-limited
- Block export of any content that is not fully cleared for audio release
- Track which rights holder controls each piece of content and when clearances expire
- Prevent accidental publication of restricted content when the project is otherwise "complete"
- Generate a rights clearance summary she can attach to a release approval package

## Context & environment *(INFERRED)*
- Windows, office environment; uses the app alongside contract management software and a spreadsheet
- Manages rights for 10–20 active titles; each may involve 2–5 separate rights holders
- Does not produce audio; her involvement is upstream (clearance) and downstream (release gate)
- Comes into Audiobook Studio to mark clearance status and to verify it before approving export
- Some projects involve chapters from an anthology — different chapters cleared by different rights holders on different timelines

## Key workflow moments
- **Initial clearance markup:** Receives a new project from the producer and marks chapters or segments by rights status: cleared, pending, restricted, or territory-limited (e.g., cleared for NA only)
- **Status update:** When a pending clearance comes through, updates the relevant chapter or segment from "pending" to "cleared" — expects this to immediately unblock it for rendering and export
- **Pre-export rights review:** Before approving a release, reviews the project rights summary: what is cleared for which territories, what is still pending, and whether anything has expired
- **Restricted content enforcement:** Expects the app to refuse to include a restricted chapter in an export — not warn her, refuse; she cannot rely on checking manually every time across 20 projects
- **Clearance record export:** Downloads a rights clearance summary for the release approval package — which chapters, which rights holder, clearance date, territory scope

## Top friction points *(INFERRED)*
- **F1 — No rights or clearance status field:** The data model has no concept of clearance status; Helen's only option is to use a chapter title prefix or a note field as a workaround, which the export process ignores entirely
- **F2 — Export does not respect any status gate:** Even if Helen marks something as restricted using an available workaround, the export function includes everything that is rendered; there is no mechanism to exclude content by status
- **F3 — No territory scope on content:** Rights are not just cleared/restricted — they are often territory-specific (a chapter may be cleared for the US but not the EU); the app has no field for territory scope, so Helen must track this entirely outside the system
- **F4 — No expiration tracking:** Some clearances have a time limit; Helen currently maintains an external calendar reminder because the app has no concept of a clearance expiry date that would auto-restrict content when it lapses
- **F5 — No audit trail for clearance changes:** If a rights status changes after production has started, there is no log of who changed it and when; Helen has no way to demonstrate to a rights holder that restricted content was withheld from a specific export run

## What they need from the studio
- A per-chapter (and optionally per-segment) clearance status field: cleared, pending, restricted, territory-limited
- Export enforcement: content not in "cleared" status is excluded from export, not just flagged — this must be automatic, not a manual pre-export checklist step
- Territory scope per clearance: which markets/territories a chapter is cleared for, visible on the chapter record and enforced on territory-specific exports
- Clearance expiry date: a field that auto-downgrades clearance status when the date passes, with a notification to Helen
- A rights summary export: PDF or CSV listing every chapter, its rights holder, clearance status, territory scope, and clearance date — suitable for inclusion in a release approval package

## Review lens — questions they ask of any screen
- "Which chapters in this project are not yet cleared for audio release?"
- "If I run the export right now, will the restricted chapters be excluded automatically?"
- "Which rights holder controls this chapter and when does the clearance expire?"
- "Is this project cleared for all territories we distribute to, or just some?"
- "Where do I see a log of when this chapter's rights status was last changed?"
- "Can I generate a clearance summary I can attach to the release approval?"

## Red flags that make them quit or distrust the app
- Export includes a chapter she marked as restricted, with no warning
- There is no clearance status field anywhere in the chapter or project view
- The app has no concept of territory scope; she has no way to encode NA-only clearances
- Nothing prevents the producer from exporting a project without running it by Helen first
- There is no audit log; if a disputed export goes to a rights holder, she cannot show what was included and when

**Evidence basis:** INFERRED. Interview rights managers at mid-size publishers or content licensing agencies who manage multi-source audiobook catalogs to validate which clearance failures actually reach distribution and how they currently track territory-specific restrictions across active titles.

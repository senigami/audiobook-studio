# 13 · Review-Only Proofreader  ☆ INFERRED

**Identity:** "I need to move through rendered audio quickly, flag specific segments for retakes, and leave the project exactly as I found it — my job ends at the annotation, not the fix."

## Goals
- Listen to rendered chapter audio in sequence without triggering any render or edit workflow
- Attach a comment or retake flag to a specific segment, tied to a timestamp or segment ID
- Hand off a clean list of flagged segments to the producer without exporting anything manually
- Know at a glance which chapters still need his review pass versus which are already signed off
- Stay in a read-only posture throughout — no accidental queue submissions, no voice changes

## Context & environment *(INFERRED)*
- MacBook Pro, shared with the production team; the Review-Only Proofreader logs in under a separate macOS user account
- Brought in by a publisher who already has Audiobook Studio set up; they have never configured the app
- Opens a specific chapter URL the producer sends him, reviews it, adds notes, closes the tab
- Works in short 30–60 minute sessions, often reviewing one chapter at a time across several days

## Key workflow moments
- **Opening a chapter for review:** the Review-Only Proofreader expects to land directly in the chapter's audio playback view with no modal prompts, no onboarding, and no queue activity
- **Navigating to a specific segment:** He skips around by segment — jumping to the third paragraph of a section is a basic need, not an advanced one
- **Flagging a retake:** He attaches a short note ("mispronounced 'Beauchamp'", "pace too fast") to the segment and expects it to persist without a save gesture
- **Checking prior flags:** He needs to see all flags for the chapter in one list so he can confirm he hasn't missed anything before signing off
- **Leaving without touching render state:** Closing the tab or navigating away should never ask him to confirm, save, or resume anything render-related

## Top friction points *(INFERRED)*
- **F1 — Review mode looks editable:** The chapter editor's text view and voice paint controls are visible in the same viewport; they regularly hover over segment controls and second-guess whether clicking will change something
- **F2 — No segment-level navigation anchor:** Jumping to segment 47 of 120 in a long chapter requires scrolling; there is no "go to segment" field or a stable URL hash per segment
- **F3 — Queue status panel creates false urgency:** The queue/ETA panel updates in real time for other jobs running on the same machine; the Review-Only Proofreader sees render progress bars and worries they have triggered something
- **F4 — Flags feel ephemeral:** There is no dedicated annotation surface; comments added to segments are mixed in with production notes and there is no clear "reviewer sign-off" state
- **F5 — No review-scoped view of chapter completion:** they cannot tell at a glance which segments have been reviewed and flagged versus which they have not yet listened to

## What they need from the studio
- A narrow review mode or view that hides all render controls, casting, and queue panels
- Segment-level playback with keyboard navigation (next / previous segment, replay current)
- Persistent retake flags tied to segment IDs, visible in a sidebar list sorted by position
- A chapter-level review status indicator (e.g., "reviewed by the Review-Only Proofreader · 3 flags · 2026-06-24")
- Clear visual separation between read-only annotation actions and production actions

## Review lens — questions they ask of any screen
- "Can I tell within five seconds whether I've already reviewed this chapter?"
- "If I click on this segment control, will it change something I can't undo?"
- "Where is the list of everything I've flagged so far in this chapter?"
- "Is the queue activity I'm seeing something I caused, or is it a background job?"
- "Can I jump directly to the segment the producer mentioned without scrolling?"
- "Will my annotations still be here if I close the browser and come back tomorrow?"
- "Does signing off on a chapter send anything to anyone, or is it just a local marker?"

## Red flags that make them quit or distrust the app
- Accidentally submitting a render job or changing a voice setting with no undo
- Annotations disappearing after a page refresh or app restart
- The chapter editor auto-advancing to voice paint mode when he clicks on a segment
- Queue panels showing error states for unrelated jobs — creates noise that makes him unsure what he did
- No visual distinction between segments he has listened to and segments he has not yet reached

**Evidence basis:** INFERRED. Interview two or three editorial reviewers at audiobook publishers who receive final-proof tasks on already-produced audio, and ask specifically how they currently track retake requests and whether they trust shared tools not to mutate production state.

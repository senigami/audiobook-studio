# 33 · "Oliver Grant" — Deadline Editor  ☆ INFERRED

**Identity:** "A commercial editor under a 48-hour deadline who needs to upload a manuscript, render a draft, and have something playable in time for a client call — and who permanently loses trust in a tool the moment it gives him a false positive status."

## Goals
- Get from file upload to a playing audio draft in under 30 minutes for a short chapter
- Know immediately whether a render is working or frozen, with no ambiguity
- Identify and retry failed segments without navigating deep into configuration
- Compare two voice renderings side-by-side to make a fast casting decision
- Close the app confident that all completed segments are saved and the project is safe

## Context & environment *(INFERRED)*
- Works as a freelance audio editor and post-production coordinator for a mid-sized commercial publisher; manages 4–6 simultaneous audiobook projects during peak season
- Has no patience for onboarding flows; reads no documentation before starting — he expects the critical path (open project → cast → render → play) to be self-evident
- Came to Audiobook Studio under time pressure after his usual tool failed to handle a large file; a colleague recommended it as "fast and local, no upload wait times"
- Tests tools by immediately trying the critical-path workflow; abandons if he hits a blocker in the first 5 minutes; his tolerance for unexplained latency is approximately 8 seconds before he assumes the app is frozen

## Key workflow moments
- **Uploading a manuscript and starting a project:** Expects to see a project open with chapters listed within a few seconds of file import; a long spinner with no progress indication after "Upload" is clicked makes him assume the app hung
- **Casting voices quickly:** Expects to cast all characters from a single panel with a voice preview he can play inline — does not want to leave the casting flow to audition voices in a separate library view
- **Queuing a render and getting immediate feedback:** Expects a visible, updating progress indicator within 3 seconds of hitting Render — a button that appears to do nothing for 10 seconds before a queue item appears is a trust-breaker
- **Identifying failed segments without reading a log:** Expects failed segments to be visually distinct in the chapter view and reachable in one click — wants Retry to be a single action, not a sequence of menu navigations
- **Playing back a completed chapter:** Expects a chapter-level play button that assembles completed segments into a continuous preview — does not want to manually concatenate segment files in a separate audio tool to hear the flow

## Top friction points *(INFERRED)*
- **F1 — False positive completion state:** A segment or chapter marked with a green "complete" indicator that has not actually rendered, or whose audio file is empty/corrupt — Oliver sends this to a client and loses the relationship; false positives are worse than visible errors
- **F2 — Queue latency with no feedback:** The gap between clicking Render and seeing a queue item appear — if it is more than 3–4 seconds with no spinner or intermediate status, he clicks Render again, queues a duplicate, and then has to untangle two competing jobs
- **F3 — No estimated completion time:** Queue items that show a spinner with no ETA, no segment count progress ("12 of 47"), and no elapsed time — he cannot decide whether to wait or come back in an hour, and the uncertainty is cognitively expensive during a deadline session
- **F4 — Error recovery requires log reading:** Segment failures that surface only as a small error badge, requiring him to open a log panel or detail view to find a retry button — he wants Retry surfaced at the segment row level, not behind a secondary panel
- **F5 — No chapter-level audio preview:** No way to play a complete chapter as a continuous stream from within the app — he has to export and open an external player to hear whether character transitions and pacing work, adding 5+ minutes to every review loop

## What they need from the studio
- A visible, updating progress indicator within 3 seconds of any render submission — something that proves the job is moving
- Segment and chapter completion states that are only marked green when audio is verified present and non-empty
- Queue items that display a progress fraction ("12 / 47 segments") and an estimated finish time alongside the spinner
- Inline Retry button at the segment row level for any failed segment, no secondary panel required
- A chapter-level sequential playback control that streams completed segments in order within the app

## Review lens — questions they ask of any screen
- "If I start a render right now, how soon do I know it is working — not just queued, but actually processing?"
- "Is this green status icon backed by a real verification, or is it set the moment the job is submitted?"
- "If three segments fail in the middle of a 50-segment chapter, how many clicks does it take to retry all three?"
- "Can I hear the whole chapter from within the app, or do I have to export and open it elsewhere?"
- "How do I know the queue is not frozen — what is the visual signal that active work is happening?"
- "If I close the app and reopen it, will my completed segments still be there and correctly marked?"
- "How long is this render going to take — is there any estimate I can use to decide whether to wait or come back?"

## Red flags that make them quit or distrust the app
- A completed-state indicator on a segment whose audio file is missing or empty — this is the single highest-trust-damage event
- Clicking Render and seeing no response for more than 8 seconds — he will click it again and create a mess
- A queue panel that shows only a spinner and a job name, with no fraction progress or time estimate
- Retry for a failed segment requires more than 2 clicks from the chapter view
- Any session where he cannot tell whether the app saved his work before he closed it

**Evidence basis:** INFERRED. Shadow commercial editors working under real deadlines (2-day turnarounds) to measure time-to-first-playback, retry click counts, and the frequency of false-positive completion states in current builds — then quantify trust impact of each failure mode.

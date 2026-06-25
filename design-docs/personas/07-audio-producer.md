# 07 · "Marta Sokolowski" — Audio Producer  ☆ INFERRED

**Identity:** "My job is to know before anyone else whether a render is actually releasable — and I can't do that if the queue shows green on a job that finished with three silent segments and a corrupted WAV nobody caught."

## Goals
- Monitor render queue health across multiple active projects simultaneously, not just one at a time
- Identify failed, partial, or low-quality renders before they reach final assembly — not after
- Manage retakes efficiently: flag specific segments for re-render, track their status, and confirm completion
- Control the final assembly step: approve which jobs feed into the finished audiobook and which are held back
- Get a clear picture of what's in-progress, what's blocked, and what's release-ready without drilling into each project individually

## Context & environment *(INFERRED)*
- Windows workstation with two monitors; runs Audiobook Studio locally; manages 8-10 concurrent projects at different stages of production
- Brought in at the production stage — manuscripts are already cast and partially rendered when she takes over; she inherits queue state from editors and narrators
- Works in a monitoring cadence: checks queue status in the morning, handles exceptions during the day, approves completed chapters for assembly at end of day; she is not in the app continuously

## Key workflow moments
- **Morning queue check:** Opens the queue panel and immediately wants a summary: how many jobs completed overnight, how many failed, how many are still running, and whether any completed jobs have quality warnings
- **Failure triage:** When a job fails or produces a suspect render, needs to see exactly which segments failed, what the error was, and whether it's a retryable transient error or a content problem requiring a pickup
- **Retake management:** Flags specific segments for re-render, confirms they enter the queue correctly, and tracks their completion without having to monitor the queue in real time
- **Assembly gate:** Reviews a chapter's full segment list before triggering final assembly — wants to see segment-level status (rendered / pickup needed / error) in one view to confirm every line is clean
- **Cross-project overview:** Occasionally needs to see render status for all active projects in a single view, not chapter-by-chapter within one project

## Top friction points *(INFERRED)*
- **F1 — Green status on partial failures:** A chapter job completes and shows as "done" in the queue even when individual segments failed silently — WAV files exist but some are zero-length or clipped; the queue panel offers no per-segment quality signal
- **F2 — No cross-project queue view:** The queue panel is scoped to one project at a time; Marta has to switch projects to check each one, making it impossible to get a production-wide status at a glance
- **F3 — Retake tracking is manual:** There's no first-class "retake" workflow — she flags a segment, it re-enters the queue as an ordinary job, and she has no way to distinguish retake jobs from first-run renders or confirm which retakes have been resolved
- **F4 — Error messages lack actionability:** When a job fails, the queue shows an error string from the TTS engine that describes what broke technically but doesn't indicate whether it's a transient engine error (retry safe) or a content error (needs human intervention)
- **F5 — Assembly lacks a pre-flight check:** Triggering final assembly doesn't require or surface a segment-completeness check; she has to verify manually that every segment is present and rendered before committing to assembly

## What they need from the studio
- A queue summary view showing job health across all active projects: completed clean, completed with warnings, failed, in progress — in one panel without project-switching
- Per-segment status indicators within a chapter view: rendered-clean, rendered-warning, failed, retake-pending, retake-complete
- A retake workflow with first-class queue tracking: flag a segment for retake, have it appear as a distinct retake job, and see retake resolution status separately from first-run renders
- Error classification on failed jobs: transient (auto-retry safe) vs. content error (requires pickup or manual fix), surfaced in plain language
- A pre-flight checklist gate before assembly: N segments expected, N rendered clean, 0 missing or failed — must confirm before assembly proceeds

## Review lens — questions they ask of any screen
- "Does 'completed' mean every segment rendered cleanly, or just that the job finished without crashing?"
- "Which jobs across all my active projects failed or produced warnings in the last 24 hours?"
- "Can I tell the difference between a first-run render and a retake job in the queue?"
- "What do I need to resolve before I'm allowed to trigger final assembly on this chapter?"
- "If a segment failed, does the error tell me whether to retry it automatically or send it back for a pickup?"
- "Can I see per-segment render status for a chapter without re-rendering the whole thing?"
- "How do I know a WAV file is actually valid and not just present with zero audio content?"

## Red flags that make them quit or distrust the app
- A chapter marked complete in the queue that contains silent or clipped segments discoverable only by listening to every WAV manually
- No way to see render status across multiple projects without navigating project-by-project
- Triggering final assembly and only then discovering a segment was never rendered because it was marked "done" by a partial job
- Failed jobs with error messages that reference internal engine state rather than telling her what action to take
- A retake she flagged and queued appearing indistinguishable from new first-run renders, with no way to confirm the specific segment was resolved

**Evidence basis:** INFERRED. Interview post-production supervisors and audio QC leads at mid-size audiobook publishers managing multiple concurrent titles; key open question is whether cross-project queue visibility should be a dedicated production dashboard view or an extension of the existing queue panel with project-level grouping.

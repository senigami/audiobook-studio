# 40 · Support Triage Agent  ☆ INFERRED

**Identity:** "A support professional who needs the app to do half the diagnostic work for her — structured failure context, traceable job provenance, and state she can share without asking a user to open DevTools."

## Goals
- Reproduce a reported failure from a ticket without needing the user to describe what they did
- Separate user error, app error, and plugin error within the first two minutes of opening a case
- Collect a complete job snapshot (segments, errors, timestamps, plugin version) that can be attached to a bug report
- Identify patterns across multiple users reporting the same failure class without opening each ticket individually
- Close tickets faster by pointing users at a specific labeled step, not a generic troubleshooting script

## Context & environment *(INFERRED)*
- Works support for an audiobook production service that deploys Audiobook Studio to 50+ internal users
- Sees 5–15 render failure tickets per week; most arrive as "it didn't work" with no other detail
- Cannot ask users to open browser consoles, read log files, or navigate to config directories
- Accesses the same Studio instance the user was working in; needs job history to persist long enough to triage retroactively
- Has no background in audio engineering; diagnoses by pattern-matching structured error output, not by interpreting waveforms

## Key workflow moments
- **Ticket intake:** Opens the queue panel and filters by job ID, date range, or status to find the failed job a user is referencing
- **Failure inspection:** Opens the job detail view expecting to see the exact error message, the segment that triggered it, the plugin that handled it, and the timestamp — all without scrolling through a raw log
- **Error attribution:** Reads a structured failure reason ("plugin returned empty audio on segment 14" vs. "orchestrator timeout waiting for TTS server") to decide whether to escalate to engineering or close as user error
- **State export:** Copies or downloads a job diagnostic bundle — segments, errors, plugin versions, queue provenance — to attach to a bug report or share with the engineering team
- **Pattern recognition:** Scans recent failed jobs to see if multiple users are hitting the same error class, surfaced without opening each job individually

## Top friction points *(INFERRED)*
- **F1 — Generic error messages:** Queue shows "render failed" with no segment context, no plugin attribution, no timestamp precision; the Support Triage Agent has to guess what actually happened
- **F2 — No shareable diagnostic state:** There is no export or copy action for job failure details; they paste text manually from whatever the UI surfaces
- **F3 — Ephemeral job history:** Completed or failed jobs disappear from the queue view after some retention window; by the time a ticket arrives, the job is gone
- **F4 — User error looks like app error:** A user uploading a zero-byte audio sample produces an error that reads identically to an engine crash; triage requires knowing the input was bad, not the engine
- **F5 — No cross-job summary:** Failed jobs across projects are not aggregated anywhere; the Support Triage Agent opens projects one at a time hunting for the failure

## What they need from the studio
- Structured failure messages with three fields: what failed, which component failed it (plugin name + version, or orchestrator), and which segment triggered it
- A "copy diagnostic bundle" action on any failed job that produces a pasteable JSON or text summary
- Job history retention long enough to survive the typical ticket-filing delay (at least 7 days post-failure)
- Input validation errors distinguished from engine errors in the failure reason field
- A cross-project failed-jobs view or filter accessible without opening individual projects

## Review lens — questions they ask of any screen
- "If this job failed, does the error message tell me which segment, which component, and what the component returned?"
- "Can I copy the full failure context from this screen without opening a browser console or reading a log file?"
- "How long does a failed job stay visible in the queue before it disappears?"
- "Does the app distinguish between a user input problem and an app or plugin problem in the error it surfaces?"
- "If ten users hit the same error this week, is there any place in the app where that pattern is visible?"
- "Can I find a specific failed job by date and status without knowing its project name?"
- "Does the job detail view show me which plugin version handled this render?"

## Red flags that make them quit or distrust the app
- Error messages that say only "failed" with no structured context — untriageable without engineering involvement
- No way to export or copy job diagnostic state; triage requires manual text assembly
- Failed jobs vanish before a ticket is even filed
- User input errors and engine crashes produce identical-looking failure messages
- The queue has no filter for failed jobs across all projects; every triage starts with a project-by-project hunt

**Evidence basis:** INFERRED. Interview support staff at studios or services that deploy shared Audiobook Studio instances to validate failure message specificity, job history retention needs, and whether a diagnostic export action would reduce ticket resolution time.

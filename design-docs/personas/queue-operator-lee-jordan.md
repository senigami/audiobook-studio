# 23 · Queue Operations Specialist  ☆ INFERRED

**Identity:** "A render-queue triage specialist who needs to know at a glance which job is actually running, who owns it, and what the fastest recovery path is — without losing any completed work."

## Goals
- Identify the single active job at any moment without reading log files
- Inspect live queue metadata (ETA, segment count, child jobs) without digging into state.json manually
- Recover a stuck or stale job without re-running completed segments
- Surface hidden "zombie" jobs — entries that appear finished but still hold child work
- Distinguish a real failure from a stale terminal state so they don't kill a job that is silently recovering

## Context & environment *(INFERRED)*
- Mid-range workstation running Windows; accesses the app at localhost:8123 from a browser tab kept permanently pinned
- Came to Audiobook Studio when the studio scaled past what one producer could monitor; the Queue Operations Specialist was assigned the queue
- Typical pattern: arrives after something breaks; does not typically initiate renders but is called in when producers report a stuck bar or frozen ETA

## Key workflow moments
- **Queue audit:** Opens the queue panel and immediately scans for any job whose status says "running" but whose progress has not advanced in the last few minutes
- **ETA drift check:** After a queue update or restart, verifies that ETA values are recalculated from current state, not carried over from a pre-restart snapshot
- **Child-work inspection:** For a job that claims completion, confirms no child segments or assembly tasks are still pending
- **Cancel and requeue:** When a job is stuck, cancels it cleanly and requeues from the last completed segment checkpoint — not from scratch
- **Handoff documentation:** Records what state the queue was in, what action they took, and what the job is doing now

## Top friction points *(INFERRED)*
- **F1 — Stale terminal states:** A job shows "completed" in the UI while the orchestrator still holds an active child task; there is no UI surface that exposes child job ownership
- **F2 — ETA drift after restart:** After recovery.py restores tasks, displayed ETAs reflect pre-restart estimates rather than fresh calculations, making it impossible to know how long is actually left
- **F3 — No single "active job" indicator:** The queue panel shows all jobs by recency, but the one job currently consuming the GPU is not visually distinguished from queued or paused ones
- **F4 — Silent recovery ambiguity:** When the orchestrator auto-recovers a task, there is no event or status change visible in the queue panel — the job just starts moving again, leaving the Queue Operations Specialist uncertain whether their manual action worked or something else resolved it

## What they need from the studio
- A persistent "currently active" indicator that reflects orchestrator state, not UI inference
- A child-job count or dependency view accessible from the queue row
- ETA recalculation confirmation after any restart or recovery event
- A structured cancel/requeue flow that preserves completed segment artifacts
- An activity log scoped to a single job, showing state transitions and who triggered them

## Review lens — questions they ask of any screen
- "Which job is the GPU working on right now — not which is 'running' in the DB, but what the orchestrator is actually dispatching?"
- "If this ETA was computed before the restart, is it labeled as stale?"
- "Can I see whether child tasks (assembly, bake) are pending without opening developer tools?"
- "If I cancel this job, will completed segment WAVs be preserved for requeue?"
- "What triggered the last status change on this row — user action, auto-recovery, or watchdog restart?"
- "Is there any job holding an exclusive resource lock that isn't surfaced in the queue view?"

## Red flags that make them quit or distrust the app
- A job marked "done" that still has work in flight with no UI indication
- ETA values that decrease by large jumps or reset to a higher number after a queue update
- A cancel action that appears to succeed in the UI but leaves the orchestrator running the job
- No visible distinction between "queued," "active," and "recovering" job states
- Progress percentages that match across two jobs at the same time — a sign the UI is showing cached state

**Evidence basis:** INFERRED. Interview studio operations staff at mid-size audiobook publishers who manage batch rendering pipelines; key open question is whether queue operators work primarily from the UI or from direct DB inspection.

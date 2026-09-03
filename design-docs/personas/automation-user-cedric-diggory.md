# 19 · Automation User  ☆ INFERRED

**Identity:** "A publisher-side engineer who treats Audiobook Studio as a headless API and needs every endpoint to behave predictably enough to build an unattended, idempotent production pipeline around it."

## Goals
- Submit 200+ chapter render jobs per week via API without manual intervention
- Poll job status reliably: a job that completes or fails must stay in its terminal state — no regressions
- Make scripts idempotent: re-submitting a job for a chapter that already has a completed render should not create a duplicate or restart the render
- Retrieve structured error payloads that categorize failure reason (engine error, missing voice, segment limit exceeded) without screen-scraping logs
- Download finished WAV files via a stable, predictable path pattern

## Context & environment *(INFERRED)*
- Works on a Linux server; Studio is running as a persistent process managed by systemd
- Came to Audiobook Studio because it offers voice cloning locally — no per-character API cost, no data leaving the building
- Runs a Python script using `httpx` that loops over a manifest of chapter IDs, submits each to Studio's API, polls every 30 seconds, and writes the WAV path to a completion log
- Rarely opens the browser UI; monitors the system through API responses and log files
- Occasionally uses the UI to debug a character that was misconfigured and is producing bad audio

## Key workflow moments
- **Batch submission:** Script POSTs a render job for each chapter in sequence; expects a job ID back and a way to check whether that chapter was already rendered (to skip it on retry)
- **Status polling:** GETs job status every 30 seconds; needs `status`, `progress`, and `error` fields to be stable and machine-readable — not human prose in a single `message` field
- **Duplicate detection:** Script reruns after a partial failure; needs to know whether re-submitting chapter 47 will trigger a new render or acknowledge the existing one
- **Error handling:** A segment with no voice assignment returns an error; the script needs to surface which segment and why, then move on to the next chapter without aborting the whole batch
- **File retrieval:** Completed render has a WAV at a predictable path; script downloads it and archives it — path must not change between a 200 response and a later reconciliation pass

## Top friction points *(INFERRED)*
- **F1 — No idempotency key:** The API accepts re-submissions of the same chapter without deduplication. A script that retries on network error ends up with two queue entries for the same chapter; the second one wins and overwrites the first, but there is no signal that this happened.
- **F2 — Terminal states not guaranteed:** A job that returned `completed` can disappear from the status endpoint after a server restart if it was only tracked in memory and not persisted to SQLite. The script's completion log diverges from reality.
- **F3 — Unstructured errors:** Engine failures surface as a single `error: "TTS server error"` string with no machine-readable error code, segment ID, or retry hint. The script can log the string but cannot categorize the failure or determine whether to retry.
- **F4 — Progress endpoint races:** A job submitted by the script may not appear in the status endpoint immediately — there is a brief window between enqueue acknowledgment and the job being queryable. Scripts that poll immediately after submission get a 404 and must special-case the race.

## What they need from the studio
- An idempotency mechanism: either a client-supplied idempotency key or a deterministic job ID derived from chapter ID + render config, so re-submissions are safe
- Guaranteed persistence of terminal states (`completed`, `failed`) across server restarts — not just in-memory
- Structured error payloads: `{ "error_code": "NO_VOICE_ASSIGNED", "segment_id": 42, "retryable": false }` rather than a prose string
- A stable, documented WAV file path pattern (or a download URL in the completion response) that does not change between submission and retrieval
- A `/api/v1/tts/docs` (OpenAPI) that is kept accurate with every API change — the automation script is built from this contract

## Review lens — questions they ask of any screen
- "If my script calls this endpoint twice with the same input, what exactly happens the second time?"
- "Does this status value persist across a server restart, or is it only in memory?"
- "Is this error response structured enough for a script to categorize without parsing the message string?"
- "What is the window between job submission and the job being queryable on the status endpoint?"
- "Does the WAV file path in the response stay valid, or can it be garbage-collected before I retrieve it?"
- "If I submit 50 jobs simultaneously, does the queue ordering remain deterministic?"
- "Is there a way to list all jobs for a given chapter so I can detect accidental duplicates?"

## Red flags that make them quit or distrust the app
- A completed job disappears from the status endpoint after a server restart — terminal states must be durable
- Re-submitting an identical job silently starts a new render without any indication a completed render already exists
- The WAV path returned at completion is not accessible — either GC'd, moved, or behind a path that requires the browser session
- API error responses differ in shape between engine types (XTTS returns `{ "detail": "..." }` while tts_mixed returns `{ "error": "..." }`)
- The OpenAPI spec at `/api/v1/tts/docs` is stale and documents parameters that no longer exist or omits ones that do

**Evidence basis:** INFERRED. Interview operators at small publishers or podcast networks running Studio in a headless or semi-automated setup; key open question is whether the idempotency gap is a real production pain point or whether operators work around it with chapter-level file-existence checks.

# 14 · "Kenji Watanabe" — API Integrator  ☆ INFERRED

**Identity:** "Kenji treats every API boundary as a contract to be stress-tested — he needs Studio's endpoints, WebSocket events, and failure envelopes to be explicit enough that he can build reliable automation around them without reading the source."

## Goals
- Submit synthesis jobs programmatically via the TTS API (`/api/v1/tts`) and track them through the queue without touching the UI
- Subscribe to WebSocket progress events and reliably determine when a job has completed, failed, or been cancelled
- Map every failure mode to a deterministic response shape so his retry and error-escalation logic can be written once
- Validate that plugin-reported capabilities (text_chunk_limit, progress_pattern) are actually honored under load
- Wire Studio into a manuscript pipeline that triggers synthesis on chapter approval without human intervention

## Context & environment *(INFERRED)*
- macOS or Linux dev machine; Studio running locally on port 8123 or in a Docker-equivalent local setup
- Found Studio because the team needed a local-first TTS solution with API access — chose it over cloud providers for data residency reasons
- Never opens the browser UI except to confirm something he observed in the API; his primary surface is curl, Postman, and a Python test harness
- Works in burst sessions: heavy integration work when wiring a new pipeline stage, then quiet monitoring while the pipeline runs overnight

## Key workflow moments
- **Submitting a job via API:** POST to `/api/v1/tts` with an `Authorization: Bearer` key, a text payload, a voice ID, and engine preferences — expects a job ID back immediately, not a synchronous response
- **Tracking job progress over WebSocket:** Subscribes to `/ws`, filters on job ID, expects event frames with `type`, `job_id`, `progress`, and `eta_seconds` fields — needs the frame schema documented and stable across minor versions
- **Handling partial failures:** A chunk fails mid-synthesis; Kenji needs the event stream to tell him which segment failed and whether the job is retryable or terminal before he decides to resubmit
- **Validating a new plugin's contract:** Installs a plugin by dropping it in `plugins/`, restarts the TTS server, then hits `GET /engines` or equivalent to confirm the engine registered and its manifest-declared limits match what the API enforces
- **Rate-limit behavior:** The API enforces rate limits via `app/core/security.py`; Kenji needs the 429 response to include a `Retry-After` header he can use directly, not just an error message

## Top friction points *(INFERRED)*
- **F1 — WebSocket frame shape is undocumented:** Progress events are consumed by the frontend via `liveEvents.ts` but there is no published JSON schema for external consumers; Kenji reverse-engineers the frame format from the frontend source or by watching the socket
- **F2 — Incomplete payload accepted silently:** The API accepts a synthesis request that is missing optional-but-expected fields (e.g., voice ID fallback behavior) and silently applies defaults; Kenji only discovers the default behavior when the audio comes back wrong
- **F3 — Plugin capability mismatch not surfaced at request time:** A plugin declares `text_chunk_limit: 500` in its manifest but the API does not reject or warn on a 2000-character payload — it either silently truncates or fails mid-job
- **F4 — No canonical error code taxonomy:** HTTP errors return varied JSON shapes; some have `detail`, some have `error`, some have both; retry logic requires pattern-matching against message strings rather than stable numeric codes
- **F5 — TTS server restart is invisible to API consumers:** When the watchdog restarts the TTS subprocess, in-flight jobs may silently re-queue or drop; the API does not emit a disruption event that external consumers can detect and act on

## What they need from the studio
- A machine-readable OpenAPI spec (already at `/api/v1/tts/docs`) that covers all error shapes, not just the happy path
- A stable, versioned WebSocket event schema with a changelog — or at minimum, the TypeScript types in `liveEvents.ts` exported as JSON Schema
- Explicit rejection (422 with field-level detail) when a request violates a plugin's manifest-declared constraints
- A uniform error envelope: `{ "error_code": "VOICE_NOT_FOUND", "message": "...", "retryable": false }` across all endpoints
- A health or disruption event on the WebSocket when the TTS server restarts, so consumers can decide whether to resubmit

## Review lens — questions they ask of any screen
- "What is the exact JSON shape of a successful response, and what is the exact shape of every failure mode?"
- "If this request succeeds but the downstream TTS engine fails later, how will I find out?"
- "Is this field required, optional with a default, or optional with undefined behavior if omitted?"
- "What happens to in-flight jobs when the TTS server subprocess restarts?"
- "Does this endpoint enforce the plugin's manifest-declared constraints, or does it rely on the plugin to self-enforce?"
- "Is the WebSocket event ordering guaranteed, or can a `completed` event arrive before the last `progress` event?"
- "Can I replay the event history for a job I missed while disconnected, or is the stream strictly live?"

## Red flags that make them quit or distrust the app
- A valid-looking API response that is missing a field his code expects — silent contract drift
- Jobs that disappear from the queue without a terminal event (completed / failed / cancelled)
- Rate-limit responses that do not include retry guidance, forcing exponential backoff guesswork
- Plugin install failures that return 200 but leave the engine in a partially-registered state
- Any behavior that only works correctly when the browser UI is also open — a hidden coupling to the frontend WebSocket session

**Evidence basis:** INFERRED. Interview engineers at small publishers or podcast networks who have tried to automate audiobook production pipelines against local TTS tools, and ask specifically where the API contract broke down under automation and what they had to read source code to understand.

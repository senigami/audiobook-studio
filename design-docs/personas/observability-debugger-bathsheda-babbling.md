# 24 · Observability Debugger  ☆ INFERRED

**Identity:** "A diagnostics analyst who investigates intermittent progress display bugs by tracing WebSocket events back to their backend emitters — and who needs tools that distinguish 'event was broadcast' from 'UI actually processed it once.'"

## Goals
- Identify the backend call that emitted a specific WebSocket frame without reading raw logs line by line
- Correlate orchestrator state snapshots with the event timeline to find causality, not just symptoms
- Distinguish duplicated event emission from a single event processed twice on the frontend
- Reduce log noise so that the signal (the anomalous frame) is visible inside the normal stream
- Prove that a consumer received an event exactly once, not zero or more times

## Context & environment *(INFERRED)*
- Mac with a second monitor dedicated to the browser's DevTools Network and Console panels
- Joined the project after a series of escalations: producers reported progress bars that froze mid-render or showed a percentage higher than the backend's actual state
- Work pattern: reproduces a bug in a controlled render, captures WebSocket traffic, compares against orchestrator logs, forms a hypothesis, writes a targeted test

## Key workflow moments
- **Frame capture and tagging:** Opens the `/ws` WebSocket in the browser's Network tab, filters by the job ID, and looks for the source and classification fields on each progress frame to find the emitter
- **State snapshot comparison:** At the moment of the UI anomaly, reads the orchestrator's in-memory state (via a debug endpoint or log snapshot) and compares it to the last frame the UI received
- **Duplicate event hunt:** Searches for the same (job_id, progress_value) pair appearing more than once in the event stream — a sign that `broadcast_progress` was called from two paths for the same update
- **Consumer verification:** Confirms the frontend store received the update exactly once by checking the React state history (Redux DevTools or custom store logging)
- **Regression test authoring:** Writes a pytest test that publishes a synthetic event through `publishStudioSocketMessage` and asserts the store sees it once and advances to the correct value

## Top friction points *(INFERRED)*
- **F1 — Mixed source/classification fields:** Progress frames sometimes carry source values that name the broadcast helper rather than the originating orchestrator module, making it impossible to trace back to the actual emitter without reading call stacks
- **F2 — Stale debug timelines:** The app's internal event log is append-only but is not cleared between renders; when investigating a frozen bar, the relevant frames are buried under noise from previous runs
- **F3 — No single-event delivery proof:** There is no built-in mechanism to confirm that a given frame was delivered to exactly one active WebSocket subscriber and that the subscriber processed it — "broadcast" and "received" are conflated in logs
- **F4 — Progress threshold gating hides causality:** The orchestrator only broadcasts when progress advances ≥ 1%; this is correct behavior, but it means a frame the Observability Debugger expects to see may legitimately be missing, and distinguishing "not emitted" from "emitted but dropped" requires log correlation that is not currently automated

## What they need from the studio
- A frame-level trace that records the call site (module + function) that triggered each `broadcast_*` call, not just the helper name
- A debug mode that clears the event log at job start and labels each frame with a monotonic sequence number
- A subscriber receipt log: for each frame, which WebSocket connections received it and whether delivery was acknowledged
- Test helpers that assert "this frame was emitted exactly once for this job" without requiring full UI automation
- Clear documentation of the progress gating rule (≥ 1% threshold) and which orchestrator paths bypass it

## Review lens — questions they ask of any screen
- "Which backend module actually called `broadcast_progress` — is the source field specific enough to answer that?"
- "Is this progress value the first time it crossed this threshold, or is it a duplicate emission from a second code path?"
- "If the UI shows 75% and the backend is at 40%, which WebSocket frame explains the gap — and when was it emitted relative to the state snapshot?"
- "Does this event log distinguish 'not yet emitted' from 'emitted and not received' from 'received and ignored'?"
- "When a progress bar freezes, is the last frame before the freeze gated by the ≥ 1% rule or is it a genuine emission failure?"
- "Is there a sequence number on these frames so I can tell if any were dropped between broadcast and UI update?"
- "Which events have a classification field, and does that field actually map to a stable taxonomy?"

## Red flags that make them quit or distrust the app
- A `source` field that always reads `broadcast_progress` regardless of which orchestrator module triggered it
- An event log that grows unboundedly across renders with no way to scope it to a single job
- A progress value that appears twice in the stream with different sequence positions but identical fields — duplication with no fingerprint
- Debug endpoints that return a cached snapshot rather than live orchestrator state
- A test suite that mocks the WebSocket layer and therefore cannot distinguish broadcast from delivery

**Evidence basis:** INFERRED. Interview frontend engineers and QA leads at companies shipping real-time audio production tools; key open question is whether teams rely on browser DevTools or custom instrumentation for WebSocket-level event tracing.

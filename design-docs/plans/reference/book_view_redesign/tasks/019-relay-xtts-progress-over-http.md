# 019 — Relay XTTS progress markers so render status/highlight is live

- **Status:** done (verify live)
- **Workload:** Real-app bug fixes
- **Severity / type:** major · contract (fusion-panel triage, 2026-06-17)
- **Blocked by:** nothing
- **Blocks:** nothing

## Why
An XTTS render completed but the job stayed at status "preparing" the whole time and segments never highlighted. Root cause (3-agent panel, high confidence): XTTS runs in the TTS-server process and is called over a blocking HTTP `/synthesize`; the worker's progress markers (`[START_SYNTHESIS]/[START_SEGMENT]/[SEGMENT_SAVED]/[PROGRESS]`) were consumed in-process by `engine.py parse_output` and never written to the server process's own stderr — the only stream the watchdog (`app/engines/watchdog.py _drain_stream`) drains and forwards to the orchestrator's `log_listener` (which flips preparing→running and broadcasts segment highlights). The `mixed` engine worked only because it runs locally and relays lines.

## What was done
`plugins/tts_xtts/plugin/server/engine.py`: added a torch-free `relay_marker(line, task_id)` and called it from `parse_output`; recognized markers are re-emitted to the server's own `sys.stderr` in the EXACT format the watchdog parser expects (`watchdog.py:552-580`), appending `req.task_id` where the worker omits it (`[START_SEGMENT] {sid} {task_id}`, `[SEGMENT_SAVED] {path} {task_id}`; START_SYNTHESIS/PROGRESS pass through). The existing watchdog→`log_listener` pipeline then drives `status="running"` (`orchestrator_helpers.py:573`) and the segment highlight (`:616`). Tests in `plugins/tts_xtts/tests/test_engine_progress_relay.py`; revert-checked; suite green.

## Verify live + caveat
Restart the TTS server, re-render → status should go preparing→running and segments should light up as they render. **Caveat:** correlation requires `req.task_id` (the TTSRequest's task_id) to equal the orchestrator's job `context.task_id` (`log_listener` filters on it, `orchestrator_helpers.py:522`). If the highlight still doesn't fire, that id mismatch is the next thing to check.

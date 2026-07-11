"""Fake xtts_inference.py --serve stub for warm-worker tests.

Implements the same stdin/stdout/stderr protocol as the real serve loop:
- Reads line-delimited JSON jobs from stdin.
- Emits stderr markers: [START_SYNTHESIS], [START_SEGMENT], [PROGRESS], [SEGMENT_SAVED].
- Writes a JSON sentinel to stdout: {"done": true, "rc": <int>}.

Environment variables:
    FAKE_WORKER_RC          — return code to emit (default 0).
    FAKE_WORKER_CRASH_AFTER — crash after N jobs (default: never).
    FAKE_WORKER_EMIT_SEGMENT — if "1", emit [START_SEGMENT] and [SEGMENT_SAVED] markers.
"""

from __future__ import annotations

import json
import os
import sys

rc_to_emit = int(os.environ.get("FAKE_WORKER_RC", "0"))
crash_after = os.environ.get("FAKE_WORKER_CRASH_AFTER", "")
emit_segment = os.environ.get("FAKE_WORKER_EMIT_SEGMENT", "") == "1"
emit_model_ready = os.environ.get("FAKE_WORKER_EMIT_MODEL_READY", "") == "1"

jobs_done = 0

# Signal readiness.
print("FAKE_WORKER_READY", file=sys.stderr, flush=True)
if emit_model_ready:
    print("XTTS serve mode: model ready — waiting for jobs", file=sys.stderr, flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue

    try:
        job = json.loads(line)
    except json.JSONDecodeError:
        sys.stdout.write(json.dumps({"done": True, "rc": 1}) + "\n")
        sys.stdout.flush()
        continue

    task_id = job.get("task_id", "")
    out_path = job.get("out_path", "")

    # Emit required markers to stderr.
    print(f"[START_SYNTHESIS] {task_id}".strip(), file=sys.stderr, flush=True)

    if emit_segment and out_path:
        print(f"[START_SEGMENT] {out_path}", file=sys.stderr, flush=True)

    print("[PROGRESS] 50%", file=sys.stderr, flush=True)
    print("[PROGRESS] 100%", file=sys.stderr, flush=True)

    if emit_segment and out_path:
        # Write a minimal WAV file so the engine's file existence check passes.
        try:
            import wave
            import struct

            with wave.open(out_path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes(struct.pack("<h", 0) * 240)  # 10 ms silence
            print(f"[SEGMENT_SAVED] {out_path}", file=sys.stderr, flush=True)
        except Exception as exc:
            print(f"[warning] fake worker could not write wav: {exc}", file=sys.stderr, flush=True)

    jobs_done += 1

    # Crash simulation.
    if crash_after and jobs_done >= int(crash_after):
        print("FAKE_WORKER_CRASHING", file=sys.stderr, flush=True)
        sys.exit(99)

    # Send done sentinel to stdout.
    sys.stdout.write(json.dumps({"done": True, "rc": rc_to_emit}) + "\n")
    sys.stdout.flush()

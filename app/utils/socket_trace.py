import os
import json
import time

def trace_outbound_socket_frame(event: dict) -> None:
    """Outbound websocket frame trace sink, gated by STUDIO_SOCKET_TRACE.
    Writes one JSONL record per outbound studio_event frame.
    """
    trace_path = os.getenv("STUDIO_SOCKET_TRACE")
    if not trace_path:
        return

    # Extract standard fields
    topic = event.get("topic")
    event_kind = event.get("eventKind")
    ids = event.get("ids", {})
    payload = event.get("payload", {})

    job_id = ids.get("jobId")
    project_id = ids.get("projectId")
    chapter_id = ids.get("chapterId")
    segment_id = ids.get("segmentId")

    # Resolve source of event
    source = event.get("source") or payload.get("source")

    # Construct payload summary (status, progress, line preview)
    summary = {}
    if "status" in payload:
        summary["status"] = payload["status"]
    if "progress" in payload:
        summary["progress"] = payload["progress"]
    if "line" in payload:
        line = payload["line"]
        summary["line"] = line[:100] + "..." if len(line) > 100 else line
    if "paused" in payload:
        summary["paused"] = payload["paused"]
    if "reasonCode" in payload:
        summary["reasonCode"] = payload["reasonCode"]
    elif "reason_code" in payload:
        summary["reasonCode"] = payload["reason_code"]

    record = {
        "timestamp": time.time(),
        "topic": topic,
        "eventKind": event_kind,
        "jobId": job_id,
        "projectId": project_id,
        "chapterId": chapter_id,
        "segmentId": segment_id,
        "source": source,
        "payload_summary": summary,
    }

    try:
        with open(trace_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception:
        pass

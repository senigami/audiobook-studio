import asyncio
import logging
from typing import List
from fastapi import WebSocket

from .contracts.events import build_studio_job_event

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    def broadcast(self, message: dict):
        # We need to broadcast from a non-async context sometimes (jobs.py or db.py)
        # So we use the bridge approach or create a task
        from ..web import _main_loop
        if _main_loop[0]:
            _main_loop[0].call_soon_threadsafe(
                lambda: asyncio.create_task(self._send_to_all(message))
            )

    async def _send_to_all(self, message: dict):
        failed = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                failed.append(connection)

        for connection in failed:
            self.disconnect(connection)
            logger.debug("Dropped dead websocket connection while broadcasting")

manager = ConnectionManager()

def broadcast_queue_update():
    manager.broadcast({"type": "queue_updated"})

def broadcast_segments_updated(chapter_id: str):
    manager.broadcast({
        "type": "segments_updated",
        "chapter_id": chapter_id
    })

def broadcast_chapter_updated(chapter_id: str):
    manager.broadcast({
        "type": "chapter_updated",
        "chapter_id": chapter_id
    })

def broadcast_pause_state(paused: bool):
    manager.broadcast({
        "type": "pause_updated",
        "paused": paused
    })

def broadcast_job_updated(job_id: str, updates: dict, current_job: dict | None = None):
    merged = dict(current_job or {})
    merged.update(updates or {})
    normalized = build_studio_job_event(
        job_id=job_id,
        status=str(merged.get("status") or "queued"),
        scope="job",
        parent_job_id=merged.get("parent_job_id"),
        progress=merged.get("progress"),
        eta_seconds=merged.get("eta_seconds"),
        message=updates.get("message") or updates.get("log"),
        reason_code=merged.get("reason_code"),
        updated_at=merged.get("updated_at"),
        started_at=merged.get("started_at"),
        active_render_batch_id=merged.get("active_render_batch_id"),
        active_render_batch_progress=merged.get("active_render_batch_progress"),
    )
    manager.broadcast(normalized)
    manager.broadcast({
        "type": "job_updated",
        "job_id": job_id,
        "updates": updates
    })


def broadcast_segment_progress(job_id: str, chapter_id: str | None, segment_id: str, progress: float):
    manager.broadcast({
        "type": "segment_progress",
        "job_id": job_id,
        "chapter_id": chapter_id,
        "segment_id": segment_id,
        "progress": progress,
    })

def broadcast_test_progress(name: str, progress: float, started_at: float = None):
    manager.broadcast({
        "type": "test_progress",
        "name": name,
        "progress": progress,
        "started_at": started_at
    })

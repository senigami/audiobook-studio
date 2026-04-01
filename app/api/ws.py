import asyncio
import logging
from typing import List
from fastapi import WebSocket

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

def broadcast_job_updated(job_id: str, updates: dict):
    manager.broadcast({
        "type": "job_updated",
        "job_id": job_id,
        "updates": updates
    })

def broadcast_test_progress(name: str, progress: float, started_at: float = None):
    manager.broadcast({
        "type": "test_progress",
        "name": name,
        "progress": progress,
        "started_at": started_at
    })

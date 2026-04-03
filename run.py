import logging

from app.web import app


class SuppressProcessingQueueAccessLog(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        args = getattr(record, "args", ())
        if isinstance(args, tuple) and len(args) >= 3:
            path = str(args[2] or "")
            if path.startswith("/api/processing_queue"):
                return False

        try:
            return "/api/processing_queue" not in record.getMessage()
        except Exception:
            return True


logging.getLogger("uvicorn.access").addFilter(SuppressProcessingQueueAccessLog())

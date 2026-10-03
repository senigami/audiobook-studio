"""Persistent rotating server log (#252).

Nothing here runs at import time. ``setup_file_logging()`` is called from the
boot sequence (``app.core.boot.boot_logging``) and is idempotent, because
``uvicorn --reload`` re-runs startup in the same interpreter.
"""

from __future__ import annotations

import logging
import logging.handlers
import re
from pathlib import Path
from typing import Optional

from app.core.config import LOG_DIR
from app.utils.pathing import safe_join_flat

LOG_FILENAME = "studio.log"
MAX_BYTES = 5 * 1024 * 1024
BACKUP_COUNT = 5

_MARKER = "_studio_file_log"
_FORMAT = "%(asctime)s %(levelname)s [%(threadName)s] %(name)s: %(message)s"

# Header values, key=value / key: value pairs, and bearer tokens.
_SECRET_RES = (
    re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+"),
    re.compile(
        r"(?i)((?:x-api-key|api[_-]?key|authorization|token|secret|password)"
        r"[\"']?\s*[:=]\s*[\"']?)(?!\[REDACTED\])[^\s,;\"'&]+"
    ),
)


def redact(text: str) -> str:
    for rx in _SECRET_RES:
        text = rx.sub(r"\1[REDACTED]", text)
    return text


class _RedactingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


def _installed() -> Optional[logging.handlers.RotatingFileHandler]:
    for h in logging.getLogger().handlers:
        if getattr(h, _MARKER, False):
            return h  # type: ignore[return-value]
    return None


def setup_file_logging(log_dir: Path | None = None) -> Optional[Path]:
    """Attach a bounded rotating file handler. Returns the log path, or None.

    Never raises: an unwritable log directory must not stop the app booting.
    """
    existing = _installed()
    if existing is not None:
        return Path(existing.baseFilename)
    try:
        root_dir = Path(log_dir) if log_dir is not None else LOG_DIR
        root_dir.mkdir(parents=True, exist_ok=True)
        path = safe_join_flat(root_dir, LOG_FILENAME)
        handler = logging.handlers.RotatingFileHandler(
            path, maxBytes=MAX_BYTES, backupCount=BACKUP_COUNT, encoding="utf-8"
        )
    except (OSError, ValueError):
        logging.getLogger(__name__).warning("Persistent log file unavailable.", exc_info=True)
        return None

    handler.setLevel(logging.INFO)
    handler.setFormatter(_RedactingFormatter(_FORMAT))
    setattr(handler, _MARKER, True)

    root = logging.getLogger()
    root.addHandler(handler)
    if root.level == logging.NOTSET or root.level > logging.INFO:
        root.setLevel(logging.INFO)
    # uvicorn.access does not propagate, so attach there too (it keeps its
    # own console handler untouched).
    logging.getLogger("uvicorn.access").addHandler(handler)
    return path


def teardown_file_logging() -> None:
    """Detach and close the handler. Used by tests."""
    handler = _installed()
    if handler is None:
        return
    logging.getLogger().removeHandler(handler)
    logging.getLogger("uvicorn.access").removeHandler(handler)
    handler.close()

import sys
import threading
from typing import Callable

# Concurrent synthesis requests (ENGINE_CLASS_ADMISSION on, cap>1) each run on
# a separate threadpool thread inside the SAME TTS Server process, and every
# writer of a line the watchdog will parse — engine.py's marker relay AND this
# module's diagnostics tee — shares this ONE process-wide stderr. A bare
# ``print(x, file=sys.stderr)``/``sys.stderr.write(x)`` issues (at least) one
# write() call with no ordering guarantee against another thread's calls in
# between, so two concurrent writers can interleave mid-line — the watchdog
# then reads one corrupted/malformed physical line spanning parts of two
# different jobs (escaped defect, 2026-07-06). This lock, held for a single
# pre-joined write() call per line, makes every line atomic with respect to
# every OTHER writer that also goes through it. Lives here (not in
# server/engine.py) because this is the lowest-level, dependency-free module
# both engine.py and implementation.py's emit_diagnostics import — a shared
# lock only closes the race if every writer uses the SAME lock instance.
STDERR_WRITE_LOCK = threading.Lock()


def emit_stderr_atomic(line: str) -> None:
    """Write one complete line to ``sys.stderr`` as a single locked write.

    Use this instead of ``print(line, file=sys.stderr, flush=True)`` or a raw
    ``sys.stderr.write(line)`` for any line the watchdog will parse — see
    ``STDERR_WRITE_LOCK``.
    """
    with STDERR_WRITE_LOCK:
        sys.stderr.write(line)  # canonical-locked-write: the emitter itself, not a bypass
        sys.stderr.flush()


def emit_diagnostics(on_output: Callable[[str], None], line: str) -> None:
    """Emit a diagnostics line to the caller's callback and also tee it to sys.stderr
    so it reaches the live stream in real time.
    """
    on_output(line)
    emit_stderr_atomic(line)

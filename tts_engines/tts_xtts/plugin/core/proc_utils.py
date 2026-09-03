import logging
import os
import queue
import shlex
import subprocess
import sys
import threading
from typing import Callable

logger = logging.getLogger(__name__)


def coerce_subprocess_output(value) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, str):
        return value
    return ""


def run_cmd_stream(
    cmd: str | list[str],
    on_output: Callable[[str], None],
    cancel_check: Callable[[], bool],
    env: dict[str, str] | None = None,
) -> int:
    """Run a command and stream its output to a callback.
    Localized for plugin portability.
    """
    import time
    from collections import deque

    if isinstance(cmd, (list, tuple)):
        display_cmd = " ".join(shlex.quote(str(part)) for part in cmd)
    else:
        display_cmd = str(cmd)

    logger.debug("Running command: %s", display_cmd)

    try:
        proc = subprocess.Popen(
            cmd,
            shell=isinstance(cmd, str),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=0,  # Unbuffered
            env=env,
            start_new_session=True,
        )
    except FileNotFoundError as exc:
        message = f"[error] Failed to launch command: {exc}\n"
        on_output(message)
        logger.warning("Command not found while launching: %s", display_cmd)
        return 127

    output_queue: queue.Queue[str | None] = queue.Queue()

    def enqueue_output():
        try:
            if proc.stdout is None:
                return
            while True:
                char = proc.stdout.read(1)
                if not isinstance(char, (bytes, str)):
                    break
                if not char:
                    break
                decoded = coerce_subprocess_output(char)
                if not decoded:
                    continue
                # Local logging for standalone use
                sys.stdout.write(decoded)
                sys.stdout.flush()
                output_queue.put(decoded)
        finally:
            output_queue.put(None)

    reader_thread = threading.Thread(target=enqueue_output, daemon=True)
    reader_thread.start()

    buffer = ""
    last_heartbeat = time.time()
    recent_lines: deque[str] = deque(maxlen=50)
    saw_eof = False

    try:
        while True:
            if cancel_check():
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                return 1

            try:
                item = output_queue.get(timeout=0.1)
                if item is None:
                    saw_eof = True
                else:
                    buffer += item
                    if item in ("\n", "\r"):
                        line = buffer.strip()
                        if line:
                            recent_lines.append(line)
                        on_output(buffer)
                        buffer = ""
                        last_heartbeat = time.time()
            except queue.Empty:
                if time.time() - last_heartbeat >= 1.0:
                    on_output("")
                    last_heartbeat = time.time()

            if saw_eof and proc.poll() is not None and output_queue.empty():
                break

        # Final flush
        if buffer:
            line = buffer.strip()
            if line:
                recent_lines.append(line)
            on_output(buffer)

        rc = proc.returncode or 0
        if rc != 0:
            logger.error(
                "Command failed (rc=%s): %s\nLast output:\n%s",
                rc,
                display_cmd,
                "\n".join(recent_lines),
            )
        return rc
    finally:
        reader_thread.join(timeout=0.5)

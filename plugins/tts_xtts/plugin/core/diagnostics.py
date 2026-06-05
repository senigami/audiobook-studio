import sys
from typing import Callable

def emit_diagnostics(on_output: Callable[[str], None], line: str) -> None:
    """Emit a diagnostics line to the caller's callback and also tee it to sys.stderr
    so it reaches the live stream in real time.
    """
    on_output(line)
    sys.stderr.write(line)
    sys.stderr.flush()

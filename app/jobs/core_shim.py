import queue
import threading

job_queue = queue.Queue()
assembly_queue = queue.Queue()
pause_flag = threading.Event()
cancel_flags = {}

def paused():
    return pause_flag.is_set()

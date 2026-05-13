import queue
import threading

job_queue = queue.Queue()
assembly_queue = queue.Queue()
pause_flag = threading.Event()
cancel_flags = {}

def paused():
    return pause_flag.is_set()

def clear_job_queue():
    while not job_queue.empty():
        try:
            job_queue.get_nowait()
            job_queue.task_done()
        except queue.Empty:
            break

def clear_assembly_queue():
    while not assembly_queue.empty():
        try:
            assembly_queue.get_nowait()
            assembly_queue.task_done()
        except queue.Empty:
            break

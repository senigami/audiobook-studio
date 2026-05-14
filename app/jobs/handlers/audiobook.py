import os
import time
from ...core.config import get_project_m4b_dir
from ...db.state import get_jobs, update_job, update_performance_metrics, get_performance_metrics
from ...engines.audiobook_utils import assemble_audiobook
from ...engines.proc_utils import terminate_all_subprocesses
from ...orchestration.scheduler.eta import format_seconds

def handle_audiobook_job(jid, j, start, on_output, cancel_check):
    if not j.project_id:
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="Audiobook job has no project_id.")
        return

    from ...core.config import get_project_dir
    src_dir = get_project_dir(j.project_id)
    title = j.custom_title or j.chapter_file
    out_file = get_project_m4b_dir(j.project_id) / f"{j.chapter_file}.m4b"

    # Collect custom titles from all jobs
    chapter_titles = {
        val.chapter_file: val.custom_title
        for val in get_jobs().values()
        if val.custom_title
    }

    rc = assemble_audiobook(
        src_dir, title, out_file, on_output, cancel_check,
        chapter_titles=chapter_titles,
        author=j.author_meta,
        narrator=j.narrator_meta,
        chapters=j.chapter_list,
        cover_path=j.cover_path
    )

    if rc == 0 and out_file.exists():
        # --- Auto-tuning feedback ---
        actual_dur = time.time() - start

        # We need the base_eta for tuning, but let's keep it simple for now or pass it in
        # For now, just mark done.
        update_job(jid, status="done", project_id=j.project_id, chapter_id=j.chapter_id, finished_at=time.time(), progress=1.0, output_mp3=out_file.name)
    else:
        update_job(jid, status="failed", project_id=j.project_id, chapter_id=j.chapter_id, finished_at=time.time(), progress=1.0, error=f"Audiobook assembly failed (rc={rc})")

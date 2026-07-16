"""Regression: the wired M4B assembly path must not double the .m4b extension.

The assemble route builds an AssemblyTask whose output_path is "<name>.m4b".
Dispatch routes kind="assembly" to the legacy handle_audiobook_job (registry),
whose job shim carries chapter_file = Path(output_path).name = "<name>.m4b".
Pre-fix, the handler computed out_file = f"{chapter_file}.m4b" → "<name>.m4b.m4b",
so shipped audiobooks were written (and recorded as output_mp3) with a doubled
extension. No test exercised the derived filename (the existing assembly test
stubs the render), so it escaped. This locks the single-extension behaviour.
"""
from pathlib import Path
from unittest.mock import patch

from app.db.models import Job
from app.jobs.handlers import audiobook as ab


def test_audiobook_out_file_has_single_m4b_extension(tmp_path):
    captured = {}

    def fake_assemble(input_folder, book_title, output_m4b, on_output, cancel_check, **kw):
        out = Path(output_m4b)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"fake m4b")
        captured["out"] = out
        return 0

    j = Job(
        id="j1",
        engine="audiobook",
        status="running",
        created_at=1.0,
        project_id="p1",
        chapter_file="My Book.m4b",   # already carries the extension (from output_path.name)
        custom_title="My Book",
    )

    with patch.object(ab, "assemble_audiobook", fake_assemble), \
         patch.object(ab, "get_jobs", return_value={}), \
         patch.object(ab, "update_job"), \
         patch.object(ab, "get_project_m4b_dir", return_value=tmp_path), \
         patch("app.core.config.get_project_dir", return_value=tmp_path):
        ab.handle_audiobook_job("j1", j, 0.0, lambda *a, **k: None, lambda: False)

    assert captured["out"].name == "My Book.m4b", (
        f"M4B output filename doubled the extension: {captured['out'].name!r}"
    )

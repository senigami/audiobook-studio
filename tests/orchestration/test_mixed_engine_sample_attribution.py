"""Mixed jobs must never write a render_performance_samples row under
engine="mixed" — "mixed" is a job-level container label, never a real
synthesizing engine (ADR-0004). Each render group already resolves its own
real engine (xtts/voxtral); the orchestrator must attribute the group's
render time to that real engine so xtts/voxtral's own calibration baselines
absorb work done via Mixed Synthesis.

Drives a full render through `OrchestratorHelpersMixin._dispatch` (like
`tests/orchestration/test_startup_eta.py`'s `_run_recording_render_with_markers`)
so the REAL `record_render_sample`/`get_render_history` path runs against the
test DB (R2 — no mocking of `record_render_sample` itself, per
testing-standards.md).
"""
from unittest.mock import patch

from app.orchestration.tasks.synthesis import SynthesisTask
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.base import TaskContext, TaskResult
from app.db.state import Job
from app.db.performance import get_render_history
from app.engines.behavior import normalize_behavior, _load_full_manifest, _load_manifest_behavior


def _run_mixed_job_with_segment_engine_samples(
    monkeypatch, *, job_id, script, marker_script, completed_at,
):
    """Drives one mixed job through `_dispatch` with a stubbed handler that
    replays `marker_script` ``[(t, line), ...]`` (including
    ``[SEGMENT_ENGINE_SAMPLE]`` lines) then returns a completed TaskResult, so
    the orchestrator's real sample-recording path runs afterward.
    """
    _load_full_manifest.cache_clear()
    _load_manifest_behavior.cache_clear()

    script_text = " ".join(entry["text"] for entry in script)
    task = SynthesisTask(
        task_id=job_id,
        engine_id="mixed",
        script_text=script_text,
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=script,
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1",
        payload={"engine_id": "mixed", "script_text": script_text, "voice_profile_id": "Default"},
    )

    jobs_db = {}

    def mock_put_job(job):
        jobs_db[job.id] = job

    def mock_get_jobs():
        return jobs_db

    def mock_update_job(jid, **kwargs):
        job = jobs_db.get(jid)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)

    def mock_publish(self, context, status=None, progress=None, eta_seconds=None, started_at=None, **kwargs):
        updates = {}
        if status is not None:
            updates["status"] = status
        if started_at is not None:
            updates["started_at"] = started_at
        job_fields = Job.__dataclass_fields__
        for k, v in kwargs.items():
            if k in job_fields:
                updates[k] = v
        if updates and context.task_id in jobs_db:
            mock_put_job(Job(**{**jobs_db[context.task_id].__dict__, **updates}))

    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", mock_publish)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *a, **kw: 10.0)
    monkeypatch.setattr(
        "app.engines.behavior.behavior_for_engine",
        lambda eid, **kw: normalize_behavior({}),
    )

    mock_segments = [
        {"id": entry["ids"][0], "text_content": entry["text"], "character_id": i + 1, "speaker_profile_name": "Narrator"}
        for i, entry in enumerate(script)
    ]
    chunk_groups = [
        {"id": entry["ids"][0], "leader_segment_id": entry["ids"][0], "segments": [mock_segments[i]], "text_content": entry["text"]}
        for i, entry in enumerate(script)
    ]

    listener_cb = [None]

    class FakeWatchdog:
        def register_log_listener(self, cb):
            listener_cb[0] = cb

        def unregister_log_listener(self, cb):
            pass

    mock_put_job(Job(id=job_id, engine="mixed", status="running", created_at=0.0))

    def custom_handler(*args, **kwargs):
        listener = listener_cb[0]
        assert listener is not None
        for t, line in marker_script:
            with patch("time.time", return_value=t):
                listener(line)
        return TaskResult(status="completed")

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.engines.watchdog.get_watchdog", return_value=FakeWatchdog()), \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=mock_segments), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=chunk_groups), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="mixed"), \
         patch("time.time", return_value=completed_at):
        mock_reg.return_value.get_handler.return_value = custom_handler
        mixin = OrchestratorHelpersMixin()
        mixin._dispatch(task=task, context=context)

    return get_render_history(), jobs_db


def test_mixed_job_records_one_sample_per_real_engine_never_mixed(clean_db, tmp_path, monkeypatch):
    """(a) A mixed job with 2 groups on different engines (xtts + voxtral) must
    record TWO render_performance_samples rows, each tagged with the group's
    real engine, and NO row with engine="mixed".
    """
    script = [
        {"ids": ["seg-xtts"], "save_path": "/tmp/seg-xtts.wav", "text": "Hello there xtts", "engine": "xtts"},
        {"ids": ["seg-vox"], "save_path": "/tmp/seg-vox.wav", "text": "Hi voxtral friend", "engine": "voxtral"},
    ]
    marker_script = [
        (100.0, "[START_SEGMENT] seg-xtts"),
        (105.0, "[SEGMENT_SAVED] /tmp/seg-xtts.wav"),
        (105.1, "[SEGMENT_ENGINE_SAMPLE] seg-xtts xtts 16 5.000"),
        (106.0, "[START_SEGMENT] seg-vox"),
        (109.0, "[SEGMENT_SAVED] /tmp/seg-vox.wav"),
        (109.1, "[SEGMENT_ENGINE_SAMPLE] seg-vox voxtral 18 3.000"),
        (110.0, "Successfully synthesized 2 audio chunks."),
    ]

    history, jobs_db = _run_mixed_job_with_segment_engine_samples(
        monkeypatch,
        job_id="mixed-two-engines",
        script=script,
        marker_script=marker_script,
        completed_at=110.0,
    )

    assert len(history) == 2, f"expected exactly 2 samples, got: {history}"
    engines = sorted(sample["engine"] for sample in history)
    assert engines == ["voxtral", "xtts"]
    assert all(sample["engine"] != "mixed" for sample in history)

    by_engine = {sample["engine"]: sample for sample in history}
    assert by_engine["xtts"]["chars"] == 16
    assert by_engine["xtts"]["synthesis_duration_seconds"] == 5.0
    assert by_engine["voxtral"]["chars"] == 18
    assert by_engine["voxtral"]["synthesis_duration_seconds"] == 3.0


def test_mixed_job_with_no_segment_engine_samples_records_nothing(clean_db, tmp_path, monkeypatch):
    """(b) A mixed job whose handler never emitted [SEGMENT_ENGINE_SAMPLE]
    markers (stale engine build, or every group reused/cached audio) must
    record NOTHING — no crash, and no fallback engine="mixed" row.
    """
    script = [
        {"ids": ["seg-1"], "save_path": "/tmp/seg-1.wav", "text": "Hello there", "engine": "xtts"},
    ]
    marker_script = [
        (100.0, "[START_SEGMENT] seg-1"),
        (105.0, "[SEGMENT_SAVED] /tmp/seg-1.wav"),
        (106.0, "Successfully synthesized 1 audio chunks."),
    ]

    history, jobs_db = _run_mixed_job_with_segment_engine_samples(
        monkeypatch,
        job_id="mixed-no-samples",
        script=script,
        marker_script=marker_script,
        completed_at=106.0,
    )

    assert history == [], f"expected no recorded samples, got: {history}"


def test_non_mixed_job_unaffected_still_records_one_sample_under_its_engine(clean_db, tmp_path, monkeypatch):
    """(c) A plain (non-mixed) xtts job is byte-identical — still exactly one
    row under engine="xtts", unaffected by the mixed-attribution branch.
    """
    from tests.orchestration.test_startup_eta import _run_recording_render_with_markers

    history, jobs_db = _run_recording_render_with_markers(
        monkeypatch,
        job_id="plain-xtts-unaffected",
        engine_id="xtts",
        engine_behavior={
            "timing_markers": {
                "ENGINE_ACTIVITY_STARTED": "Loading XTTS model...",
                "CHAPTER_SYNTHESIS_COMPLETE": "Successfully synthesized",
            }
        },
        marker_script=[
            (100.0, "[START_SEGMENT] seg-1"),
            (101.0, "[START_SYNTHESIS] seg-1"),
            (105.0, "[SEGMENT_SAVED] /tmp/seg-1.wav"),
            (106.0, "Successfully synthesized 1 audio chunks."),
        ],
        completed_at=106.0,
    )

    assert len(history) == 1, f"expected exactly one sample, got: {history}"
    assert history[0]["engine"] == "xtts"

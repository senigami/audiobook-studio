import json


def test_render_trace_is_disabled_by_default(monkeypatch, tmp_path):
    from app import render_trace

    trace_path = tmp_path / "render_trace.jsonl"
    monkeypatch.delenv("STUDIO_RENDER_TRACE", raising=False)
    monkeypatch.setenv("STUDIO_RENDER_TRACE_FILE", str(trace_path))

    render_trace.trace("test.disabled", job_id="job-1")

    assert not trace_path.exists()


def test_render_trace_writes_jsonl_when_enabled(monkeypatch, tmp_path):
    from app import render_trace

    trace_path = tmp_path / "render_trace.jsonl"
    monkeypatch.setenv("STUDIO_RENDER_TRACE", "1")
    monkeypatch.setenv("STUDIO_RENDER_TRACE_FILE", str(trace_path))

    render_trace.trace(
        "test.enabled",
        job_id="job-1",
        nested={"value": 1},
        unserializable=object(),
    )

    lines = trace_path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    payload = json.loads(lines[0])
    assert payload["event"] == "test.enabled"
    assert payload["job_id"] == "job-1"
    assert payload["nested"] == {"value": 1}
    assert isinstance(payload["unserializable"], str)

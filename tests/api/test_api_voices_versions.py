import hashlib
import io
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.domain.voices.variant_versions import record_new_version
from app.orchestration.scheduler.orchestrator import TaskOrchestrator
from tests.utils.timeout import timeout_after


def _make_build_bridge():
    """Build a fake VoiceBridge + wav_to_mp3 pair that mimics a real synth."""
    mock_bridge = MagicMock()

    def fake_synthesize(req):
        out_path = Path(req["output_path"])
        out_path.write_text("synthetic audio")
        return {"status": "ok", "audio_path": str(out_path)}

    mock_bridge.synthesize.side_effect = fake_synthesize

    def fake_wav_to_mp3(in_wav, out_mp3, on_output=None, cancel_check=None):
        out_mp3.write_bytes(str(out_mp3).encode() + b"-mp3-audio")
        return 0

    return mock_bridge, fake_wav_to_mp3


def _build_via_api(client, monkeypatch, name, files):
    """Drive the real /build endpoint end-to-end with a stubbed bridge, the
    same pattern used by test_voice_build_api_uses_real_orchestrator_submit."""
    mock_progress = MagicMock()
    mock_progress.reconcile.return_value = {"decision": "queue", "artifact_state": "missing"}
    mock_bridge, fake_wav_to_mp3 = _make_build_bridge()

    orchestrator = TaskOrchestrator(progress_service=mock_progress, voice_bridge=mock_bridge)
    monkeypatch.setattr("app.api.routers.voices_actions.create_orchestrator", lambda: orchestrator)

    with timeout_after(5, "voice build should not hang"), \
         patch("app.engines.bridge.create_voice_bridge", return_value=mock_bridge), \
         patch("app.engines.voice_engines.list_tts_engines", return_value=["xtts"]), \
         patch("app.engines.voice_engines.get_default_profile_engine", return_value="xtts"), \
         patch("app.orchestration.scheduler.orchestrator.reserve_task_resources", return_value={"admitted": True}), \
         patch("app.orchestration.scheduler.orchestrator.release_task_resources"), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.engines.audio_ops.wav_to_mp3", side_effect=fake_wav_to_mp3):
        response = client.post(f"/api/speaker-profiles/{name}/build", files=files)
    return response


def _make_profile(voices_root, name, variant="Default", engine="xtts"):
    profile_root = voices_root / name
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": name}))
    profile_dir = profile_root / variant
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": variant, "engine": engine}))
    return profile_dir


def test_list_versions_no_history_yet(clean_db, voices_root, client):
    """A pre-existing unversioned variant has no versions/ dir -- 'history
    starts now' is intentional, not an error."""
    voices_root.mkdir(parents=True, exist_ok=True)
    _make_profile(voices_root, "SpeakerA")

    response = client.get("/api/speaker-profiles/SpeakerA/versions")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "versions": [], "active_version_id": None}


def test_list_versions_missing_profile_dir(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    response = client.get("/api/speaker-profiles/NoSuchSpeaker/versions")
    assert response.status_code == 404
    assert response.json()["status"] == "error"


def test_list_versions_after_build_and_rebuild(clean_db, voices_root, client, monkeypatch):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_dir = _make_profile(voices_root, "SpeakerA")

    files1 = {"files": ("input1.wav", io.BytesIO(b"fake wav 1"), "audio/wav")}
    response = _build_via_api(client, monkeypatch, "SpeakerA", files1)
    assert response.status_code == 200
    assert (profile_dir / "sample.mp3").exists()

    files2 = {"files": ("input2.wav", io.BytesIO(b"fake wav 2"), "audio/wav")}
    response = _build_via_api(client, monkeypatch, "SpeakerA", files2)
    assert response.status_code == 200

    response = client.get("/api/speaker-profiles/SpeakerA/versions")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    # Each build call records two entries: the pre-build snapshot taken by the
    # /build route (voices_actions.py) before the sample is cleared, plus the
    # post-build active version SampleBuildTask records via
    # record_new_version(). Two builds -> 4 entries total. (The very first
    # build's pre-build snapshot captures an empty/no-artifact state, since
    # nothing had been built yet.)
    assert len(body["versions"]) == 4

    active_flags = [v["is_active"] for v in body["versions"]]
    assert active_flags.count(True) == 1
    assert body["active_version_id"] is not None

    # All but the very first (pre-first-build, empty-state) snapshot have an
    # artifact, since only that one predates any sample.mp3 existing.
    with_artifact = [v for v in body["versions"] if v["has_artifact"]]
    assert len(with_artifact) == 3
    for v in with_artifact:
        assert v["artifact_url"] == f"/out/voices/SpeakerA/Default/versions/{v['id']}/artifact.mp3"

    without_artifact = [v for v in body["versions"] if not v["has_artifact"]]
    assert len(without_artifact) == 1
    assert without_artifact[0]["artifact_url"] is None


def test_promote_version_and_revert_check(clean_db, voices_root, client, monkeypatch):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_dir = _make_profile(voices_root, "SpeakerA")

    files1 = {"files": ("input1.wav", io.BytesIO(b"fake wav 1"), "audio/wav")}
    response = _build_via_api(client, monkeypatch, "SpeakerA", files1)
    assert response.status_code == 200

    files2 = {"files": ("input2.wav", io.BytesIO(b"fake wav 2"), "audio/wav")}
    response = _build_via_api(client, monkeypatch, "SpeakerA", files2)
    assert response.status_code == 200

    versions_before = client.get("/api/speaker-profiles/SpeakerA/versions").json()
    # See test_list_versions_after_build_and_rebuild: two builds -> 4 entries
    # (pre-build snapshot + post-build active version, per build call).
    assert len(versions_before["versions"]) == 4
    # Pick the oldest version with an artifact (not the empty pre-first-build
    # snapshot) as the "older version" to promote.
    old_version = next(v for v in versions_before["versions"] if v["has_artifact"])
    old_id = old_version["id"]

    # --- Unknown version_id -> 404, no side effects ---
    response = client.post("/api/speaker-profiles/SpeakerA/versions/does-not-exist/promote")
    assert response.status_code == 404
    versions_unchanged = client.get("/api/speaker-profiles/SpeakerA/versions").json()
    assert versions_unchanged["active_version_id"] == versions_before["active_version_id"]
    assert len(versions_unchanged["versions"]) == 4

    # --- R1 revert-check: force promote_version to fail -> 500, no side effects ---
    with patch("app.api.routers.voices_versions.promote_version", return_value=False):
        response = client.post(f"/api/speaker-profiles/SpeakerA/versions/{old_id}/promote")
    assert response.status_code == 500
    assert response.json()["status"] == "error"

    # A pre-promote snapshot IS taken before the promote_version call, so the
    # revert-check run itself adds one extra version -- but the *active*
    # version and live sample.mp3 must remain untouched.
    versions_after_failed_promote = client.get("/api/speaker-profiles/SpeakerA/versions").json()
    assert versions_after_failed_promote["active_version_id"] == versions_before["active_version_id"]
    live_mp3_after_failed_promote = (profile_dir / "sample.mp3").read_bytes()

    # --- Real promote path: should now succeed ---
    response = client.post(f"/api/speaker-profiles/SpeakerA/versions/{old_id}/promote")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "active_version_id": old_id}

    versions_after_promote = client.get("/api/speaker-profiles/SpeakerA/versions").json()
    # A third (well, fourth counting the failed-promote snapshot) version now
    # exists, capturing what promote just replaced.
    assert len(versions_after_promote["versions"]) == len(versions_after_failed_promote["versions"]) + 1
    assert versions_after_promote["active_version_id"] == old_id

    # Live sample.mp3 now byte-matches the promoted version's artifact.mp3.
    promoted_artifact = profile_dir / "versions" / old_id / "artifact.mp3"
    live_mp3 = profile_dir / "sample.mp3"
    assert hashlib.sha256(live_mp3.read_bytes()).hexdigest() == hashlib.sha256(promoted_artifact.read_bytes()).hexdigest()


def _make_two_versions(profile_dir, text_a="Version A test passage.", text_b="Version B different passage."):
    """Build two recorded versions directly via variant_versions.record_new_version
    (real module, not mocked -- R2), each with its own samples/artifact so the
    A/B endpoint's cached-vs-fresh branching has something real to check."""
    (profile_dir / "sample1.wav").write_bytes(b"wav-content-a")
    (profile_dir / "sample.mp3").write_bytes(b"artifact-content-a")
    version_a_id = record_new_version(
        profile_dir, engine_id="xtts", test_text=text_a, voice_job_settings={"engine": "xtts"}
    )

    (profile_dir / "sample1.wav").write_bytes(b"wav-content-b")
    (profile_dir / "sample.mp3").write_bytes(b"artifact-content-b")
    version_b_id = record_new_version(
        profile_dir, engine_id="xtts", test_text=text_b, voice_job_settings={"engine": "xtts"}
    )
    return version_a_id, version_b_id


def test_ab_test_missing_fields_returns_400(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_dir = _make_profile(voices_root, "SpeakerA")
    version_a_id, version_b_id = _make_two_versions(profile_dir)

    response = client.post("/api/speaker-profiles/SpeakerA/versions/ab-test", json={})
    assert response.status_code == 400
    assert response.json()["status"] == "error"

    response = client.post(
        "/api/speaker-profiles/SpeakerA/versions/ab-test",
        json={"version_a_id": version_a_id, "version_b_id": version_b_id},
    )
    assert response.status_code == 400


def test_ab_test_cached_hit_and_fresh_job(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_dir = _make_profile(voices_root, "SpeakerA")
    text_a = "Version A test passage."
    text_b = "Version B different passage."
    version_a_id, version_b_id = _make_two_versions(profile_dir, text_a, text_b)

    with patch("app.db.state.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit") as mock_submit:
        response = client.post(
            "/api/speaker-profiles/SpeakerA/versions/ab-test",
            json={"version_a_id": version_a_id, "version_b_id": version_b_id, "test_text": text_a},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"

    # Version A's own recorded test_text matches -> cached, pointing at its
    # real artifact.mp3 (verify the file actually exists at the implied path).
    assert body["results"]["a"]["mode"] == "cached"
    audio_url = body["results"]["a"]["audio_url"]
    assert audio_url == f"/out/voices/SpeakerA/Default/versions/{version_a_id}/artifact.mp3"
    rel = audio_url[len("/out/voices/"):]
    assert (voices_root / rel).exists()

    # Version B's recorded test_text does NOT match -> fresh render job.
    assert body["results"]["b"]["mode"] == "job"
    assert body["results"]["b"]["job_id"]

    # Exactly one SampleTestTask submitted (for B only), pointed at B's own
    # versions/<id>/samples snapshot -- never the live variant directory.
    assert mock_submit.call_count == 1
    submitted_task = mock_submit.call_args.args[0]
    assert submitted_task.voice_profile_dir == profile_dir / "versions" / version_b_id / "samples"
    assert submitted_task.voice_profile_dir != profile_dir
    assert submitted_task.test_text == text_a


def test_ab_test_unknown_version_id_returns_404_no_partial_side_effects(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_dir = _make_profile(voices_root, "SpeakerA")
    text_a = "Version A test passage."
    version_a_id, version_b_id = _make_two_versions(profile_dir, text_a)

    # Slot "a" is processed before slot "b" in the endpoint's loop. Making the
    # UNKNOWN id be version_a_id proves the loop never reaches (and never
    # queues a job for) the otherwise-valid version_b_id.
    with patch("app.db.state.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit") as mock_submit:
        response = client.post(
            "/api/speaker-profiles/SpeakerA/versions/ab-test",
            json={"version_a_id": "does-not-exist", "version_b_id": version_b_id, "test_text": text_a},
        )
    assert response.status_code == 404
    assert response.json()["status"] == "error"
    assert not mock_submit.called

    # Also cover the case where the VALID version is slot "a" (cached hit --
    # no job submission needed for it) and slot "b" is unknown: still no job
    # queued at all.
    with patch("app.db.state.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit") as mock_submit2:
        response = client.post(
            "/api/speaker-profiles/SpeakerA/versions/ab-test",
            json={"version_a_id": version_a_id, "version_b_id": "does-not-exist", "test_text": text_a},
        )
    assert response.status_code == 404
    assert response.json()["status"] == "error"
    assert not mock_submit2.called


def test_ab_test_cached_path_revert_check(clean_db, voices_root, client):
    """R1 revert-check: force the cached-path optimization off (as if the
    version had no artifact), confirm the endpoint falls back to mode "job"
    even though the test_text matches exactly, then restore and confirm the
    cached path is taken again.

    Note: get_version()'s record (unlike list_versions()'s) does not carry a
    computed "has_artifact" field, so the endpoint checks the version's
    artifact.mp3 file directly (see the code comment in voices_versions.py).
    The revert-check below therefore removes/restores that file rather than
    monkeypatching a "has_artifact" dict key, to exercise the real condition
    the endpoint evaluates.
    """
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_dir = _make_profile(voices_root, "SpeakerA")
    text_a = "Version A test passage."
    # Both versions recorded against the same passage, so "b" stays cached
    # throughout and only "a"'s cached-vs-job branching is under test.
    version_a_id, version_b_id = _make_two_versions(profile_dir, text_a, text_a)

    artifact_path = profile_dir / "versions" / version_a_id / "artifact.mp3"
    assert artifact_path.exists()
    moved_aside = artifact_path.with_suffix(".mp3.bak")
    artifact_path.rename(moved_aside)

    try:
        with patch("app.db.state.put_job"), \
             patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit") as mock_submit:
            response = client.post(
                "/api/speaker-profiles/SpeakerA/versions/ab-test",
                json={"version_a_id": version_a_id, "version_b_id": version_b_id, "test_text": text_a},
            )
        assert response.status_code == 200
        body = response.json()
        # Falls through to a fresh job even for an exact test_text match,
        # because the (simulated) artifact is missing.
        assert body["results"]["a"]["mode"] == "job"
        assert mock_submit.call_count == 1
        submitted_task = mock_submit.call_args.args[0]
        assert submitted_task.voice_profile_dir == profile_dir / "versions" / version_a_id / "samples"
    finally:
        moved_aside.rename(artifact_path)

    # Restored: cached path is taken again for the real test.
    with patch("app.db.state.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit") as mock_submit2:
        response = client.post(
            "/api/speaker-profiles/SpeakerA/versions/ab-test",
            json={"version_a_id": version_a_id, "version_b_id": version_b_id, "test_text": text_a},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["results"]["a"]["mode"] == "cached"
    assert not mock_submit2.called


def test_version_artifact_url_is_actually_servable(clean_db, voices_root, client):
    """The artifact_url returned by GET .../versions must resolve over HTTP,
    not just exist on disk -- the static route's filename whitelist must
    include artifact.mp3 alongside sample.mp3/sample.wav."""
    profile_dir = _make_profile(voices_root, "SpeakerA")
    version_id = record_new_version(
        profile_dir, engine_id="xtts", test_text="hi", voice_job_settings={}
    )
    (profile_dir / "versions" / version_id / "artifact.mp3").write_bytes(b"real-mp3-bytes")

    response = client.get("/api/speaker-profiles/SpeakerA/versions")
    body = response.json()
    entry = next(v for v in body["versions"] if v["id"] == version_id)
    assert entry["artifact_url"]

    audio_response = client.get(entry["artifact_url"])
    assert audio_response.status_code == 200
    assert audio_response.content == b"real-mp3-bytes"


def test_ab_test_job_render_is_servable_via_predictable_url(clean_db, voices_root, client):
    """A fresh A/B render's job_id maps to a real, fetchable URL once the
    scratch file exists -- confirms the /out/voice-ab-test static route."""
    from app.core import config as app_config

    job_id = "abtest-deadbeef"
    scratch_path = app_config.TRANSIENT_DIR / "voice-ab-test" / job_id / "render.mp3"
    scratch_path.parent.mkdir(parents=True, exist_ok=True)
    scratch_path.write_bytes(b"scratch-render-bytes")

    response = client.get(f"/out/voice-ab-test/{job_id}/render.mp3")
    assert response.status_code == 200
    assert response.content == b"scratch-render-bytes"

    # Wrong filename, or a job_id that doesn't match the abtest-<hex> shape
    # (including an attempted traversal), must both 404 -- never fall through
    # to serving an arbitrary file under TRANSIENT_DIR.
    assert client.get(f"/out/voice-ab-test/{job_id}/render.wav").status_code == 404
    assert client.get("/out/voice-ab-test/../../etc/passwd/render.mp3").status_code == 404
    assert client.get("/out/voice-ab-test/not-a-real-job/render.mp3").status_code == 404

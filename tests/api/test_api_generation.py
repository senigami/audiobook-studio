import pytest
import os
import importlib
from unittest.mock import patch, MagicMock
from tests.utils.timeout import timeout_after

@pytest.fixture(autouse=True)
def setup_test_voices(tmp_path, monkeypatch):
    from app.core import config
    import app.db.speakers
    import json

    voices_dir = tmp_path / "voices"
    voices_dir.mkdir(exist_ok=True)

    # Create Voice1 profile directory, voice.json, and Default variant profile.json
    v1_dir = voices_dir / "Voice1"
    v1_dir.mkdir(exist_ok=True)
    (v1_dir / "voice.json").write_text(json.dumps({"id": "voice1-id", "default_variant": "Default"}))

    v1_default_dir = v1_dir / "Default"
    v1_default_dir.mkdir(exist_ok=True)
    (v1_default_dir / "profile.json").write_text(json.dumps({"engine": "xtts"}))

    monkeypatch.setattr(config, "VOICES_DIR", voices_dir)
    return voices_dir


@pytest.fixture
def client(clean_db):
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db(tmp_path):
    db_path = tmp_path / "test_api_gen.db"
    os.environ["DB_PATH"] = str(db_path)
    import app.db.core
    importlib.reload(app.db.core)
    app.db.core.init_db()

    from app.db.state import update_settings
    update_settings({"default_speaker_profile": "Voice1", "default_engine": "xtts", "mistral_api_key": "test_key", "enabled_plugins": {"voxtral": True}})

    yield


@pytest.fixture(autouse=True)
def mock_plugin_registry(monkeypatch):
    """Generic mock for engine registry and enablement state."""
    from app.engines.bridge import VoiceBridge
    from app.db.state import get_settings

    def mocked_is_enabled(self, engine_id):
        settings = get_settings()
        enabled_plugins = settings.get("enabled_plugins") or {}
        return bool(enabled_plugins.get(engine_id, True))

    def mocked_describe_registry(self):
        settings = get_settings()
        enabled_plugins = settings.get("enabled_plugins") or {}

        # Mock two engines: one built-in, one plugin-like with an API key requirement
        mistral_key = settings.get("mistral_api_key")

        return [
            {"engine_id": "xtts", "can_enable": True, "enablement_message": "", "enabled": True},
            {
                "engine_id": "voxtral",
                "can_enable": bool(mistral_key),
                "enablement_message": "" if mistral_key else "Plugin API key required",
                "enabled": bool(enabled_plugins.get("voxtral", False))
            }
        ]

    monkeypatch.setattr("app.engines.bridge.VoiceBridge.is_engine_enabled", mocked_is_enabled)
    monkeypatch.setattr("app.engines.bridge.VoiceBridge.describe_registry", mocked_describe_registry)

def test_queue_and_bake(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.queue import get_queue
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    # Add to queue
    with timeout_after(5, "queue route should not hang"), \
         patch("app.api.routers.generation.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 200
        assert "queue_id" in response.json()

    # Bake
    with timeout_after(5, "bake route should not hang"), \
         patch("app.api.routers.generation.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client.post(f"/api/generation/bake/{cid}")
        assert response.status_code == 200
        job_id = response.json()["job_id"]
        assert job_id
        assert any(row["id"] == job_id and row["custom_title"] == "C1" for row in get_queue())


def test_queue_chapter_proceeds_when_segments_cast_without_default(clean_db, client):
    """A chapter whose segments are already cast queues even with NO global
    default voice and NO explicit voice param — the assigned voice is the
    fallback. Regression: previously hard-blocked with "No speaker profile selected"."""
    from app.db.state import update_settings
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    update_settings({"default_speaker_profile": ""})  # no global default voice
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")

    with timeout_after(5, "queue route should not hang"), \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=[
             {"id": "s1", "speaker_profile_name": "Voice1", "character_speaker_profile_name": None, "text_content": "Hello world.", "audio_status": "unprocessed", "audio_file_path": None},
         ]), \
         patch("app.api.routers.generation.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 200, response.json()


def test_queue_chapter_blocks_only_when_no_voice_anywhere(clean_db, client):
    """Block solely when nothing resolves: no explicit voice, no default, and no
    segment is cast."""
    from app.db.state import update_settings
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    update_settings({"default_speaker_profile": ""})
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")

    with timeout_after(5, "queue route should not hang"), \
         patch("app.api.routers.generation.get_chapter_segments", return_value=[
             {"id": "s1", "speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
         ]), \
         patch("app.api.routers.generation.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 400
        assert "voice" in response.json()["message"].lower()


def test_standard_queue_preserves_split_part_after_metadata_upsert(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.queue import get_queue

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    with timeout_after(5, "split-part queue route should not hang"), \
         patch("app.api.routers.generation.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client.post(
            "/api/processing_queue",
            data={"project_id": pid, "chapter_id": cid, "split_part": "2"},
        )

    assert response.status_code == 200
    queue_id = response.json()["queue_id"]
    row = next(item for item in get_queue() if item["id"] == queue_id)
    assert row["split_part"] == 2


def test_bake_chapter_mixed_engines_use_mixed_worker(clean_db, client):
    from app.db.state import update_settings
    update_settings({"enabled_plugins": {"voxtral": True}})
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    from app.db.state import update_settings
    update_settings({"mistral_api_key": "abc123"})

    with patch("app.domain.chunk_groups.load_chunk_segments", return_value=[
        {"id": "s1", "speaker_profile_name": "SingleEngine Voice", "character_speaker_profile_name": None, "text_content": "Hello world.", "audio_status": "done", "audio_file_path": "1.wav"},
        {"id": "s2", "speaker_profile_name": "Voxtral Voice", "character_speaker_profile_name": None, "text_content": "Goodbye world.", "audio_status": "unprocessed", "audio_file_path": None},
    ]), \
         patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"), \
         patch("app.db.speakers.get_profile_engine", side_effect=lambda name, fallback=None: "voxtral" if "Voxtral" in (name or "") else "xtts"):
        response = client.post(f"/api/generation/bake/{cid}")
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"
        assert job.project_id == pid
        assert job.chapter_file == f"{cid}_0.txt"


def test_build_script_uses_chunk_group_engine_for_safe_text(monkeypatch, tmp_path):
    from app.api.routers import generation

    monkeypatch.setattr(generation, "get_chapter_dir", lambda project_id, chapter_id: tmp_path)
    monkeypatch.setattr(
        "app.db.segments.get_chapter_segments",
        lambda chapter_id: [{"id": "s1", "text_content": "Hello world."}],
    )
    monkeypatch.setattr(
        generation,
        "build_chunk_groups",
        lambda segments, default_profile: [
            {
                "segments": [{"id": "s1"}],
                "profile_name": "Voice A",
                "engine": "manifest-engine",
                "text_parts": ["Hello world."],
            }
        ],
    )
    monkeypatch.setattr("app.db.speakers.get_profile_wavs", lambda profile_name: None)
    monkeypatch.setattr("app.db.speakers.get_profile_dir", lambda profile_name: tmp_path / "voice")
    monkeypatch.setattr(
        generation,
        "resolve_profile_engine",
        lambda profile_name, fallback_engine=None: (_ for _ in ()).throw(AssertionError("engine was recomputed")),
    )
    monkeypatch.setattr(generation, "has_behavior", lambda engine_id, behavior: engine_id == "manifest-engine")

    seen_targets = []

    def fake_split(text, *, target):
        seen_targets.append(target)
        return text

    monkeypatch.setattr(generation, "get_text_split_target", lambda engine_id: 321 if engine_id == "manifest-engine" else 999)
    monkeypatch.setattr(generation, "sanitize_text", lambda text, categories=None: text)
    monkeypatch.setattr(generation, "safe_split_long_sentences", fake_split)

    script = generation._build_script_for_chapter("chapter-1", "project-1", "Default Voice", safe_mode=True)

    assert script[0]["id"] == "s1"
    assert seen_targets == [321]


def test_bake_chapter_voxtral_uses_mixed_worker(clean_db, client):
    from app.db.state import update_settings
    update_settings({"enabled_plugins": {"voxtral": True}})
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    from app.db.state import update_settings
    update_settings({"mistral_api_key": "abc123"})

    with patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"), \
         patch("app.db.speakers.get_profile_engine", return_value="voxtral"):
        response = client.post(f"/api/generation/bake/{cid}")
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"


def test_bake_chapter_rejects_voxtral_without_api_key(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    from app.db.state import update_settings
    update_settings({"mistral_api_key": ""})

    with patch("app.db.speakers.get_profile_engine", return_value="voxtral"), \
         patch("app.api.routers.generation.get_settings", return_value={"default_speaker_profile": "Voice1", "default_engine": "xtts", "enabled_plugins": {"voxtral": True}}):
        response = client.post(f"/api/generation/bake/{cid}")
        assert response.status_code == 400
        assert "API key" in response.json()["message"]

def test_pause_resume(clean_db, client):
    response = client.post("/api/generation/pause")
    assert response.status_code == 200

    response = client.post("/api/generation/resume")
    assert response.status_code == 200

def test_generate_segments(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.queue import get_queue
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    segs = get_chapter_segments(cid)
    sid = segs[0]['id']

    with timeout_after(5, "segment route should not hang"), \
         patch("app.api.routers.generation.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client.post("/api/segments/generate", data={"segment_ids": sid})
        assert response.status_code == 200
        job_id = response.json()["job_id"]
        assert job_id
        assert any(row["id"] == job_id and row["custom_title"] == "C1: segment #1" for row in get_queue())




def test_generate_segments_single_engine_use_mixed_worker(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    segs = get_chapter_segments(cid)

    with timeout_after(5, "segment worker selection should not hang"), \
         patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"), \
         patch("app.db.speakers.get_profile_engine", return_value="xtts"):
        response = client.post("/api/segments/generate", data={"segment_ids": f"{segs[0]['id']},{segs[1]['id']}"})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"


def test_generate_segments_sets_segment_specific_queue_title(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "Overview", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    segs = get_chapter_segments(cid)

    with timeout_after(5, "segment title selection should not hang"), \
         patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"), \
         patch("app.db.speakers.get_profile_engine", return_value="xtts"):
        response = client.post("/api/segments/generate", data={"segment_ids": f"{segs[0]['id']},{segs[1]['id']}"})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.custom_title == "Overview: segment #1"


def test_generate_segments_hydrates_segment_ids_without_live_job(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "Overview", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    segs = get_chapter_segments(cid)
    segment_ids = [segs[0]["id"], segs[1]["id"]]

    with timeout_after(5, "segment queue hydration should not hang"), \
         patch("app.api.routers.generation.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"), \
         patch("app.db.speakers.get_profile_engine", return_value="xtts"):
        response = client.post("/api/segments/generate", data={"segment_ids": ",".join(segment_ids)})

    assert response.status_code == 200
    job_id = response.json()["job_id"]

    queue_response = client.get("/api/processing_queue")
    assert queue_response.status_code == 200
    row = next(item for item in queue_response.json() if item["id"] == job_id)
    assert row["custom_title"] == "Overview: segment #1"
    assert row["segment_ids"] == segment_ids


def test_queue_chapter_without_bakeable_segments_uses_standard_engine(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")

    with patch("app.api.routers.generation.put_job") as mock_put_job, patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.is_bake is False


def test_queue_chapter_uses_disambiguated_sort_order_title(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "Overview", "Hello world.", sort_order=4)
    sync_chapter_segments(cid, "Hello world.")

    with patch("app.api.routers.generation.put_job") as mock_put_job, patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.custom_title == "Overview • Part 5"


def test_queue_chapter_preserves_rendered_segment_history(clean_db, client, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Another line.")
    sync_chapter_segments(cid, "Hello world. Another line.")
    segs = get_chapter_segments(cid)

    chapter_dir = tmp_path / "chapters" / cid
    nested_seg_dir = chapter_dir / "segments"
    nested_seg_dir.mkdir(parents=True)

    rendered_name = f"{segs[0]['id']}.wav"
    (nested_seg_dir / rendered_name).write_bytes(b"fake wav")
    update_segment(segs[0]["id"], audio_status="done", audio_file_path=rendered_name)
    update_segment(segs[1]["id"], audio_status="unprocessed", audio_file_path=None)

    with patch("app.api.routers.generation.get_chapter_dir", return_value=chapter_dir), \
         patch("app.core.config.get_chapter_dir", return_value=chapter_dir), \
         patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.is_bake is True
        refreshed = get_chapter_segments(cid)
        assert refreshed[0]["audio_status"] == "done"
        assert refreshed[0]["audio_file_path"] == rendered_name
        assert refreshed[1]["audio_status"] == "unprocessed"


def test_get_chapter_segments_treats_done_without_audio_path_as_unprocessed(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db.core import get_connection

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE chapter_segments SET audio_status = 'done', audio_file_path = NULL WHERE chapter_id = ?", (cid,))
        conn.commit()

    refreshed = get_chapter_segments(cid)
    assert refreshed[0]["audio_status"] == "unprocessed"
    assert refreshed[0]["audio_file_path"] is None


def test_get_chapter_segments_treats_other_segment_audio_paths_as_unprocessed(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db.core import get_connection

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    segs = get_chapter_segments(cid)

    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()
    expected_name = f"{segs[1]['id']}.wav"
    (audio_dir / expected_name).write_bytes(b"fake wav")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE chapter_segments
            SET audio_status = 'done',
                audio_file_path = ?
            WHERE chapter_id = ?
            """,
            (expected_name, cid),
        )
        conn.commit()

    # We no longer patch get_project_audio_dir because it's deleted.
    # The runtime should NOT find the file in audio_dir.
    refreshed = get_chapter_segments(cid)

    assert refreshed[0]["audio_status"] == "unprocessed"
    assert refreshed[1]["audio_status"] == "unprocessed"


def test_queue_chapter_resolves_voxtral_engine_from_profile(clean_db, client):
    from app.db.state import update_settings
    update_settings({"enabled_plugins": {"voxtral": True}})
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    from app.db.state import update_settings
    update_settings({"mistral_api_key": "abc123"})

    with patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"), \
         patch("app.db.speakers.get_profile_engine", return_value="voxtral"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "Voice1"})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "voxtral"


def test_queue_chapter_mixed_engines_use_mixed_worker(clean_db, client):
    from app.db.state import update_settings
    update_settings({"enabled_plugins": {"voxtral": True}})
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")

    from app.db.state import update_settings
    update_settings({"mistral_api_key": "abc123"})

    with patch("app.domain.chunk_groups.load_chunk_segments", return_value=[
        {"id": "s1", "speaker_profile_name": "SingleEngine Voice", "character_speaker_profile_name": None, "text_content": "Hello world.", "audio_status": "unprocessed", "audio_file_path": None},
        {"id": "s2", "speaker_profile_name": "Voxtral Voice", "character_speaker_profile_name": None, "text_content": "Goodbye world.", "audio_status": "unprocessed", "audio_file_path": None},
    ]), \
         patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"), \
         patch("app.db.speakers.get_profile_engine", side_effect=lambda name, fallback=None: "voxtral" if "Voxtral" in (name or "") else "xtts"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "SingleEngine Voice"})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"


def test_queue_chapter_detects_mixed_engines_from_character_voice_assignments(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment
    from app.db.characters import create_character

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Narration. Dialogue.")
    sync_chapter_segments(cid, "Narration. Dialogue.")
    segs = get_chapter_segments(cid)
    char_id = create_character(pid, "Dracula", "SingleEngine Voice")
    update_segment(segs[1]["id"], character_id=char_id)
    from app.db.state import update_settings
    update_settings({"mistral_api_key": "abc123"})

    with patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"), \
         patch("app.db.speakers.get_profile_engine", side_effect=lambda name, fallback=None: "voxtral" if name == "Narrator Voxtral" else "xtts"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "Narrator Voxtral"})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"


def test_generate_segments_resolves_voxtral_engine(clean_db, client):
    from app.db.state import update_settings
    update_settings({"enabled_plugins": {"voxtral": True}})
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    segs = get_chapter_segments(cid)
    sid = segs[0]['id']
    from app.db.state import update_settings
    update_settings({"mistral_api_key": "abc123"})

    with patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"), \
         patch("app.db.speakers.get_profile_engine", return_value="voxtral"):
        response = client.post("/api/segments/generate", data={"segment_ids": sid})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"


def test_generate_segments_mixed_engines_use_mixed_worker(clean_db, client):
    from app.db.state import update_settings
    update_settings({"enabled_plugins": {"voxtral": True}})
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    segs = get_chapter_segments(cid)
    from app.db.state import update_settings
    update_settings({"mistral_api_key": "abc123"})

    with patch("app.api.routers.generation.get_chapter_segments", return_value=[
        {**segs[0], "speaker_profile_name": "SingleEngine Voice"},
        {**segs[1], "speaker_profile_name": "Voxtral Voice"},
    ]), \
         patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"), \
         patch("app.db.speakers.get_profile_engine", side_effect=lambda name, fallback=None: "voxtral" if "Voxtral" in (name or "") else "xtts"):
        response = client.post("/api/segments/generate", data={"segment_ids": f"{segs[0]['id']},{segs[1]['id']}"})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"


def test_queue_chapter_rejects_voxtral_without_api_key(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    from app.db.state import update_settings
    update_settings({"mistral_api_key": ""})

    with patch("app.db.speakers.get_profile_engine", return_value="voxtral"), \
         patch("app.api.routers.generation.get_settings", return_value={"safe_mode": True, "make_mp3": False, "default_engine": "xtts"}):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "Voice1"})
        assert response.status_code == 400
        assert "API key" in response.json()["message"]


def test_queue_chapter_rejects_unconfigured_engine_with_clear_message(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")

    with patch("app.api.routers.generation.get_settings", return_value={"default_speaker_profile": "Voice1", "default_engine": ""}), \
         patch("app.api.routers.generation.resolve_tts_engine_for_profiles", return_value=("", [""])):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "Voice1"})

    assert response.status_code == 400
    assert response.json()["message"] == "No TTS engine is currently configured for this voice profile. Please select an engine in Settings."


def test_queue_chapter_rejects_missing_registry_engine_with_named_message(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")

    bridge = MagicMock()
    bridge.describe_registry.return_value = []
    bridge.is_engine_enabled.return_value = False

    with patch("app.api.routers.generation.create_voice_bridge", return_value=bridge), \
         patch("app.api.routers.generation.get_settings", return_value={"default_speaker_profile": "Voice1", "default_engine": "some-engine"}), \
         patch("app.api.routers.generation.resolve_tts_engine_for_profiles", return_value=("some-engine", ["some-engine"])):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "Voice1"})

    assert response.status_code == 400
    assert response.json()["message"] == "Enable Some-engine in Settings to use these voices."


def test_generation_orchestration_integration(clean_db, client, monkeypatch):
    """Exercises the real TaskOrchestrator.submit path from the API."""
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.orchestration.scheduler.orchestrator import TaskOrchestrator

    # 1. Setup DB
    pid = create_project("IntegrationProject")
    cid = create_chapter(pid, "IntegrationChapter", "Hello world.")

    # 2. Mock Bridge to capture the request
    mock_bridge = MagicMock()
    mock_bridge.synthesize.return_value = {"status": "ok", "message": "success"}
    mock_bridge.is_engine_enabled.return_value = True
    mock_bridge.describe_registry.return_value = [
        {"engine_id": "xtts", "enabled": True, "can_enable": True}
    ]

    # 3. Mock ProgressService to avoid real side effects and control reconciliation
    mock_progress = MagicMock()
    # Return "queue" decision for reconciliation so it reaches _dispatch
    mock_progress.reconcile.return_value = {"decision": "queue", "artifact_state": "missing"}

    # 4. Create a real orchestrator but with our mocks
    real_orchestrator = TaskOrchestrator(
        progress_service=mock_progress,
        voice_bridge=mock_bridge
    )

    # 5. Patch create_orchestrator to return our real (but mocked-dependency) orchestrator
    monkeypatch.setattr("app.api.routers.generation.create_orchestrator", lambda: real_orchestrator)

    # 6. Ensure registry is clear so it falls back to bridge synthesis
    from app.jobs.registry import get_handler_registry
    get_handler_registry().clear()

    # 7. Patch state-syncing to avoid state.json pollution during test
    # and patch resource reservation to skip hardware checks
    with patch("app.api.routers.generation.put_job"), \
         patch("app.api.routers.generation.update_job"), \
         patch("app.orchestration.scheduler.orchestrator.reserve_task_resources", return_value={"admitted": True}), \
         patch("app.orchestration.scheduler.orchestrator.release_task_resources"):

        # 7. Call the API
        response = client.post("/api/processing_queue", data={
            "project_id": pid,
            "chapter_id": cid
        })

        assert response.status_code == 200

    # 8. Verify bridge was called with expected context
    # FastAPI TestClient runs BackgroundTasks before returning
    assert mock_bridge.synthesize.called
    request = mock_bridge.synthesize.call_args.args[0]

    assert request["engine_id"] == "xtts"
    assert request["project_id"] == pid
    assert request["chapter_id"] == cid
    assert os.path.isabs(request["output_path"])
    assert request["output_path"].endswith(".wav")
    assert pid in request["output_path"]
    assert cid in request["output_path"]


def test_voice_profile_dir_propagation(clean_db, client, monkeypatch):
    """Verifies that voice_profile_dir reaches the bridge via synthesis_settings."""
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.orchestration.scheduler.orchestrator import TaskOrchestrator
    from pathlib import Path

    pid = create_project("VoiceProject")
    cid = create_chapter(pid, "VoiceChapter", "Voice text.")

    # Mock settings to have a default voice
    from app.db.state import update_settings
    update_settings({"default_speaker_profile": "Voice1", "default_engine": "xtts"})

    mock_bridge = MagicMock()
    mock_bridge.synthesize.return_value = {"status": "ok"}
    mock_bridge.describe_registry.return_value = [{"engine_id": "xtts", "enabled": True}]

    mock_progress = MagicMock()
    mock_progress.reconcile.return_value = {"decision": "queue", "artifact_state": "missing"}

    real_orchestrator = TaskOrchestrator(
        progress_service=mock_progress,
        voice_bridge=mock_bridge
    )
    monkeypatch.setattr("app.api.routers.generation.create_orchestrator", lambda: real_orchestrator)

    # Mock voice resolution
    mock_resolution = (None, Path("/tmp/dummy_voice_dir"))

    from app.jobs.registry import get_handler_registry
    get_handler_registry().clear()

    with patch("app.api.routers.generation.put_job"), \
         patch("app.api.routers.generation.update_job"), \
         patch("app.engines.voice_engines.resolve_voice_preview_inputs", return_value=mock_resolution), \
         patch("app.orchestration.scheduler.orchestrator.reserve_task_resources", return_value={"admitted": True}), \
         patch("app.orchestration.scheduler.orchestrator.release_task_resources"):

        response = client.post("/api/processing_queue", data={
            "project_id": pid,
            "chapter_id": cid
        })
        assert response.status_code == 200

    assert mock_bridge.synthesize.called
    request = mock_bridge.synthesize.call_args.args[0]

    # Verify voice_profile_dir is at the top level of bridge request
    # (because SynthesisTask spreads synthesis_settings)
    assert request.get("voice_profile_dir") == "/tmp/dummy_voice_dir"
    # Ensure it's NOT in requested_revision anymore
    assert "voice_profile_dir" not in request.get("requested_revision", {})


def test_mixed_generation_orchestration_integration(clean_db, client, monkeypatch):
    """Verifies that 'mixed' jobs bypass the bridge and call run() locally."""
    from app.jobs.registry import initialize_default_handlers, get_handler_registry
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.orchestration.scheduler.orchestrator import TaskOrchestrator

    get_handler_registry().clear()
    initialize_default_handlers()

    pid = create_project("MixedProject")
    cid = create_chapter(pid, "MixedChapter", "Mixed text.")

    mock_bridge = MagicMock()
    mock_progress = MagicMock()
    mock_progress.reconcile.return_value = {"decision": "queue", "artifact_state": "missing"}

    real_orchestrator = TaskOrchestrator(
        progress_service=mock_progress,
        voice_bridge=mock_bridge
    )
    monkeypatch.setattr("app.api.routers.generation.create_orchestrator", lambda: real_orchestrator)

    # Clear registry so it picks up our patch during initialize_default_handlers
    from app.jobs.registry import get_handler_registry
    get_handler_registry().clear()

    # We need to mock handle_mixed_job because it's called by the registry
    # when engine_id == 'mixed'.
    with patch("app.api.routers.generation.put_job"), \
         patch("app.api.routers.generation.update_job"), \
         patch("app.api.routers.generation.resolve_tts_engine_for_profiles", return_value=("xtts", ["xtts", "voxtral"])), \
         patch("plugins.tts_mixed.handler.handle_mixed_job", return_value=("done", None)) as mock_mixed_handler, \
         patch("app.orchestration.scheduler.orchestrator.reserve_task_resources", return_value={"admitted": True}), \
         patch("app.orchestration.scheduler.orchestrator.release_task_resources"):

        response = client.post("/api/processing_queue", data={
            "project_id": pid,
            "chapter_id": cid
        })

        assert response.status_code == 200

    # 1. Verify bridge.synthesize was NOT called for 'mixed'
    # (Individual segments might call it, but not the root task)
    assert not mock_bridge.synthesize.called

    # 2. Verify handle_mixed_job WAS called
    assert mock_mixed_handler.called
    assert mock_mixed_handler.call_args.kwargs["jid"] is not None
    assert mock_mixed_handler.call_args.kwargs["j"].engine == "mixed"


def test_queue_chapter_mixed_render_runs_end_to_end(clean_db, client, monkeypatch, tmp_path):
    """Exercise the real mixed render path through the queue API."""
    from pathlib import Path
    import wave

    from app.db import get_connection
    from app.db.chapters import create_chapter, get_chapter
    from app.db.projects import create_project
    from app.db.segments import get_chapter_segments, sync_chapter_segments, update_segment
    from app.orchestration.scheduler.orchestrator import TaskOrchestrator

    pid = create_project("MixedProject")
    cid = create_chapter(pid, "MixedChapter", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    segs = get_chapter_segments(cid)
    update_segment(segs[0]["id"], speaker_profile_name="Voice1")
    update_segment(segs[1]["id"], speaker_profile_name="Voice2")

    mock_progress = MagicMock()
    mock_progress.reconcile.return_value = {"decision": "queue", "artifact_state": "missing"}
    mock_progress.publish.return_value = None
    mock_bridge = MagicMock()
    real_orchestrator = TaskOrchestrator(progress_service=mock_progress, voice_bridge=mock_bridge)
    monkeypatch.setattr("app.api.routers.generation.create_orchestrator", lambda: real_orchestrator)

    from app.jobs.registry import initialize_default_handlers, get_handler_registry
    get_handler_registry().clear()
    initialize_default_handlers()

    chapter_dir = tmp_path / "chapters" / cid

    def _write_silence_wav(path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(22050)
            wav_file.writeframes(b"\x00\x00" * 22050)

    def fake_generate_via_bridge(**kwargs):
        out_wav = Path(kwargs["out_wav"])
        _write_silence_wav(out_wav)
        return 0

    def fake_stitch(_pdir, _segment_wavs, output_path, _on_output, _cancel_check):
        _write_silence_wav(output_path)
        return 0

    from app.jobs.registry import get_handler_registry
    get_handler_registry().clear()

    with patch("app.api.routers.generation.get_chapter_dir", return_value=chapter_dir), \
         patch("app.core.config.get_chapter_dir", return_value=chapter_dir), \
         patch("plugins.tts_mixed.handler.get_chapter_dir", return_value=chapter_dir), \
         patch("app.api.routers.generation.resolve_tts_engine_for_profiles", return_value=("xtts", ["xtts", "voxtral"])), \
         patch("app.engines.voice_engines.resolve_profile_engine", side_effect=lambda name, fallback_engine=None, fallback=None: "voxtral" if name == "Voice2" else "xtts"), \
         patch("app.api.routers.generation.resolve_profile_engine", side_effect=lambda name, fallback_engine=None, fallback=None: "voxtral" if name == "Voice2" else "xtts"), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, fallback=None: "voxtral" if name == "Voice2" else "xtts"), \
         patch("plugins.tts_mixed.handler.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "voice_123"} if name == "Voice2" else {"speed": 1.0}), \
         patch("plugins.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("plugins.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("plugins.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("plugins.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("app.api.routers.generation.broadcast_queue_update"), \
         patch("app.api.routers.generation.broadcast_chapter_updated"), \
         patch("app.api.ws.broadcast_segments_updated"), \
         patch("app.orchestration.scheduler.orchestrator.reserve_task_resources", return_value={"admitted": True}), \
         patch("app.orchestration.scheduler.orchestrator.release_task_resources"):

        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "Voice1"})

    assert response.status_code == 200

    with get_connection() as conn:
        queue_row = conn.execute(
            "SELECT status, completed_at FROM processing_queue WHERE chapter_id = ? ORDER BY created_at DESC LIMIT 1",
            (cid,),
        ).fetchone()
        segment_rows = conn.execute(
            "SELECT audio_status, audio_file_path FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order",
            (cid,),
        ).fetchall()

    chapter = get_chapter(cid)

    assert queue_row["status"] == "done"
    assert queue_row["completed_at"] is not None
    assert chapter["audio_status"] == "done"
    assert chapter["audio_file_path"] == "chapter.wav"
    assert all(row["audio_status"] == "done" for row in segment_rows)
    assert all(row["audio_file_path"] for row in segment_rows)


def test_queue_chapter_mixed_engine_builds_weighted_script(clean_db, client):
    """Mixed jobs must carry the per-group script so the orchestrator gets
    render-group weights — without them every segment frame is published with
    the FULL chapter ETA (observed: every segments.progress frame pinned at
    85s) and chapter progress collapses to the raw active-segment progress."""
    from app.db.state import update_settings
    update_settings({"enabled_plugins": {"voxtral": True}, "mistral_api_key": "abc123"})
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")

    with patch("app.domain.chunk_groups.load_chunk_segments", return_value=[
        {"id": "s1", "speaker_profile_name": "SingleEngine Voice", "character_speaker_profile_name": None, "text_content": "Hello world.", "audio_status": "unprocessed", "audio_file_path": None},
        {"id": "s2", "speaker_profile_name": "Voxtral Voice", "character_speaker_profile_name": None, "text_content": "Goodbye world.", "audio_status": "unprocessed", "audio_file_path": None},
    ]), \
         patch("app.api.routers.generation.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit") as mock_submit, \
         patch("app.db.speakers.get_profile_engine", side_effect=lambda name, fallback=None: "voxtral" if "Voxtral" in (name or "") else "xtts"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "SingleEngine Voice"})
        assert response.status_code == 200
        task = mock_submit.call_args.args[0]
        assert task.engine_id == "mixed"
        assert task.script, "mixed synthesis task must carry the weighted per-group script"
        for entry in task.script:
            assert entry.get("ids"), entry
            assert entry.get("weight", 0) >= 1, entry


def test_queue_chapter_xtts_engine_builds_nonempty_script_with_worker_aligned_ids(clean_db, client):
    """XTTS chapter render task must carry a non-empty .script so the orchestrator's
    grouped-progress path (total_weight > 0) is taken — without it the fallback
    `p = raw_progress` resets the progress bar toward 0 each segment (backwards bar).

    Alignment contract (R1-verified):
    - Each entry's ``id`` matches what the XTTS worker emits in [START_SEGMENT] {sid}.
    - Each entry's ``save_path`` matches what the worker emits in [SEGMENT_SAVED] {path}.
    Both are: chapter_dir / "segments" / "{first_segment_id}.wav".

    R1 revert-check: if `uses_segment_orchestration("xtts")` returns False (or
    `_build_script_for_chapter` is not called), `task.script` will be None and the
    ``assert task.script`` line fails — confirming this test catches the regression.
    """
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments
    from app.core.config import get_chapter_dir

    pid = create_project("P-xtts-script")
    cid = create_chapter(pid, "C-xtts-script", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")

    segment_rows = [
        {
            "id": "seg-xtts-1",
            "speaker_profile_name": "Voice1",
            "character_speaker_profile_name": None,
            "text_content": "Hello world.",
            "audio_status": "unprocessed",
            "audio_file_path": None,
        },
        {
            "id": "seg-xtts-2",
            "speaker_profile_name": "Voice1",
            "character_speaker_profile_name": None,
            "text_content": "Goodbye world.",
            "audio_status": "unprocessed",
            "audio_file_path": None,
        },
    ]

    with patch("app.domain.chunk_groups.load_chunk_segments", return_value=segment_rows), \
         patch("app.db.segments.get_chapter_segments", return_value=segment_rows), \
         patch("app.api.routers.generation.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit") as mock_submit, \
         patch("app.db.speakers.get_profile_engine", return_value="xtts"):
        response = client.post(
            "/api/processing_queue",
            data={"project_id": pid, "chapter_id": cid, "speaker_profile": "Voice1"},
        )
        assert response.status_code == 200, response.json()
        task = mock_submit.call_args.args[0]

    # Engine must be xtts (not mixed, not empty string)
    assert task.engine_id == "xtts", f"expected xtts engine, got {task.engine_id!r}"

    # script must be populated — this is the grouped-progress gate
    assert task.script, (
        "XTTS chapter render task must carry a non-empty .script; "
        "without it total_weight=0 and the orchestrator falls back to raw per-segment "
        "progress which resets toward 0 each segment (backwards bar)"
    )

    # Alignment: each entry must have id + save_path matching the worker marker format
    chapter_dir = get_chapter_dir(pid, cid)
    for entry in task.script:
        seg_id = entry.get("id")
        assert seg_id, f"script entry missing 'id': {entry}"

        # Worker emits [START_SEGMENT] {seg_id} — id must be the segment row id
        assert seg_id in {r["id"] for r in segment_rows}, (
            f"script entry id {seg_id!r} not in segment ids — "
            "orchestrator START_SEGMENT lookup will miss"
        )

        # Worker emits [SEGMENT_SAVED] {save_path} — must be absolute path
        save_path = entry.get("save_path")
        assert save_path, f"script entry missing 'save_path': {entry}"
        expected_path = str((chapter_dir / "segments" / f"{seg_id}.wav").absolute())
        assert save_path == expected_path, (
            f"save_path mismatch: got {save_path!r}, expected {expected_path!r}; "
            "orchestrator SEGMENT_SAVED path lookup will miss and completed_weight won't advance"
        )

        # Weight must be positive for the orchestrator's total_weight > 0 gate
        assert entry.get("weight", 0) >= 1, f"script entry weight must be >= 1: {entry}"

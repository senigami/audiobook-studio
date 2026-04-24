import os
from pathlib import Path

import pytest

from app.db import create_project, create_chapter, get_chapter_segments, update_segment, create_character, sync_chapter_segments
from app.db.core import init_db


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app

    return TestClient(fastapi_app)


@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_chapters_production_blocks.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib

    importlib.reload(app.db.core)
    init_db()
    yield
    if os.path.exists(db_path):
        os.unlink(db_path)


def _assign_segment(segment_id: str, character_id: str, speaker_profile_name: str) -> None:
    update_segment(
        segment_id,
        character_id=character_id,
        speaker_profile_name=speaker_profile_name,
    )


def test_production_block_grouping_and_batches(clean_db, client):
    pid = create_project("Production Block Project")
    cid = create_chapter(pid, "Chapter 1", "Alpha one. Alpha two. Beta one. Gamma one.")

    char_a = create_character(pid, "Narrator", "NarratorProfile")
    char_b = create_character(pid, "Guest", "GuestProfile")
    char_c = create_character(pid, "Guide", "GuideProfile")

    segments = get_chapter_segments(cid)
    assert len(segments) == 4
    _assign_segment(segments[0]["id"], char_a, "NarratorProfile")
    _assign_segment(segments[1]["id"], char_a, "NarratorProfile")
    _assign_segment(segments[2]["id"], char_b, "GuestProfile")
    _assign_segment(segments[3]["id"], char_c, "GuideProfile")

    response = client.get(f"/api/chapters/{cid}/production-blocks")
    assert response.status_code == 200
    data = response.json()

    assert data["chapter_id"] == cid
    assert data["base_revision_id"].startswith("rev_")
    assert len(data["blocks"]) == 3
    assert data["blocks"][0]["source_segment_ids"] == [segments[0]["id"], segments[1]["id"]]
    assert data["blocks"][0]["character_id"] == char_a
    assert data["blocks"][1]["source_segment_ids"] == [segments[2]["id"]]
    assert data["blocks"][2]["source_segment_ids"] == [segments[3]["id"]]
    assert len(data["render_batches"]) == 3
    assert data["render_batches"][0]["block_ids"] == [data["blocks"][0]["id"]]


def test_production_block_split_on_paragraph(clean_db, client):
    pid = create_project("P1")
    # Newline after first sentence
    text = "Para one.\nPara two."
    cid = create_chapter(pid, "Chapter 1", text)
    # sync_chapter_segments uses nlp.split_into_sentences
    sync_chapter_segments(cid, text)

    response = client.get(f"/api/chapters/{cid}/production-blocks")
    assert response.status_code == 200
    data = response.json()
    # Should be 2 blocks
    assert len(data["blocks"]) == 2
    assert data["blocks"][0]["text"] == "Para one."
    assert data["blocks"][1]["text"] == "Para two."
    assert data["blocks"][0]["order_index"] == 0
    assert data["blocks"][1]["order_index"] == 1


def test_production_block_save_preserves_assignments_and_resyncs(clean_db, client):
    pid = create_project("Production Block Save Project")
    cid = create_chapter(pid, "Chapter 1", "Alpha one. Alpha two. Beta one. Gamma one.")

    char_a = create_character(pid, "Narrator", "NarratorProfile")
    char_b = create_character(pid, "Guest", "GuestProfile")
    char_c = create_character(pid, "Guide", "GuideProfile")

    segments = get_chapter_segments(cid)
    _assign_segment(segments[0]["id"], char_a, "NarratorProfile")
    _assign_segment(segments[1]["id"], char_a, "NarratorProfile")
    _assign_segment(segments[2]["id"], char_b, "GuestProfile")
    _assign_segment(segments[3]["id"], char_c, "GuideProfile")

    first_payload = client.get(f"/api/chapters/{cid}/production-blocks").json()
    base_revision_id = first_payload["base_revision_id"]

    split_payload = {
        "base_revision_id": base_revision_id,
        "blocks": [
            {
                "id": first_payload["blocks"][0]["id"],
                "order_index": 0,
                "text": "Alpha one.",
                "character_id": char_a,
                "speaker_profile_name": "NarratorProfile",
                "status": "draft",
                "source_segment_ids": [segments[0]["id"]],
            },
            {
                "id": "split-alpha-two",
                "order_index": 1,
                "text": "Alpha two.",
                "character_id": char_a,
                "speaker_profile_name": "NarratorProfile",
                "status": "draft",
                "source_segment_ids": [segments[1]["id"]],
            },
            {
                "id": first_payload["blocks"][1]["id"],
                "order_index": 2,
                "text": "Beta one.",
                "character_id": char_b,
                "speaker_profile_name": "GuestProfile",
                "status": "draft",
                "source_segment_ids": [segments[2]["id"]],
            },
            {
                "id": first_payload["blocks"][2]["id"],
                "order_index": 3,
                "text": "Gamma one.",
                "character_id": char_c,
                "speaker_profile_name": "GuideProfile",
                "status": "draft",
                "source_segment_ids": [segments[3]["id"]],
            },
        ],
    }

    response = client.put(f"/api/chapters/{cid}/production-blocks", json=split_payload)
    assert response.status_code == 200
    split_data = response.json()
    assert len(split_data["blocks"]) == 4

    refreshed_segments = get_chapter_segments(cid)
    assert len(refreshed_segments) == 4
    assert refreshed_segments[0]["character_id"] == char_a
    assert refreshed_segments[1]["character_id"] == char_a
    assert refreshed_segments[2]["character_id"] == char_b
    assert refreshed_segments[3]["character_id"] == char_c

    merge_payload = {
        "base_revision_id": split_data["base_revision_id"],
        "blocks": [
            {
                "id": split_data["blocks"][0]["id"],
                "order_index": 0,
                "text": "Alpha one. Alpha two.",
                "character_id": char_a,
                "speaker_profile_name": "NarratorProfile",
                "status": "draft",
                "source_segment_ids": [
                    segments[0]["id"],
                    segments[1]["id"],
                ],
            },
            {
                "id": split_data["blocks"][3]["id"],
                "order_index": 1,
                "text": "Gamma one.",
                "character_id": char_c,
                "speaker_profile_name": "GuideProfile",
                "status": "draft",
                "source_segment_ids": [segments[3]["id"]],
            },
        ],
    }

    response = client.put(f"/api/chapters/{cid}/production-blocks", json=merge_payload)
    assert response.status_code == 200
    merged_data = response.json()
    assert len(merged_data["blocks"]) == 2

    merged_segments = get_chapter_segments(cid)
    assert len(merged_segments) == 3
    assert merged_segments[0]["character_id"] == char_a
    assert merged_segments[1]["character_id"] == char_a
    assert merged_segments[2]["character_id"] == char_c


def test_chapter_audio_export_wav_mp3_and_missing_audio(clean_db, tmp_path, client, monkeypatch):
    pid = create_project("Export Project")
    cid = create_chapter(pid, "Chapter 1", "Alpha one.")

    from app.web import app as fastapi_app
    from app.api.routers.chapters import get_xtts_out_dir
    from app.domain.chapters import compatibility as compatibility_module

    fastapi_app.dependency_overrides[get_xtts_out_dir] = lambda: tmp_path
    monkeypatch.setattr(compatibility_module, "find_existing_project_subdir", lambda _project_id, _kind: tmp_path)

    wav_path = tmp_path / f"{cid}.wav"
    wav_path.write_bytes(b"RIFFfakewav")

    response = client.post(f"/api/chapters/{cid}/export-audio", json={"format": "wav"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")
    assert response.content == b"RIFFfakewav"

    def fake_wav_to_mp3(in_wav: Path, out_mp3: Path, on_output=None, cancel_check=None) -> int:
        assert in_wav == wav_path
        out_mp3.write_bytes(b"ID3fake-mp3")
        return 0

    monkeypatch.setattr("app.engines.wav_to_mp3", fake_wav_to_mp3)

    response = client.post(f"/api/chapters/{cid}/export-audio", json={"format": "mp3"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/mpeg")
    assert (tmp_path / f"{cid}.mp3").read_bytes() == b"ID3fake-mp3"

    other_cid = create_chapter(pid, "Chapter 2", "Beta one.")
    response = client.post(f"/api/chapters/{other_cid}/export-audio", json={"format": "wav"})
    assert response.status_code == 404
    assert "render the chapter first" in response.json()["message"].lower()

    fastapi_app.dependency_overrides = {}

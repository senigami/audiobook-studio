import pytest
import json
import uuid
from unittest.mock import patch
from .api_voices_fixtures import client, clean_db, voices_root

def test_create_and_delete_profile(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()

    # Create
    response = client.post("/api/speaker-profiles", data={"speaker_id": "S1", "variant_name": "V1"})
    assert response.status_code == 200
    name = response.json()["name"]
    # Verify nested structure
    if " - " in name:
        spk, var = name.split(" - ", 1)
        assert (voices_dir / spk.strip() / var.strip()).exists()
    else:
        assert (voices_dir / name).exists()

    # Delete
    response = client.delete(f"/api/speaker-profiles/{name}")
    assert response.status_code == 200
    if " - " in name:
        spk, var = name.split(" - ", 1)
        assert not (voices_dir / spk.strip() / var.strip()).exists()
    else:
        assert not (voices_dir / name).exists()


def test_character_voice_assignment_blank_value_clears_to_default(clean_db, voices_root, client):
    from app.db.projects import create_project

    voices_root.mkdir()
    pid = create_project("Character Project", "/tmp")

    create_response = client.post(f"/api/projects/{pid}/characters", data={"name": "Alice", "speaker_profile_name": "Prof1"})
    assert create_response.status_code == 200
    character_id = create_response.json()["character_id"]

    update_response = client.put(f"/api/characters/{character_id}", data={"speaker_profile_name": ""})
    assert update_response.status_code == 200

    chars_response = client.get(f"/api/projects/{pid}/characters")
    assert chars_response.status_code == 200
    characters = chars_response.json()["characters"]
    assert characters[0]["speaker_profile_name"] is None


def test_create_character_blank_voice_uses_default(clean_db, voices_root, client):
    from app.db.projects import create_project

    voices_root.mkdir()
    pid = create_project("Character Project", "/tmp")

    create_response = client.post(f"/api/projects/{pid}/characters", data={"name": "Bob", "speaker_profile_name": ""})
    assert create_response.status_code == 200

    chars_response = client.get(f"/api/projects/{pid}/characters")
    assert chars_response.status_code == 200
    characters = chars_response.json()["characters"]
    assert characters[0]["speaker_profile_name"] is None


def test_character_crud(clean_db, client):
    from app.db.projects import create_project
    pid = create_project("P1")

    # Create
    response = client.post(f"/api/projects/{pid}/characters", data={"name": "Alice", "speaker_profile_name": "Prof1"})
    assert response.status_code == 200
    cid = response.json()["id"]

    # List
    response = client.get(f"/api/projects/{pid}/characters")
    assert response.status_code == 200
    assert len(response.json()["characters"]) == 1

    # Update
    response = client.put(f"/api/characters/{cid}", data={"name": "Alice Updated", "color": "#123456"})
    assert response.status_code == 200

    # Delete
    response = client.delete(f"/api/characters/{cid}")
    assert response.status_code == 200


def test_speaker_crud(clean_db, client):
    # Create
    response = client.post("/api/speakers", data={"name": "Narrator", "default_profile_name": "P1"})
    assert response.status_code == 200
    sid = response.json()["id"]

    # List
    response = client.get("/api/speakers")
    assert response.status_code == 200
    assert len(response.json()) == 1

    # Update
    response = client.put(f"/api/speakers/{sid}", data={"name": "Narrator Updated"})
    assert response.status_code == 200

    # Delete
    response = client.delete(f"/api/speakers/{sid}")
    assert response.status_code == 200


def test_rename_profile_and_security(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "OldName").mkdir()
    (voices_dir / "OldName" / "profile.json").write_text(json.dumps({"variant_name": "Old"}))
    (voices_dir / "OldName" / "latent.pth").write_text("latent")

    # Success
    response = client.post("/api/voices/rename-profile", data={"old_name": "OldName", "new_name": "NewName - Variant"})
    assert response.status_code == 200
    assert (voices_dir / "NewName" / "Variant").exists()
    assert not (voices_dir / "OldName").exists()
    assert (voices_dir / "NewName" / "Variant" / "latent.pth").exists()

    # Security traversal
    response = client.post("/api/voices/rename-profile", data={"old_name": "NewName - Variant", "new_name": "../../traversal"})
    assert response.status_code == 403


def test_rename_speaker_with_variants(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "Narrator").mkdir()
    (voices_dir / "Narrator" / "Calm").mkdir()
    (voices_dir / "Narrator" / "voice.json").write_text(json.dumps({"version": 2, "name": "Narrator"}))
    (voices_dir / "Narrator" / "Calm" / "profile.json").write_text(json.dumps({"speaker_id": "Narrator"}))
    (voices_dir / "Narrator" / "Calm" / "latent.pth").write_text("latent")
    (voices_dir / "Narrator" / "Excited").mkdir()
    (voices_dir / "Narrator" / "Excited" / "profile.json").write_text("{}")

    # Rename
    response = client.post("/api/voices/rename-profile", data={"old_name": "Narrator", "new_name": "Dracula"})
    assert response.status_code == 200

    # Verify both main and variants are renamed
    assert (voices_dir / "Dracula").exists()
    assert (voices_dir / "Dracula" / "Calm").exists()
    assert (voices_dir / "Dracula" / "Excited").exists()
    assert not (voices_dir / "Narrator").exists()
    assert (voices_dir / "Dracula" / "Calm" / "latent.pth").exists()

    # Verify metadata update
    meta = json.loads((voices_dir / "Dracula" / "Calm" / "profile.json").read_text())
    assert meta["speaker_id"] == "Dracula"


def test_rename_profile_default_sync(clean_db, voices_root, client):
    from app.state import update_settings, get_settings
    update_settings({"default_speaker_profile": "OldProfile"})

    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "OldProfile").mkdir()
    response = client.post("/api/voices/rename-profile", data={"old_name": "OldProfile", "new_name": "NewProfile"})
    assert response.status_code == 200
    assert get_settings()["default_speaker_profile"] == "NewProfile"


def test_profile_creation_errors(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()

    # Already exists
    (voices_dir / "S1 - V1").mkdir()
    (voices_dir / "S1 - V1" / "profile.json").write_text("{}")
    response = client.post("/api/speaker-profiles", data={"speaker_id": "S1", "variant_name": "V1"})
    assert response.status_code == 400

    # Traversal
    response = client.post("/api/speaker-profiles", data={"speaker_id": "../../etc", "variant_name": "passwd"})
    assert response.status_code == 403

    # Exception
    with patch("app.api.routers.voices_management.Path.mkdir", side_effect=Exception("boom")):
        response = client.post("/api/speaker-profiles", data={"speaker_id": "Err", "variant_name": "V1"})
        assert response.status_code == 500

    response = client.post("/api/speaker-profiles", data={"speaker_id": "Err", "variant_name": "V1", "engine": "bad-engine"})
    assert response.status_code == 400


def test_assign_profile_to_speaker_errors(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "SomeProf").mkdir()
    (voices_dir / "SomeProf" / "profile.json").write_text("{}")

    # Generic error
    with patch("app.api.routers.voices_management.db.get_speaker", side_effect=Exception("db crash")):
        response = client.post("/api/speaker-profiles/SomeProf/assign", data={"speaker_id": "sid"})
        assert response.status_code == 500

import json
from app.db.speakers import create_speaker

def test_assign_profile_to_different_speaker(clean_db, voices_root, client):
    """Assigning a profile to a different speaker renames the folder correctly."""
    voices_dir = voices_root

    # Create two speakers
    sid_dracula = create_speaker("Dracula")
    create_speaker("Narrator")

    # Create a profile folder for Dracula
    (voices_dir / "Dracula").mkdir()
    (voices_dir / "Dracula" / "Calm").mkdir()
    (voices_dir / "Dracula" / "voice.json").write_text(json.dumps({"version": 2, "name": "Dracula"}))
    (voices_dir / "Dracula" / "Calm" / "profile.json").write_text(
        json.dumps({"speaker_id": sid_dracula, "variant_name": "Calm"})
    )

    # Get Narrator's speaker ID
    narr = [s for s in client.get("/api/speakers").json() if s["name"] == "Narrator"]
    sid_narrator = narr[0]["id"]

    # Reassign "Dracula - Calm" to Narrator
    response = client.post(
        "/api/speaker-profiles/Dracula%20-%20Calm/assign",
        data={"speaker_id": sid_narrator}
    )
    assert response.status_code == 200, response.text
    new_name = response.json()["new_profile_name"]
    assert new_name == "Narrator - Calm"
    assert (voices_dir / "Narrator" / "Calm").exists()
    assert not (voices_dir / "Dracula").exists()

"""Archetype-matched sample-text auto-suggestion on POST /{name}/test.

Covers the wiring in submit_sample_test_job (app/api/routers/voices_helpers.py):
when a voice's profile.json has never had test_text explicitly set, and its
tagged attributes closely match one of the curated archetypes, the archetype's
sample_text is applied before the sample job is submitted -- so clicking
"Generate Sample" produces a tailored line instead of the generic default.
Never happens if test_text was already customized (even to the same generic
default via an explicit save), and never happens for an untagged voice.
"""
import json
from unittest.mock import patch

from app.db.speakers import DEFAULT_SPEAKER_TEST_TEXT, get_speaker_settings

WARM_STORYTELLER_ATTRIBUTES = {
    "class": "human",
    "gender": "feminine",
    "age": "adult",
    "tone": ["warm", "friendly", "gentle"],
    "timbre": ["rich", "velvety", "smooth"],
    "pace": "measured",
}
WARM_STORYTELLER_SAMPLE_TEXT = (
    "Come sit by the fire a while — I've got a story that's just waiting to be "
    "told, and it gets better every time I tell it."
)


def _make_voice(voices_root, name, attributes=None, test_text=None, engine="xtts"):
    profile_root = voices_root / name
    profile_root.mkdir(parents=True)
    voice_manifest = {"version": 2, "name": name}
    if attributes is not None:
        voice_manifest["attributes"] = attributes
    (profile_root / "voice.json").write_text(json.dumps(voice_manifest))

    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "1.wav").write_text("audio")
    variant_meta = {"variant_name": "Default", "engine": engine}
    if test_text is not None:
        variant_meta["test_text"] = test_text
    (profile_dir / "profile.json").write_text(json.dumps(variant_meta))
    return profile_root


def _post_test(client, name):
    with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True), \
         patch("app.db.state.put_job"), \
         patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        return client.post(f"/api/speaker-profiles/{name}/test")


def test_never_customized_and_closely_tagged_voice_gets_archetype_sample_text(clean_db, voices_root, client):
    _make_voice(voices_root, "WarmVoice", attributes=WARM_STORYTELLER_ATTRIBUTES)

    response = _post_test(client, "WarmVoice")

    assert response.status_code == 200
    assert get_speaker_settings("WarmVoice")["test_text"] == WARM_STORYTELLER_SAMPLE_TEXT


def test_already_customized_test_text_is_never_overwritten(clean_db, voices_root, client):
    custom_text = "This is my own custom preview line, please leave it alone."
    _make_voice(voices_root, "CustomVoice", attributes=WARM_STORYTELLER_ATTRIBUTES, test_text=custom_text)

    response = _post_test(client, "CustomVoice")

    assert response.status_code == 200
    assert get_speaker_settings("CustomVoice")["test_text"] == custom_text


def test_untagged_voice_keeps_the_generic_default(clean_db, voices_root, client):
    _make_voice(voices_root, "UntaggedVoice", attributes=None)

    response = _post_test(client, "UntaggedVoice")

    assert response.status_code == 200
    assert get_speaker_settings("UntaggedVoice")["test_text"] == DEFAULT_SPEAKER_TEST_TEXT


def test_tagged_but_no_close_archetype_match_keeps_the_generic_default(clean_db, voices_root, client):
    # A combination that scores below CLOSE_THRESHOLD against every curated archetype.
    odd_attributes = {"class": "robot", "gender": "neutral", "age": "ageless"}
    _make_voice(voices_root, "OddVoice", attributes=odd_attributes)

    response = _post_test(client, "OddVoice")

    assert response.status_code == 200
    assert get_speaker_settings("OddVoice")["test_text"] == DEFAULT_SPEAKER_TEST_TEXT

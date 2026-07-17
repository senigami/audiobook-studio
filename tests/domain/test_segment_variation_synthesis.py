"""B4 — Non-default voice variant must reach the synthesis engine.

A segment assigned a non-default variant (e.g. "Aria - Whisper") must
persist that speaker_profile_name and carry the *variant's* voice assets
(not the base speaker's default) all the way to the synthesis call.

Discovery findings (2026-06-17):
  - Storage: `save_script_assignments` stores the full compound name; no drop there.
  - `resolve_segment_profile_name` (chunk_groups.py:33) preserves the variant suffix.
  - `build_chunk_groups` groups by the full variant profile_name; no strip there.
  - `_render_segment` (tts_mixed/handler.py:203) receives the full profile_name and
    passes it verbatim to `get_speaker_settings`, `get_voice_profile_dir`, and
    `generate_via_bridge`.  No suffix stripping occurs in the current code.
  - `_build_script_for_chapter` (generation.py:166) resolves `voice_profile_dir` per
    group using the group's `profile_name` (which includes the variant suffix).
  - Verdict: the code is CORRECT as written; these tests provide a regression guard
    against any future change that strips the variant suffix before resolution.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import call, patch


# ---------------------------------------------------------------------------
# Mixed-handler variant path (B4 regression guard)
# ---------------------------------------------------------------------------

def test_render_segment_uses_variant_profile_name_for_resolution():
    """_render_segment must call get_speaker_settings and get_voice_profile_dir
    with the FULL compound profile name "Aria - Whisper", NOT the base "Aria".

    Mocks only the TTS engine boundary (generate_via_bridge) and the DB/filesystem
    helpers (get_speaker_settings, get_voice_profile_dir) — never the unit under test
    (_render_segment).  R2 compliant.

    R1 revert-check: a change that strips the variant suffix (e.g. calling
    infer_speaker_name() in _render_segment before resolution) would cause these
    assertions to fail because the helpers would be called with "Aria" instead of
    "Aria - Whisper".
    """
    from tts_engines.tts_mixed.handler import _render_segment

    variant_profile_dir = Path("/tmp/voices/Aria/Whisper")
    bridge_calls: list[dict] = []

    def capturing_bridge(**kwargs):
        bridge_calls.append(kwargs)
        Path(kwargs["out_wav"]).write_text("audio")
        return 0

    with patch(
        "tts_engines.tts_mixed.handler.get_speaker_settings",
        return_value={"speed": 1.0, "engine": "xtts"},
    ) as mock_settings, patch(
        "tts_engines.tts_mixed.handler.get_voice_profile_dir",
        return_value=variant_profile_dir,
    ) as mock_dir, patch(
        "tts_engines.tts_mixed.handler.generate_via_bridge",
        side_effect=capturing_bridge,
    ):
        rc = _render_segment(
            "xtts",
            "Hello, whispered voice.",
            "Aria - Whisper",
            Path("/tmp/seg.wav"),
            safe_mode=False,
            on_output=lambda _: None,
            cancel_check=lambda: False,
        )

    assert rc == 0

    # Resolution functions must be called with the full variant name.
    mock_settings.assert_called_once_with("Aria - Whisper")
    mock_dir.assert_called_once_with("Aria - Whisper")

    # The synthesis request must carry the variant's profile name and directory.
    assert bridge_calls, "generate_via_bridge was not called"
    req = bridge_calls[0]
    assert req.get("profile_name") == "Aria - Whisper", (
        f"Expected profile_name='Aria - Whisper', got {req.get('profile_name')!r}. "
        "The variant suffix must not be stripped before the bridge call."
    )
    assert req.get("voice_profile_dir") == variant_profile_dir, (
        f"Expected voice_profile_dir={variant_profile_dir!r}, got {req.get('voice_profile_dir')!r}. "
        "The synthesis request must reference the variant's directory, not the default."
    )


# ---------------------------------------------------------------------------
# Chunk-group resolution: variant profile_name is preserved through grouping
# ---------------------------------------------------------------------------

def test_build_chunk_groups_preserves_variant_in_profile_name():
    """build_chunk_groups must keep the full 'Speaker - Variant' compound name
    as group["profile_name"].  It must not strip the variant suffix.

    R2 compliant: mocks only resolve_profile_engine (engine registry lookup) and
    get_text_chunk_limit (manifest data).  The unit under test (build_chunk_groups)
    is NOT mocked.
    """
    from app.domain.chunk_groups import build_chunk_groups

    segments = [
        {
            "id": "s1",
            "text_content": "Hello.",
            "character_id": "char1",
            "speaker_profile_name": "Aria - Whisper",
        },
        {
            "id": "s2",
            "text_content": "World.",
            "character_id": "char1",
            "speaker_profile_name": "Aria - Whisper",
        },
    ]

    with patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("app.domain.chunk_groups.get_text_chunk_limit", return_value=500):
        groups = build_chunk_groups(segments, default_profile="Aria")

    assert len(groups) == 1
    assert groups[0]["profile_name"] == "Aria - Whisper", (
        f"Expected 'Aria - Whisper' but got {groups[0]['profile_name']!r}. "
        "build_chunk_groups must not strip the variant suffix from profile_name."
    )


def test_build_chunk_groups_separates_default_and_variant():
    """Segments assigned to different variants of the same speaker must be grouped
    separately (since profile_name differs, even though character_id is the same).

    This ensures the synthesis engine receives distinct voice_profile_dir values
    for each variant group — not merged into one group using the default's assets.
    """
    from app.domain.chunk_groups import build_chunk_groups

    segments = [
        {
            "id": "s1",
            "text_content": "Default voice.",
            "character_id": "char1",
            "speaker_profile_name": "Aria",
        },
        {
            "id": "s2",
            "text_content": "Whisper variant.",
            "character_id": "char1",
            "speaker_profile_name": "Aria - Whisper",
        },
    ]

    with patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("app.domain.chunk_groups.get_text_chunk_limit", return_value=500):
        groups = build_chunk_groups(segments, default_profile="Aria")

    assert len(groups) == 2, (
        "Different variant profiles for the same character must form separate groups. "
        f"Got {len(groups)} groups: {[g['profile_name'] for g in groups]}"
    )
    profile_names = [g["profile_name"] for g in groups]
    assert "Aria" in profile_names
    assert "Aria - Whisper" in profile_names


# ---------------------------------------------------------------------------
# Script-building: variant's voice_profile_dir reaches the XTTS script entry
# ---------------------------------------------------------------------------

def test_build_script_for_chapter_uses_variant_voice_profile_dir(tmp_path):
    """_build_script_for_chapter must resolve voice_profile_dir using each group's
    profile_name (which includes the variant suffix).  Each script entry must carry
    the variant's specific directory, not the base speaker's default directory.

    R2 compliant: mocks the DB/filesystem layer (get_profile_wavs, get_profile_dir,
    get_chapter_segments) and the engine registry (build_chunk_groups return value)
    which are outside the unit under test (_build_script_for_chapter).  The function
    itself is NOT mocked.
    """
    from app.api.routers.generation import _build_script_for_chapter

    default_dir = tmp_path / "voices" / "Aria" / "Default"
    whisper_dir = tmp_path / "voices" / "Aria" / "Whisper"
    default_dir.mkdir(parents=True)
    whisper_dir.mkdir(parents=True)
    chapter_dir = tmp_path / "chapters" / "c1"
    chapter_dir.mkdir(parents=True)

    segments = [
        {"id": "s1", "text_content": "Default text.", "character_id": "c1",
         "speaker_profile_name": "Aria", "audio_status": None, "audio_file_path": None},
        {"id": "s2", "text_content": "Whisper text.", "character_id": "c1",
         "speaker_profile_name": "Aria - Whisper", "audio_status": None, "audio_file_path": None},
    ]

    def fake_build_chunk_groups(segs, prof, **kw):
        return [
            {"profile_name": "Aria", "engine": "xtts",
             "segments": [segments[0]], "text_parts": ["Default text."]},
            {"profile_name": "Aria - Whisper", "engine": "xtts",
             "segments": [segments[1]], "text_parts": ["Whisper text."]},
        ]

    profile_dirs = {"Aria": default_dir, "Aria - Whisper": whisper_dir}

    with patch("app.api.routers.generation_shared.build_chunk_groups", side_effect=fake_build_chunk_groups), \
         patch("app.db.segments.get_chapter_segments", return_value=segments), \
         patch("app.db.speakers.get_profile_wavs", return_value=None), \
         patch("app.db.speakers.get_profile_dir", side_effect=lambda name: profile_dirs.get(name, tmp_path / name)), \
         patch("app.domain.chunk_groups.has_behavior", return_value=False), \
         patch("app.domain.chunk_groups.get_text_split_target", return_value=450), \
         patch("app.core.config.get_chapter_dir", return_value=chapter_dir):
        script = _build_script_for_chapter("c1", "p1", "Aria", safe_mode=False)

    assert len(script) == 2, f"Expected 2 script entries, got {len(script)}"

    default_entry = next(e for e in script if e["id"] == "s1")
    whisper_entry = next(e for e in script if e["id"] == "s2")

    assert default_entry.get("voice_profile_dir") == str(default_dir), (
        f"Default entry must reference Aria/Default dir, got: {default_entry.get('voice_profile_dir')!r}"
    )
    assert whisper_entry.get("voice_profile_dir") == str(whisper_dir), (
        f"Whisper entry must reference Aria/Whisper dir, got: {whisper_entry.get('voice_profile_dir')!r}. "
        "The variant's directory must be used, not the default speaker's directory."
    )

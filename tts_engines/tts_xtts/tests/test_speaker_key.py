"""
Tests for serve_speakers.speaker_key — the canonical hashable dict key helper.

R1 revert-check: the regression-equality tests MUST FAIL if either:
  - build_unique_speakers reverts to building keys inline without speaker_key, OR
  - the lookup sites in xtts_inference revert to raw (vpdir or "", sw or "") form.

The old bug: for a list speaker_wav the old form ``(vpdir or "", sw)`` raises
  TypeError: unhashable type: 'list'
and for a Path voice_profile_dir with a string lookup the old form silently
  misses the cache (str("...") != Path("...") as a tuple element).
"""
from pathlib import Path

import pytest

from tts_engines.tts_xtts.plugin.core.serve_speakers import build_unique_speakers, speaker_key


# ---------------------------------------------------------------------------
# Hashability contract
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("voice_profile_dir,speaker_wav", [
    (None, None),
    ("", ""),
    ("/vp/alice", "ref.wav"),
    ("/vp/alice", ["a.wav", "b.wav"]),
    ("/vp/alice", ("a.wav", "b.wav")),
    (Path("/vp/alice"), "ref.wav"),
    (Path("/vp/alice"), ["a.wav", "b.wav"]),
    (None, ["a.wav"]),
    (None, ""),
])
def test_speaker_key_is_hashable(voice_profile_dir, speaker_wav):
    """speaker_key must produce a hashable value for all input combinations."""
    key = speaker_key(voice_profile_dir, speaker_wav)
    d = {}
    d[key] = "value"  # raises TypeError if unhashable
    assert d[key] == "value"


# ---------------------------------------------------------------------------
# Regression: construction == lookup (the actual bug)
# ---------------------------------------------------------------------------

def test_list_speaker_wav_construction_equals_lookup():
    """
    Regression (a): list speaker_wav.

    The key from build_unique_speakers MUST equal speaker_key() computed from
    the same raw segment values — proving construction and lookup agree.

    Pre-fix: build_unique_speakers used tuple(sw) but the lookup used raw sw
    (a list), raising TypeError: unhashable type: 'list'.
    """
    raw_sw = ["sample1.wav", "sample2.wav"]
    raw_vpdir = "/voice/profiles/alice"

    segment = {"voice_profile_dir": raw_vpdir, "speaker_wav": raw_sw, "text": "Hello"}
    unique = build_unique_speakers([segment], default_voice_profile_dir="/default")

    # The ONE key that build_unique_speakers stored
    (constructed_key,) = unique.keys()

    # The key a lookup site would compute from the raw segment values
    lookup_key = speaker_key(
        segment.get("voice_profile_dir") or "/default",
        segment.get("speaker_wav"),
    )

    assert constructed_key == lookup_key, (
        "Construction and lookup keys diverge for list speaker_wav — "
        "the latent cache miss bug is present"
    )


def test_path_voice_profile_dir_construction_equals_lookup():
    """
    Regression (b): Path voice_profile_dir with string lookup.

    The old lookup used (vpdir or "", sw or "") where vpdir was a Path object;
    str("...") != Path("..."), so the cache was silently missed.
    """
    raw_sw = "ref.wav"
    raw_vpdir = Path("/voice/profiles/bob")

    segment = {"voice_profile_dir": raw_vpdir, "speaker_wav": raw_sw, "text": "Hi"}
    unique = build_unique_speakers([segment], default_voice_profile_dir=Path("/default"))

    (constructed_key,) = unique.keys()

    lookup_key = speaker_key(
        segment.get("voice_profile_dir") or Path("/default"),
        segment.get("speaker_wav"),
    )

    assert constructed_key == lookup_key, (
        "Construction and lookup keys diverge for Path voice_profile_dir — "
        "the silent cache-miss bug is present"
    )


# ---------------------------------------------------------------------------
# Internal shape checks
# ---------------------------------------------------------------------------

def test_speaker_key_list_normalized_to_tuple():
    """List speaker_wav is stored as a tuple in the key."""
    key = speaker_key("/vp/x", ["a.wav", "b.wav"])
    _, sw_part = key
    assert isinstance(sw_part, tuple)
    assert sw_part == ("a.wav", "b.wav")


def test_speaker_key_path_vpdir_normalized_to_str():
    """Path voice_profile_dir is stored as a str in the key."""
    key = speaker_key(Path("/vp/x"), "ref.wav")
    vp_part, _ = key
    assert isinstance(vp_part, str)
    assert vp_part == "/vp/x"


def test_speaker_key_none_inputs_produce_empty_strings():
    key = speaker_key(None, None)
    assert key == ("", "")


def test_speaker_key_empty_string_inputs():
    key = speaker_key("", "")
    assert key == ("", "")

"""
Tests for serve_speakers.build_unique_speakers.

R1 revert-check: the test_list_speaker_wav_is_hashable test must FAIL when the
old inline key form `(vpdir or "", sw)` is used with a list sw value, producing
TypeError: unhashable type: 'list'.  See test_old_key_form_raises_for_list for
that explicit regression guard.
"""
from plugins.tts_xtts.plugin.core.serve_speakers import build_unique_speakers


# ---------------------------------------------------------------------------
# Primary behaviour tests
# ---------------------------------------------------------------------------

def test_list_speaker_wav_is_hashable():
    """Multi-reference speaker_wav (a list) must not raise TypeError."""
    script = [
        {"voice_profile_dir": "/vp/alice", "speaker_wav": ["a.wav", "b.wav"], "text": "Hello"},
    ]
    result = build_unique_speakers(script, default_voice_profile_dir="/default")
    assert len(result) == 1
    # Key must be hashable (dict construction would have failed if not)
    (key,) = result.keys()
    assert isinstance(key, tuple)
    # Stored value preserves the original list
    stored_sw, stored_vpdir = result[key]
    assert stored_sw == ["a.wav", "b.wav"]
    assert stored_vpdir == "/vp/alice"


def test_string_speaker_wav_dedupes():
    """Two identical string-wav segments collapse to one key."""
    script = [
        {"voice_profile_dir": "/vp/bob", "speaker_wav": "ref.wav", "text": "Line 1"},
        {"voice_profile_dir": "/vp/bob", "speaker_wav": "ref.wav", "text": "Line 2"},
    ]
    result = build_unique_speakers(script, default_voice_profile_dir="/default")
    assert len(result) == 1
    (key,) = result.keys()
    stored_sw, stored_vpdir = result[key]
    assert stored_sw == "ref.wav"
    assert stored_vpdir == "/vp/bob"


def test_different_wavs_produce_different_keys():
    """Two different speaker_wavs must produce two distinct keys."""
    script = [
        {"voice_profile_dir": "/vp/carol", "speaker_wav": "x.wav", "text": "A"},
        {"voice_profile_dir": "/vp/carol", "speaker_wav": "y.wav", "text": "B"},
    ]
    result = build_unique_speakers(script, default_voice_profile_dir="/default")
    assert len(result) == 2


def test_missing_speaker_wav_falls_back_to_empty_string_key():
    """Segment with no speaker_wav uses '' as the key component, None as stored value."""
    script = [{"text": "No wav here"}]
    result = build_unique_speakers(script, default_voice_profile_dir="/vp/default")
    assert len(result) == 1
    (key,) = result.keys()
    vp_key, sw_key = key
    assert sw_key == ""
    stored_sw, stored_vpdir = result[key]
    assert stored_sw is None
    assert stored_vpdir == "/vp/default"


def test_default_voice_profile_dir_used_when_segment_has_none():
    """Segment without voice_profile_dir inherits default_voice_profile_dir."""
    script = [{"speaker_wav": "s.wav"}]
    result = build_unique_speakers(script, default_voice_profile_dir="/fallback/dir")
    (key,) = result.keys()
    _, stored_vpdir = result[key]
    assert stored_vpdir == "/fallback/dir"


def test_mixed_list_and_string_wavs():
    """Mix of list and string wavs in the same script all resolve without error."""
    script = [
        {"voice_profile_dir": "/vp/a", "speaker_wav": ["r1.wav", "r2.wav"], "text": "Multi"},
        {"voice_profile_dir": "/vp/b", "speaker_wav": "single.wav", "text": "Single"},
        {"voice_profile_dir": "/vp/a", "speaker_wav": ["r1.wav", "r2.wav"], "text": "Dup"},
    ]
    result = build_unique_speakers(script, default_voice_profile_dir="/default")
    # /vp/a list appears twice → deduped; /vp/b string once → one more
    assert len(result) == 2

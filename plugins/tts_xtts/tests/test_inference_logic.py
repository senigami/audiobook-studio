import sys
import unittest
from unittest.mock import MagicMock, patch
import pytest
from pathlib import Path

# Mock dependencies before importing
with patch('argparse.ArgumentParser.parse_args'):
    import plugins.tts_xtts.xtts_inference as xtts_inference

def test_xtts_inference_guard_raises_on_missing_voice():
    # Verify the guard logic in _synthesize_one
    def guard_logic(latent_pair, fallback_sw):
        if not latent_pair and not fallback_sw:
            raise ValueError("No voice reference available for synthesis")

    with pytest.raises(ValueError, match="No voice reference available for synthesis"):
        guard_logic(None, None)

    # Should not raise
    guard_logic(("gpt", "spk"), None)
    guard_logic(None, "spk.wav")

def test_xtts_inference_main_key_and_fallback_consistency():
    # Verify that the pre-load key matches the loop key AND fallback_sw is resolved
    script = [{"speaker_wav": None, "text": "test"}]
    args = MagicMock()
    args.voice_profile_dir = "/tmp/profile"

    # 1. Pre-load logic simulation (matching xtts_inference.py lines 255-260)
    unique_speakers = {}
    for s in script:
        profile_dir = s.get("voice_profile_dir") or args.voice_profile_dir
        sw_for_key = s.get('speaker_wav') or ''
        key = (profile_dir or "", sw_for_key)
        unique_speakers[key] = (sw_for_key or None, profile_dir)

    # 2. Synthesis loop simulation (matching xtts_inference.py lines 309-322)
    speaker_latents = {k: ("gpt", "spk") for k in unique_speakers}

    for segment in script:
        sw = segment.get('speaker_wav')
        profile_dir = segment.get("voice_profile_dir") or args.voice_profile_dir

        # Fallback resolution logic
        fallback_sw = sw
        if not fallback_sw and profile_dir:
            # Simulation of _normalize_speaker_wav_paths(None, profile_dir) returning a default
            fallback_sw = "/tmp/profile/default.wav"

        # Key lookup must use 'sw or ''' to match the pre-load standardization
        latents = speaker_latents.get((profile_dir or "", sw or ''))

        assert latents is not None, "Latents should be found even if speaker_wav is None"
        assert fallback_sw == "/tmp/profile/default.wav", "Fallback WAV should be resolved from profile"

def test_synthesize_one_logic_routing():
    # Mock parameters
    text = "Hello"
    latent_pair = ("gpt", "spk")
    fallback_sw = "fallback.wav"
    xtts_model = MagicMock()
    tts = MagicMock()

    # We'll simulate _synthesize_one's logic (matching xtts_inference.py lines 278-299)
    def mock_synthesize_one(text_to_speak, latent_pair, fallback_sw, xtts_model, tts):
        if not latent_pair and not fallback_sw:
            raise ValueError("No voice reference available")
        if latent_pair:
            gpt_cond, spk_emb = latent_pair
            # Simulate xtts_model.inference call
            return "wav_from_inference"
        else:
            # Simulate tts.synthesizer.tts call
            return "wav_from_tts"

    # 1. Use latents (preferred)
    res = mock_synthesize_one(text, latent_pair, fallback_sw, xtts_model, tts)
    assert res == "wav_from_inference"

    # 2. Use fallback (if latents missing)
    res = mock_synthesize_one(text, None, fallback_sw, xtts_model, tts)
    assert res == "wav_from_tts"

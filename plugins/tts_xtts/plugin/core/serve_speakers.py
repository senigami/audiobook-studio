"""
Torch-free helper for building the unique-speaker map used in _run_serve_job.

Kept separate so that main-venv pytest can import and test this logic without
pulling in torch/TTS (which live only in ~/xtts-env).
"""


def build_unique_speakers(script, default_voice_profile_dir):
    """Map each segment's (voice_profile_dir, speaker_wav) to its (speaker_wav, voice_profile_dir),
    deduped. Key is hashable even when speaker_wav is a list of reference samples; the stored
    speaker_wav value keeps its original type (list preserved for multi-reference synthesis)."""
    unique = {}
    for s in script:
        vpdir = s.get("voice_profile_dir") or default_voice_profile_dir
        sw = s.get("speaker_wav") or ""
        sw_key = tuple(sw) if isinstance(sw, list) else sw
        vp_key = str(vpdir) if vpdir else ""
        unique[(vp_key, sw_key)] = (sw or None, vpdir)
    return unique

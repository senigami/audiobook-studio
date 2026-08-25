from unittest.mock import MagicMock, patch

import pytest

# `_run_synthesis_loop` imports torch at call time, so these tests need the XTTS
# environment (~/xtts-env). CI installs only root requirements.txt, which excludes
# torch by design, so skip rather than fail there.
pytest.importorskip("torch", reason="torch is not installed (lives in the separate ~/xtts-env)")

# Mock dependencies before importing
with patch('argparse.ArgumentParser.parse_args'):
    import tts_engines.tts_xtts.plugin.core.xtts_inference as xtts_inference

from tts_engines.tts_xtts.plugin.core.serve_speakers import speaker_key


def _make_tts_mock(sentences):
    """A minimal `tts` stand-in with just enough surface for `_run_synthesis_loop`
    to split `text` into sentences and (if used) call `synthesizer.tts` for the
    fallback (no-latents) synthesis path."""
    tts = MagicMock()
    tts.synthesizer.split_into_sentences.return_value = sentences
    return tts


def _run_loop(*, script, tts, xtts_model, speaker_latents, out_path):
    return xtts_inference._run_synthesis_loop(
        script,
        tts,
        xtts_model,
        device="cpu",
        language="en",
        speed=1.0,
        temperature=0.7,
        repetition_penalty=1.0,
        task_id=None,
        out_path=str(out_path),
        speaker_latents=speaker_latents,
        emit_line=lambda line: None,
        default_voice_profile_dir=None,
        voice_reference_error_detail=False,
    )


def test_synthesis_loop_raises_when_no_latents_and_no_speaker_wav(tmp_path):
    """Real guard in `_synthesize_one`: with neither precomputed latents nor a
    fallback speaker_wav, synthesis must refuse rather than call into the model."""
    script = [{"id": "seg-1", "text": "Hello world.", "speaker_wav": None}]
    tts = _make_tts_mock(["Hello world."])
    xtts_model = MagicMock()

    with pytest.raises(ValueError, match="No voice reference available"):
        _run_loop(
            script=script,
            tts=tts,
            xtts_model=xtts_model,
            speaker_latents={},
            out_path=tmp_path / "out.wav",
        )

    xtts_model.inference.assert_not_called()
    tts.synthesizer.tts.assert_not_called()


def test_synthesis_loop_prefers_precomputed_latents_over_fallback(tmp_path):
    """When `speaker_latents` already has an entry for the segment's
    (voice_profile_dir, speaker_wav) key, `_synthesize_one` must call
    `xtts_model.inference` with those latents rather than the raw-wav fallback path."""
    script = [{"id": "seg-1", "text": "Hello world.", "speaker_wav": None}]
    tts = _make_tts_mock(["Hello world."])
    xtts_model = MagicMock()
    xtts_model.inference.return_value = {"wav": [0.0] * 100}

    key = speaker_key(None, None)
    _run_loop(
        script=script,
        tts=tts,
        xtts_model=xtts_model,
        speaker_latents={key: ("gpt_cond", "spk_emb")},
        out_path=tmp_path / "out.wav",
    )

    xtts_model.inference.assert_called_once()
    call_kwargs = xtts_model.inference.call_args.kwargs
    assert call_kwargs["gpt_cond_latent"] == "gpt_cond"
    assert call_kwargs["speaker_embedding"] == "spk_emb"
    tts.synthesizer.tts.assert_not_called()


def test_synthesis_loop_falls_back_to_speaker_wav_when_no_latents(tmp_path):
    """Without a precomputed-latents entry, `_synthesize_one` must fall back to
    `tts.synthesizer.tts` using the segment's own speaker_wav."""
    script = [{"id": "seg-1", "text": "Hello world.", "speaker_wav": "ref.wav"}]
    tts = _make_tts_mock(["Hello world."])
    tts.synthesizer.tts.return_value = [0.0] * 100
    xtts_model = MagicMock()

    _run_loop(
        script=script,
        tts=tts,
        xtts_model=xtts_model,
        speaker_latents={},
        out_path=tmp_path / "out.wav",
    )

    tts.synthesizer.tts.assert_called_once()
    call_kwargs = tts.synthesizer.tts.call_args.kwargs
    assert call_kwargs["speaker_wav"] == "ref.wav"
    xtts_model.inference.assert_not_called()


def test_xtts_stderr_status_lines_flush_in_order(capsys):
    from tts_engines.tts_xtts.plugin.core.xtts_inference import _emit_stderr_line

    _emit_stderr_line("Loading XTTS model...", flush=True)
    _emit_stderr_line("[START_SYNTHESIS] job-1", flush=True)

    captured = capsys.readouterr()
    assert captured.err.splitlines() == [
        "Loading XTTS model...",
        "[START_SYNTHESIS] job-1",
    ]

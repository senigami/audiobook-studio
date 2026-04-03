import importlib.util
import wave

import pytest

if importlib.util.find_spec("torch") is None:
    pytest.skip("torch is not installed", allow_module_level=True)

import torch  # noqa: E402

from app.xtts_inference import _load_wav_tensor  # noqa: E402


def test_load_wav_tensor_reads_and_resamples_mono_wav(tmp_path):
    wav_path = tmp_path / "ref.wav"
    samples = torch.tensor([0.0, 0.5, -0.5, 0.25], dtype=torch.float32)
    pcm16 = (samples * 32767.0).to(torch.int16).numpy()

    with wave.open(str(wav_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(8000)
        wav_file.writeframes(pcm16.tobytes())

    loaded = _load_wav_tensor(str(wav_path), 16000)

    assert loaded.dim() == 2
    assert loaded.shape[0] == 1
    assert loaded.shape[1] == 8
    assert float(loaded.abs().max()) <= 1.0

import subprocess
import sys
from pathlib import Path
import pytest

def test_voxtral_cli_help():
    """Verify the CLI can be invoked and shows help."""
    plugin_dir = Path(__file__).parents[1]
    cli_path = plugin_dir / "cli.py"

    # Run with --help
    result = subprocess.run(
        [sys.executable, str(cli_path), "--help"],
        capture_output=True,
        text=True
    )

    assert result.returncode == 0
    assert "Voxtral" in result.stdout
    assert "--text" in result.stdout
    assert "--out" in result.stdout

@pytest.mark.skip(reason="Requires MISTRAL_API_KEY and network")
def test_voxtral_cli_generate(tmp_path):
    """Smoke test for actual generation (requires API key)."""
    plugin_dir = Path(__file__).parents[1]
    cli_path = plugin_dir / "cli.py"
    out_wav = tmp_path / "test.wav"

    result = subprocess.run(
        [
            sys.executable, str(cli_path),
            "--text", "Hello standalone",
            "--out", str(out_wav),
            "--voice-id", "mistral-tts-latest"
        ],
        capture_output=True,
        text=True
    )

    assert result.returncode == 0
    assert out_wav.exists()

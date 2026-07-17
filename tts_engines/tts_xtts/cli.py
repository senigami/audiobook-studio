import argparse
import sys
from pathlib import Path

# Add the plugin directory to sys.path to allow relative imports in core
sys.path.insert(0, str(Path(__file__).parent))

from plugin.core.implementation import xtts_generate

def main():
    parser = argparse.ArgumentParser(description="XTTS Standalone CLI")
    parser.add_argument("--text", required=True, help="Text to synthesize")
    parser.add_argument("--out", required=True, help="Output WAV file path")
    parser.add_argument("--speaker-wav", help="Path to reference speaker WAV file(s), comma-separated")
    parser.add_argument("--voice-dir", help="Path to voice profile directory containing latent.pth")
    parser.add_argument("--speed", type=float, default=1.0, help="Synthesis speed")
    parser.add_argument("--raw", action="store_true", help="Disable text sanitization")

    args = parser.parse_args()

    out_path = Path(args.out)
    voice_dir = Path(args.voice_dir) if args.voice_dir else None

    print(f"Synthesizing: {args.text[:50]}...")

    try:
        rc = xtts_generate(
            text=args.text,
            out_wav=out_path,
            safe_mode=not args.raw,
            on_output=lambda m: sys.stdout.write(m),
            cancel_check=lambda: False,
            speaker_wav=args.speaker_wav,
            speed=args.speed,
            voice_profile_dir=voice_dir
        )

        if rc == 0:
            print(f"\nSuccess: Audio saved to {args.out}")
            sys.exit(0)
        else:
            print("\nSynthesis failed.")
            sys.exit(1)

    except Exception as e:
        print(f"\nUnexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

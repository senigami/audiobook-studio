import argparse
import sys
import os
from pathlib import Path

# Add the plugin directory to sys.path to allow relative imports in core
# This supports running as `python cli.py` inside the standalone repo 
# or `python plugins/tts_voxtral/cli.py` in the monorepo.
sys.path.insert(0, str(Path(__file__).parent))

from plugin.core.implementation import voxtral_generate, VoxtralError

def main():
    parser = argparse.ArgumentParser(description="Voxtral (Mistral AI) Standalone CLI")
    parser.add_argument("--text", required=True, help="Text to synthesize")
    parser.add_argument("--out", required=True, help="Output WAV file path")
    parser.add_argument("--voice-id", help="Mistral voice_id to use")
    parser.add_argument("--ref-audio", help="Path to reference audio file (if no voice-id)")
    parser.add_argument("--model", help="Mistral model name")
    parser.add_argument("--api-key", help="Mistral API Key (or set MISTRAL_API_KEY env var)")

    args = parser.parse_args()

    if args.api_key:
        os.environ["MISTRAL_API_KEY"] = args.api_key

    out_path = Path(args.out)
    ref_path = Path(args.ref_audio) if args.ref_audio else None

    print(f"Synthesizing: {args.text[:50]}...")

    try:
        # Resolve reference audio if provided
        voice_profile_dir = ref_path.parent if ref_path else None
        reference_sample = ref_path.name if ref_path else None

        rc = voxtral_generate(
            text=args.text,
            out_wav=out_path,
            voice_id=args.voice_id,
            model=args.model,
            reference_sample=reference_sample,
            voice_profile_dir=voice_profile_dir,
            on_output=lambda m: sys.stdout.write(m)
        )

        if rc == 0:
            print(f"\nSuccess: Audio saved to {args.out}")
            sys.exit(0)
        else:
            print("\nSynthesis failed.")
            sys.exit(1)

    except VoxtralError as e:
        print(f"\nError: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

import os
import sys

# Silence environment noise before heavy imports
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["COQUI_TOS_AGREED"] = "1"

import torch
import torchaudio
import argparse
import warnings
import json
import hashlib
from pathlib import Path

from app.engines import migrate_speaker_latent_to_profile

# Suppress common XTTS/Torch warnings that clutter logs
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

def main():
    parser = argparse.ArgumentParser(description="XTTS Streaming Inference Script")
    parser.add_argument("--text", help="Text to synthesize (ignored if --script_json is provided)")
    parser.add_argument("--speaker_wav", help="Path to reference speaker wav(s). (ignored if --script_json is provided)")
    parser.add_argument("--language", default="en", help="Language code")
    parser.add_argument("--out_path", required=True, help="Output wav path")
    parser.add_argument("--repetition_penalty", type=float, default=2.0, help="Repetition penalty")
    parser.add_argument("--temperature", type=float, default=0.75, help="Temperature")
    parser.add_argument("--speed", type=float, default=1.0, help="Speaking speed (1.0 = normal)")
    parser.add_argument("--script_json", help="Path to a JSON file containing segments: list of {'text', 'speaker_wav'}")
    parser.add_argument("--voice_profile_dir", help="Optional voice profile directory for portable latent caching")

    args = parser.parse_args()

    # Silence durations (in samples at 24kHz)
    SAMPLE_RATE = 24000
    SENTENCE_PAUSE_MS = 180   # pause between sentences
    PARAGRAPH_PAUSE_MS = 650  # pause at segment boundaries (paragraph breath)
    PAUSE_CHAR = ";"           # semicolons become silence pauses (stripped before XTTS)
    PAUSE_CHAR_MS = 400        # duration of a semicolon pause

    script = []
    if args.script_json:
        if not os.path.exists(args.script_json):
            print(f"[error] Script JSON not found: {args.script_json}", file=sys.stderr)
            sys.exit(1)
        with open(args.script_json, 'r') as f:
            script = json.load(f)
    else:
        if not args.text or not args.speaker_wav:
            print("[error] Either --text and --speaker_wav OR --script_json MUST be provided.", file=sys.stderr)
            sys.exit(1)
        # Legacy mode: split by \n to preserve paragraph padding logic
        chunks = [p.strip() for p in args.text.split('\n') if p.strip()]
        for c in chunks:
            script.append({"text": c, "speaker_wav": args.speaker_wav})

    voice_dir = os.path.expanduser("~/.cache/audiobook-studio/voices")
    os.makedirs(voice_dir, exist_ok=True)

    def _profile_fingerprint(voice_profile_dir: str) -> str:
        profile_path = Path(voice_profile_dir)
        if not profile_path.exists():
            return ""

        h = hashlib.sha256()
        wavs = sorted(
            p for p in profile_path.glob("*.wav")
            if p.name != "latent.pth"
        )
        for wav in wavs:
            h.update(wav.name.encode("utf-8"))
            h.update(b"\0")
            try:
                h.update(wav.read_bytes())
            except Exception:
                continue
            h.update(b"\0")
        return h.hexdigest()

    def get_latents(speaker_wav_paths, device, tts_model, voice_profile_dir=None):
        if isinstance(speaker_wav_paths, list):
            combined_paths = "|".join(sorted([os.path.abspath(p) for p in speaker_wav_paths]))
            wav_input = speaker_wav_paths
        elif "," in speaker_wav_paths:
            wavs = [s.strip() for s in speaker_wav_paths.split(",") if s.strip()]
            combined_paths = "|".join(sorted([os.path.abspath(p) for p in wavs]))
            wav_input = wavs
        else:
            combined_paths = os.path.abspath(speaker_wav_paths)
            wav_input = speaker_wav_paths

        speaker_id = hashlib.md5(combined_paths.encode()).hexdigest()
        migrated = False
        if voice_profile_dir:
            latent_file = os.path.join(voice_profile_dir, "latent.pth")
            current_fingerprint = _profile_fingerprint(voice_profile_dir)
            if not os.path.exists(latent_file):
                migrated = migrate_speaker_latent_to_profile(speaker_wav_paths, Path(voice_profile_dir)) is not None
        else:
            latent_file = os.path.join(voice_dir, f"{speaker_id}.pth")
            current_fingerprint = None

        if os.path.exists(latent_file):
            try:
                latents = torch.load(latent_file, map_location=device, weights_only=False)
                if migrated and current_fingerprint and latents.get("profile_fingerprint") != current_fingerprint:
                    latents["profile_fingerprint"] = current_fingerprint
                    torch.save(latents, latent_file)
                if not current_fingerprint or latents.get("profile_fingerprint") == current_fingerprint:
                    print(f"Loading cached latents for {speaker_id}...", file=sys.stderr)
                    return latents["gpt_cond_latent"], latents["speaker_embedding"]
                print(f"Profile fingerprint changed for {speaker_id}; rebuilding latents...", file=sys.stderr)
            except Exception as e:
                print(f"Warning: Failed to load cached latents for {speaker_id}: {e}", file=sys.stderr)

        print(f"Computing latents for {speaker_id}...", file=sys.stderr)
        gpt_cond_latent, speaker_embedding = tts_model.get_conditioning_latents(audio_path=wav_input)
        save_payload = {
            "gpt_cond_latent": gpt_cond_latent,
            "speaker_embedding": speaker_embedding
        }
        if current_fingerprint:
            save_payload["profile_fingerprint"] = current_fingerprint
        torch.save(save_payload, latent_file)
        return gpt_cond_latent, speaker_embedding

    # Load model (quietly)
    print("Loading XTTS model...", file=sys.stderr)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    original_stderr = sys.stderr
    try:
        from TTS.api import TTS
        tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=True).to(device)
        xtts_model = tts.synthesizer.tts_model
    finally:
        sys.stderr = original_stderr

    # Pre-load all unique latents
    unique_speakers = {}
    for s in script:
        profile_dir = s.get("voice_profile_dir") or args.voice_profile_dir
        key = (profile_dir or "", s['speaker_wav'])
        unique_speakers[key] = (s['speaker_wav'], profile_dir)

    speaker_latents = {}
    for key, (sw, profile_dir) in unique_speakers.items():
        try:
            speaker_latents[key] = get_latents(sw, device, xtts_model, voice_profile_dir=profile_dir)
        except Exception as e:
            print(f"Warning: Failed to compute latents for {sw}: {e}", file=sys.stderr)
            speaker_latents[key] = None

    print(f"Synthesizing {len(script)} segments to {args.out_path}...", file=sys.stderr)
    print("[START_SYNTHESIS]", file=sys.stderr, flush=True)

    try:
        from tqdm import tqdm
        all_wav_chunks = []
        pause_indices = set()  # indices that are already silence tensors from <PAUSE> markers

        def _synthesize_one(text_to_speak, latent_pair, fallback_sw):
            """Synthesize a single text string, returning the raw wav numpy array."""
            if latent_pair:
                gpt_cond, spk_emb = latent_pair
                out_dict = xtts_model.inference(
                    text=text_to_speak,
                    language=args.language,
                    gpt_cond_latent=gpt_cond,
                    speaker_embedding=spk_emb,
                    temperature=args.temperature,
                    speed=args.speed,
                    repetition_penalty=args.repetition_penalty
                )
                return out_dict['wav']
            else:
                return tts.synthesizer.tts(
                    text=text_to_speak,
                    speaker_wav=fallback_sw,
                    language_name=args.language,
                    speed=args.speed,
                    repetition_penalty=args.repetition_penalty,
                    temperature=args.temperature
                )

        with tqdm(total=len(script), unit="seg", desc="Synthesizing", file=sys.stderr) as pbar:
            for i, segment in enumerate(script):
                if 'id' in segment:
                    print(f"[START_SEGMENT] {segment['id']}", file=sys.stderr, flush=True)
                elif 'save_path' in segment:
                    print(f"[START_SEGMENT] {segment['save_path']}", file=sys.stderr, flush=True)

                text = segment['text']
                sw = segment['speaker_wav']
                profile_dir = segment.get("voice_profile_dir") or args.voice_profile_dir
                latents = speaker_latents.get((profile_dir or "", sw))

                # Pre-calculate total sentences for progress reporting
                total_sentences = 0
                paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
                all_sentences = []
                for p_idx, paragraph in enumerate(paragraphs):
                    if hasattr(tts, 'synthesizer') and hasattr(tts.synthesizer, 'split_into_sentences'):
                        sentences = tts.synthesizer.split_into_sentences(paragraph)
                    elif hasattr(tts, 'tts_tokenizer'):
                        sentences = tts.tts_tokenizer.split_sentences(paragraph)
                    else:
                        sentences = [paragraph]
                    # Filter empty/noise sentences immediately
                    sentences = [s for s in sentences if s and s.strip() and any(c.isalnum() for c in s)]
                    all_sentences.append(sentences)
                    total_sentences += len(sentences)

                segment_wav_chunks = []
                sentences_done = 0

                for p_idx, sentences in enumerate(all_sentences):
                    for s_idx, sentence in enumerate(sentences):
                        # Handle semicolons: split around them, synthesize each part,
                        # and insert a silence tensor where each semicolon was.
                        if PAUSE_CHAR in sentence:
                            sub_parts = [p.strip() for p in sentence.split(PAUSE_CHAR) if p.strip()]

                            def is_safe(t):
                                words = [w for w in t.split() if any(c.isalnum() for c in w)]
                                return len(words) >= 3

                            # Only perform a manual split-pause if every resulting segment is safe (>= 3 words).
                            # This prevents XTTS from hallucinating on tiny fragments like "Effie."
                            if all(is_safe(p) for p in sub_parts):
                                for sp_idx, sub_part in enumerate(sub_parts):
                                    sub_text = sub_part.strip()
                                    if sub_text and any(c.isalnum() for c in sub_text):
                                        wav_chunk = _synthesize_one(sub_text, latents, sw)
                                        chunk_tensor = torch.FloatTensor(wav_chunk)
                                        all_wav_chunks.append(chunk_tensor)
                                        segment_wav_chunks.append(chunk_tensor)
                                    if sp_idx < len(sub_parts) - 1:
                                        pause_samples = int(SAMPLE_RATE * PAUSE_CHAR_MS / 1000)
                                        silence = torch.zeros(pause_samples)
                                        all_wav_chunks.append(silence)
                                        segment_wav_chunks.append(silence)
                                        pause_indices.add(len(all_wav_chunks) - 1)
                            else:
                                # Combined chunk is safer for the model
                                wav_chunk = _synthesize_one(sentence, latents, sw)
                                chunk_tensor = torch.FloatTensor(wav_chunk)
                                all_wav_chunks.append(chunk_tensor)
                                segment_wav_chunks.append(chunk_tensor)
                        else:
                            wav_chunk = _synthesize_one(sentence, latents, sw)
                            chunk_tensor = torch.FloatTensor(wav_chunk)
                            all_wav_chunks.append(chunk_tensor)
                            segment_wav_chunks.append(chunk_tensor)

                        sentences_done += 1
                        if total_sentences > 0:
                            perc = int((sentences_done / total_sentences) * 100)
                            print(f"[PROGRESS] {perc}%", file=sys.stderr, flush=True)

                        # Add sentence or paragraph pause

                        # Add sentence or paragraph pause
                        is_last_sentence = (s_idx == len(sentences) - 1)
                        is_last_paragraph = (p_idx == len(paragraphs) - 1)

                        pause_ms = 0
                        if not (is_last_sentence and is_last_paragraph):
                            pause_ms = PARAGRAPH_PAUSE_MS if is_last_sentence else SENTENCE_PAUSE_MS
                        elif i < len(script) - 1:
                            # End of a script entry (except the very last one)
                            pause_ms = PARAGRAPH_PAUSE_MS

                        if pause_ms > 0:
                            pause_samples = int(SAMPLE_RATE * pause_ms / 1000)
                            silence = torch.zeros(pause_samples)
                            all_wav_chunks.append(silence)
                            segment_wav_chunks.append(silence)
                            pause_indices.add(len(all_wav_chunks) - 1)

                # Save this segment individually if requested (for Performance tab playback)
                if 'save_path' in segment and segment_wav_chunks:
                    seg_wav = torch.cat(segment_wav_chunks, dim=0)
                    torchaudio.save(segment['save_path'], seg_wav.unsqueeze(0), SAMPLE_RATE)
                    # Signal to parent process that this segment's audio is ready
                    print(f"[SEGMENT_SAVED] {segment['save_path']}", file=sys.stderr)

                pbar.update(1)

        if all_wav_chunks:
            final_wav = torch.cat(all_wav_chunks, dim=0)
            torchaudio.save(args.out_path, final_wav.unsqueeze(0), SAMPLE_RATE)
            print(f"Successfully synthesized {len(all_wav_chunks)} audio chunks.", file=sys.stderr)

    except Exception as e:
        print(f"\n[CRITICAL ERROR] XTTS failed: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

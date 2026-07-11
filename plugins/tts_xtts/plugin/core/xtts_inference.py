import os
import sys
import wave
from pathlib import Path

# Silence environment noise before heavy imports
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["COQUI_TOS_AGREED"] = "1"

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import argparse  # noqa: E402
import warnings  # noqa: E402
import json  # noqa: E402
import hashlib  # noqa: E402
from core.serve_speakers import build_unique_speakers, speaker_key  # noqa: E402

# Suppress common XTTS/Torch warnings that clutter logs
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)


def _get_torch_modules():
    import torch
    import torch.nn.functional as F

    return torch, F


def _save_wav(path: str, waveform, sample_rate: int) -> None:
    torch, _ = _get_torch_modules()
    wav = waveform.detach().cpu()
    if wav.dim() == 2:
        wav = wav.squeeze(0)
    wav = torch.clamp(wav, -1.0, 1.0)
    pcm16 = (wav * 32767.0).to(torch.int16).numpy()

    with wave.open(path, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16.tobytes())


def _load_wav_tensor(path: str, sample_rate: int):
    torch, F = _get_torch_modules()
    with wave.open(path, "rb") as wav_file:
        if wav_file.getcomptype() != "NONE":
            raise ValueError(f"Unsupported compressed WAV format: {path}")

        channels = wav_file.getnchannels()
        sampwidth = wav_file.getsampwidth()
        source_rate = wav_file.getframerate()
        frame_count = wav_file.getnframes()
        raw = wav_file.readframes(frame_count)

    if sampwidth == 1:
        audio = torch.tensor(list(raw), dtype=torch.float32)
        audio = (audio - 128.0) / 128.0
    elif sampwidth == 2:
        audio = torch.frombuffer(bytearray(raw), dtype=torch.int16).to(torch.float32) / 32768.0
    elif sampwidth == 3:
        triplets = torch.tensor(list(raw), dtype=torch.int32).view(-1, 3)
        audio = triplets[:, 0] | (triplets[:, 1] << 8) | (triplets[:, 2] << 16)
        audio = torch.where(audio >= 0x800000, audio - 0x1000000, audio).to(torch.float32) / 8388608.0
    elif sampwidth == 4:
        audio = torch.frombuffer(bytearray(raw), dtype=torch.int32).to(torch.float32) / 2147483648.0
    else:
        raise ValueError(f"Unsupported WAV sample width ({sampwidth} bytes): {path}")

    if channels > 1:
        audio = audio.view(-1, channels).transpose(0, 1).mean(dim=0)

    audio = audio.unsqueeze(0)
    if source_rate != sample_rate:
        target_frames = max(1, int(round(audio.shape[-1] * sample_rate / source_rate)))
        audio = F.interpolate(audio.unsqueeze(0), size=target_frames, mode="linear", align_corners=False).squeeze(0)

    return audio.contiguous()


def _patch_xtts_load_audio() -> None:
    try:
        import TTS.tts.models.xtts as xtts_module
    except Exception:
        return

    original_load_audio = getattr(xtts_module, "load_audio", None)
    if not callable(original_load_audio):
        return

    def _safe_load_audio(audiopath, sampling_rate):
        path = str(audiopath)
        if path.lower().endswith(".wav"):
            return _load_wav_tensor(path, sampling_rate)
        return original_load_audio(audiopath, sampling_rate)

    xtts_module.load_audio = _safe_load_audio


def _emit_stderr_line(message: str, *, flush: bool = False) -> None:
    print(message, file=sys.stderr, flush=flush)


def _normalize_speaker_wav_paths(speaker_wav_paths, voice_profile_dir=None):
    """Resolve a speaker-wav spec into (wav_input, combined_paths_key).

    Accepts a list of wav paths, a comma-joined string of paths, a single path
    string, or (if none of those) falls back to globbing `voice_profile_dir` for
    `*.wav` files. `combined_paths_key` is a stable, sorted "|"-joined string used
    as the cache key for latent lookups.

    Hoisted to module level: serve mode (`_run_serve_job`) and one-shot mode
    (`main`) previously each defined a byte-identical copy of this function.
    """
    if isinstance(speaker_wav_paths, list):
        wavs = [os.path.abspath(p) for p in speaker_wav_paths if p]
        return wavs, "|".join(sorted(wavs))

    if isinstance(speaker_wav_paths, str) and "," in speaker_wav_paths:
        wavs = [os.path.abspath(s.strip()) for s in speaker_wav_paths.split(",") if s.strip()]
        return wavs, "|".join(sorted(wavs))

    if isinstance(speaker_wav_paths, str) and speaker_wav_paths.strip():
        wav = os.path.abspath(speaker_wav_paths)
        return wav, wav

    if voice_profile_dir:
        profile_path = Path(voice_profile_dir)
        profile_wavs = sorted(
            str(p.resolve())
            for p in profile_path.glob("*.wav")
            if p.name != "latent.pth"
        )
        if profile_wavs:
            return profile_wavs, "|".join(sorted(profile_wavs))
        return None, str(profile_path.resolve())

    return None, None


def _run_synthesis_loop(
    script,
    tts,
    xtts_model,
    device,
    *,
    language,
    speed,
    temperature,
    repetition_penalty,
    task_id,
    out_path,
    speaker_latents,
    emit_line,
    default_voice_profile_dir=None,
    voice_reference_error_detail=False,
):
    """Shared per-segment synthesis loop used by both the warm-worker serve path
    (`_run_serve_job`) and the one-shot CLI path (`main`).

    Handles: sentence splitting, semicolon sub-pause splitting, sentence/paragraph
    pause insertion (SENTENCE_PAUSE_MS=180, PARAGRAPH_PAUSE_MS=650, PAUSE_CHAR_MS=400),
    per-segment marker emission ([START_SEGMENT], [PROGRESS], [SEGMENT_SAVED]),
    `_synthesize_one()` fallback between precomputed latents and a raw speaker_wav,
    per-segment WAV save, and the final concatenated WAV save.

    `device` is accepted for signature symmetry with both call sites (kept so the
    caller can pass it even though the loop body does not need it directly — all
    torch ops here run against tensors/models already bound to the right device).

    Parameters that intentionally differ between callers and are NOT unified:
      - `speaker_latents`: pre-computed per-speaker-key latents dict. The two
        callers use different cache-staleness logic to build this dict *before*
        calling this loop (serve: no invalidation, just exists-check; one-shot:
        `_profile_fingerprint()`-gated invalidation via sha256 over wav
        name+size+mtime). That is a genuine behavioral difference in cache
        correctness, not boilerplate, so it stays outside this shared loop as an
        upstream input.
      - `emit_line`: how a marker/log line is written to stderr. Serve mode always
        flushes immediately (`_emit_stderr_line(msg, flush=True)`) — required so
        the warm-worker's persistent stderr reader (commit 8b9ae90a) sees markers
        promptly; the one-shot path's original `print(..., file=sys.stderr, ...)`
        calls did NOT all pass `flush=True` explicitly (a few relied on Python's
        default buffering / at-exit flush). Each caller passes a wrapper closure
        that reproduces its own original flush behavior line-by-line; this loop
        does not decide flushing.
      - `voice_reference_error_detail`: the "no voice reference" ValueError message
        differs between the two paths (serve: short "No voice reference available";
        one-shot: longer message including the repr of the missing speaker_wav).
        Set True to get the one-shot's more detailed message.

    Returns the list of top-level wav chunk tensors that were synthesized
    (`all_wav_chunks`); already saved to `out_path` if non-empty. Raises on
    failure — translating an exception into a return code (serve, which
    continues its loop) vs. `sys.exit(1)` (one-shot) is a genuine difference in
    process-lifecycle behavior that is deliberately left to each caller, not
    unified here.
    """
    import torch as _torch  # noqa: PLC0415
    from tqdm import tqdm  # noqa: PLC0415

    # Silence durations (in samples at 24kHz) — identical constants in both paths.
    SAMPLE_RATE = 24000
    SENTENCE_PAUSE_MS = 180
    PARAGRAPH_PAUSE_MS = 650
    PAUSE_CHAR = ";"
    PAUSE_CHAR_MS = 400

    all_wav_chunks: list = []
    pause_indices: set = set()

    def _synthesize_one(text_to_speak, latent_pair, fallback_sw):
        if not latent_pair and not fallback_sw:
            if voice_reference_error_detail:
                raise ValueError(
                    f"No voice reference available for synthesis (no latents and no "
                    f"speaker_wav). sw={fallback_sw!r}"
                )
            raise ValueError("No voice reference available")
        if latent_pair:
            gpt_cond, spk_emb = latent_pair
            out_dict = xtts_model.inference(
                text=text_to_speak,
                language=language,
                gpt_cond_latent=gpt_cond,
                speaker_embedding=spk_emb,
                temperature=temperature,
                speed=speed,
                repetition_penalty=repetition_penalty,
            )
            return out_dict["wav"]
        else:
            return tts.synthesizer.tts(
                text=text_to_speak,
                speaker_wav=fallback_sw,
                language_name=language,
                speed=speed,
                repetition_penalty=repetition_penalty,
                temperature=temperature,
            )

    with tqdm(total=len(script), unit="seg", desc="Synthesizing", file=sys.stderr) as pbar:
        for i, segment in enumerate(script):
            if "id" in segment:
                emit_line(f"[START_SEGMENT] {segment['id']}")
            elif "save_path" in segment:
                emit_line(f"[START_SEGMENT] {segment['save_path']}")
            # True 0% start anchor: emit progress 0 at the real start of this
            # segment's synthesis (before the first sentence), so the segment
            # progress bar starts at 0% in sync with synthesis starting — not
            # first appearing at the first sentence's non-zero percent.
            _seg_start_progress = "[PROGRESS] 0%"
            if task_id:
                _seg_start_progress += f" {task_id}"
            emit_line(_seg_start_progress)

            text = segment.get("text", "")
            sw = segment.get("speaker_wav")
            vpdir = segment.get("voice_profile_dir") or default_voice_profile_dir

            fallback_sw = sw
            if not fallback_sw and vpdir:
                _, combined_sw = _normalize_speaker_wav_paths(None, vpdir)
                if combined_sw and "|" in combined_sw:
                    fallback_sw = combined_sw.split("|")[0]
                elif combined_sw:
                    fallback_sw = combined_sw
            # Ensure fallback_sw is a single path string (tts.synthesizer.tts expects one)
            if isinstance(fallback_sw, (list, tuple)):
                fallback_sw = fallback_sw[0] if fallback_sw else None

            latents = speaker_latents.get(speaker_key(vpdir, sw))

            paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
            all_sentences: list = []
            total_sentences = 0
            for paragraph in paragraphs:
                if hasattr(tts, "synthesizer") and hasattr(tts.synthesizer, "split_into_sentences"):
                    sentences = tts.synthesizer.split_into_sentences(paragraph)
                elif hasattr(tts, "tts_tokenizer"):
                    sentences = tts.tts_tokenizer.split_sentences(paragraph)
                else:
                    sentences = [paragraph]
                sentences = [s for s in sentences if s and s.strip() and any(c.isalnum() for c in s)]
                all_sentences.append(sentences)
                total_sentences += len(sentences)

            segment_wav_chunks: list = []
            sentences_done = 0

            for p_idx, sentences in enumerate(all_sentences):
                for s_idx, sentence in enumerate(sentences):
                    if PAUSE_CHAR in sentence:
                        sub_parts = [p.strip() for p in sentence.split(PAUSE_CHAR) if p.strip()]

                        def is_safe(t):
                            words = [w for w in t.split() if any(c.isalnum() for c in w)]
                            return len(words) >= 3

                        if all(is_safe(p) for p in sub_parts):
                            for sp_idx, sub_part in enumerate(sub_parts):
                                sub_text = sub_part.strip()
                                if sub_text and any(c.isalnum() for c in sub_text):
                                    wav_chunk = _synthesize_one(sub_text, latents, fallback_sw)
                                    chunk_tensor = _torch.FloatTensor(wav_chunk)
                                    all_wav_chunks.append(chunk_tensor)
                                    segment_wav_chunks.append(chunk_tensor)
                                if sp_idx < len(sub_parts) - 1:
                                    pause_samples = int(SAMPLE_RATE * PAUSE_CHAR_MS / 1000)
                                    silence = _torch.zeros(pause_samples)
                                    all_wav_chunks.append(silence)
                                    segment_wav_chunks.append(silence)
                                    pause_indices.add(len(all_wav_chunks) - 1)
                        else:
                            wav_chunk = _synthesize_one(sentence, latents, fallback_sw)
                            chunk_tensor = _torch.FloatTensor(wav_chunk)
                            all_wav_chunks.append(chunk_tensor)
                            segment_wav_chunks.append(chunk_tensor)
                    else:
                        wav_chunk = _synthesize_one(sentence, latents, fallback_sw)
                        chunk_tensor = _torch.FloatTensor(wav_chunk)
                        all_wav_chunks.append(chunk_tensor)
                        segment_wav_chunks.append(chunk_tensor)

                    sentences_done += 1
                    if total_sentences > 0:
                        perc = int((sentences_done / total_sentences) * 100)
                        progress_line = f"[PROGRESS] {perc}%"
                        if task_id:
                            progress_line += f" {task_id}"
                        emit_line(progress_line)

                    is_last_sentence = s_idx == len(sentences) - 1
                    is_last_paragraph = p_idx == len(paragraphs) - 1
                    pause_ms = 0
                    if not (is_last_sentence and is_last_paragraph):
                        pause_ms = PARAGRAPH_PAUSE_MS if is_last_sentence else SENTENCE_PAUSE_MS
                    elif i < len(script) - 1:
                        pause_ms = PARAGRAPH_PAUSE_MS
                    if pause_ms > 0:
                        pause_samples = int(SAMPLE_RATE * pause_ms / 1000)
                        silence = _torch.zeros(pause_samples)
                        all_wav_chunks.append(silence)
                        segment_wav_chunks.append(silence)
                        pause_indices.add(len(all_wav_chunks) - 1)

            if "save_path" in segment and segment_wav_chunks:
                seg_wav = _torch.cat(segment_wav_chunks, dim=0)
                _save_wav(segment["save_path"], seg_wav, SAMPLE_RATE)
                emit_line(f"[SEGMENT_SAVED] {segment['save_path']}")

            pbar.update(1)

    if all_wav_chunks:
        final_wav = _torch.cat(all_wav_chunks, dim=0)
        _save_wav(out_path, final_wav, SAMPLE_RATE)
        emit_line(f"Successfully synthesized {len(all_wav_chunks)} audio chunks.")

    return all_wav_chunks


def serve_loop():
    """Persistent serve mode: load model once, read line-delimited JSON jobs from stdin.

    Each job is a JSON object with the same fields as the CLI arguments::

        {
            "text": "...",          # or omit and supply "script_json" path
            "script_json": "...",   # path to a script JSON file
            "speaker_wav": "...",
            "voice_profile_dir": "...",
            "out_path": "...",
            "language": "en",
            "speed": 1.0,
            "temperature": 0.75,
            "repetition_penalty": 2.0,
            "task_id": "..."
        }

    After each job, the worker writes a JSON sentinel line to **stdout**::

        {"done": true, "rc": 0}

    Stderr carries the same markers as the one-shot mode
    (``[START_SYNTHESIS]``, ``[START_SEGMENT]``, ``[PROGRESS]``,
    ``[SEGMENT_SAVED]``).
    """
    _emit_stderr_line("XTTS serve mode: loading model...", flush=True)

    torch, _ = _get_torch_modules()
    device = "cuda" if torch.cuda.is_available() else "cpu"

    original_stderr = sys.stderr
    try:
        _patch_xtts_load_audio()
        from TTS.api import TTS  # noqa: E402, PLC0415
        tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=True).to(device)
        xtts_model = tts.synthesizer.tts_model
    finally:
        sys.stderr = original_stderr

    _emit_stderr_line("XTTS serve mode: model ready — waiting for jobs", flush=True)

    # Flush stdout so the manager knows we're up (no explicit READY line is
    # required; the manager detects readiness implicitly via the done sentinel
    # after the first job).

    import io as _io
    # Use binary stdin so we can read byte-by-byte reliably.
    stdin_bin = sys.stdin.buffer if hasattr(sys.stdin, "buffer") else sys.stdin  # type: ignore[assignment]

    def _read_job_line() -> str | None:
        """Read one newline-terminated line from binary stdin."""
        buf = b""
        while True:
            ch = stdin_bin.read(1)
            if not ch:
                return None  # EOF
            if ch == b"\n":
                return buf.decode("utf-8", errors="replace")
            buf += ch

    while True:
        raw = _read_job_line()
        if raw is None:
            _emit_stderr_line("XTTS serve mode: stdin closed — exiting", flush=True)
            break

        raw = raw.strip()
        if not raw:
            continue

        try:
            job = json.loads(raw)
        except json.JSONDecodeError as exc:
            _emit_stderr_line(f"[error] XTTS serve mode: bad job JSON: {exc}", flush=True)
            sys.stdout.write(json.dumps({"done": True, "rc": 1}) + "\n")
            sys.stdout.flush()
            continue

        rc = _run_serve_job(job, tts, xtts_model, device)
        sys.stdout.write(json.dumps({"done": True, "rc": rc}) + "\n")
        sys.stdout.flush()


def _run_serve_job(job: dict, tts, xtts_model, device) -> int:
    """Execute one synthesis job inside the serve loop.

    Emits the same stderr markers as the one-shot mode.
    Returns 0 on success, 1 on failure.
    """
    import wave as _wave

    out_path = job.get("out_path", "")
    language = job.get("language", "en")
    speed = float(job.get("speed", 1.0))
    temperature = float(job.get("temperature", 0.75))
    repetition_penalty = float(job.get("repetition_penalty", 2.0))
    task_id = job.get("task_id") or ""
    voice_profile_dir = job.get("voice_profile_dir") or None
    script_json_path = job.get("script_json") or None

    # ---- build script ------------------------------------------------
    script = []
    if script_json_path:
        try:
            with open(script_json_path) as f:
                script = json.load(f)
        except Exception as exc:
            _emit_stderr_line(f"[error] XTTS serve: cannot read script_json: {exc}", flush=True)
            return 1
    else:
        text = job.get("text") or ""
        speaker_wav = job.get("speaker_wav") or None
        if not text:
            _emit_stderr_line("[error] XTTS serve: no text and no script_json", flush=True)
            return 1
        chunks = [p.strip() for p in text.split("\n") if p.strip()]
        for c in chunks:
            script.append({"text": c, "speaker_wav": speaker_wav})

    if not out_path:
        _emit_stderr_line("[error] XTTS serve: out_path is required", flush=True)
        return 1

    # ---- latent helpers (same logic as main()) -----------------------
    torch, F = _get_torch_modules()

    voice_dir = os.path.expanduser("~/.cache/audiobook-studio/voices")
    os.makedirs(voice_dir, exist_ok=True)

    def _get_latents(speaker_wav_paths, vpdir=None):
        import hashlib as _hashlib

        # Mirror the one-shot path's .pth branch (see get_latents() ~line 569):
        # if the speaker ref is already a pre-computed latent file, load it directly
        # without attempting audio decoding (which explodes on .pth input).
        #
        # NOTE (PL-4 deliberate divergence — see _run_synthesis_loop docstring):
        # serve mode's latent cache has NO staleness/fingerprint check — once a
        # latent.pth exists it is trusted forever. One-shot mode's get_latents()
        # below gates reuse on _profile_fingerprint(). This difference predates
        # the PL-4 extraction and is NOT unified here; it governs only the
        # speaker_latents dict built before _run_synthesis_loop runs.
        if (
            isinstance(speaker_wav_paths, str)
            and speaker_wav_paths.lower().endswith(".pth")
            and os.path.exists(speaker_wav_paths)
        ):
            try:
                latents = torch.load(speaker_wav_paths, map_location=device, weights_only=False)
                return latents["gpt_cond_latent"], latents["speaker_embedding"]
            except Exception as exc:
                _emit_stderr_line(
                    f"Warning: failed to load pre-computed latents from {speaker_wav_paths}: {exc}",
                    flush=True,
                )
                raise

        wav_input, combined_paths = _normalize_speaker_wav_paths(speaker_wav_paths, vpdir)
        if wav_input is None and not vpdir:
            raise ValueError("No speaker WAVs or voice profile directory available")

        speaker_id = _hashlib.md5(combined_paths.encode()).hexdigest()
        if vpdir:
            latent_file = os.path.join(vpdir, "latent.pth")
        else:
            latent_file = os.path.join(voice_dir, f"{speaker_id}.pth")

        if os.path.exists(latent_file):
            try:
                latents = torch.load(latent_file, map_location=device, weights_only=False)
                return latents["gpt_cond_latent"], latents["speaker_embedding"]
            except Exception as exc:
                _emit_stderr_line(f"Warning: failed to load cached latents: {exc}", flush=True)

        if wav_input is None:
            raise ValueError("No speaker WAVs available to compute latents")

        gpt_cond_latent, speaker_embedding = xtts_model.get_conditioning_latents(audio_path=wav_input)
        payload = {"gpt_cond_latent": gpt_cond_latent, "speaker_embedding": speaker_embedding}
        torch.save(payload, latent_file)
        return gpt_cond_latent, speaker_embedding

    # ---- pre-load latents -------------------------------------------
    unique_speakers: dict = build_unique_speakers(script, voice_profile_dir)

    speaker_latents: dict = {}
    for key, (sw, vpdir) in unique_speakers.items():
        try:
            speaker_latents[key] = _get_latents(sw, vpdir)
        except Exception as exc:
            _emit_stderr_line(f"Warning: failed to compute latents for {sw}: {exc}", flush=True)
            speaker_latents[key] = None

    _emit_stderr_line(f"Synthesizing {len(script)} segments to {out_path}...", flush=True)
    _emit_stderr_line(f"[START_SYNTHESIS] {task_id}".strip(), flush=True)

    def _emit(line: str) -> None:
        # Serve mode always flushes immediately — required by the warm-worker's
        # persistent stderr reader (commit 8b9ae90a) to see markers promptly.
        _emit_stderr_line(line, flush=True)

    try:
        _run_synthesis_loop(
            script,
            tts,
            xtts_model,
            device,
            language=language,
            speed=speed,
            temperature=temperature,
            repetition_penalty=repetition_penalty,
            task_id=task_id,
            out_path=out_path,
            speaker_latents=speaker_latents,
            emit_line=_emit,
            default_voice_profile_dir=voice_profile_dir,
            voice_reference_error_detail=False,
        )
        return 0

    except Exception as exc:
        _emit_stderr_line(f"\n[CRITICAL ERROR] XTTS failed: {exc}", flush=True)
        import traceback  # noqa: PLC0415
        traceback.print_exc(file=sys.stderr)
        return 1


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
    parser.add_argument("--task_id", "--task-id", help="Optional task identifier for logging")

    args = parser.parse_args()

    script = []
    if args.script_json:
        if not os.path.exists(args.script_json):
            print(f"[error] Script JSON not found: {args.script_json}", file=sys.stderr)
            sys.exit(1)
        with open(args.script_json, 'r') as f:
            script = json.load(f)
    else:
        if not args.text or (not args.speaker_wav and not args.voice_profile_dir):
            print("[error] Either --text and --speaker_wav, or --text and --voice_profile_dir, OR --script_json MUST be provided.", file=sys.stderr)
            sys.exit(1)
        # Plain-text mode: split by newline to preserve paragraph padding logic.
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
            try:
                stat = wav.stat()
            except Exception:
                continue
            h.update(wav.name.encode("utf-8"))
            h.update(b"\0")
            h.update(str(stat.st_size).encode("utf-8"))
            h.update(b"\0")
            h.update(str(getattr(stat, "st_mtime_ns", int(stat.st_mtime * 1_000_000_000))).encode("utf-8"))
            h.update(b"\0")
        return h.hexdigest()

    def get_latents(speaker_wav_paths, device, tts_model, voice_profile_dir=None):
        # NOTE (PL-4 deliberate divergence — see _run_synthesis_loop docstring in
        # this module): one-shot mode gates latent-cache reuse on
        # _profile_fingerprint() (sha256 over wav name+size+mtime), rebuilding
        # when a voice profile's source wavs changed. Serve mode's _get_latents
        # (in _run_serve_job) has no such check — this difference predates the
        # PL-4 extraction and is intentionally NOT unified; it governs only the
        # speaker_latents dict built before _run_synthesis_loop runs.
        wav_input, combined_paths = _normalize_speaker_wav_paths(speaker_wav_paths, voice_profile_dir)

        if wav_input is None and not voice_profile_dir:
            raise ValueError("No speaker WAVs or voice profile directory available")

        torch, _ = _get_torch_modules()
        speaker_id = hashlib.md5(combined_paths.encode()).hexdigest()
        migrated = False
        if voice_profile_dir:
            latent_file = os.path.join(voice_profile_dir, "latent.pth")
            current_fingerprint = _profile_fingerprint(voice_profile_dir)
            if not os.path.exists(latent_file):
                pass
        else:
            latent_file = os.path.join(voice_dir, f"{speaker_id}.pth")
            current_fingerprint = None

        # Check if the input is already a pre-computed latent file
        if isinstance(wav_input, str) and wav_input.lower().endswith(".pth") and os.path.exists(wav_input):
            try:
                print(f"Loading pre-computed latents from {wav_input}...", file=sys.stderr)
                latents = torch.load(wav_input, map_location=device, weights_only=False)
                return latents["gpt_cond_latent"], latents["speaker_embedding"]
            except Exception as e:
                print(f"Warning: Failed to load pre-computed latents from {wav_input}: {e}", file=sys.stderr)

        if os.path.exists(latent_file):
            try:
                latents = torch.load(latent_file, map_location=device, weights_only=False)
                if wav_input is None:
                    print(f"Loading cached latents for {speaker_id} (no source wavs available)...", file=sys.stderr)
                    return latents["gpt_cond_latent"], latents["speaker_embedding"]
                if migrated and current_fingerprint and latents.get("profile_fingerprint") != current_fingerprint:
                    latents["profile_fingerprint"] = current_fingerprint
                    torch.save(latents, latent_file)
                if not current_fingerprint or latents.get("profile_fingerprint") == current_fingerprint:
                    print(f"Loading cached latents for {speaker_id}...", file=sys.stderr)
                    return latents["gpt_cond_latent"], latents["speaker_embedding"]
                print(f"Profile fingerprint changed for {speaker_id}; rebuilding latents...", file=sys.stderr)
            except Exception as e:
                print(f"Warning: Failed to load cached latents for {speaker_id}: {e}", file=sys.stderr)

        if wav_input is None:
            raise ValueError("No speaker WAVs available to compute latents, and no cached latent could be loaded")

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
    _emit_stderr_line("Loading XTTS model...", flush=True)
    torch, _ = _get_torch_modules()
    device = "cuda" if torch.cuda.is_available() else "cpu"

    original_stderr = sys.stderr
    try:
        _patch_xtts_load_audio()
        from TTS.api import TTS
        tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=True).to(device)
        xtts_model = tts.synthesizer.tts_model
    finally:
        sys.stderr = original_stderr

    # Pre-load all unique latents. build_unique_speakers is the same
    # torch-free helper serve mode uses (core/serve_speakers.py) — verified
    # equivalent to this function's previous inline loop (same speaker_key(),
    # same "sw or None" storage), so switching to it is not a behavior change.
    unique_speakers = build_unique_speakers(script, args.voice_profile_dir)

    speaker_latents = {}
    for key, (sw, profile_dir) in unique_speakers.items():
        try:
            speaker_latents[key] = get_latents(sw, device, xtts_model, voice_profile_dir=profile_dir)
        except Exception as e:
            print(f"Warning: Failed to compute latents for {sw}: {e}", file=sys.stderr)
            speaker_latents[key] = None

    _emit_stderr_line(f"Synthesizing {len(script)} segments to {args.out_path}...", flush=True)
    print(f"[START_SYNTHESIS] {args.task_id or ''}".strip(), file=sys.stderr, flush=True)

    def _emit(line: str) -> None:
        # Reproduces the one-shot path's original per-line flush behavior exactly:
        # [SEGMENT_SAVED] and the final "Successfully synthesized..." line were
        # bare `print(..., file=sys.stderr)` (no explicit flush=True); every other
        # marker line (START_SEGMENT, PROGRESS) was flushed immediately. Not
        # unified with serve mode's always-flush behavior — see
        # _run_synthesis_loop's docstring.
        if line.startswith("[SEGMENT_SAVED]") or line.startswith("Successfully synthesized"):
            print(line, file=sys.stderr)
        else:
            print(line, file=sys.stderr, flush=True)

    try:
        _run_synthesis_loop(
            script,
            tts,
            xtts_model,
            device,
            language=args.language,
            speed=args.speed,
            temperature=args.temperature,
            repetition_penalty=args.repetition_penalty,
            task_id=args.task_id,
            out_path=args.out_path,
            speaker_latents=speaker_latents,
            emit_line=_emit,
            default_voice_profile_dir=args.voice_profile_dir,
            voice_reference_error_detail=True,
        )

    except Exception as e:
        print(f"\n[CRITICAL ERROR] XTTS failed: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    # Check for --serve before argparse so --out_path=required doesn't block it.
    if "--serve" in sys.argv:
        serve_loop()
    else:
        main()

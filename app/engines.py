import shlex
import subprocess
import os
import re
import hashlib
import shutil
import logging
import tempfile
import queue
import threading
from pathlib import Path
from typing import List, Optional

from .config import XTTS_ENV_ACTIVATE, XTTS_ENV_PYTHON, MP3_QUALITY, BASE_DIR, AUDIOBOOK_BITRATE
from .textops import safe_split_long_sentences, sanitize_for_xtts, pack_text_to_limit

_active_processes = set()
logger = logging.getLogger(__name__)


def _create_temp_manifest(prefix: str, suffix: str) -> Path:
    safe_prefix = re.sub(r"[^A-Za-z0-9._-]+", "_", prefix) or "audiobook"
    fd, tmp = tempfile.mkstemp(prefix=safe_prefix, suffix=suffix)
    os.close(fd)
    return Path(tmp)

def terminate_all_subprocesses():
    for proc in list(_active_processes):
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            try:
                proc.kill()
            except Exception:
                logger.debug("Failed to force-kill subprocess during termination", exc_info=True)
        _active_processes.clear()

def run_cmd_stream(cmd, on_output, cancel_check, env=None) -> int:
    import time
    from collections import deque
    if isinstance(cmd, (list, tuple)):
        display_cmd = " ".join(shlex.quote(str(part)) for part in cmd)
    else:
        display_cmd = str(cmd)
    logger.debug("Running command: %s", display_cmd)
    proc = subprocess.Popen(
        cmd,
        shell=isinstance(cmd, str),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=0, # Unbuffered
        env=env,
    )
    _active_processes.add(proc)
    output_queue: "queue.Queue[Optional[str]]" = queue.Queue()

    def enqueue_output():
        try:
            if proc.stdout is None:
                return
            while True:
                char = proc.stdout.read(1)
                if not char:
                    break
                output_queue.put(char)
        finally:
            output_queue.put(None)

    reader_thread = threading.Thread(target=enqueue_output, daemon=True)
    reader_thread.start()

    buffer = ""
    last_heartbeat = time.time()
    recent_lines = deque(maxlen=50)
    saw_eof = False

    try:
        while True:
            if cancel_check():
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                return 1

            try:
                item = output_queue.get(timeout=0.1)
                if item is None:
                    saw_eof = True
                else:
                    buffer += item
                    if item in ('\n', '\r'):
                        line = buffer.strip()
                        if line:
                            recent_lines.append(line)
                        on_output(buffer)
                        buffer = ""
                        last_heartbeat = time.time()
            except queue.Empty:
                if time.time() - last_heartbeat >= 1.0:
                    on_output("")
                    last_heartbeat = time.time()

            if saw_eof and proc.poll() is not None and output_queue.empty():
                break

        # Final flush
        if buffer:
            line = buffer.strip()
            if line:
                recent_lines.append(line)
            on_output(buffer)

        rc = proc.returncode or 0
        if rc != 0:
            logger.error(
                "Command failed (rc=%s): %s\nLast output:\n%s",
                rc,
                display_cmd,
                "\n".join(recent_lines),
            )
        return rc
    finally:
        if proc in _active_processes:
            _active_processes.remove(proc)

def wav_to_mp3(in_wav: Path, out_mp3: Path, on_output=None, cancel_check=None) -> int:
    def noop(*_args):
        return None

    def never_cancel():
        return False

    if on_output is None:
        on_output = noop
    if cancel_check is None:
        cancel_check = never_cancel

    cmd = f'ffmpeg -y -i {shlex.quote(str(in_wav))} -codec:a libmp3lame -q:a {shlex.quote(MP3_QUALITY)} {shlex.quote(str(out_mp3))}'
    return run_cmd_stream(cmd, on_output, cancel_check)

def convert_to_wav(in_file: Path, out_wav: Path) -> int:
    """Converts any audio file to a standard 22050Hz mono WAV (best for XTTS references)."""
    cmd = f'ffmpeg -y -i {shlex.quote(str(in_file))} -ar 22050 -ac 1 {shlex.quote(str(out_wav))}'
    return subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode

def xtts_generate(
    text: str,
    out_wav: Path,
    safe_mode: bool,
    on_output,
    cancel_check,
    speaker_wav: str = None,
    speed: float = 1.0,
    voice_profile_dir: Path = None,
) -> int:
    if not XTTS_ENV_ACTIVATE.exists():
        on_output(f"[error] XTTS activate not found: {XTTS_ENV_ACTIVATE}\n")
        return 1

    sw = speaker_wav

    if not sw and voice_profile_dir is None:
        on_output("[error] No speaker profile or reference WAV provided\n")
        return 1

    if safe_mode:
        text = sanitize_for_xtts(text)
        text = safe_split_long_sentences(text)
    else:
        # Raw mode: Absolute bare minimum to prevent speech engine crashes
        text = re.sub(r'[^\x00-\x7F]+', '', text) # ASCII only
        text = text.strip()

    text = pack_text_to_limit(text, pad=True) or " "

    cmd = [
        str(XTTS_ENV_PYTHON),
        str(BASE_DIR / 'app' / 'xtts_inference.py'),
        "--text", text,
        "--language", "en",
        "--repetition_penalty", "2.0",
        "--speed", str(speed),
        "--out_path", str(out_wav),
    ]
    if sw:
        cmd.extend(["--speaker_wav", sw])
    if voice_profile_dir is not None:
        cmd.extend(["--voice_profile_dir", str(voice_profile_dir)])
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    on_output("Launching XTTS inference...\n")
    on_output("XTTS may take a while on first use while models load, caches warm, or assets download.\n")
    return run_cmd_stream(cmd, on_output, cancel_check, env=env)


def xtts_generate_script(
    script_json_path: Path,
    out_wav: Path,
    on_output,
    cancel_check,
    speed: float = 1.0,
    voice_profile_dir: Path = None,
) -> int:
    if not XTTS_ENV_ACTIVATE.exists():
        on_output(f"[error] XTTS activate not found: {XTTS_ENV_ACTIVATE}\n")
        return 1

    cmd = [
        str(XTTS_ENV_PYTHON),
        str(BASE_DIR / 'app' / 'xtts_inference.py'),
        "--script_json", str(script_json_path),
        "--language", "en",
        "--repetition_penalty", "2.0",
        "--speed", str(speed),
        "--out_path", str(out_wav),
    ]
    if voice_profile_dir is not None:
        cmd.extend(["--voice_profile_dir", str(voice_profile_dir)])
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    on_output("Launching XTTS inference...\n")
    on_output("XTTS may take a while on first use while models load, caches warm, or assets download.\n")
    return run_cmd_stream(cmd, on_output, cancel_check, env=env)


def get_audio_duration(file_path: Path) -> float:
    """Uses ffprobe to get the duration of an audio file in seconds."""
    cmd = [
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(file_path)
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        return float(result.stdout.strip())
    except Exception:
        return 0.0

def get_speaker_latent_path(speaker_wavs_str, voice_profile_dir: Path = None) -> Optional[Path]:
    """Computes the same latent path as xtts_inference.py."""
    if voice_profile_dir is not None:
        return Path(voice_profile_dir) / "latent.pth"

    if not speaker_wavs_str:
        return None

    if isinstance(speaker_wavs_str, list):
        combined_paths = "|".join(sorted([os.path.abspath(p) for p in speaker_wavs_str]))
    elif "," in speaker_wavs_str:
        wavs = [s.strip() for s in speaker_wavs_str.split(",") if s.strip()]
        combined_paths = "|".join(sorted([os.path.abspath(p) for p in wavs]))
    else:
        combined_paths = os.path.abspath(speaker_wavs_str)

    speaker_id = hashlib.md5(combined_paths.encode()).hexdigest()
    voice_dir = Path(os.path.expanduser("~/.cache/audiobook-studio/voices"))
    return voice_dir / f"{speaker_id}.pth"


def migrate_speaker_latent_to_profile(speaker_wavs_str, voice_profile_dir: Path) -> Optional[Path]:
    """Copies a legacy cache latent into a profile-owned latent path if needed."""
    profile_latent = Path(voice_profile_dir) / "latent.pth"
    if profile_latent.exists():
        return profile_latent

    legacy_latent = get_speaker_latent_path(speaker_wavs_str)
    if legacy_latent and legacy_latent.exists():
        profile_latent.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(legacy_latent, profile_latent)
        return profile_latent

    return None

def assemble_audiobook(
    input_folder: Path,
    book_title: str,
    output_m4b: Path,
    on_output,
    cancel_check,
    chapter_titles: dict = None,
    author: str = None,
    narrator: str = None,
    chapters: List[dict] = None, # List of {filename, title}
    cover_path: str = None
):
    # 1. Gather files
    if chapters:
        # Use provided list from interaction
        files = [c['filename'] for c in chapters]
        final_titles = {c['filename']: c['title'] for c in chapters}
    else:
        all_files = [f for f in os.listdir(input_folder) if f.endswith(('.wav', '.mp3')) and not f.startswith('seg_')]
        # Group by stem, prioritizing mp3
        chapters_found = {}
        for f in all_files:
            stem = Path(f).stem
            ext = Path(f).suffix.lower()
            # Priority: .wav > .mp3 > anything else
            if stem not in chapters_found:
                chapters_found[stem] = f
            else:
                current_ext = Path(chapters_found[stem]).suffix.lower()
                if ext == '.wav' and current_ext != '.wav':
                    chapters_found[stem] = f

        def extract_number(filename):
            # Only match digits followed by dot (e.g., chapter 1.wav) or alone if it's the whole stem
            # to avoid picking up UUID hashes
            match = re.search(r'(?:part_)?(\d+)(?:\.|$|_)', filename, re.IGNORECASE)
            return int(match.group(1)) if match else 0

        sorted_stems = sorted(chapters_found.keys(), key=lambda x: extract_number(x))
        files = [chapters_found[s] for s in sorted_stems]
        final_titles = {} # will use chapter_titles logic below

    if not files:
        on_output("No audio files found to combine.\n")
        return 1

    # 2. Build Metadata and Concat List
    metadata_file = _create_temp_manifest(f"{output_m4b.stem}_", ".metadata.txt")
    list_file = _create_temp_manifest(f"{output_m4b.stem}_", ".list.txt")

    metadata = ";FFMETADATA1\n"
    metadata += f"title={book_title}\n"
    if author:
        metadata += f"artist={author}\n"
    if narrator:
        metadata += f"comment={narrator}\n"
    metadata += "\n"

    current_offset = 0.0

    try:
        with open(list_file, 'w') as lf:
            for f in files:
                file_path = input_folder / f
                if not file_path.exists():
                    on_output(f"Missing input audio file: {file_path}\n")
                    return 1

                # Check for cached m4a
                m4a_path = input_folder / f"{Path(f).stem}.m4a"
                needs_encode = True

                if m4a_path.exists():
                    try:
                        source_mtime = file_path.stat().st_mtime
                        m4a_mtime = m4a_path.stat().st_mtime
                        if m4a_mtime >= source_mtime:
                            needs_encode = False
                    except OSError:
                        logger.debug("Could not compare timestamps for cached audiobook segment %s", m4a_path, exc_info=True)

                if needs_encode:
                    on_output(f"Pre-encoding {f} to AAC...\n")
                    encode_cmd = f"ffmpeg -y -i {shlex.quote(str(file_path))} -c:a aac -b:a {shlex.quote(AUDIOBOOK_BITRATE)} -ac 1 -vn {shlex.quote(str(m4a_path))}"
                    encode_rc = run_cmd_stream(encode_cmd, on_output, cancel_check)
                    if encode_rc != 0:
                        on_output(f"Failed to encode {f}\n")
                        return encode_rc

                duration = get_audio_duration(m4a_path)

                lf.write(f"file '{m4a_path}'\n")

                start_ms = int(current_offset * 1000)
                end_ms = int((current_offset + duration) * 1000)

                # Use custom title if provided, else use stem
                stem = Path(f).stem
                if f in final_titles:
                    display_name = final_titles[f]
                elif chapter_titles:
                    display_name = chapter_titles.get(stem + ".txt") or chapter_titles.get(stem) or stem
                else:
                    display_name = stem

                metadata += "[CHAPTER]\nTIMEBASE=1/1000\n"
                metadata += f"START={start_ms}\n"
                metadata += f"END={end_ms}\n"
                metadata += f"title={display_name}\n\n"

                current_offset += duration

        metadata_file.write_text(metadata, encoding="utf-8")

        # 3. Run FFmpeg
        on_output(f"Assembling audiobook: {book_title}\n")
        on_output(f"Combining {len(files)} files into {output_m4b.name}...\n")

        cover_input = ""
        cover_map = ""
        if cover_path:
            on_output(f"Checking cover path: {cover_path}\n")
        if cover_path and Path(cover_path).exists():
            on_output(f"Cover image found, adding to ffmpeg: {cover_path}\n")
            cover_input = f"-i {shlex.quote(str(cover_path))} "
            # Map chapter 0 (concat audio) and chapter 1 (metadata) and chapter 2 (cover)
            cover_map = "-map 2:v -c:v copy -disposition:v:0 attached_pic "

        cmd = (
            f"ffmpeg -y -f concat -safe 0 -i {shlex.quote(str(list_file))} "
            f"-i {shlex.quote(str(metadata_file))} {cover_input} "
            f"-map 0:a {cover_map} -map_metadata 1 "
            f"-c:a copy -movflags +faststart {shlex.quote(str(output_m4b))}"
        )

        rc = run_cmd_stream(cmd, on_output, cancel_check)

        # 4. Copy cover art if successful so frontend can show it in the library
        if rc == 0 and cover_path and Path(cover_path).exists():
            try:
                import shutil
                cover_ext = Path(cover_path).suffix
                cover_dest = output_m4b.with_suffix(cover_ext)
                shutil.copy2(cover_path, cover_dest)
                on_output(f"Saved cover preview to: {cover_dest.name}\n")
            except Exception:
                logger.warning("Failed to copy cover preview to %s", output_m4b.with_suffix(Path(cover_path).suffix), exc_info=True)
                on_output("Warning: Failed to copy cover preview.\n")

        return rc
    finally:
        # Cleanup
        if list_file.exists(): list_file.unlink()
        if metadata_file.exists(): metadata_file.unlink()


def generate_video_sample(
    input_audio: Path,
    output_video: Path,
    logo_path: Path,
    on_output,
    cancel_check,
    max_duration: int = 120
) -> int:
    """
    Generates a video sample (MP4) from an audio file with a logo overlay.
    Limited to max_duration seconds.
    """
    if not input_audio.exists():
        on_output(f"[error] Input audio not found: {input_audio}\n")
        return 1

    logo_filter = ""
    # Small 400x400 canvas for a compact player feel
    inputs = f"-f lavfi -i color=c=black:s=400x400:d={max_duration} -i {shlex.quote(str(input_audio))}"

    if logo_path and logo_path.exists():
        inputs += f" -i {shlex.quote(str(logo_path))}"
        # Scale logo to fit 400x400 and center it
        logo_filter = '-filter_complex "[2:v]scale=400:400:force_original_aspect_ratio=decrease[logo];[0:v][logo]overlay=(W-w)/2:(H-h)/2[outv]" -map "[outv]" '
    else:
        logo_filter = '-map 0:v '

    cmd = f"ffmpeg -y {inputs} {logo_filter} -map 1:a -c:v libx264 -c:a copy -t {max_duration} -shortest {shlex.quote(str(output_video))}"
    return run_cmd_stream(cmd, on_output, cancel_check)

def stitch_segments(
    pdir: Path,
    segment_wavs: List[Path],
    output_path: Path,
    on_output,
    cancel_check
) -> int:
    """Concatenates multiple segments into one final file."""
    if not segment_wavs:
        on_output("No segments to stitch.\n")
        return 1

    list_file = _create_temp_manifest(f"{output_path.stem}_", ".list.txt")
    try:
        with open(list_file, 'w') as lf:
            for sw in segment_wavs:
                # Use absolute path for safety with safe 0
                lf.write(f"file '{sw.absolute()}'\n")

        # Simple concat for segments (they should all be same sample rate/channels from XTTS)
        cmd = f'ffmpeg -y -f concat -safe 0 -i {shlex.quote(str(list_file))} -c copy {shlex.quote(str(output_path))}'
        return run_cmd_stream(cmd, on_output, cancel_check)
    finally:
        if list_file.exists(): list_file.unlink()

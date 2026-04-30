from __future__ import annotations
import time
import logging
import shutil
from pathlib import Path

from ..state import update_job
from ..engines import wav_to_mp3
from ..engines.bridge import create_voice_bridge
from ..engines.errors import EngineBridgeError
from .speaker import get_speaker_wavs, get_speaker_settings, get_voice_profile_dir
from .worker_helpers import _mark_queue_failed

logger = logging.getLogger(__name__)


def _resolve_voxtral_reference_audio_path(
    *,
    pdir: Path,
    reference_sample: str | None,
    speaker_wavs: str | None,
) -> str | None:
    candidates: list[Path] = []
    if reference_sample:
        sample_path = pdir / reference_sample
        candidates.append(sample_path)
        candidates.append(Path(reference_sample))
    if speaker_wavs:
        first_wav = str(speaker_wavs).split(",", 1)[0].strip()
        if first_wav:
            candidates.append(Path(first_wav))

    for candidate in candidates:
        try:
            if candidate.exists() and candidate.is_file():
                return str(candidate)
        except OSError as e:
            logger.debug("Failed to check reference audio candidate %s: %s", candidate, e)
            continue
    return None


def _generate_voice_sample_via_bridge(
    *,
    engine: str,
    profile_name: str,
    test_text: str,
    out_wav: Path,
    on_output,
    cancel_check,
    speed: float,
    speaker_wavs: str | None,
    voice_profile_dir: Path | None,
    voxtral_voice_id: str | None,
    voxtral_model: str | None,
    reference_sample: str | None,
) -> int:
    bridge = create_voice_bridge()
    request: dict[str, object] = {
        "engine_id": engine,
        "voice_profile_id": profile_name,
        "script_text": test_text,
        "output_path": str(out_wav),
        "output_format": "wav",
        "on_output": on_output,
        "cancel_check": cancel_check,
        "reference_sample": reference_sample,
    }
    # Pass through additional context that hooks might need
    if speed is not None:
        request["speed"] = speed
    if voxtral_model:
        request["voxtral_model"] = voxtral_model
    if voxtral_voice_id:
        request["voice_asset_id"] = voxtral_voice_id
    if voice_profile_dir:
        request["voice_profile_dir"] = str(voice_profile_dir)

    response = bridge.synthesize(request)
    if response.get("audio_path") and Path(str(response["audio_path"])) != out_wav:
        generated = Path(str(response["audio_path"]))
        if generated.exists() and generated != out_wav:
            shutil.move(str(generated), str(out_wav))
    return 0


def handle_voice_job(jid, j, on_output, cancel_check, voice_job_settings=None):
    from ..config import VOICES_DIR
    try:
        pdir = get_voice_profile_dir(j.speaker_profile)
    except ValueError:
        pdir = VOICES_DIR / j.speaker_profile
    pdir.mkdir(parents=True, exist_ok=True)

    # For voice_test or missing sample.wav, generate one. voice_build always rebuilds.
    sample_path = pdir / "sample.wav"
    if j.engine in ("voice_build", "voice_test") or not sample_path.exists():
        on_output(f"Generating test sample for {j.speaker_profile}...\n")
        spk = voice_job_settings or get_speaker_settings(j.speaker_profile)
        sw = get_speaker_wavs(j.speaker_profile)
        try:
            voice_profile_dir = get_voice_profile_dir(j.speaker_profile)
        except ValueError:
            voice_profile_dir = None
        engine = spk.get("engine", "xtts")
        try:
            rc = _generate_voice_sample_via_bridge(
                engine=engine,
                profile_name=j.speaker_profile,
                test_text=spk["test_text"],
                out_wav=sample_path,
                on_output=on_output,
                cancel_check=cancel_check,
                speed=spk.get("speed", 1.0),
                speaker_wavs=sw,
                voice_profile_dir=voice_profile_dir,
                voxtral_voice_id=spk.get("voxtral_voice_id"),
                voxtral_model=spk.get("voxtral_model"),
                reference_sample=spk.get("reference_sample"),
            )
        except EngineBridgeError as exc:
            _mark_queue_failed(jid, str(exc))
            return
        if rc != 0:
            _mark_queue_failed(jid, "Voice synthesis failed.")
            return

        sample_mp3 = pdir / "sample.mp3"
        mp3_rc = wav_to_mp3(sample_path, sample_mp3, on_output=on_output, cancel_check=cancel_check)
        if mp3_rc == 0 and sample_mp3.exists():
            try:
                sample_path.unlink()
            except FileNotFoundError:
                logger.debug("Transient voice sample already removed or missing at %s", sample_path)
        else:
            logger.warning(
                "Failed to convert voice sample for %s to mp3; keeping wav fallback",
                j.speaker_profile,
            )

        # After success: mark samples as built if this was a build job
        if j.engine == "voice_build" or j.engine == "voice_test":
            try:
                from .speaker import update_speaker_settings
                raw_wavs = sorted([
                    f.name for f in pdir.glob("*.wav")
                    if f.name not in {"sample.wav", "sample.mp3"}
                ])
                update_speaker_settings(
                    j.speaker_profile,
                    built_samples=raw_wavs,
                    preview_test_text=spk["test_text"],
                    preview_engine=engine,
                    preview_reference_sample=spk.get("reference_sample"),
                    preview_voxtral_voice_id=spk.get("voxtral_voice_id"),
                    preview_voxtral_model=spk.get("voxtral_model"),
                )
                on_output(f"Updated build samples for {j.speaker_profile}.\n")
            except Exception as e:
                logger.error(f"Error updating build samples for {j.speaker_profile}: {e}")

    update_job(jid, status="done", progress=1.0, finished_at=time.time())
    # Mark done in the DB queue so sync_memory_queue doesn't re-enqueue on server restart
    try:
        from ..db import update_queue_item
        update_queue_item(jid, "done")
    except Exception as _qe:
        logger.warning(f"Could not mark voice job {jid} done in DB queue: {_qe}")

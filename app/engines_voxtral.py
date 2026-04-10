import base64
import json
import logging
import os
import shutil
from pathlib import Path
from typing import Optional

import httpx

from .engines import convert_to_wav
from .state import get_settings

logger = logging.getLogger(__name__)

DEFAULT_VOXTRAL_MODEL = "voxtral-mini-tts-2603"
DEFAULT_MISTRAL_TTS_URL = "https://api.mistral.ai/v1/audio/speech"


class VoxtralError(RuntimeError):
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


def _never_cancel() -> bool:
    return False


def _noop_output(*_args) -> None:
    return None


def resolve_mistral_api_key() -> Optional[str]:
    settings = get_settings()
    key = str(settings.get("mistral_api_key") or os.getenv("MISTRAL_API_KEY") or "").strip()
    return key or None


def resolve_voxtral_model(profile_model: Optional[str] = None) -> str:
    settings = get_settings()
    model = (
        str(profile_model or settings.get("voxtral_model") or os.getenv("VOXTRAL_MODEL") or DEFAULT_VOXTRAL_MODEL)
        .strip()
    ) or DEFAULT_VOXTRAL_MODEL
    if model == "voxtral-tts":
        return DEFAULT_VOXTRAL_MODEL
    return model


def resolve_mistral_tts_url() -> str:
    return str(os.getenv("MISTRAL_TTS_URL") or DEFAULT_MISTRAL_TTS_URL).strip() or DEFAULT_MISTRAL_TTS_URL


def resolve_reference_audio_path(profile_name: Optional[str], reference_sample: Optional[str] = None) -> Optional[Path]:
    if not profile_name:
        return None

    try:
        from .jobs.speaker import get_voice_profile_dir

        profile_dir = get_voice_profile_dir(profile_name)
    except Exception:
        return None

    if not profile_dir.exists():
        return None

    if reference_sample:
        preferred = profile_dir / Path(reference_sample).name
        if preferred.exists() and preferred.is_file():
            return preferred

    raw_candidates = sorted(
        p for p in profile_dir.iterdir()
        if p.is_file() and p.suffix.lower() in {".wav", ".mp3", ".flac", ".m4a", ".ogg"}
        and p.name not in {"sample.wav", "sample.mp3"}
    )
    return raw_candidates[0] if raw_candidates else None


def _guess_mime_type(path: Path) -> str:
    return {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
    }.get(path.suffix.lower(), "application/octet-stream")


def _looks_like_wav(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE"


def _extract_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except Exception:
        text = response.text.strip()
        return text or f"HTTP {response.status_code}"

    if isinstance(payload, dict):
        for key in ("message", "error", "detail"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
            if isinstance(value, dict):
                nested = value.get("message") or value.get("detail")
                if isinstance(nested, str) and nested.strip():
                    return nested.strip()

    return f"HTTP {response.status_code}"


def _extract_audio_bytes(response: httpx.Response) -> bytes:
    content_type = (response.headers.get("content-type") or "").lower()
    if response.status_code >= 400:
        raise VoxtralError(_extract_error_message(response), status_code=response.status_code)

    if "application/json" in content_type:
        try:
            payload = response.json()
        except Exception as exc:
            raise VoxtralError("Voxtral returned JSON that could not be parsed.") from exc

        if isinstance(payload, dict):
            for key in ("audio_data", "audio_base64", "b64_json", "audio"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    try:
                        return base64.b64decode(value)
                    except Exception as exc:
                        raise VoxtralError("Voxtral returned invalid audio payload.") from exc

            data = payload.get("data")
            if isinstance(data, list):
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    for key in ("audio_data", "audio_base64", "b64_json", "audio"):
                        value = item.get(key)
                        if isinstance(value, str) and value.strip():
                            try:
                                return base64.b64decode(value)
                            except Exception as exc:
                                raise VoxtralError("Voxtral returned invalid audio payload.") from exc

        raise VoxtralError("Voxtral returned JSON without audio content.")

    if not response.content:
        raise VoxtralError("Voxtral returned an empty audio response.")
    return response.content


def _request_payload_variants(text: str, model: str) -> list[dict]:
    return [
        {"model": model, "input": text, "response_format": "wav"},
        {"model": model, "text": text, "response_format": "wav"},
        {"model": model, "input": text},
        {"model": model, "text": text},
    ]


def voxtral_generate(
    text: str,
    out_wav: Path,
    on_output=None,
    cancel_check=None,
    profile_name: Optional[str] = None,
    voice_id: Optional[str] = None,
    model: Optional[str] = None,
    reference_sample: Optional[str] = None,
) -> int:
    on_output = on_output or _noop_output
    cancel_check = cancel_check or _never_cancel

    if cancel_check():
        return 1

    api_key = resolve_mistral_api_key()
    if not api_key:
        raise VoxtralError("Missing Mistral API key. Set MISTRAL_API_KEY or save mistral_api_key in settings.")

    model_name = resolve_voxtral_model(model)
    endpoint = resolve_mistral_tts_url()
    clean_voice_id = str(voice_id or "").strip() or None
    ref_audio_path = None if clean_voice_id else resolve_reference_audio_path(profile_name, reference_sample)

    if not clean_voice_id and ref_audio_path is None:
        raise VoxtralError("No Voxtral voice_id or reference sample is available for this voice profile.")

    out_wav.parent.mkdir(parents=True, exist_ok=True)
    on_output("[START_SYNTHESIS]\n")
    on_output(f"Submitting Voxtral synthesis request using model '{model_name}'.\n")
    if clean_voice_id:
        on_output(f"Using saved Voxtral voice ID for {profile_name or 'voice'}.\n")
    elif ref_audio_path:
        on_output(f"Using reference audio {ref_audio_path.name} for {profile_name or 'voice'}.\n")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    last_error: Optional[VoxtralError] = None
    for payload in _request_payload_variants(text, model_name):
        if cancel_check():
            return 1

        request_payload = dict(payload)
        if clean_voice_id:
            request_payload["voice_id"] = clean_voice_id
        elif ref_audio_path:
            request_payload["ref_audio"] = base64.b64encode(ref_audio_path.read_bytes()).decode("ascii")

        try:
            with httpx.Client(timeout=httpx.Timeout(180.0, connect=20.0)) as client:
                response = client.post(endpoint, headers=headers, json=request_payload)
            audio_bytes = _extract_audio_bytes(response)
        except VoxtralError as exc:
            last_error = exc
            if exc.status_code is not None and exc.status_code >= 500:
                break
            continue
        except httpx.HTTPError as exc:
            raise VoxtralError(f"Could not reach Mistral API: {exc}") from exc

        tmp_audio = out_wav.with_suffix(".voxtral.tmp")
        tmp_audio.write_bytes(audio_bytes)
        try:
            if _looks_like_wav(audio_bytes):
                shutil.move(str(tmp_audio), str(out_wav))
                on_output(f"Saved Voxtral audio to {out_wav.name}.\n")
                return 0

            rc = convert_to_wav(tmp_audio, out_wav)
            if rc != 0 or not out_wav.exists():
                raise VoxtralError("Voxtral audio was returned in an unsupported format.")
            on_output(f"Normalized Voxtral audio to {out_wav.name}.\n")
            return 0
        finally:
            try:
                if tmp_audio.exists():
                    tmp_audio.unlink()
            except FileNotFoundError:
                pass

    raise last_error or VoxtralError("Voxtral synthesis failed before any audio was returned.")

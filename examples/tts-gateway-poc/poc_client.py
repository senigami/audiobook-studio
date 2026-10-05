#!/usr/bin/env python3
"""Audiobook Studio — TTS Gateway API proof-of-concept client.

A self-contained example that exercises the external "Studio as a TTS gateway"
API (``/api/v1/tts``) end to end, exactly as a remote client would:

    1. discover engines        GET  /engines
    2. submit a synthesis      POST /synthesize
    3. poll to completion       GET  /jobs/{id}
    4. download the audio       GET  /jobs/{id}/audio

This script is an *example*. It is not imported by the app runtime and has no
dependency on any ``app.*`` module — it talks only to the public HTTP surface.

Configuration comes from the environment (never hardcode secrets):

    TTS_API_BASE_URL   Base URL of the gateway.
                       Default: http://127.0.0.1:8123/api/v1/tts
    TTS_API_KEY        Bearer token. Required only if the server has an API key
                       configured (it does whenever the API is exposed).

Usage:
    export TTS_API_KEY="your-key"
    python poc_client.py                       # uses a built-in long sample
    python poc_client.py --engine xtts         # pick an engine explicitly
    python poc_client.py --text "Hello there"  # short text -> inline audio path
    python poc_client.py --voice-ref "My Narrator"   # use a voice profile

The only third-party dependency is ``requests`` (``pip install requests``).
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:  # pragma: no cover - guidance for the example runner
    sys.exit("This example needs the 'requests' package.  Run: pip install requests")


# A passage comfortably over the 500-character inline threshold, so the default
# run demonstrates the interesting async path: submit -> job_id -> poll -> fetch.
SAMPLE_TEXT = (
    "The gateway accepted this request over plain HTTP, authenticated the "
    "bearer token, and handed the work to the same scheduler that drives the "
    "studio itself. Because this passage runs past five hundred characters, the "
    "server does not answer inline; instead it enqueues a synthesis job and "
    "returns a job identifier. This client then polls the job endpoint until the "
    "status turns to done, and finally downloads the rendered audio from the "
    "job's audio route. That full round trip — discover, submit, poll, and fetch "
    "— is exactly what any external application would do to use Audiobook Studio "
    "as a text-to-speech service, and it is the loop this example is here to prove."
)


class GatewayError(RuntimeError):
    """Raised when the gateway returns an unexpected response."""


class TTSGatewayClient:
    """Thin wrapper over the gateway's HTTP surface."""

    def __init__(self, base_url: str, api_key: str | None, *, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        if api_key:
            self.session.headers["Authorization"] = f"Bearer {api_key}"

    def _url(self, path: str) -> str:
        return f"{self.base_url}/{path.lstrip('/')}"

    def list_engines(self) -> list[dict]:
        resp = self.session.get(self._url("engines"), timeout=self.timeout)
        _raise_for_gateway(resp)
        return resp.json().get("engines", [])

    def submit(
        self,
        *,
        engine_id: str,
        text: str,
        voice_ref: str | None = None,
        language: str = "en",
        output_format: str = "wav",
    ) -> requests.Response:
        body = {
            "engine_id": engine_id,
            "text": text,
            "language": language,
            "output_format": output_format,
        }
        if voice_ref:
            body["voice_ref"] = voice_ref
        resp = self.session.post(self._url("synthesize"), json=body, timeout=self.timeout)
        _raise_for_gateway(resp)
        return resp

    def job_status(self, job_id: str) -> dict:
        resp = self.session.get(self._url(f"jobs/{job_id}"), timeout=self.timeout)
        _raise_for_gateway(resp)
        return resp.json()

    def download_audio(self, job_id: str) -> requests.Response:
        resp = self.session.get(self._url(f"jobs/{job_id}/audio"), timeout=self.timeout)
        _raise_for_gateway(resp)
        return resp


def _raise_for_gateway(resp: requests.Response) -> None:
    """Turn non-2xx responses into a readable error, surfacing the API's message."""
    if resp.status_code < 400:
        return
    detail = ""
    try:
        payload = resp.json()
        detail = payload.get("detail") or payload.get("message") or ""
    except ValueError:
        detail = resp.text[:200]
    raise GatewayError(f"HTTP {resp.status_code} from {resp.url} — {detail}".rstrip(" —"))


def _pick_engine(engines: list[dict], requested: str | None) -> str:
    if not engines:
        raise GatewayError(
            "The gateway reported no engines. Is the managed TTS server booted "
            "and an engine enabled?"
        )
    ids = [e["engine_id"] for e in engines]
    if requested:
        if requested not in ids:
            raise GatewayError(f"Engine {requested!r} not available. Choose one of: {ids}")
        return requested
    # Prefer a ready/verified engine if the summary tells us; else the first.
    for e in engines:
        if e.get("verified") and str(e.get("status", "")).lower() in {"ready", "ok", "available"}:
            return e["engine_id"]
    return ids[0]


def _save_audio(resp: requests.Response, out_dir: Path, job_id: str) -> Path:
    ctype = resp.headers.get("Content-Type", "")
    ext = {
        "audio/wav": ".wav", "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3", "audio/mp3": ".mp3",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac", "audio/x-flac": ".flac",
    }.get(ctype.split(";")[0].strip(), ".bin")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{job_id}{ext}"
    out_path.write_bytes(resp.content)
    return out_path


def run(args: argparse.Namespace) -> int:
    base_url = os.environ.get("TTS_API_BASE_URL", "http://127.0.0.1:8123/api/v1/tts")
    api_key = os.environ.get("TTS_API_KEY")
    client = TTSGatewayClient(base_url, api_key)

    print(f"→ Gateway: {base_url}")
    print(f"→ API key: {'provided' if api_key else 'none (server may be open)'}\n")

    # 1. Discover engines --------------------------------------------------
    print("[1/4] GET /engines")
    engines = client.list_engines()
    for e in engines:
        print(f"      • {e['engine_id']:<10} {e.get('display_name','')} "
              f"(status={e.get('status')}, verified={e.get('verified')})")
    engine_id = _pick_engine(engines, args.engine)
    print(f"      using engine: {engine_id}\n")

    # 2. Submit ------------------------------------------------------------
    text = args.text or SAMPLE_TEXT
    mode = "inline (<500 chars)" if len(text) < 500 else "queued (>=500 chars)"
    print(f"[2/4] POST /synthesize  ({len(text)} chars → {mode})")
    resp = client.submit(
        engine_id=engine_id,
        text=text,
        voice_ref=args.voice_ref,
        language=args.language,
        output_format=args.output_format,
    )

    out_dir = Path(args.out_dir)

    # Short text comes back as audio inline; long text returns a job envelope.
    ctype = resp.headers.get("Content-Type", "")
    if ctype.startswith("audio/"):
        job_id = f"inline_{int(time.time())}"
        out_path = _save_audio(resp, out_dir, job_id)
        print(f"      inline audio returned directly ({len(resp.content)} bytes)\n")
        print(f"✓ Saved audio to: {out_path.resolve()}")
        return 0

    envelope = resp.json()
    job_id = envelope["job_id"]
    print(f"      job_id={job_id} status={envelope.get('status')}\n")

    # 3. Poll --------------------------------------------------------------
    print(f"[3/4] GET /jobs/{job_id}  (polling)")
    deadline = time.time() + args.timeout
    status = envelope.get("status", "queued")
    while time.time() < deadline:
        info = client.job_status(job_id)
        status = info.get("status", "unknown")
        progress = info.get("progress", 0.0)
        print(f"      status={status:<12} progress={progress:>6.2f}")
        # Terminal success is "done" in Studio's job vocabulary; accept "completed"
        # too so the example is robust if the gateway ever normalizes the status.
        if status in {"done", "completed"}:
            break
        if status in {"failed", "cancelled", "error"}:
            raise GatewayError(f"Job {job_id} ended in state {status!r}: {info.get('message')}")
        time.sleep(args.poll_interval)
    else:
        raise GatewayError(f"Job {job_id} did not complete within {args.timeout}s (last status={status}).")
    print()

    # 4. Download ----------------------------------------------------------
    print(f"[4/4] GET /jobs/{job_id}/audio")
    audio = client.download_audio(job_id)
    out_path = _save_audio(audio, out_dir, job_id)
    print(f"      downloaded {len(audio.content)} bytes ({audio.headers.get('Content-Type')})\n")
    print(f"✓ Saved audio to: {out_path.resolve()}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="TTS Gateway API proof-of-concept client.")
    p.add_argument("--engine", help="Engine id to use (default: first ready engine).")
    p.add_argument("--text", help="Text to synthesize (default: a built-in long sample).")
    p.add_argument("--voice-ref", help="Voice profile name or contained reference path.")
    p.add_argument("--language", default="en", help="BCP-47 language code (default: en).")
    p.add_argument("--output-format", default="wav", choices=["wav", "mp3", "ogg", "flac"],
                   help="Requested audio format (default: wav).")
    p.add_argument("--out-dir", default="./poc-output", help="Where to save audio (default: ./poc-output).")
    p.add_argument("--timeout", type=float, default=180.0, help="Max seconds to wait for a job (default: 180).")
    p.add_argument("--poll-interval", type=float, default=2.0, help="Seconds between polls (default: 2).")
    return p


def main() -> int:
    args = build_parser().parse_args()
    try:
        return run(args)
    except GatewayError as exc:
        print(f"\n✗ {exc}", file=sys.stderr)
        return 1
    except requests.RequestException as exc:
        print(f"\n✗ Could not reach the gateway: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

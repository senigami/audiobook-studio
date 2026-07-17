# TTS Gateway API — proof-of-concept client

A minimal, self-contained example that drives Audiobook Studio's external
**"Studio as a TTS gateway"** API (`/api/v1/tts`) end to end, the way a remote
application would:

```
GET  /engines            discover available engines
POST /synthesize         submit text  →  inline audio (short) or a job id (long)
GET  /jobs/{id}          poll a queued job to completion
GET  /jobs/{id}/audio    download the rendered audio
```

Nothing here is part of the app runtime. The client talks only to the public
HTTP surface — it does **not** import `app.*` — so it works from any machine or
language. Two equivalent examples are included:

| File | What it is |
|------|------------|
| [`poc_client.py`](./poc_client.py) | A command-line Python client (`requests`). The primary example. |
| [`index.html`](./index.html) | A tiny static page doing the same loop via browser `fetch()`. |

## The one behavior to know

`POST /synthesize` has **two response shapes**, decided by text length:

- **Text < 500 chars → inline.** The response *is* the audio file
  (`Content-Type: audio/…`). No job id, no polling.
- **Text ≥ 500 chars → queued.** The response is JSON
  `{ "job_id", "status", "poll_url" }`; you then poll `/jobs/{id}` until
  `status == "done"` (Studio's terminal-success status) and fetch
  `/jobs/{id}/audio`.

Both example clients handle both shapes automatically. The default sample text
is deliberately long so a plain run demonstrates the full submit → poll → fetch
loop.

## 1. Configure the server

The gateway is guarded by an API key and an enabled flag. In Studio's settings
(or via the settings API) make sure:

- **External TTS API** is **enabled** (`tts_api_enabled = true`) — otherwise
  every request returns `403`.
- An **API key** is set (`tts_api_key`). If it's blank the server runs open (no
  auth), which is fine for a local-only trial but not for anything exposed.

At least one TTS engine must be enabled and its managed server booted (start the
app normally; `GET /engines` shows what's ready).

## 2. Run the Python client

```bash
pip install requests          # the only dependency

export TTS_API_KEY="your-key"                 # omit if the server is open
export TTS_API_BASE_URL="http://127.0.0.1:8123/api/v1/tts"   # this is the default

python poc_client.py                          # long built-in sample → poll loop
python poc_client.py --engine xtts            # choose an engine
python poc_client.py --text "Hi there"        # short text → inline audio path
python poc_client.py --voice-ref "My Narrator"  # use a saved voice profile
```

### Configuration

| Variable / flag | Purpose | Default |
|-----------------|---------|---------|
| `TTS_API_BASE_URL` (env) | Gateway base URL | `http://127.0.0.1:8123/api/v1/tts` |
| `TTS_API_KEY` (env) | Bearer token | — (none) |
| `--engine` | Engine id | first ready engine |
| `--text` | Text to synthesize | built-in long sample |
| `--voice-ref` | Voice profile name or contained reference path | — |
| `--output-format` | `wav` / `mp3` / `ogg` / `flac` | `wav` |
| `--out-dir` | Where audio is saved | `./poc-output` |
| `--timeout` | Max seconds to wait for a job | `180` |

Secrets are read only from the environment — nothing is hardcoded. See
[`.env.example`](./.env.example).

### Expected output

```
→ Gateway: http://127.0.0.1:8123/api/v1/tts
→ API key: provided

[1/4] GET /engines
      • xtts       XTTS (status=ready, verified=True)
      using engine: xtts

[2/4] POST /synthesize  (612 chars → queued (>=500 chars))
      job_id=api_1a2b3c4d status=queued

[3/4] GET /jobs/api_1a2b3c4d  (polling)
      status=queued       progress=  0.00
      status=running       progress= 42.00
      status=done          progress=100.00

[4/4] GET /jobs/api_1a2b3c4d/audio
      downloaded 246044 bytes (audio/wav)

✓ Saved audio to: /…/examples/tts-gateway-poc/poc-output/api_1a2b3c4d.wav
```

## 3. Run the browser example

Open [`index.html`](./index.html) directly in a browser (or serve it with any
static server). Enter the base URL and API key, click **Load engines**, pick
one, and **Synthesize**. The rendered audio plays inline.

> If the page is served from a different origin than the API and the browser
> blocks the request with a CORS error, run the Python client instead (CORS is a
> browser-only restriction and does not affect server-to-server calls).

## Error responses

Errors come back as JSON `{ "detail": "…" }` (FastAPI's shape) with a matching
status code — both clients surface the `detail`:

| Status | When |
|--------|------|
| `401` | Missing/invalid API key (when a key is configured) |
| `403` | The external API is disabled |
| `404` | Unknown engine, voice profile, or job id |
| `400` | Bad `voice_ref` (traversal / `.pth`) or unsupported `output_format` |
| `429` | Rate limit exceeded |

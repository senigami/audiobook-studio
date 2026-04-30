# Proposal: Local TTS API (Studio 2.0)

This document specifies how Audiobook Studio exposes its installed TTS engines as a local HTTP API for external applications. The goal is to make Studio a practical TTS gateway that eliminates the setup burden of integrating individual TTS engines from scratch.

## 1. Objectives

- Allow external applications on the local machine to generate speech using Studio's installed TTS engines.
- Reuse the existing TTS Server infrastructure without duplicating engine management.
- Route API synthesis requests through Studio's resource-aware orchestrator to prevent resource contention.
- Provide a simple, well-documented API that developers can adopt with minimal effort.
- Keep the API local-only by default for security and privacy.

## 2. Why This Matters

Setting up a TTS engine from scratch requires installing Python dependencies, downloading models, configuring CUDA, managing voice references, and handling audio output. Studio already does all of this. By exposing an API, Studio becomes a practical TTS service that any local application can use, lowering the barrier to TTS adoption significantly.

Use cases:
- A game developer runs a local app that calls Studio's API to generate NPC dialogue.
- A content creator uses a script to batch-generate narration without opening the Studio UI.
- A developer testing a chatbot feeds text through Studio's API to produce voice responses.
- An automation tool generates audiobook chapters from a custom pipeline.

## 3. Architecture

### 3.1 Request Flow

```text
External App
    │
    ▼
Studio Process (FastAPI)
    │  /api/v1/tts/synthesize
    ▼
Orchestrator Queue
    │  ApiSynthesisTask (lower default priority)
    ▼
VoiceBridge (HTTP client)
    │
    ▼
TTS Server Process
    │  POST /synthesize
    ▼
Plugin Engine
    │
    ▼
Audio File → returned to caller
```

### 3.2 Key Design Points

- **API routes live in Studio**, not in the TTS Server. Studio handles authentication, rate limiting, and queue scheduling.
- **API requests enter the orchestrator queue** like any other task. They are not direct passthrough to the TTS Server.
- **Preview requests bypass the queue** and go directly to the TTS Server for fast feedback. Preview is limited to short text.
- **The TTS Server is internal**. External apps never talk to the TTS Server directly — they go through Studio's API.

## 4. API Endpoints

### 4.1 Engine Discovery

```text
GET /api/v1/tts/engines
```

List all available TTS engines with their health status, capabilities, and settings schemas.

Response:
```json
{
  "engines": [
    {
      "engine_id": "xtts",
      "display_name": "XTTS",
      "version": "2.0.1",
      "status": "ready",
      "verified": true,
      "local": true,
      "cloud": false,
      "languages": ["en", "es"],
      "capabilities": ["synthesis", "preview"]
    },
    {
      "engine_id": "voxtral",
      "display_name": "Voxtral",
      "version": "1.0.0",
      "status": "needs_setup",
      "verified": false,
      "local": false,
      "cloud": true,
      "languages": ["en", "es", "fr", "de", "ja"]
    }
  ]
}
```

### 4.2 Engine Detail

```text
GET /api/v1/tts/engines/{engine_id}
```

Get detailed information about a specific engine, including its settings schema.

Response:
```json
{
  "engine_id": "xtts",
  "display_name": "XTTS",
  "version": "2.0.1",
  "status": "ready",
  "verified": true,
  "local": true,
  "cloud": false,
  "languages": ["en", "es"],
  "capabilities": ["synthesis", "preview"],
  "resource": { "gpu": true, "vram_mb": 2048 },
  "settings_schema": {
    "type": "object",
    "properties": {
      "temperature": { "type": "number", "default": 0.7 },
      "repetition_penalty": { "type": "number", "default": 2.0 }
    }
  },
  "current_settings": {
    "temperature": 0.7,
    "repetition_penalty": 2.0
  }
}
```

### 4.3 Synthesis

```text
POST /api/v1/tts/synthesize
```

Submit a synthesis request. For short text (under the preview threshold), returns audio inline. For longer text, enqueues a job and returns a job ID.

Request body:
```json
{
  "engine_id": "xtts",
  "text": "Hello, this is a test of the TTS API.",
  "voice_ref": "base64-encoded-wav-or-path",
  "output_format": "wav",
  "language": "en",
  "settings": {
    "temperature": 0.8
  }
}
```

Short text response (inline audio):
```
HTTP 200
Content-Type: audio/wav
Content-Disposition: attachment; filename="tts_output.wav"

<binary audio data>
```

Long text response (queued):
```json
{
  "job_id": "tts_api_abc123",
  "status": "queued",
  "estimated_wait_seconds": 30,
  "poll_url": "/api/v1/tts/jobs/tts_api_abc123"
}
```

### 4.4 Preview

```text
POST /api/v1/tts/preview
```

Quick preview synthesis for short text. Bypasses the queue for fast feedback.

Request body: same as synthesis.

Constraints:
- Text must be under 500 characters
- Always returns inline audio (never queued)
- Uses preview mode if the engine supports it

Response:
```
HTTP 200
Content-Type: audio/wav
<binary audio data>
```

### 4.5 Job Status

```text
GET /api/v1/tts/jobs/{job_id}
```

Poll the status of a queued synthesis job.

Response:
```json
{
  "job_id": "tts_api_abc123",
  "status": "completed",
  "created_at": "2026-04-14T12:00:00Z",
  "completed_at": "2026-04-14T12:00:32Z",
  "duration_sec": 4.2,
  "download_url": "/api/v1/tts/jobs/tts_api_abc123/audio"
}
```

Status values: `queued`, `running`, `completed`, `failed`

### 4.6 Job Audio Download

```text
GET /api/v1/tts/jobs/{job_id}/audio
```

Download the audio output of a completed job.

Response:
```
HTTP 200
Content-Type: audio/wav
<binary audio data>
```

Audio files are available for download for 1 hour after completion, then cleaned up automatically.

## 5. Queue Integration

### 5.1 ApiSynthesisTask

API synthesis requests are modeled as `ApiSynthesisTask` in the orchestrator:

```python
class ApiSynthesisTask(StudioTask):
    job_type = "api_synthesis"
    resource_claim = ResourceClaim(gpu=1)  # Inherits from engine's resource profile
    priority = PRIORITY_API  # Configurable, default lower than UI tasks
```

### 5.2 Priority Policy

The scheduler supports three priority modes for API vs. UI tasks, configurable in Settings → API:

| Mode | Behavior |
|------|----------|
| `studio_first` (default) | Studio UI synthesis tasks always run before API tasks |
| `equal` | FIFO ordering regardless of source |
| `api_first` | API tasks take priority (for TTS gateway use cases) |

### 5.3 Queue Visibility

API tasks appear in the Studio queue UI with a distinct badge so users can see what is consuming resources:

- Badge: `API` label on the task card
- Source info: `"source": "api"` in the task metadata
- Cancellable: Users can cancel API tasks from the queue UI

## 6. Authentication

### 6.1 Default: No Authentication

When running locally for personal use, no authentication is required. The API binds to `127.0.0.1` only.

### 6.2 Optional: API Key

For multi-app scenarios or LAN access, an optional API key can be configured:

- Set in Settings → API → API Key
- Sent as `Authorization: Bearer <key>` header
- Stored in Studio's settings database (hashed)
- When enabled, all `/api/v1/tts/` endpoints require the key

### 6.3 Network Binding

| Setting | Bind Address | Who Can Access |
|---------|-------------|---------------|
| `local_only` (default) | `127.0.0.1` | Only the local machine |
| `lan` | `0.0.0.0` | Any device on the LAN (API key recommended) |

Configurable in Settings → API.

## 7. Rate Limiting

### 7.1 Queue-Based Limiting

The primary rate limit is the orchestrator's resource-aware scheduling. Only one GPU-heavy task runs at a time (by default). API tasks enter the same queue as UI tasks.

### 7.2 Request-Level Throttle

To prevent request flooding:
- Maximum 10 pending API synthesis jobs per source (configurable)
- If the limit is reached, new requests return `HTTP 429 Too Many Requests`
- Preview requests have a separate limit: 5 per minute

## 8. Error Responses

All API errors use a consistent shape:

```json
{
  "error": "engine_not_ready",
  "message": "XTTS engine is not ready. Status: needs_setup.",
  "engine_id": "xtts"
}
```

### 8.1 Error Codes

| HTTP Status | Error Code | Meaning |
|-------------|-----------|---------|
| 400 | `invalid_request` | Missing or invalid request fields |
| 401 | `unauthorized` | API key required but not provided or invalid |
| 404 | `engine_not_found` | No engine with that ID |
| 404 | `job_not_found` | No job with that ID |
| 409 | `engine_not_ready` | Engine exists but cannot process requests |
| 410 | `audio_expired` | Job audio has been cleaned up |
| 422 | `text_too_long` | Text exceeds preview limit (for preview endpoint) |
| 429 | `rate_limited` | Too many pending jobs |
| 503 | `tts_server_unavailable` | TTS Server is down or restarting |

## 9. Output Formats

The API supports multiple output formats:

| Format | MIME Type | Notes |
|--------|----------|-------|
| `wav` (default) | `audio/wav` | Lossless, largest file |
| `mp3` | `audio/mpeg` | Compressed, requires ffmpeg |
| `ogg` | `audio/ogg` | Compressed, good quality/size tradeoff |

Format conversion is handled by Studio using ffmpeg after the TTS Server returns the raw WAV output. If the requested format requires ffmpeg and ffmpeg is not available, the API returns `wav` with a warning header.

## 10. API Documentation

The API is documented via OpenAPI (Swagger), auto-generated from FastAPI route definitions. The documentation is available at:

```text
GET /api/v1/tts/docs      # Swagger UI
GET /api/v1/tts/openapi    # OpenAPI JSON spec
```

This is a Phase 9 deliverable.

## 11. Implementation References

- `plans/v2_tts_server.md` — TTS Server process that executes synthesis
- `plans/v2_plugin_sdk.md` — plugin contract that engines implement
- `plans/v2_queuing_system.md` — orchestrator that schedules API tasks
- `plans/v2_settings_architecture.md` — API settings tab
- `plans/phases/phase_5_orchestrator.md` — Phase 5 deliverables including ApiSynthesisTask
- `plans/phases/phase_9_plugins_and_api.md` — Phase 9 deliverables including authentication and rate limiting

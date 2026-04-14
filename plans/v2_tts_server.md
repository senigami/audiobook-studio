# Proposal: TTS Server Architecture (Studio 2.0)

Synthesis execution will run in a dedicated subprocess managed by Studio. This document defines the process boundary, lifecycle, communication protocol, watchdog behavior, and plugin hosting responsibilities.

## 1. Why A Separate Process

The current architecture loads engine code (XTTS, Voxtral) in the same Python process as the Flask/FastAPI web server. This creates several problems that grow worse as the system adds more engines:

- A plugin segfault, CUDA out-of-memory error, or infinite loop kills the entire Studio.
- GPU memory and model weights share address space with the web server.
- There is no way to kill a stuck synthesis without restarting the whole application.
- External applications cannot use the synthesis engines without going through the Studio UI.

Running synthesis in a separate process solves all four problems and creates a clean boundary that the rest of the architecture can build on.

## 2. Process Architecture

### 2.1 Two-Process Model

```text
┌─────────────────────────────┐     HTTP over      ┌──────────────────────────────┐
│     Studio Process          │    127.0.0.1        │      TTS Server Process      │
│                             │  ◄──────────────►   │                              │
│  FastAPI web server         │                     │  Plugin discovery             │
│  VoiceBridge (HTTP client)  │                     │  Engine loading               │
│  Orchestrator / Queue       │                     │  Synthesis execution          │
│  Watchdog health monitor    │                     │  Settings management          │
│  Frontend serving           │                     │  Health endpoint              │
│  Domain services            │                     │                              │
└─────────────────────────────┘                     └──────────────────────────────┘
```

### 2.2 Responsibilities

#### Studio Process Owns

- User-facing web server and API routes
- VoiceBridge as an HTTP client to the TTS Server
- Orchestrator that decides when to submit synthesis work
- Queue scheduling, priority policies, and resource claims
- Watchdog that monitors TTS Server health
- Domain services (projects, chapters, voices, artifacts)
- Artifact publication after synthesis completes
- Frontend serving and WebSocket event broadcasting

#### TTS Server Process Owns

- Plugin directory scanning and engine discovery
- Manifest validation and engine class loading
- Engine environment validation
- Verification synthesis on first load
- Synthesis execution (calling engine adapters)
- Preview execution (lightweight test synthesis)
- Per-engine settings storage and retrieval
- GPU memory and model weight management
- Graceful shutdown and resource release

### 2.3 What Crosses The Boundary

| Direction | Data | Format |
|-----------|------|--------|
| Studio → TTS Server | Synthesis request (text, voice ref, engine settings, output path) | HTTP POST JSON |
| TTS Server → Studio | Synthesis result (status, output path, duration, warnings) | HTTP response JSON |
| Studio → TTS Server | Health check | HTTP GET |
| TTS Server → Studio | Health report (per-engine status) | HTTP response JSON |
| Studio → TTS Server | Settings update | HTTP PUT JSON |
| TTS Server → Studio | Current settings | HTTP GET response JSON |

Audio files are written to a shared temp directory on the local filesystem. The TTS Server writes audio to a temp path, returns the path in the result, and Studio publishes the artifact through its normal domain and cache pipeline.

## 3. TTS Server Lifecycle

### 3.1 Startup Sequence

1. Studio process starts (`run.py`)
2. Studio spawns TTS Server as a subprocess: `python -u tts_server.py --port PORT`
3. TTS Server scans `plugins/tts_*/` folders
4. TTS Server loads manifests, imports engine classes
5. TTS Server calls `check_env()` on each engine
6. TTS Server runs verification synthesis for each engine
7. TTS Server starts HTTP server on `127.0.0.1:PORT`
8. TTS Server writes `READY` to stdout
9. Studio's watchdog begins heartbeat polling
10. Studio queries `/engines` to populate its registry cache

### 3.2 Port Assignment

The TTS Server uses a configurable port with a sensible default and auto-increment fallback:

- Default port: `7862`
- If `7862` is taken, try `7863`, `7864`, up to `7872`
- If all 10 ports fail, log an error and exit with a clear message
- Port is configurable via `--port` flag or `TTS_SERVER_PORT` environment variable
- Studio stores the assigned port after successful startup for subsequent API calls

### 3.3 Shutdown Sequence

When Studio shuts down:

1. Studio sends `SIGTERM` to the TTS Server process
2. TTS Server catches the signal and begins graceful shutdown
3. TTS Server calls `shutdown()` on each loaded engine (release GPU memory, close files)
4. TTS Server stops accepting new requests
5. TTS Server waits up to 10 seconds for in-progress synthesis to complete
6. TTS Server exits

If the TTS Server does not exit within 15 seconds of `SIGTERM`, Studio sends `SIGKILL`.

### 3.4 Restart After Crash

If the TTS Server process exits unexpectedly:

1. Watchdog detects process exit via `process.poll()`
2. Watchdog logs the exit code and stderr output
3. Watchdog waits for `RESTART_COOLDOWN` (10 seconds)
4. Watchdog spawns a new TTS Server subprocess
5. Watchdog resumes heartbeat polling
6. Studio re-fetches `/engines` to refresh its registry cache
7. Any in-flight synthesis tasks that were sent to the crashed server are marked as `failed` with a retriable reason
8. The orchestrator requeues retriable tasks

## 4. Watchdog

### 4.1 Purpose

The watchdog runs as a background thread in the Studio process. It monitors the TTS Server's health and takes corrective action when the server becomes unresponsive or crashes.

### 4.2 Heartbeat Protocol

- Poll interval: 5 seconds
- Endpoint: `GET /health`
- Timeout per request: 3 seconds
- Failure threshold: 3 consecutive failures before kill/restart
- Expected response: `{"status": "ok", "engines": [...]}`

### 4.3 Failure Detection

The watchdog distinguishes three failure modes:

| Failure Mode | Detection | Action |
|-------------|-----------|--------|
| **Process exit** | `process.poll()` returns non-None | Restart immediately after cooldown |
| **Unresponsive** | 3 consecutive heartbeat timeouts | `SIGTERM` → wait 5s → `SIGKILL` → restart |
| **Degraded** | `/health` returns `200` but individual engines report errors | Log warning, do not restart; mark affected engines as unavailable in Studio's registry cache |

### 4.4 Restart Limits

To prevent restart loops from a fundamentally broken configuration:

- Maximum 5 restarts within a 5-minute window
- If the limit is reached, the watchdog stops restarting and logs a critical error
- Studio's UI shows a clear error: "TTS Server has crashed repeatedly. Check your plugin configurations."
- The user can manually trigger a restart from Settings → TTS Engines

### 4.5 State Recovery After Restart

After a TTS Server restart:

1. All previously loaded plugins will be rediscovered and re-verified
2. Per-engine settings are reloaded from `plugins/tts_<name>/settings.json`
3. Studio's registry cache is fully refreshed
4. Any synthesis tasks that were in-flight when the crash occurred are already marked as failed by the orchestrator
5. The orchestrator decides whether to requeue those tasks based on retry policy

## 5. TTS Server Internal API

### 5.1 Endpoints

```text
GET  /health
     Response: {
       "status": "ok" | "degraded",
       "uptime_seconds": 142,
       "engines": [
         {"engine_id": "xtts", "status": "ready", "verified": true},
         {"engine_id": "voxtral", "status": "needs_setup", "verified": false}
       ]
     }

GET  /engines
     Response: [
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
         "resource": {"gpu": true, "vram_mb": 2048},
         "settings_schema": { ... }
       }
     ]

GET  /engines/{engine_id}
     Response: Single engine detail object (same shape as above)

GET  /engines/{engine_id}/settings
     Response: { "temperature": 0.7, "repetition_penalty": 2.0, ... }

PUT  /engines/{engine_id}/settings
     Body: { "temperature": 0.8 }
     Response: { "ok": true }

POST /synthesize
     Body: {
       "engine_id": "xtts",
       "text": "Hello world",
       "output_path": "/tmp/studio/synth_abc123.wav",
       "voice_ref": "/path/to/reference.wav",
       "settings": { "temperature": 0.7 },
       "language": "en"
     }
     Response: {
       "ok": true,
       "output_path": "/tmp/studio/synth_abc123.wav",
       "duration_sec": 2.3,
       "warnings": []
     }

POST /preview
     Body: Same as /synthesize
     Response: Same as /synthesize (but engine may use lighter processing)

POST /plugins/refresh
     Response: {
       "discovered": ["tts_xtts", "tts_voxtral", "tts_custom"],
       "loaded": ["tts_xtts", "tts_voxtral"],
       "failed": [{"plugin": "tts_custom", "reason": "Missing dependency: torch"}]
     }

POST /engines/{engine_id}/verify
     Response: {
       "ok": true,
       "duration_sec": 1.2,
       "output_path": "/tmp/studio/verify_xtts.wav"
     }
```

### 5.2 Error Responses

All errors use a consistent shape:

```json
{
  "ok": false,
  "error": "engine_not_ready",
  "message": "XTTS model file not found at plugins/tts_xtts/assets/model.pt",
  "engine_id": "xtts"
}
```

Error codes:
- `engine_not_found`: No plugin with that engine_id
- `engine_not_ready`: Engine loaded but environment check failed
- `engine_not_verified`: Engine environment OK but verification synthesis failed
- `invalid_request`: Missing or invalid request fields
- `synthesis_failed`: Engine threw an error during synthesis
- `server_busy`: Too many concurrent requests (should not happen if Studio orchestrator is working correctly)

## 6. Plugin Hosting

### 6.1 Discovery

On startup (or when `/plugins/refresh` is called):

1. List all directories in `plugins/` matching the pattern `tts_*`
2. For each directory, look for `manifest.json`
3. Validate manifest against the required schema
4. If `requirements.txt` exists, check whether dependencies are installed
5. If manifest is valid and dependencies are met, import the engine class specified by `entry_class`
6. Call `check_env()` on the engine instance
7. Run verification synthesis

### 6.2 Plugin Isolation

Each plugin is loaded in the TTS Server's process but with isolation boundaries:

- Each engine's `synthesize()` call is wrapped in a `try/except` that catches all exceptions
- Exceptions from one engine never propagate to affect other engines
- If an engine raises during synthesis, the error is returned in the result; the TTS Server stays alive
- If an engine causes a process-level crash (segfault, CUDA fatal), the watchdog restarts the entire TTS Server
- Engine imports are done lazily and wrapped; a bad import does not prevent other engines from loading

### 6.3 Settings Persistence

Per-engine settings are stored in each plugin's folder:

```text
plugins/tts_xtts/settings.json
plugins/tts_voxtral/settings.json
```

The TTS Server reads settings on startup and when `GET /engines/{id}/settings` is called. Settings are written when `PUT /engines/{id}/settings` is received from Studio.

Settings files use the JSON Schema defined in each plugin's `settings_schema.json` for validation. Invalid settings are rejected with a clear error message.

## 7. Verification Synthesis

### 7.1 Purpose

Verification synthesis runs a short test to confirm that an engine can actually produce audio, not just pass environment checks. An engine might have valid CUDA drivers but a corrupted model file, for example.

### 7.2 Procedure

1. Read the `test_text` field from the plugin's manifest (optional)
2. If no `test_text`, use the default: `"This is a verification test."`
3. Create a temp output path for the verification audio
4. Call `engine.synthesize()` with the test text and default settings
5. Verify the output file exists and is a valid audio file (non-zero size, valid header)
6. Record the verification result and duration
7. Clean up the temp file

### 7.3 Verification States

- `verified`: Environment OK and test synthesis produced valid audio
- `unverified`: Environment OK but test synthesis failed or produced invalid output
- `invalid_config`: Environment check failed (missing deps, bad paths, etc.)
- `not_loaded`: Manifest invalid or engine class could not be imported

### 7.4 Re-Verification

Users can re-verify an engine at any time from Settings → TTS Engines → engine card → "Verify" button. This calls `POST /engines/{id}/verify` on the TTS Server.

Re-verification is also triggered automatically after:
- Plugin settings are changed
- Dependencies are installed
- TTS Server is restarted

## 8. Temp File And Output Path Contract

### 8.1 Shared Temp Directory

Studio and TTS Server share a temp directory for synthesis output:

```text
<studio_root>/temp/tts/
```

Studio creates the directory on startup. Studio generates unique filenames and passes them as `output_path` in synthesis requests. The TTS Server writes to these paths but never creates paths on its own.

### 8.2 Ownership Transfer

1. Studio generates `output_path` and sends it in the request
2. TTS Server writes audio to `output_path`
3. TTS Server returns the path in the result
4. Studio validates the file (exists, non-zero, valid audio header)
5. Studio publishes the artifact through its normal domain pipeline
6. Studio deletes or archives the temp file after publication

This keeps path ownership in Studio where the domain service and artifact publication rules apply, consistent with the backend paths rules.

## 9. Known Risks And Planned Solutions

- **Risk: Port conflicts in shared environments**
  Solution: Auto-increment port with configurable override.

- **Risk: Watchdog restart loop from bad plugin**
  Solution: 5-restart-in-5-minutes circuit breaker. User must fix and manually restart.

- **Risk: Temp file accumulation from crashed synthesis**
  Solution: Studio cleans stale temp files on startup (files older than 1 hour in `temp/tts/`).

- **Risk: Plugin import takes too long (large model loading)**
  Solution: Import timeout per plugin (configurable, default 120 seconds). Plugins that exceed the timeout are marked `not_loaded` with a clear message.

- **Risk: Windows subprocess management differences**
  Solution: Use `subprocess.Popen` with `CREATE_NEW_PROCESS_GROUP` on Windows for clean signal handling. Test on Windows CI.

## 10. Implementation References

- `plans/v2_plugin_sdk.md` — plugin contract and packaging
- `plans/v2_voice_system_interface.md` — engine contract and bridge architecture
- `plans/v2_local_tts_api.md` — external API that proxies through the TTS Server
- `plans/phases/phase_5_orchestrator.md` — Phase 5 deliverables that include TTS Server setup
- `plans/implementation/voice_engine_impl.md` — file-level implementation blueprint

# Plugin Interface Template

Audiobook Studio 2.0 — skeleton standalone plugin repo for third-party authors.
Copy the files in §1 into a new GitHub repo and fill in the stubs.

---

## 1. Template File Tree

```
studio-tts-myplugin/               ← your GitHub repo root
├── manifest.json
├── settings_schema.json
├── requirements.txt
├── README.md
├── plugin/
│   ├── server/
│   │   ├── __init__.py
│   │   └── engine.py
│   └── studio/
│       ├── __init__.py
│       └── handler.py
└── assets/
    └── .gitkeep
```

---

## 2. `manifest.json`

```json
{
  "studio_tts_manifest": "1.0",
  "contract_version": "1.0",
  "sdk_version": "1.0",
  "settings_schema_version": "1.0",
  "event_envelope_version": "1.0",
  "engine_id": "myplugin",
  "display_name": "My TTS Plugin",
  "version": "0.1.0",
  "min_studio": "2.0.0",
  "entry_class": "plugin.server.engine:MyEngine",
  "capabilities": ["synthesis", "preview"],
  "languages": ["en"],
  "resource": {
    "gpu": false,
    "vram_mb": 0,
    "cpu_heavy": false
  },
  "local": true,
  "cloud": false,
  "network": false,
  "worker_logic": {
    "kind_handlers": {
      "synthesis": "plugin.studio.handler:handle_job"
    }
  },
  "author": "your-github-username",
  "license": "MIT",
  "homepage": "https://github.com/your-org/studio-tts-myplugin",
  "test_text": "This is a verification test.",
  "dev": {
    "enabled": false
  }
}
```

**Key validation rules enforced by the plugin loader (at load time):**
- `studio_tts_manifest`, `contract_version`, `sdk_version`,
  `settings_schema_version`, and `event_envelope_version` must each be `"1.0"`.
  A missing or unsupported version fails discovery — these are how future
  contract revisions coexist with 2.0 plugins after release. See doc 02 §4.2.
- `engine_id` must match `^[a-z][a-z0-9]{1,14}$`.
- `entry_class` must be `"module.path:ClassName"`.
- `capabilities` must include `"synthesis"`.
- `worker_logic` handler values must be `"module.path:function_name"`.

---

## 3. `settings_schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "My Plugin Settings",
  "type": "object",
  "properties": {
    "model_path": {
      "type": "string",
      "title": "Model Path",
      "description": "Absolute path to your model file.",
      "default": "",
      "x-ui": {
        "widget": "file-picker",
        "accept": ".bin,.onnx,.pt",
        "placeholder": "/path/to/model.bin"
      }
    },
    "speed": {
      "type": "number",
      "title": "Speed",
      "description": "Speech rate multiplier. 1.0 = normal.",
      "default": 1.0,
      "minimum": 0.5,
      "maximum": 2.0,
      "x-ui": {
        "widget": "slider",
        "step": 0.05
      }
    }
  },
  "required": []
}
```

---

## 4. `requirements.txt`

```
# List your pip dependencies here.
# The plugin loader checks these are installed at discovery time.
# It does NOT auto-install them — document the install step in README.md.
#
# Example:
# numpy>=1.24
# torch>=2.0
# soundfile>=0.12
```

---

## 5. `plugin/server/engine.py`

```python
"""My TTS Plugin — server-side engine.

This file runs inside the TTS Server subprocess. It must NOT import anything
from app.* (Studio internals). Only stdlib, declared dependencies in
requirements.txt, and studio_plugin_sdk types are permitted.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

# SDK types — the only Studio import allowed in this file.
from studio_plugin_sdk import (
    StudioTTSEngine,
    TTSRequest,
    TTSResult,
    TimingEvent,
    VerificationResult,
    VoiceProcessingHooks,
)


class MyEngine(StudioTTSEngine):
    """Concrete TTS engine implementation.

    Replace every `...` and every `raise NotImplementedError` with your real
    implementation.
    """

    # ------------------------------------------------------------------
    # REQUIRED: info
    # ------------------------------------------------------------------

    def info(self) -> dict[str, Any]:
        """Return runtime metadata for the /engines registry endpoint.

        Called once during plugin discovery, merged with manifest.json data.
        Do NOT load models here. Return lightweight diagnostic info only.

        Example keys: detected model path, GPU device name, library version.

        Returns:
            dict[str, Any]: Runtime metadata dict. May be empty {}.
        """
        return {
            "library_version": "0.0.0",          # replace with your library's version
            "model_detected": False,              # set True if model file found
        }

    # ------------------------------------------------------------------
    # REQUIRED: check_env
    # ------------------------------------------------------------------

    def check_env(self) -> tuple[bool, str]:
        """Check whether this engine can run in the current environment.

        Called during plugin discovery and re-verification. Must be FAST —
        do not load models or allocate GPU memory.

        Typical checks:
        - Is the required library installed and importable?
        - Is the model file present at the configured path?
        - Is a required API key set?

        Returns:
            tuple[bool, str]:
                (True, 'OK') — environment is valid, engine can synthesize.
                (False, reason) — user must fix the setup before using this engine.
        """
        # Example: check a required library is importable.
        try:
            import numpy  # noqa: F401 — replace with your actual dependency
        except ImportError:
            return False, "numpy is not installed. Run: pip install numpy"

        # Example: check a model file exists.
        model_path = self._get_model_path()
        if model_path and not Path(model_path).is_file():
            return False, f"Model file not found: {model_path}"

        return True, "OK"

    # ------------------------------------------------------------------
    # REQUIRED: check_request
    # ------------------------------------------------------------------

    def check_request(self, req: TTSRequest) -> tuple[bool, str]:
        """Pre-flight validation before synthesize() or preview() is called.

        Called before every synthesis. Must be FAST — no I/O beyond path
        existence checks.

        Args:
            req: The immutable TTSRequest about to be synthesized.
                 req.text — the text to speak.
                 req.output_path — where to write audio.
                 req.voice_ref — optional reference WAV path for voice cloning.
                 req.settings — engine settings from settings.json.
                 req.language — BCP-47 language code.

        Returns:
            tuple[bool, str]:
                (True, 'OK') — request is valid.
                (False, reason) — synthesis should be skipped.
        """
        if not req.text.strip():
            return False, "Text is empty."

        if req.voice_ref and not Path(req.voice_ref).is_file():
            return False, f"voice_ref file not found: {req.voice_ref}"

        return True, "OK"

    # ------------------------------------------------------------------
    # REQUIRED: synthesize
    # ------------------------------------------------------------------

    def synthesize(self, req: TTSRequest) -> TTSResult:
        """Synthesize audio and write it to req.output_path.

        This is the core method. On success, write a valid WAV (or MP3) file
        to req.output_path and return TTSResult(ok=True, output_path=...).
        On failure, return TTSResult(ok=False, error=...) — do NOT raise.

        Cancellation: call req.cancel_check() at each natural checkpoint
        (after each segment or chunk). Return TTSResult(ok=False,
        error='Cancelled') immediately when it returns True.

        Timing events: call req.on_timing_event(TimingEvent(...)) at each
        phase transition so Studio can build accurate ETAs. See TimingEvent
        event_name literals in the contract doc.

        Args:
            req: Immutable synthesis request.
                 req.text — text to synthesize (pre-cleaned by Studio).
                 req.output_path — absolute path; you must write here.
                 req.voice_ref — optional reference WAV for voice cloning.
                 req.settings — your engine's settings dict.
                 req.language — BCP-47 code e.g. "en".
                 req.script — optional list of segment dicts for batch mode.
                 req.cancel_check — callable; returns True if cancelled.
                 req.on_timing_event — callable; emit timing anchors here.

        Returns:
            TTSResult:
                .ok — True iff audio was written successfully.
                .output_path — same as req.output_path on success.
                .duration_sec — audio duration if known, else None.
                .warnings — list of non-fatal warning strings.
                .error — error message if ok=False.
        """
        import time

        # Emit timing anchor: engine is now active.
        if req.on_timing_event:
            req.on_timing_event(TimingEvent(
                event_name='engine_activity_started',
                timestamp=time.time(),
            ))

        # Check cancellation before starting.
        if req.cancel_check and req.cancel_check():
            return TTSResult(ok=False, error="Cancelled")

        # Emit timing anchor: chapter render begins. The TTS Server requires
        # both chapter_render_started and chapter_render_completed to build a
        # TTSTimingResult (see contract doc 02 §2.6) — always emit the pair.
        if req.on_timing_event:
            req.on_timing_event(TimingEvent(
                event_name='chapter_render_started',
                timestamp=time.time(),
            ))

        try:
            # ----------------------------------------------------------
            # TODO: Replace this block with your actual synthesis logic.
            # ----------------------------------------------------------
            output_path = req.output_path

            # Example: write a silent WAV placeholder (remove in real impl).
            _write_silent_wav(output_path, duration_sec=1.0)

            # Emit timing anchor: synthesis complete.
            if req.on_timing_event:
                req.on_timing_event(TimingEvent(
                    event_name='chapter_render_completed',
                    timestamp=time.time(),
                ))

            return TTSResult(
                ok=True,
                output_path=output_path,
                duration_sec=1.0,   # replace with real duration
            )

        except Exception as exc:
            return TTSResult(ok=False, error=str(exc))

    # ------------------------------------------------------------------
    # REQUIRED: settings_schema
    # ------------------------------------------------------------------

    def settings_schema(self) -> dict[str, Any]:
        """Return JSON Schema for this engine's configurable settings.

        The TTS Server uses this to validate settings updates. Studio Settings
        UI renders form controls from the schema. The schema should match
        settings_schema.json in the plugin folder — return the same dict.

        Returns:
            dict[str, Any]: JSON Schema Draft 7 object.
        """
        # Simplest approach: load from the bundled file.
        schema_path = Path(__file__).parent.parent.parent / "settings_schema.json"
        if schema_path.is_file():
            import json
            return json.loads(schema_path.read_text(encoding="utf-8"))
        return {}

    # ------------------------------------------------------------------
    # OPTIONAL: verify
    # ------------------------------------------------------------------

    def verify(self, req: TTSRequest) -> VerificationResult:
        """Fast readiness check without rendering audio.

        Override to support the "Verify" button in Studio Settings. Should
        complete in under 5 seconds without loading the full model.

        Returns:
            VerificationResult:
                .ok — True iff the engine is fully ready.
                .message — human-readable status or error.
                .details — optional dict with extra info.
        """
        ok, msg = self.check_env()
        return VerificationResult(ok=ok, message=msg)

    # ------------------------------------------------------------------
    # OPTIONAL: run_test
    # ------------------------------------------------------------------

    def run_test(self) -> VerificationResult:
        """Full end-to-end synthesis test using bundled test assets.

        Called by the Settings UI "Run Test" action. Write output to
        assets/test_output.wav inside the plugin folder. Must be fully
        self-contained — do not depend on user-provided voice profiles.

        Returns:
            VerificationResult: ok=True iff test synthesis succeeded.
        """
        import tempfile, time

        test_req = TTSRequest(
            text=self._get_test_text(),
            output_path=str(
                Path(__file__).parent.parent.parent / "assets" / "test_output.wav"
            ),
            language="en",
        )

        # Reuse check_request for fast pre-flight.
        ok, msg = self.check_request(test_req)
        if not ok:
            return VerificationResult(ok=False, message=f"check_request failed: {msg}")

        result = self.synthesize(test_req)
        if result.ok:
            return VerificationResult(ok=True, message="Test synthesis succeeded.")
        return VerificationResult(ok=False, message=result.error or "Unknown error")

    # ------------------------------------------------------------------
    # OPTIONAL: preview
    # ------------------------------------------------------------------

    def preview(self, req: TTSRequest) -> TTSResult:
        """Lightweight preview synthesis.

        Override if you can offer a faster/lower-quality preview mode.
        Default implementation calls synthesize() — only override if you
        have a genuine faster path.

        Args:
            req: Same as synthesize().

        Returns:
            TTSResult: Same contract as synthesize().
        """
        return self.synthesize(req)

    # ------------------------------------------------------------------
    # OPTIONAL: check_output  (planned Phase 12 contract method)
    # ------------------------------------------------------------------

    def check_output(self, req: TTSRequest, result: TTSResult) -> tuple[bool, str]:
        """Validate rendered artifact quality after synthesis.

        Called by the Studio reconcile pass after synthesize() returns ok=True.
        Override to detect silence, truncation, or speaker mismatch.

        Args:
            req:    The original TTSRequest.
            result: The TTSResult returned by synthesize().

        Returns:
            tuple[bool, str]:
                (True, 'OK') — artifact passes QA; keep it.
                (False, reason) — artifact is bad; discard and re-queue.
        """
        return True, "OK"

    # ------------------------------------------------------------------
    # OPTIONAL: hooks
    # ------------------------------------------------------------------

    def hooks(self) -> VoiceProcessingHooks:
        """Return processing hooks for request planning and postprocessing.

        Override to customize chunking policy, voice selection, or apply
        post-synthesis effects. Default returns a no-op VoiceProcessingHooks.
        """
        return VoiceProcessingHooks()

    # ------------------------------------------------------------------
    # OPTIONAL: shutdown
    # ------------------------------------------------------------------

    def shutdown(self) -> None:
        """Release resources when the engine is unloaded.

        Called by the TTS Server during graceful shutdown or plugin reload.
        Release GPU memory, close file handles, disconnect API clients, etc.
        """
        pass

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_model_path(self) -> str | None:
        """Read model_path from settings; return None if not configured.

        Settings live OUTSIDE the plugin source tree at
        plugin_data/<engine_id>/settings.json (see contract doc 02 §4.5) and are
        normally injected via TTSRequest.settings during synthesize/preview.
        check_env() runs before any TTSRequest exists, so the TTS Server passes
        the settings directory via the STUDIO_PLUGIN_DATA_DIR environment
        variable. Never hardcode a relative ``../../..`` walk — the plugin tree
        is deletable and re-clonable and must not contain mutable state.
        """
        data_dir = os.environ.get("STUDIO_PLUGIN_DATA_DIR")
        if not data_dir:
            return None
        settings_path = Path(data_dir) / "settings.json"
        if settings_path.is_file():
            import json
            data = json.loads(settings_path.read_text(encoding="utf-8"))
            return data.get("model_path")
        return None

    def _get_test_text(self) -> str:
        return "This is an automated synthesis test. The engine is working correctly."


def _write_silent_wav(output_path: str, duration_sec: float = 1.0) -> None:
    """Write a silent WAV file for placeholder/testing purposes.

    Remove this function and replace with real synthesis in your implementation.
    """
    import struct, wave
    sample_rate = 22050
    num_samples = int(sample_rate * duration_sec)
    with wave.open(output_path, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack('<' + 'h' * num_samples, *([0] * num_samples)))
```

---

## 6. `plugin/studio/handler.py`

```python
"""My TTS Plugin — studio-side job handler.

This file runs inside the Studio process (FastAPI). It receives a
StudioPluginContext and a JobSpec at dispatch time.

IMPORTANT: Do NOT import from app.* here. Only stdlib, declared dependencies,
and studio_plugin_sdk are allowed. All interaction with Studio internals goes
through ctx.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from studio_plugin_sdk import (
    StudioPluginContext,
    JobSpec,
    JobResult,
)


def handle_job(ctx: StudioPluginContext, job: JobSpec) -> JobResult:
    """Main entry point for synthesis jobs dispatched to this plugin.

    Called by the Studio job dispatcher when a job is assigned to this engine.
    The function must:
    1. Update job status to 'running' at the start.
    2. Build the synthesis script (text + voice inputs per segment group).
    3. Call ctx.generate_via_bridge() to send the request to the TTS Server.
    4. Emit segment events via ctx.emit_segment_* as the bridge reports progress.
    5. Update job status to 'done' or 'failed' at the end.
    6. Return a JobResult reflecting the terminal state.

    Args:
        ctx: StudioPluginContext — all Studio services are accessed through this.
             See the communication contract doc for the full API surface.
        job: JobSpec — immutable snapshot of the dispatched job.
             job.id — job ID string.
             job.engine — engine ID ("myplugin").
             job.kind — JobKind literal ("synthesis", "voice_build", etc.).
             job.chapter_id — chapter being rendered, or None.
             job.project_id — parent project, or None.
             job.segment_ids — specific segment IDs if a partial re-render,
                               or None for a full chapter render.
             job.speaker_profile — default speaker profile name.
             job.is_bake — True if this is a stitch/bake job.
             job.make_mp3 — True if MP3 output is required.
             job.safe_mode — True if text sanitization is enabled.
             job.extra — engine-specific fields.

    Returns:
        JobResult:
            .status — "done" | "failed" | "cancelled"
            .error — error message when status=="failed"
            .output_wav — filename of the output WAV (not full path)
            .output_mp3 — filename of the output MP3, if produced
            .progress — final progress value (typically 1.0)
    """
    start = time.time()

    # Step 1: Mark the job as running.
    ctx.update_job_progress(
        job.id,
        status="running",
        progress=0.0,
    )

    # Step 2: Check for cancellation before doing any work.
    if ctx.is_cancelled(job.id):
        ctx.update_job_progress(job.id, status="cancelled", progress=1.0, finished_at=time.time())
        return JobResult(status="cancelled")

    # Step 3: Resolve output paths.
    # Plugin data directory for this job's output files.
    # Convention: job output lives under plugin_data/<engine_id>/<job_id>/
    output_dir = Path(ctx.get_plugin_data_dir()) / job.id
    output_dir.mkdir(parents=True, exist_ok=True)
    out_wav = output_dir / "output.wav"
    out_mp3 = output_dir / "output.mp3"

    # Step 4: If segment-level render, route to the segment handler.
    if job.segment_ids:
        return _handle_segment_job(ctx, job, output_dir)

    # Step 5: Full chapter render — load segments and build synthesis script.
    if job.chapter_id:
        segments = ctx.get_chapter_segments(job.chapter_id)
    else:
        segments = []

    # Build the script: one entry per text chunk / render group.
    # See ctx.build_chunk_groups() to group by speaker and character limit.
    behavior = ctx.get_behavior("myplugin")
    groups = ctx.build_chunk_groups(segments, char_limit=behavior.sent_char_limit)

    full_script = []
    for group in groups:
        profile_name = group[0].get("speaker_profile_name") or job.speaker_profile
        speaker_wavs = ctx.get_speaker_wavs(profile_name) if profile_name else []
        combined_text = " ".join(s["text_content"] for s in group)
        first_seg_id = group[0]["id"]
        seg_out = output_dir / "segments" / f"{first_seg_id}.wav"
        seg_out.parent.mkdir(parents=True, exist_ok=True)
        script_entry: dict[str, Any] = {
            "text": combined_text,
            "save_path": str(seg_out),
            "id": first_seg_id,
        }
        if speaker_wavs:
            script_entry["speaker_wav"] = speaker_wavs[0]
        full_script.append(script_entry)

    # Step 6: Track completion counts for progress updates.
    completed = [0]
    total = len(full_script)

    def on_output(line: str) -> None:
        """Parse TTS Server stdout markers and emit Studio events."""
        # Route raw log lines to the diagnostics panel.
        ctx.log(line.rstrip(), level="debug", job_id=job.id, engine_id="myplugin")

        if "[START_SEGMENT]" in line:
            seg_id = line.split("[START_SEGMENT]")[1].strip()
            if job.chapter_id:
                ctx.emit_segment_started(job.chapter_id, seg_id, job.id)
            ctx.update_job_progress(
                job.id,
                progress=completed[0] / total if total else 0.0,
                active_segment_id=seg_id,
            )

        if "[SEGMENT_SAVED]" in line:
            saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
            # Find the group for this path and mark all its segments done.
            completed[0] += 1
            progress = completed[0] / total if total else 1.0
            ctx.update_job_progress(job.id, progress=progress)

        if "[PROGRESS]" in line:
            try:
                pct = float(line.split("[PROGRESS]")[1].split("%")[0].strip())
                base = (completed[0] / total) if total else 0.0
                seg_frac = pct / 100.0 / total if total else 0.0
                ctx.update_job_progress(job.id, progress=base + seg_frac)
            except (ValueError, IndexError):
                pass

    # Step 7: Send synthesis request to the TTS Server via bridge.
    try:
        rc = ctx.generate_via_bridge(
            engine="myplugin",
            text="",                            # ignored when script is provided
            out_wav=out_wav,
            profile_name=job.speaker_profile,
            on_output=on_output,
            cancel_check=lambda: ctx.is_cancelled(job.id),
            speed=1.0,
            script=full_script,
            task_id=job.id,
        )
    except Exception as exc:
        ctx.log(f"Bridge error: {exc}", level="error", job_id=job.id)
        ctx.update_job_progress(
            job.id, status="failed", progress=1.0, error=str(exc), finished_at=time.time()
        )
        return JobResult(status="failed", error=str(exc))

    # Step 8: Check for cancellation after bridge returns.
    if ctx.is_cancelled(job.id):
        ctx.update_job_progress(job.id, status="cancelled", progress=1.0, finished_at=time.time())
        return JobResult(status="cancelled")

    if rc != 0 or not out_wav.exists():
        error = f"Synthesis failed (bridge rc={rc})."
        ctx.update_job_progress(
            job.id, status="failed", progress=1.0, error=error, finished_at=time.time()
        )
        return JobResult(status="failed", error=error)

    # Step 9: Broadcast segment list invalidation so the chapter editor refreshes.
    if job.chapter_id:
        ctx.broadcast_segments_updated(job.chapter_id)

    # Step 10: Mark done.
    ctx.update_job_progress(
        job.id,
        status="done",
        progress=1.0,
        output_wav=out_wav.name,
        finished_at=time.time(),
    )
    return JobResult(status="done", output_wav=out_wav.name, progress=1.0)


def _handle_segment_job(
    ctx: StudioPluginContext,
    job: JobSpec,
    output_dir: Path,
) -> JobResult:
    """Handle a partial segment re-render job.

    Called when job.segment_ids is not None — only the listed segments should
    be re-synthesized.

    Args:
        ctx: StudioPluginContext.
        job: JobSpec with job.segment_ids populated.
        output_dir: Directory for output files.

    Returns:
        JobResult with terminal state.
    """
    # TODO: implement segment-level re-render using the same bridge pattern
    # as handle_job but scoped to job.segment_ids only.
    ctx.log("Segment re-render not yet implemented.", level="warning", job_id=job.id)
    ctx.update_job_progress(
        job.id, status="failed", progress=1.0,
        error="Segment re-render not implemented.", finished_at=time.time()
    )
    return JobResult(status="failed", error="Segment re-render not implemented.")
```

---

## 7. `README.md`

````markdown
# studio-tts-myplugin

A TTS engine plugin for [Audiobook Studio 2.0](https://github.com/your-org/audiobook-factory).

## Plugin Author Checklist

Work through this list in order. Each item has an acceptance test.

### A. Manifest and schema

- [ ] `manifest.json` — `engine_id` matches `^[a-z][a-z0-9]{1,14}$`.
- [ ] `manifest.json` — `entry_class` matches `plugin.server.engine:MyEngine`.
- [ ] `manifest.json` — `capabilities` includes `"synthesis"`.
- [ ] `manifest.json` — `worker_logic.kind_handlers.synthesis` points to your handler.
- [ ] `settings_schema.json` — valid JSON Schema Draft 7. At minimum one property.

**Test:** Place the folder as `plugins/tts_myplugin/` and run Studio. The
plugin should appear in Settings → Engines without a red error badge.

### B. Server-side engine (`plugin/server/engine.py`)

Implement these 5 required methods:

- [ ] `info()` — returns a dict (may be `{}`).
- [ ] `check_env()` — returns `(True, 'OK')` or `(False, reason)`. No model loads.
- [ ] `check_request(req)` — validates text, voice_ref, settings. Fast.
- [ ] `synthesize(req)` — writes audio to `req.output_path`. Returns `TTSResult`.
- [ ] `settings_schema()` — returns the JSON Schema dict.

**Test:** In the TTS Server environment, instantiate your class and call
`check_env()`. It must return `(True, 'OK')` with your model configured.

Then call `synthesize()` with a test `TTSRequest`. A WAV file must appear at
`req.output_path`.

### C. Synthesis events (inside `synthesize`)

Emit these timing events so Studio can display accurate ETAs:

- [ ] `engine_activity_started` — before any audio work begins.
- [ ] `segment_render_started` — when each segment starts (if batch mode).
- [ ] `segment_render_completed` — when each segment is written to disk.
- [ ] `chapter_render_completed` — after all segments are done.

Call `req.cancel_check()` after each segment. Return
`TTSResult(ok=False, error='Cancelled')` immediately when it returns `True`.

### D. Studio-side handler (`plugin/studio/handler.py`)

- [ ] `handle_job(ctx, job)` updates job status to `'running'` at start.
- [ ] `handle_job(ctx, job)` calls `ctx.generate_via_bridge(...)`.
- [ ] `handle_job(ctx, job)` emits `ctx.emit_segment_started/saved` per segment.
- [ ] `handle_job(ctx, job)` calls `ctx.broadcast_segments_updated(chapter_id)` on completion.
- [ ] `handle_job(ctx, job)` updates job status to `'done'` or `'failed'` at end.
- [ ] No `from app.*` imports anywhere in `plugin/studio/`.

**Test:** `grep -rn "from app\." plugin/studio/` must return nothing.

### E. No `app.*` imports anywhere

- [ ] `grep -rn "from app\." plugin/` returns nothing.

### F. Optional but recommended

- [ ] `verify(req)` — fast readiness check (enables Settings UI "Verify" button).
- [ ] `run_test()` — full synthesis test using bundled assets (enables "Run Test").
- [ ] `check_output(req, result)` — artifact QA (enables automatic reconcile).
- [ ] `shutdown()` — release GPU memory or API connections.

### G. Distribution

- [ ] `requirements.txt` — lists all pip dependencies.
- [ ] `README.md` — includes install instructions for each dependency.
- [ ] Tested with Studio's `discover_plugins()` returning your engine without errors.
- [ ] Engine appears in Studio Settings with green status after dependencies are met.

## Installation

```bash
# 1. Clone into your Studio plugins directory.
git clone https://github.com/your-org/studio-tts-myplugin plugins/tts_myplugin

# 2. Install dependencies.
pip install -r plugins/tts_myplugin/requirements.txt

# 3. Restart Studio — the engine will be discovered automatically.
```

## Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `model_path` | string | — | Absolute path to the model file |
| `speed` | float | 1.0 | Speech rate multiplier |

## License

MIT
````

---

## 8. Plan — Create Template Directory in Repo and Validate

### Step 1 — Create template directory structure

- [ ] Create `design-docs/specs/plugin_template/` in the `audiobook-factory` repo.
- [ ] Copy the file contents from §2–§7 above into the following paths:
  - `design-docs/specs/plugin_template/manifest.json`
  - `design-docs/specs/plugin_template/settings_schema.json`
  - `design-docs/specs/plugin_template/requirements.txt`
  - `design-docs/specs/plugin_template/README.md`
  - `design-docs/specs/plugin_template/plugin/__init__.py` (empty)
  - `design-docs/specs/plugin_template/plugin/server/__init__.py` (empty)
  - `design-docs/specs/plugin_template/plugin/server/engine.py`
  - `design-docs/specs/plugin_template/plugin/studio/__init__.py` (empty)
  - `design-docs/specs/plugin_template/plugin/studio/handler.py`
  - `design-docs/specs/plugin_template/assets/.gitkeep`

**Acceptance:** `ls design-docs/specs/plugin_template/` lists all of the above files.

### Step 2 — Install template as a test plugin

- [ ] Symlink or copy `design-docs/specs/plugin_template/` to `plugins/tts_template/`
  (only in a dev environment, never in production).
- [ ] Update `manifest.json` `engine_id` to `"template"` so it satisfies the
  folder regex (`tts_template` → engine_id `template`).

**Acceptance:** folder name matches `^tts_[a-z][a-z0-9]{1,14}$`.

### Step 3 — Run `discover_plugins` against the template

- [ ] Write or extend `tests/test_plugin_loader.py` with a test that calls
  `discover_plugins(plugins_dir)` and asserts the `tts_template` plugin is
  in the returned list without a `load_error`.
- [ ] Run: `pytest tests/test_plugin_loader.py -k template`.

**Acceptance:** test passes; `LoadedPlugin.load_error` is `None` for the
template entry.

### Step 4 — Run the engine contract verification

- [ ] In the test, instantiate `MyEngine()` and assert:
  - `check_env()` returns `(bool, str)`.
  - `check_request(TTSRequest(text='hello', output_path='/tmp/test.wav'))` returns `(bool, str)`.
  - `settings_schema()` returns a dict with key `"type"`.
  - `info()` returns a dict.
- [ ] Assert no `from app.` imports in `plugin/studio/handler.py`:
  ```python
  import ast, pathlib
  src = (plugin_dir / "plugin" / "studio" / "handler.py").read_text()
  tree = ast.parse(src)
  for node in ast.walk(tree):
      if isinstance(node, (ast.Import, ast.ImportFrom)):
          if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("app."):
              raise AssertionError(f"Forbidden app.* import: {node.module}")
  ```

**Acceptance:** all assertions pass; the AST check finds zero `app.*` imports.

### Step 5 — Synthesize a test audio file

- [ ] Call `engine.synthesize(req)` with a temp output path.
- [ ] Assert `result.ok is True`.
- [ ] Assert `Path(result.output_path).is_file()`.
- [ ] Assert `Path(result.output_path).stat().st_size > 0`.

**Acceptance:** a non-empty WAV file is written to the output path.

### Step 6 — Confirm template is excluded from production discovery

- [ ] Add `tts_template` to a `.pluginignore` or convention doc noting it is
  for development only.
- [ ] Alternatively, set `"dev": {"enabled": false}` in `manifest.json` and
  document that production Studio skips dev-only plugins.

**Acceptance:** `discover_plugins` in a production test (simulated by env var
or config flag) does not return the template plugin.

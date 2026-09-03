"""Template studio job handler — illustrates the SDK facade, not the wiring.

This file demonstrates the shape of a *custom* job handler built entirely on
``StudioPluginContext`` (``ctx``) — the SDK facade over Studio's internals —
so a plugin never needs to import ``app.*`` directly to do segment-level work
(load chunk groups, emit per-segment progress, stitch/convert output, etc.).

Two things to know before you copy this into a real plugin:

1. **Most plugins don't need this file at all.** If your engine can be fully
   expressed as ``StudioTTSEngine.synthesize()`` / ``preview()`` (see
   ``plugin/server/engine.py``), Studio's generic dispatch handles job
   orchestration for you — no ``worker_logic`` entry required. Only reach for
   a custom handler like this one if you need fine-grained control over
   chunking, segment progress, or multi-pass rendering that the generic path
   doesn't give you.
2. **The exact function signature Studio's orchestrator calls today is not
   yet this clean ``handle_job(ctx, job)`` shape.** The current registry
   dispatch (``app/orchestration/scheduler/orchestrator_helpers.py``) still
   calls ``worker_logic``-registered handlers with the legacy positional
   convention — keyword args named ``jid``, ``j`` (a raw job record,
   inspected via ``inspect.signature``), ``on_output``, ``cancel_check``, and
   optionally ``text``/``start`` — as shown in the real, currently-dispatched
   example at ``tts_engines/tts_voxtral/plugin/studio/handler.py``. This file
   documents the SDK-facade contract (``JobSpec``/``JobResult``, ``ctx.*``
   helpers) that a future dispatcher revision is expected to call directly;
   until then, wiring this exact function into ``manifest.json``'s
   ``worker_logic`` will not be invoked this way. Check
   ``design-docs/specs/plugin-contract.md`` for the current state before
   wiring a custom handler into a real plugin.

All Studio services here are accessed via ``ctx`` — never import from
``app.*`` directly; that import boundary (not the exact call signature) is
the part of this example that is stable and enforced today.

SDK types live in ``studio_plugin_sdk`` which is pre-registered in
``sys.modules`` before any plugin handler is imported.
"""

from __future__ import annotations

from studio_plugin_sdk import JobResult, JobSpec, StudioPluginContext


def handle_job(ctx: StudioPluginContext, job: JobSpec) -> JobResult:
    """Handle a dispatched synthesis job.

    Args:
        ctx: Context object exposing all Studio services (progress, paths,
             segments, audio ops, logging, etc.).
        job: Immutable snapshot of the job fields dispatched from the queue.

    Returns:
        JobResult: Final job state — always return one, never raise.
    """
    # Guard: respect cancellation before starting expensive work.
    if ctx.is_cancelled(job.id):
        return JobResult(status="cancelled")

    ctx.log("Starting synthesis job", job_id=job.id)

    # Resolve chunk groups from the chapter's segments.
    chunk_limit = ctx.get_text_chunk_limit(job.engine)
    groups = ctx.load_chunk_segments(job.chapter_id or "", chunk_limit)

    # Determine output path from Studio's chapter directory.
    chapter_dir = ctx.get_chapter_dir(job.chapter_id or "")
    out_wav = f"{chapter_dir}/output.wav"

    segment_wavs: list[str] = []
    total_groups = len(groups)

    for group_idx, group in enumerate(groups):
        if ctx.is_cancelled(job.id):
            return JobResult(status="cancelled")

        # Synthesize each render group — call the bridge to reach the TTS engine.
        for segment in group:
            text = ctx.sanitize_text(segment.get("text", ""))
            seg_wav = f"{chapter_dir}/seg_{segment['id']}.wav"
            ctx.emit_segment_started(job.chapter_id or "", segment["id"], job.id)

            return_code = ctx.generate_via_bridge(
                engine=job.engine,
                text=text,
                out_wav=__import__("pathlib").Path(seg_wav),
                profile_name=job.speaker_profile,
                task_id=job.id,
            )
            if return_code != 0:
                return JobResult(status="failed", error=f"Bridge returned {return_code}")

            duration = ctx.get_audio_duration(seg_wav)
            ctx.emit_segment_saved(
                job.chapter_id or "", segment["id"], job.id,
                audio_file_path=seg_wav, duration_sec=duration,
            )
            segment_wavs.append(seg_wav)

        progress = round((group_idx + 1) / max(total_groups, 1), 2)
        ctx.update_job_progress(job.id, progress=progress)

    # Assemble all segment WAVs into the final chapter WAV.
    ctx.stitch_segments(segment_wavs, out_wav)

    if job.make_mp3:
        out_mp3 = out_wav.replace(".wav", ".mp3")
        ctx.wav_to_mp3(out_wav, out_mp3)
        return JobResult(status="done", output_wav=out_wav, output_mp3=out_mp3)

    return JobResult(status="done", output_wav=out_wav)

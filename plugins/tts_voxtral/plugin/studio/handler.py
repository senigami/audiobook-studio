from __future__ import annotations
import time
import logging
from pathlib import Path

from .segments import handle_voxtral_segments
from .bake import handle_voxtral_bake

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level SDK context factory (lazy singleton)
# ---------------------------------------------------------------------------

_ctx_instance = None


def _get_ctx():
    """Return the shared StudioPluginContext for the voxtral engine."""
    global _ctx_instance  # noqa: PLW0603
    if _ctx_instance is None:
        try:
            from studio_plugin_sdk import StudioPluginContext  # noqa: PLC0415
        except ImportError:
            from app.studio_plugin_sdk import StudioPluginContext  # noqa: PLC0415
        _ctx_instance = StudioPluginContext("voxtral")
    return _ctx_instance


# ---------------------------------------------------------------------------
# Module-level residue wrappers — kept so existing tests that monkeypatch
# ``plugins.tts_voxtral.plugin.studio.handler.<name>`` still intercept calls.
# The real implementations are loaded lazily inside each wrapper.
# Resolves when S9 test patch targets move to the context.  (S4 residue
# convention.)
# ---------------------------------------------------------------------------

def update_job(jid, **kwargs):
    """Residue wrapper for app.db.state.update_job — patchable by legacy tests."""
    from app.db.state import update_job as _fn  # noqa: PLC0415
    return _fn(jid, **kwargs)


def get_chapter_dir(project_id, chapter_id):
    """Residue wrapper for app.core.config.get_chapter_dir — patchable by legacy tests."""
    from app.core.config import get_chapter_dir as _fn  # noqa: PLC0415
    return _fn(project_id, chapter_id)


def get_speaker_settings(profile_name):
    """Residue wrapper for app.db.speakers.get_speaker_settings — patchable by legacy tests."""
    from app.db.speakers import get_speaker_settings as _fn  # noqa: PLC0415
    return _fn(profile_name)


def generate_via_bridge(**kwargs):
    """Residue wrapper for bridge_helpers.generate_via_bridge — patchable by legacy tests."""
    from app.jobs.handlers.bridge_helpers import generate_via_bridge as _fn  # noqa: PLC0415
    return _fn(**kwargs)


def get_db_connection():
    """Module-level alias for app.db.get_connection — patchable by tests."""
    from app.db import get_connection as _fn  # noqa: PLC0415
    return _fn()


def get_project_lexicon(project_id: str) -> list:
    """Module-level alias for db.lexicon.get_lexicon — patchable by tests."""
    from app.db.lexicon import get_lexicon as _fn  # noqa: PLC0415
    return _fn(project_id)


def apply_project_lexicon(text: str, entries: list) -> str:
    """Module-level alias for utils.text.lexicon.apply_lexicon — patchable by tests."""
    from app.utils.text.lexicon import apply_lexicon as _fn  # noqa: PLC0415
    return _fn(text, entries)


def _get_bridge_error():
    """Return EngineBridgeError — module-level, patchable by tests.

    Returns ``app.engines.errors.EngineBridgeError`` which is the superclass of
    both the internal engine error and ``app.studio_plugin_sdk.errors.BridgeError``.
    """
    from app.engines.errors import EngineBridgeError  # noqa: PLC0415
    return EngineBridgeError


# ---------------------------------------------------------------------------
# Private helpers (DB queries)
# ---------------------------------------------------------------------------

def _chapter_text_from_segments(chapter_id: str) -> str:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT text_content
            FROM chapter_segments
            WHERE chapter_id = ?
            ORDER BY segment_order
            """,
            (chapter_id,),
        )
        return " ".join((row["text_content"] or "").strip() for row in cursor.fetchall() if (row["text_content"] or "").strip())


def _chapter_uses_multiple_profiles(job) -> bool:
    if not job.chapter_id:
        return False

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.character_id, c.speaker_profile_name
            FROM chapter_segments s
            LEFT JOIN characters c ON s.character_id = c.id
            WHERE s.chapter_id = ?
            ORDER BY s.segment_order
            """,
            (job.chapter_id,),
        )
        profiles = {
            (row["speaker_profile_name"] or job.speaker_profile or "").strip()
            for row in cursor.fetchall()
            if (row["speaker_profile_name"] or job.speaker_profile)
        }
        return len(profiles) > 1


def _is_sample_job(j) -> bool:
    """Voice build/test and sample jobs have no chapter context by design."""
    return (
        getattr(j, "kind", None) in ("sample_build", "sample_test", "voice_build", "voice_test")
        or j.engine in ("voice_build", "voice_test")
    )


# ---------------------------------------------------------------------------
# Public handler
# ---------------------------------------------------------------------------

def handle_voxtral_job(jid, j, start, on_output, cancel_check, text=None):
    ctx = _get_ctx()

    if cancel_check():
        update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
        return "cancelled"

    if _chapter_uses_multiple_profiles(j) and not (j.segment_ids or j.is_bake):
        update_job(
            jid,
            status="failed",
            finished_at=time.time(),
            progress=1.0,
            error="This chapter uses multiple voice profiles. Mixed Voxtral rendering lands in a later issue.",
        )
        return "failed"

    # The engine resolves reference audio only from an explicit profile dir
    # (the plugin core stays portable and never guesses storage paths), so
    # every job must pass it — voices without a Mistral voice_asset_id fail
    # otherwise ("No Voxtral voice_id or reference sample is available").
    voice_profile_dir = None
    if j.speaker_profile:
        try:
            voice_profile_dir_str = ctx.get_voice_profile_dir(j.speaker_profile)
            if voice_profile_dir_str is not None:
                voice_profile_dir = Path(voice_profile_dir_str)
        except ValueError:
            voice_profile_dir = Path(ctx.get_voices_dir()) / j.speaker_profile

    # Route segment-targeted and bake jobs before the standard/sample branch.
    if j.segment_ids or j.is_bake:
        if not j.project_id or not j.chapter_id:
            update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="Voxtral jobs require project and chapter context.")
            return "failed"
        pdir = get_chapter_dir(j.project_id, j.chapter_id)
        pdir.mkdir(parents=True, exist_ok=True)
        spk = get_speaker_settings(j.speaker_profile) if j.speaker_profile else {}
        if j.segment_ids:
            rc = handle_voxtral_segments(jid, j, start, on_output, cancel_check, pdir, voice_profile_dir, spk)
        else:
            out_wav = pdir / (Path(j.chapter_file).stem + ".wav" if j.chapter_file else "chapter.wav")
            rc = handle_voxtral_bake(jid, j, start, on_output, cancel_check, pdir, out_wav, voice_profile_dir, spk)
        return "done" if rc == 0 else "failed"

    if _is_sample_job(j):
        # Voice preview/test: render into the voice profile directory.
        if voice_profile_dir is None:
            update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="Voice sample jobs require a speaker profile.")
            return "failed"
        pdir = voice_profile_dir
        out_wav = pdir / "sample.wav"
    else:
        if not j.project_id or not j.chapter_id:
            update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="Voxtral jobs require project and chapter context.")
            return "failed"

        pdir = get_chapter_dir(j.project_id, j.chapter_id)
        out_wav = pdir / "chapter.wav"

    pdir.mkdir(parents=True, exist_ok=True)

    spk = get_speaker_settings(j.speaker_profile) if j.speaker_profile else {}
    if _is_sample_job(j):
        render_text = text or str(spk.get("test_text") or "")
    else:
        render_text = text or (_chapter_text_from_segments(j.chapter_id) if j.chapter_id else "")

    # Apply project lexicon substitution (zero-impact when no entries).
    if j.project_id and not _is_sample_job(j):
        try:
            _lexicon_entries = get_project_lexicon(j.project_id)
            if _lexicon_entries:
                render_text = apply_project_lexicon(render_text, _lexicon_entries)
        except Exception:
            logger.warning("Failed to apply lexicon for project %s; proceeding without substitution.", j.project_id, exc_info=True)

    logger.info(
        "[%s-debug %s] start job=%s chapter=%s profile=%s out_wav=%s text_len=%s",
        j.engine,
        time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
        jid,
        j.chapter_id,
        j.speaker_profile,
        out_wav,
        len(render_text),
    )
    if not render_text.strip():
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="No text was available for Voxtral synthesis.")
        return "failed"

    BridgeError = _get_bridge_error()

    try:
        logger.info("[%s-debug %s] calling generate_via_bridge (%s) job=%s", j.engine, time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()), j.engine, jid)
        rc = generate_via_bridge(
            engine=j.engine,
            text=render_text,
            out_wav=out_wav,
            profile_name=j.speaker_profile,
            on_output=on_output,
            cancel_check=cancel_check,
            voice_asset_id=spk.get("voice_asset_id"),
            model=spk.get("model"),
            reference_sample=spk.get("reference_sample"),
            voice_profile_dir=voice_profile_dir,
            task_id=jid,
        )
        logger.info(
            "[%s-debug %s] generate_via_bridge returned job=%s rc=%s wav_exists=%s",
            j.engine,
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            jid,
            rc,
            out_wav.exists(),
        )
    except BridgeError as exc:
        logger.info("[%s-debug %s] generate_via_bridge error job=%s error=%s", j.engine, time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()), jid, exc)
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=str(exc))
        return "failed"

    if cancel_check():
        update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
        return "cancelled"

    if rc != 0 or not out_wav.exists():
        logger.info(
            "[%s-debug %s] synthesis failed job=%s rc=%s wav_exists=%s",
            j.engine,
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            jid,
            rc,
            out_wav.exists(),
        )
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="Voxtral synthesis failed.")
        return "failed"

    # For sample jobs, convert WAV → MP3 and delete WAV
    if _is_sample_job(j):
        final_path = ctx.finalize_sample_artifact(out_wav)
        out_name = final_path.name
        logger.info(
            "[%s-debug %s] marking done job=%s artifact=%s",
            j.engine,
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            jid,
            out_name,
        )
        if final_path.suffix.lower() == ".mp3":
            update_job(jid, status="done", finished_at=time.time(), progress=1.0, output_mp3=out_name)
        else:
            update_job(jid, status="done", finished_at=time.time(), progress=1.0, output_wav=out_name)
    else:
        logger.info(
            "[%s-debug %s] marking done job=%s wav=%s",
            j.engine,
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            jid,
            out_wav.name,
        )
        update_job(jid, status="done", finished_at=time.time(), progress=1.0, output_wav=out_wav.name)
    return "done"

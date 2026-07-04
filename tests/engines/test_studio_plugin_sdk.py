"""Tests for the studio_plugin_sdk S1 infrastructure.

Covers:
- SDK importable and exposes the full public surface (both processes)
- StudioPluginContext instantiation and each service-group method routed to
  the correct underlying app.* symbol (boundary mocks only)
- Version-field manifest validation: present+wrong → PluginLoadError,
  missing → accepted with deprecation warning, present+right → accepted
- Exception hierarchy (BridgeError / ValidationError)
"""

from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# §1 — SDK import surface
# ---------------------------------------------------------------------------

class TestSDKImportSurface:
    """SDK must expose the full public surface in both process contexts."""

    def test_import_via_app_namespace(self):
        import app.studio_plugin_sdk as sdk
        assert sdk.__version__ == "1.0"

    def test_sys_modules_alias_registered(self):
        """plugin_loader registers studio_plugin_sdk alias on import."""
        # Import the loader to trigger alias registration.
        import app.tts_server.plugin_loader  # noqa: F401
        assert "studio_plugin_sdk" in sys.modules

    def test_alias_exposes_studio_tts_engine(self):
        sdk = sys.modules["studio_plugin_sdk"]
        assert hasattr(sdk, "StudioTTSEngine")

    def test_all_public_symbols_present(self):
        import studio_plugin_sdk as sdk
        required = [
            "StudioTTSEngine",
            "StudioPluginContext",
            "JobSpec",
            "JobResult",
            "TTSRequest",
            "TTSResult",
            "TimingEvent",
            "VerificationResult",
            "VoiceProcessingHooks",
            "SynthesisPlan",
        ]
        for sym in required:
            assert hasattr(sdk, sym), f"studio_plugin_sdk missing {sym!r}"

    def test_version_string(self):
        import studio_plugin_sdk as sdk
        assert sdk.__version__ == "1.0"


# ---------------------------------------------------------------------------
# §2 — JobSpec / JobResult dataclasses
# ---------------------------------------------------------------------------

class TestJobDataclasses:
    def test_jobspec_construction(self):
        from app.studio_plugin_sdk.context import JobSpec
        spec = JobSpec(
            id="j1",
            engine="xtts",
            kind="synthesis",
            chapter_id="ch1",
            project_id="p1",
            segment_ids=["s1"],
            speaker_profile="alice",
            is_bake=False,
            make_mp3=False,
            safe_mode=True,
        )
        assert spec.id == "j1"
        assert spec.extra == {}

    def test_jobresult_defaults(self):
        from app.studio_plugin_sdk.context import JobResult
        r = JobResult(status="done")
        assert r.error is None
        assert r.progress == 1.0


# ---------------------------------------------------------------------------
# §2b — get_plugin_ctx shared factory (PL-1: kills 9 copies of _get_ctx())
# ---------------------------------------------------------------------------

class TestGetPluginCtxFactory:
    """PL-1: one SDK context factory, keyed per engine_id.

    Each of the 9 formerly-duplicated ``_get_ctx()`` blocks hardcoded a
    single engine_id and expected a shared, lazily-built singleton for that
    engine. ``get_plugin_ctx`` must preserve that exact semantic: same
    engine_id -> same cached instance; different engine_id -> independent
    instances (never collide).
    """

    def setup_method(self):
        # The cache is process-lifetime module state; reset it around each
        # test so tests don't leak instances into each other.
        from app.studio_plugin_sdk import plugin_utils
        plugin_utils._ctx_cache.clear()

    def test_returns_studio_plugin_context(self):
        from app.studio_plugin_sdk import get_plugin_ctx, StudioPluginContext
        ctx = get_plugin_ctx("xtts")
        assert isinstance(ctx, StudioPluginContext)

    def test_same_engine_id_returns_same_cached_instance(self):
        from app.studio_plugin_sdk import get_plugin_ctx
        first = get_plugin_ctx("xtts")
        second = get_plugin_ctx("xtts")
        assert first is second

    def test_different_engine_ids_do_not_collide(self):
        from app.studio_plugin_sdk import get_plugin_ctx
        xtts_ctx = get_plugin_ctx("xtts")
        voxtral_ctx = get_plugin_ctx("voxtral")
        mixed_ctx = get_plugin_ctx("mixed")
        assert xtts_ctx is not voxtral_ctx
        assert xtts_ctx is not mixed_ctx
        assert voxtral_ctx is not mixed_ctx
        # Re-fetching each still returns its own cached instance.
        assert get_plugin_ctx("xtts") is xtts_ctx
        assert get_plugin_ctx("voxtral") is voxtral_ctx
        assert get_plugin_ctx("mixed") is mixed_ctx

    def test_engine_id_recorded_on_context(self):
        # StudioPluginContext stores engine_id privately (_engine_id) and
        # uses it downstream (e.g. as the logger name / plugin dir lookup
        # key) — verify the factory threads the exact engine_id through
        # rather than a hardcoded default.
        from app.studio_plugin_sdk import get_plugin_ctx
        ctx = get_plugin_ctx("voxtral")
        assert ctx._engine_id == "voxtral"


class TestLoadSettingsSchemaCaching:
    """PL-3 merged xtts's ``@lru_cache(maxsize=1)`` and voxtral's uncached ``_load_settings_schema``.

    The two originals were NOT behaviorally identical: xtts cached forever, voxtral re-read the
    file on every call (schema edits took effect live, no restart needed). ``cache`` defaults to
    True (xtts's call site, unchanged) but must be overridable to False (voxtral's call site) so
    voxtral keeps its live-reload behavior instead of silently inheriting xtts's permanent cache.
    """

    def setup_method(self):
        from app.studio_plugin_sdk import plugin_utils
        plugin_utils._settings_schema_cache.clear()

    def test_cache_true_returns_stale_content_after_file_changes(self, tmp_path):
        from app.studio_plugin_sdk.plugin_utils import load_settings_schema
        schema_path = tmp_path / "settings_schema.json"
        schema_path.write_text(json.dumps({"version": 1}))
        first = load_settings_schema(schema_path, engine_name="XTTS", cache=True)
        schema_path.write_text(json.dumps({"version": 2}))
        second = load_settings_schema(schema_path, engine_name="XTTS", cache=True)
        assert first == {"version": 1}
        assert second == {"version": 1}  # stale — cached, matching xtts's original lru_cache

    def test_cache_false_reflects_file_changes_live(self, tmp_path):
        from app.studio_plugin_sdk.plugin_utils import load_settings_schema
        schema_path = tmp_path / "settings_schema.json"
        schema_path.write_text(json.dumps({"version": 1}))
        first = load_settings_schema(schema_path, engine_name="Voxtral", cache=False)
        schema_path.write_text(json.dumps({"version": 2}))
        second = load_settings_schema(schema_path, engine_name="Voxtral", cache=False)
        assert first == {"version": 1}
        assert second == {"version": 2}  # live — matching voxtral's original uncached behavior

    def test_voxtral_call_site_passes_cache_false(self):
        # Pins the actual call site, not just the helper's capability — a future edit that drops
        # the cache=False kwarg would silently regress voxtral back to permanent caching.
        repo_root = Path(__file__).parents[2]
        source = (repo_root / "plugins/tts_voxtral/plugin/studio/app_adapter.py").read_text(encoding="utf-8")
        assert 'load_settings_schema(schema_path, engine_name="Voxtral", cache=False)' in source


# ---------------------------------------------------------------------------
# §3 — StudioPluginContext service-group smoke tests (boundary mocks only)
# ---------------------------------------------------------------------------

class TestContextServiceGroups:
    """Each group is called once; we mock only the wrapped app.* symbol."""

    def _ctx(self):
        from app.studio_plugin_sdk.context import StudioPluginContext
        return StudioPluginContext(engine_id="xtts")

    # 3.3.1 Job progress
    def test_update_job_progress(self):
        ctx = self._ctx()
        with patch("app.db.state_jobs.update_job") as mock_uj:
            ctx.update_job_progress("j1", status="running", progress=0.5)
            mock_uj.assert_called_once()
            kwargs = mock_uj.call_args
            assert kwargs[0][0] == "j1"
            assert kwargs[1]["status"] == "running"
            assert kwargs[1]["progress"] == 0.5

    # 3.3.2 Segment events
    def test_emit_segment_started(self):
        ctx = self._ctx()
        with patch("app.api.ws.broadcast_job_updated") as mock_bju:
            ctx.emit_segment_started("ch1", "seg1", "j1")
            mock_bju.assert_called_once()

    def test_emit_segment_saved(self):
        ctx = self._ctx()
        with patch("app.api.ws.broadcast_job_updated") as mock_bju:
            ctx.emit_segment_saved("ch1", "seg1", "j1", "/tmp/seg1.wav", duration_sec=3.2)
            mock_bju.assert_called_once()

    def test_emit_segment_progress(self):
        ctx = self._ctx()
        with patch("app.api.ws.broadcast_segment_progress") as mock_bsp:
            ctx.emit_segment_progress("ch1", "seg1", "j1", 0.75)
            mock_bsp.assert_called_once_with(
                job_id="j1", chapter_id="ch1", segment_id="seg1", progress=0.75
            )

    def test_broadcast_segments_updated(self):
        ctx = self._ctx()
        with patch("app.api.ws.broadcast_segments_updated") as mock_bsu:
            ctx.broadcast_segments_updated("ch1")
            mock_bsu.assert_called_once_with(chapter_id="ch1")

    # 3.3.3 Queue row
    def test_update_queue_row(self):
        ctx = self._ctx()
        with patch("app.api.ws.broadcast_queue_update") as mock_bqu:
            ctx.update_queue_row("j1", status="running", progress=0.3)
            mock_bqu.assert_called_once()

    # 3.3.4 Speaker / voice settings
    def test_get_speaker_wavs_splits_comma_string(self):
        ctx = self._ctx()
        with patch("app.db.speakers.get_profile_wavs", return_value="/a.wav,/b.wav") as mock_gpw:
            result = ctx.get_speaker_wavs("alice")
            mock_gpw.assert_called_once_with("alice")
            assert result == ["/a.wav", "/b.wav"]

    def test_get_speaker_wavs_returns_empty_for_none(self):
        ctx = self._ctx()
        with patch("app.db.speakers.get_profile_wavs", return_value=None):
            assert ctx.get_speaker_wavs("alice") == []

    def test_get_voice_profile_dir(self):
        ctx = self._ctx()
        with patch("app.db.speakers.get_profile_dir", return_value=Path("/voices/alice")):
            result = ctx.get_voice_profile_dir("alice")
            assert result == "/voices/alice"

    def test_get_voice_settings(self):
        ctx = self._ctx()
        with patch("app.db.speakers.get_speaker_settings", return_value={"speed": 1.0}) as m:
            result = ctx.get_voice_settings("alice")
            m.assert_called_once_with("alice")
            assert result == {"speed": 1.0}

    # 3.3.5 Chunk groups
    def test_get_chapter_segments(self):
        ctx = self._ctx()
        with patch("app.db.segments.get_chapter_segments", return_value=[{"id": "s1"}]) as m:
            result = ctx.get_chapter_segments("ch1")
            m.assert_called_once_with("ch1")
            assert result == [{"id": "s1"}]

    def test_build_chunk_groups(self):
        ctx = self._ctx()
        segs = [{"id": "s1", "text_content": "hello", "speaker_profile_name": None,
                 "character_speaker_profile_name": None}]
        with patch("app.domain.chunk_groups.build_chunk_groups", return_value=[segs]) as m:
            result = ctx.build_chunk_groups(segs, 500)
            m.assert_called_once()
            assert result == [segs]

    # 3.3.6 Bridge synthesis
    def test_generate_via_bridge(self):
        ctx = self._ctx()
        with patch("app.jobs.handlers.bridge_helpers.generate_via_bridge", return_value=0) as m:
            rc = ctx.generate_via_bridge("xtts", "Hello", Path("/tmp/out.wav"))
            m.assert_called_once()
            assert rc == 0

    # 3.3.7 Engine behavior
    def test_get_behavior_returns_normalized_dict(self):
        ctx = self._ctx()
        # behavior module's normalize_behavior accepts None and returns defaults
        result = ctx.get_behavior("nonexistent_engine_xyz")
        assert isinstance(result, dict)

    # 3.3.8 Cancellation
    def test_is_cancelled_false_when_no_job(self):
        ctx = self._ctx()
        from app.db import state_jobs as _sjobs
        with patch.object(_sjobs, "get_jobs", return_value={}):
            assert ctx.is_cancelled("j_missing") is False

    def test_is_cancelled_true_when_status_cancelled(self):
        ctx = self._ctx()
        from app.db import state_jobs as _sjobs
        with patch.object(_sjobs, "get_jobs", return_value={"j1": {"status": "cancelled"}}):
            assert ctx.is_cancelled("j1") is True

    # 3.3.9 Logging
    def test_log_calls_broadcast(self):
        ctx = self._ctx()
        with patch("app.api.ws.broadcast_tts_log_line") as mock_log:
            ctx.log("hello", job_id="j1")
            mock_log.assert_called_once()
            call_kwargs = mock_log.call_args[1]
            assert call_kwargs["line"] == "hello"
            assert call_kwargs["job_id"] == "j1"

    # 3.3.10 Segment persistence
    def test_update_segment(self):
        ctx = self._ctx()
        with patch("app.db.segments.update_segment") as m:
            ctx.update_segment("s1", audio_status="done")
            m.assert_called_once_with("s1", audio_status="done")

    def test_update_segments_status_bulk(self):
        ctx = self._ctx()
        with patch("app.db.segments.update_segments_status_bulk") as m:
            ctx.update_segments_status_bulk(["s1", "s2"], "unprocessed")
            m.assert_called_once()

    def test_cleanup_orphaned_segments(self):
        ctx = self._ctx()
        with patch("app.db.segments.cleanup_orphaned_segments") as m:
            ctx.cleanup_orphaned_segments("ch1")
            m.assert_called_once_with("ch1")

    def test_update_queue_item(self):
        ctx = self._ctx()
        with patch("app.db.queue.update_queue_item") as m:
            ctx.update_queue_item("j1", status="done")
            m.assert_called_once()

    # 3.3.11 Path resolution
    def test_get_plugin_data_dir(self, tmp_path):
        ctx = self._ctx()
        with patch("app.core.config.PLUGIN_DATA_DIR", tmp_path):
            result = ctx.get_plugin_data_dir("xtts")
            assert result == str(tmp_path / "xtts")
            assert Path(result).is_dir()

    def test_get_voices_dir(self, tmp_path):
        ctx = self._ctx()
        with patch("app.core.config.VOICES_DIR", tmp_path):
            result = ctx.get_voices_dir()
            assert result == str(tmp_path)

    # 3.3.12 Audio operations
    def test_stitch_segments_basic(self):
        """ctx.stitch_segments routes to audio_ops with default pdir/callbacks."""
        from pathlib import Path
        ctx = self._ctx()
        with patch("app.engines.audio_ops.stitch_segments", return_value=0) as m:
            rc = ctx.stitch_segments(["/a.wav", "/b.wav"], "/out.wav")
        assert rc == 0
        args = m.call_args[0]
        # pdir defaults to parent of out_wav
        assert args[0] == Path("/")           # parent of /out.wav
        assert args[1] == [Path("/a.wav"), Path("/b.wav")]
        assert args[2] == Path("/out.wav")
        # on_output and cancel_check are callable stubs
        assert callable(args[3])
        assert callable(args[4])

    def test_stitch_segments_explicit_on_output_cancel_check(self):
        """Explicit on_output and cancel_check are forwarded."""
        from pathlib import Path
        ctx = self._ctx()

        def on_out(line: str) -> None:
            pass

        def cancel() -> bool:
            return False

        with patch("app.engines.audio_ops.stitch_segments", return_value=0) as m:
            ctx.stitch_segments(["/a.wav"], "/tmp/out.wav", on_output=on_out, cancel_check=cancel)
        args = m.call_args[0]
        assert args[3] is on_out
        assert args[4] is cancel

    def test_stitch_segments_explicit_pdir(self):
        """Explicit pdir is forwarded as a Path."""
        from pathlib import Path
        ctx = self._ctx()
        with patch("app.engines.audio_ops.stitch_segments", return_value=0) as m:
            ctx.stitch_segments(["/a.wav"], "/tmp/out.wav", pdir="/work/dir")
        args = m.call_args[0]
        assert args[0] == Path("/work/dir")

    def test_wav_to_mp3(self):
        ctx = self._ctx()
        with patch("app.engines.audio_ops.wav_to_mp3") as m:
            ctx.wav_to_mp3("/in.wav", "/out.mp3")
            m.assert_called_once_with("/in.wav", "/out.mp3")

    def test_get_audio_duration(self):
        ctx = self._ctx()
        with patch("app.engines.audio_ops.get_audio_duration", return_value=5.0) as m:
            result = ctx.get_audio_duration("/audio.wav")
            assert result == 5.0

    # 3.3.13 Text preparation
    def test_sanitize_text(self):
        ctx = self._ctx()
        with patch("app.utils.text.textops_cleaning.sanitize_text", return_value="clean") as m:
            result = ctx.sanitize_text("raw")
            m.assert_called_once_with("raw")
            assert result == "clean"

    def test_split_long_sentences(self):
        ctx = self._ctx()
        with patch("app.utils.text.textops_splitting.safe_split_long_sentences",
                   return_value="part1 part2") as m:
            result = ctx.split_long_sentences("long text", 50)
            m.assert_called_once_with("long text", target=50)
            assert isinstance(result, list)

    def test_get_text_chunk_limit(self):
        ctx = self._ctx()
        with patch("app.engines.behavior.get_text_chunk_limit", return_value=500) as m:
            result = ctx.get_text_chunk_limit("xtts")
            m.assert_called_once_with("xtts")
            assert result == 500


# ---------------------------------------------------------------------------
# §4 — Version-field manifest validation
# ---------------------------------------------------------------------------

def _make_plugin_dir(tmp_path, folder_name, manifest, engine_src=""):
    plugin_dir = tmp_path / folder_name
    plugin_dir.mkdir()
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    if engine_src:
        (plugin_dir / "engine.py").write_text(textwrap.dedent(engine_src), encoding="utf-8")
    return plugin_dir


_ENGINE_SRC = """
from app.engines.voice.sdk import TTSRequest, TTSResult
from app.engines.voice.base import StudioTTSEngine

class MockEngine(StudioTTSEngine):
    def info(self): return {}
    def check_env(self): return True, "OK"
    def check_request(self, req): return True, "OK"
    def synthesize(self, req): return TTSResult(ok=True, output_path=req.output_path)
    def settings_schema(self): return {}
"""

_BASE_MANIFEST = {
    "studio_tts_manifest": "1.0",
    "contract_version": "1.0",
    "sdk_version": "1.0",
    "settings_schema_version": "1.0",
    "event_envelope_version": "1.0",
    "engine_id": "mock",
    "display_name": "Mock",
    "entry_class": "engine:MockEngine",
    "capabilities": ["synthesis"],
}

_VERSION_FIELDS = ["contract_version", "sdk_version", "settings_schema_version", "event_envelope_version"]


class TestVersionFieldValidation:
    """present+wrong → PluginLoadError; missing → PluginLoadError (S8 gate flip); present+right → OK."""

    @pytest.mark.parametrize("vfield", _VERSION_FIELDS)
    def test_wrong_value_raises_plugin_load_error(self, tmp_path, vfield):
        from app.tts_server.plugin_loader import _validate_manifest, PluginLoadError
        manifest = {**_BASE_MANIFEST, vfield: "9.9"}
        with pytest.raises(PluginLoadError, match=vfield):
            _validate_manifest(manifest=manifest, folder_name="tts_mock")

    @pytest.mark.parametrize("vfield", _VERSION_FIELDS)
    def test_missing_field_raises_plugin_load_error(self, tmp_path, vfield):
        """S8 gate flip: missing version field is now a hard PluginLoadError."""
        from app.tts_server.plugin_loader import _validate_manifest, PluginLoadError
        manifest = {**_BASE_MANIFEST}
        manifest.pop(vfield, None)
        with pytest.raises(PluginLoadError, match=vfield):
            _validate_manifest(manifest=manifest, folder_name="tts_mock")

    @pytest.mark.parametrize("vfield", _VERSION_FIELDS)
    def test_correct_value_accepted_without_error(self, tmp_path, vfield):
        from app.tts_server.plugin_loader import _validate_manifest
        manifest = {**_BASE_MANIFEST, vfield: "1.0"}
        # Should not raise
        _validate_manifest(manifest=manifest, folder_name="tts_mock")

    def test_all_four_fields_correct_accepted(self):
        from app.tts_server.plugin_loader import _validate_manifest
        manifest = {
            **_BASE_MANIFEST,
            "contract_version": "1.0",
            "sdk_version": "1.0",
            "settings_schema_version": "1.0",
            "event_envelope_version": "1.0",
        }
        _validate_manifest(manifest=manifest, folder_name="tts_mock")  # no raise


# ---------------------------------------------------------------------------
# §5 — Exception hierarchy
# ---------------------------------------------------------------------------

class TestExceptionHierarchy:
    def test_bridge_error_is_studio_exception(self):
        from app.studio_plugin_sdk.errors import BridgeError, StudioException
        assert issubclass(BridgeError, StudioException)

    def test_validation_error_is_studio_exception(self):
        from app.studio_plugin_sdk.errors import ValidationError, StudioException
        assert issubclass(ValidationError, StudioException)

    def test_bridge_error_can_be_raised_and_caught(self):
        from app.studio_plugin_sdk.errors import BridgeError, StudioException
        with pytest.raises(StudioException):
            raise BridgeError("synthesis failed")

    def test_validation_error_can_be_raised_and_caught(self):
        from app.studio_plugin_sdk.errors import ValidationError, StudioException
        with pytest.raises(StudioException):
            raise ValidationError("bad value")

    def test_bridge_error_is_also_exception(self):
        from app.studio_plugin_sdk.errors import BridgeError
        assert issubclass(BridgeError, Exception)

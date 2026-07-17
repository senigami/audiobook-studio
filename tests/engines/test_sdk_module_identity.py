"""Module-identity invariant for the real top-level ``studio_plugin_sdk`` package.

Plan 010 invariant 1 (00-overview.md): after the SDK dependency inversion there
must be exactly ONE module object per SDK class. The app-side modules
(``app.engines.voice.sdk``, ``app.engines.voice.base``, ``app.studio_plugin_sdk.*``)
are re-export shims over the real top-level ``studio_plugin_sdk`` package, so
every symbol importable from both places must be the identical object.

Written test-first for task 01: fails before the move (no top-level
``studio_plugin_sdk`` package on disk), passes after.
"""

from __future__ import annotations


class TestTypesIdentity:
    """app.engines.voice.sdk.* is studio_plugin_sdk.types.*"""

    def test_all_type_symbols_identical(self):
        import app.engines.voice.sdk as app_sdk
        import studio_plugin_sdk.types as sdk_types

        for name in (
            "TTSRequest",
            "TTSResult",
            "VerificationResult",
            "TTSTimingResult",
            "SegmentTimingResult",
            "TimingEvent",
            "TimingEventName",
            "SynthesisPlan",
            "VoiceProcessingHooks",
        ):
            assert getattr(app_sdk, name) is getattr(sdk_types, name), (
                f"app.engines.voice.sdk.{name} is not studio_plugin_sdk.types.{name}"
            )


class TestEngineIdentity:
    """app.engines.voice.base.StudioTTSEngine is studio_plugin_sdk.engine.StudioTTSEngine"""

    def test_studio_tts_engine_identical(self):
        import app.engines.voice.base as app_base
        import studio_plugin_sdk.engine as sdk_engine

        assert app_base.StudioTTSEngine is sdk_engine.StudioTTSEngine

    def test_base_voice_engine_stays_in_app(self):
        import app.engines.voice.base as app_base
        import studio_plugin_sdk

        assert hasattr(app_base, "BaseVoiceEngine")
        assert not hasattr(studio_plugin_sdk, "BaseVoiceEngine"), (
            "BaseVoiceEngine is app-side only; it must not be exported by the real SDK package"
        )


class TestContextIdentity:
    """app.studio_plugin_sdk.context.* is studio_plugin_sdk.context.*"""

    def test_context_symbols_identical(self):
        import app.studio_plugin_sdk.context as app_ctx
        import studio_plugin_sdk.context as sdk_ctx

        for name in ("StudioPluginContext", "JobSpec", "JobResult"):
            assert getattr(app_ctx, name) is getattr(sdk_ctx, name), (
                f"app.studio_plugin_sdk.context.{name} is not studio_plugin_sdk.context.{name}"
            )


class TestPluginUtilsIdentity:
    """app.studio_plugin_sdk.plugin_utils.* is studio_plugin_sdk.plugin_utils.*"""

    def test_plugin_utils_symbols_identical(self):
        import app.studio_plugin_sdk.plugin_utils as app_pu
        import studio_plugin_sdk.plugin_utils as sdk_pu

        for name in (
            "get_plugin_ctx",
            "load_settings_schema",
            "make_segment_output_handler",
        ):
            assert getattr(app_pu, name) is getattr(sdk_pu, name), (
                f"app.studio_plugin_sdk.plugin_utils.{name} is not studio_plugin_sdk.plugin_utils.{name}"
            )

    def test_module_state_caches_shared(self):
        # Tests reset plugin_utils._ctx_cache / _settings_schema_cache via the
        # app shim; those must be the SAME dict objects as the real module's.
        import app.studio_plugin_sdk.plugin_utils as app_pu
        import studio_plugin_sdk.plugin_utils as sdk_pu

        assert app_pu._ctx_cache is sdk_pu._ctx_cache
        assert app_pu._settings_schema_cache is sdk_pu._settings_schema_cache


class TestErrorsIdentity:
    """app.studio_plugin_sdk.errors.* is studio_plugin_sdk.errors.*"""

    def test_error_classes_identical(self):
        import app.studio_plugin_sdk.errors as app_err
        import studio_plugin_sdk.errors as sdk_err

        for name in ("StudioException", "BridgeError", "ValidationError"):
            assert getattr(app_err, name) is getattr(sdk_err, name), (
                f"app.studio_plugin_sdk.errors.{name} is not studio_plugin_sdk.errors.{name}"
            )


class TestPackageNamespaceIdentity:
    """The app namespace package and the real package expose identical objects."""

    def test_app_namespace_matches_real_package(self):
        import app.studio_plugin_sdk as app_sdk
        import studio_plugin_sdk as sdk

        for name in (
            "StudioTTSEngine",
            "TTSRequest",
            "TTSResult",
            "TimingEvent",
            "VerificationResult",
            "VoiceProcessingHooks",
            "SynthesisPlan",
            "StudioPluginContext",
            "JobSpec",
            "JobResult",
            "get_plugin_ctx",
            "load_settings_schema",
        ):
            assert getattr(app_sdk, name) is getattr(sdk, name), (
                f"app.studio_plugin_sdk.{name} is not studio_plugin_sdk.{name}"
            )

    def test_sdk_version_declared(self):
        import studio_plugin_sdk as sdk

        assert sdk.SDK_VERSION == "1.0"
        assert sdk.__version__ == "1.0"

    def test_no_import_time_side_effects_marker(self):
        # Importing the real package must not register sys.modules aliases,
        # start threads, or otherwise mutate global state. Cheap proxy: the
        # package imports cleanly in a fresh subprocess with only repo root
        # on sys.path and does not import app.* at module level.
        import subprocess
        import sys
        from pathlib import Path

        repo_root = Path(__file__).parents[2]
        code = (
            "import sys; import studio_plugin_sdk; "
            "bad = [m for m in sys.modules if m == 'app' or m.startswith('app.')]; "
            "assert not bad, f'SDK import pulled in app modules: {bad}'"
        )
        proc = subprocess.run(
            [sys.executable, "-c", code],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert proc.returncode == 0, proc.stderr

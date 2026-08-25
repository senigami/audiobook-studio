"""The SDK's app-adapter contract: VoiceEngineAdapter plus the request helpers.

Issue #200 Stage C. A plugin's app-side adapter satisfies a Protocol rather
than subclassing the host's BaseVoiceEngine, and calls the four PL-3 request
helpers as module-level SDK functions rather than inheriting them.

BaseVoiceEngine keeps working: its four helper attributes ARE the SDK
functions, so there is one implementation reached by two names.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from studio_plugin_sdk import VoiceEngineAdapter
from studio_plugin_sdk.engine_adapter import (
    normalize_output_format,
    resolve_cancel_check,
    resolve_on_output,
    resolve_output_path,
)
from studio_plugin_sdk.engine_errors import EngineRequestError


# The nine methods the app-adapter contract requires, written as literals.
_EXPECTED_PROTOCOL_METHODS = frozenset(
    {
        "hooks",
        "describe_health",
        "validate_environment",
        "validate_request",
        "synthesize",
        "preview",
        "settings_schema",
        "current_settings",
        "build_voice_asset",
    }
)


class TestProtocolShape:
    def test_protocol_members_match_the_literal_list(self) -> None:
        """A method added to the Protocol without a row above fails here."""
        declared = {
            name
            for name, value in vars(VoiceEngineAdapter).items()
            if callable(value) and not name.startswith("_")
        }
        assert declared == _EXPECTED_PROTOCOL_METHODS

    def test_a_class_with_all_nine_methods_satisfies_it(self) -> None:
        class Complete:
            def hooks(self): ...
            def describe_health(self): ...
            def validate_environment(self): ...
            def validate_request(self, request): ...
            def synthesize(self, request): ...
            def preview(self, request): ...
            def settings_schema(self): ...
            def current_settings(self): ...
            def build_voice_asset(self, request): ...

        assert isinstance(Complete(), VoiceEngineAdapter)

    def test_a_class_missing_one_method_does_not(self) -> None:
        class MissingPreview:
            def hooks(self): ...
            def describe_health(self): ...
            def validate_environment(self): ...
            def validate_request(self, request): ...
            def synthesize(self, request): ...
            def settings_schema(self): ...
            def current_settings(self): ...
            def build_voice_asset(self, request): ...

        assert not isinstance(MissingPreview(), VoiceEngineAdapter)

    def test_protocol_requires_no_inheritance(self) -> None:
        """A plugin adapter must not have to subclass anything host-side."""

        class Standalone:
            def hooks(self): ...
            def describe_health(self): ...
            def validate_environment(self): ...
            def validate_request(self, request): ...
            def synthesize(self, request): ...
            def preview(self, request): ...
            def settings_schema(self): ...
            def current_settings(self): ...
            def build_voice_asset(self, request): ...

        assert Standalone.__bases__ == (object,)
        assert isinstance(Standalone(), VoiceEngineAdapter)


class TestNormalizeOutputFormat:
    def test_absent_output_format_defaults_to_wav(self) -> None:
        assert normalize_output_format({}, engine_name="XTTS") == "wav"

    def test_value_is_stripped_and_lowercased(self) -> None:
        assert normalize_output_format({"output_format": "  MP3 "}, engine_name="XTTS", allow_mp3=True) == "mp3"

    def test_empty_string_falls_back_to_wav(self) -> None:
        assert normalize_output_format({"output_format": "   "}, engine_name="XTTS") == "wav"

    def test_mp3_rejected_when_not_allowed(self) -> None:
        with pytest.raises(EngineRequestError) as excinfo:
            normalize_output_format({"output_format": "mp3"}, engine_name="XTTS")
        assert "XTTS" in str(excinfo.value)
        assert "preview" in str(excinfo.value)

    def test_unknown_format_rejected_when_mp3_allowed(self) -> None:
        with pytest.raises(EngineRequestError) as excinfo:
            normalize_output_format({"output_format": "flac"}, engine_name="Voxtral", allow_mp3=True)
        assert "Voxtral" in str(excinfo.value)
        assert "synthesis" in str(excinfo.value)


class TestResolveOutputPath:
    def test_creates_the_parent_directory(self, tmp_path: Path) -> None:
        target = tmp_path / "renders" / "chapter-01.wav"
        assert not target.parent.exists()

        resolved = resolve_output_path({"output_path": str(target)}, engine_name="XTTS")

        assert resolved == target
        assert target.parent.is_dir()

    def test_missing_output_path_rejected(self) -> None:
        with pytest.raises(EngineRequestError) as excinfo:
            resolve_output_path({}, engine_name="XTTS")
        assert "XTTS" in str(excinfo.value)


class TestResolveCallbacks:
    def test_absent_on_output_becomes_a_no_op(self) -> None:
        handler = resolve_on_output({}, engine_name="XTTS")
        assert handler("some line") is None

    def test_supplied_on_output_is_returned_unchanged(self) -> None:
        seen: list[str] = []

        def record(line: str) -> None:
            seen.append(line)

        assert resolve_on_output({"on_output": record}, engine_name="XTTS") is record

    def test_non_callable_on_output_rejected(self) -> None:
        with pytest.raises(EngineRequestError) as excinfo:
            resolve_on_output({"on_output": "not callable"}, engine_name="XTTS")
        assert "XTTS" in str(excinfo.value)

    def test_absent_cancel_check_never_cancels(self) -> None:
        assert resolve_cancel_check({}, engine_name="XTTS")() is False

    def test_supplied_cancel_check_is_returned_unchanged(self) -> None:
        def always_cancel() -> bool:
            return True

        assert resolve_cancel_check({"cancel_check": always_cancel}, engine_name="XTTS") is always_cancel

    def test_non_callable_cancel_check_rejected(self) -> None:
        with pytest.raises(EngineRequestError) as excinfo:
            resolve_cancel_check({"cancel_check": 3}, engine_name="Voxtral")
        assert "Voxtral" in str(excinfo.value)


class TestBaseVoiceEngineSharesTheSameImplementation:
    """One implementation, two names. Not a copy that can drift."""

    @pytest.mark.parametrize(
        "attribute,sdk_function",
        [
            ("normalize_output_format", normalize_output_format),
            ("resolve_output_path", resolve_output_path),
            ("resolve_on_output", resolve_on_output),
            ("resolve_cancel_check", resolve_cancel_check),
        ],
    )
    def test_helper_is_the_sdk_function(self, attribute: str, sdk_function) -> None:
        from app.engines.voice.base import BaseVoiceEngine

        assert getattr(BaseVoiceEngine, attribute) is sdk_function

    def test_subclass_call_shape_still_works(self, tmp_path: Path) -> None:
        """Existing adapters call these through self, with keyword-only engine_name."""
        from app.engines.voice.base import BaseVoiceEngine

        class Adapter(BaseVoiceEngine):
            pass

        adapter = Adapter()
        target = tmp_path / "out" / "x.wav"

        assert adapter.normalize_output_format({}, engine_name="XTTS") == "wav"
        assert adapter.resolve_output_path({"output_path": str(target)}, engine_name="XTTS") == target
        assert adapter.resolve_on_output({}, engine_name="XTTS")("line") is None
        assert adapter.resolve_cancel_check({}, engine_name="XTTS")() is False

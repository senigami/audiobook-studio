"""Tests for ApiSynthesisTask."""

from __future__ import annotations

import pytest

from app.orchestration.tasks.api_synthesis import ApiSynthesisTask
from app.orchestration.tasks.base import StudioTask
from app.orchestration.scheduler.resources import ResourceClaim


class TestApiSynthesisTask:
    def test_is_studio_task_subclass(self):
        assert issubclass(ApiSynthesisTask, StudioTask)

    def test_creation_defaults(self):
        task = ApiSynthesisTask(
            task_id="task-1",
            engine_id="xtts",
            text="Hello world",
            output_path="/tmp/out.wav",
        )
        assert task.task_id == "task-1"
        assert task.engine_id == "xtts"
        assert task.source == "api"
        assert task.language == "en"
        assert task.voice_ref is None
        assert task.caller_id is None
        assert task.request_settings == {}
        assert isinstance(task.resource_claim, ResourceClaim)
        assert task.resource_claim.exclusive is True

    def test_custom_resource_claim(self):
        claim = ResourceClaim.gpu_heavy(vram_mb=8000)
        task = ApiSynthesisTask(
            task_id="t",
            engine_id="xtts",
            text="x",
            output_path="/tmp/x.wav",
            resource_claim=claim,
        )
        assert task.resource_claim.gpu is True
        assert task.resource_claim.vram_mb == 8000

    def test_to_task_context(self):
        task = ApiSynthesisTask(
            task_id="t-ctx",
            engine_id="voxtral",
            text="Test text",
            output_path="/tmp/out.wav",
            language="es",
            caller_id="app-xyz",
        )
        ctx = task.to_task_context()
        assert ctx.task_id == "t-ctx"
        assert ctx.task_type == "api_synthesis"
        assert ctx.payload["engine_id"] == "voxtral"
        assert ctx.payload["script_text"] == "Test text"
        assert ctx.payload["source"] == "api"
        assert ctx.payload["caller_id"] == "app-xyz"
        assert ctx.payload["language"] == "es"

    def test_to_bridge_request(self):
        task = ApiSynthesisTask(
            task_id="t-bridge",
            engine_id="xtts",
            text="Bridge test",
            output_path="/tmp/bridge.wav",
            voice_ref="/tmp/ref.wav",
            request_settings={"speed": 1.2},
        )
        req = task.to_bridge_request()
        assert req["engine_id"] == "xtts"
        assert req["script_text"] == "Bridge test"
        assert req["reference_audio_path"] == "/tmp/ref.wav"
        assert req["speed"] == 1.2
        assert req["source"] == "api"

    def test_to_bridge_request_resolves_profile_name_to_voice_paths(self, monkeypatch):
        # BUG 2 (PR #134 gateway verify): a plain voice-profile name from the
        # external API must resolve to a speaker WAV + voice_profile_dir the
        # same way Studio's own synthesis path resolves one, not be forwarded
        # verbatim as a filesystem path (which the TTS Server then rejects).
        monkeypatch.setattr(
            "app.db.speakers._resolve_existing_profile_name",
            lambda name: "Dark Fantasy",
        )
        monkeypatch.setattr(
            "app.db.speakers.get_profile_wavs",
            lambda name: "/voices/Dark Fantasy/sample.wav",
        )
        monkeypatch.setattr(
            "app.db.speakers.get_profile_dir",
            lambda name: "/voices/Dark Fantasy",
        )

        task = ApiSynthesisTask(
            task_id="t-profile",
            engine_id="xtts",
            text="Profile test",
            output_path="/tmp/profile.wav",
            voice_ref="Dark Fantasy",
        )
        req = task.to_bridge_request()
        assert req["reference_audio_path"] == "/voices/Dark Fantasy/sample.wav"
        assert req["voice_profile_dir"] == "/voices/Dark Fantasy"

    def test_to_bridge_request_falls_back_to_default_profile_when_voice_ref_missing(self, monkeypatch):
        # A gateway request with no voice_ref at all must not fail outright —
        # it resolves to the configured default speaker profile, the same
        # fallback app.db.speakers_paths._resolve_existing_profile_name
        # already applies for Studio-originated requests.
        monkeypatch.setattr(
            "app.db.speakers._resolve_existing_profile_name",
            lambda name: "Studio Voice" if not name else name,
        )
        monkeypatch.setattr(
            "app.db.speakers.get_profile_wavs",
            lambda name: "/voices/Studio Voice/sample.wav",
        )
        monkeypatch.setattr(
            "app.db.speakers.get_profile_dir",
            lambda name: "/voices/Studio Voice",
        )

        task = ApiSynthesisTask(
            task_id="t-no-voice-ref",
            engine_id="xtts",
            text="No voice ref",
            output_path="/tmp/default.wav",
        )
        req = task.to_bridge_request()
        assert req["reference_audio_path"] == "/voices/Studio Voice/sample.wav"
        assert req["voice_profile_dir"] == "/voices/Studio Voice"

    def test_request_settings_cannot_override_reserved_bridge_keys(self):
        # settings comes verbatim from the external API caller and is spread
        # last into the bridge request — reserved keys must be stripped so a
        # caller cannot override the containment-checked output_path or the
        # resolved reference_audio_path / voice_profile_dir.
        task = ApiSynthesisTask(
            task_id="t-inject",
            engine_id="xtts",
            text="Injection test",
            output_path="/tmp/safe.wav",
            voice_ref="/tmp/ref.wav",
            request_settings={
                "output_path": "/etc/evil.wav",
                "reference_audio_path": "/etc/passwd",
                "voice_profile_dir": "/",
                "task_id": "spoofed",
                "speed": 1.1,
            },
        )
        req = task.to_bridge_request()
        assert req["output_path"] == "/tmp/safe.wav"
        assert req["reference_audio_path"] == "/tmp/ref.wav"
        assert "voice_profile_dir" not in req
        assert req["task_id"] == "t-inject"
        assert req["speed"] == 1.1
        assert task.request_settings == {"speed": 1.1}

    def test_from_task_context_roundtrip(self):
        original = ApiSynthesisTask(
            task_id="rt-1",
            engine_id="xtts",
            text="Roundtrip",
            output_path="/tmp/rt.wav",
            language="fr",
            caller_id="system",
        )
        ctx = original.to_task_context()
        recovered = ApiSynthesisTask.from_task_context(ctx)

        assert recovered.task_id == original.task_id
        assert recovered.engine_id == original.engine_id
        assert recovered.text == original.text
        assert recovered.output_path == original.output_path
        assert recovered.language == original.language
        assert recovered.caller_id == original.caller_id

    def test_submitted_at_is_set(self):
        task = ApiSynthesisTask(
            task_id="x", engine_id="e", text="t", output_path="/tmp/x.wav"
        )
        assert isinstance(task.submitted_at, float)
        assert task.submitted_at > 0

    def test_on_cancel_does_not_raise(self):
        task = ApiSynthesisTask(
            task_id="x", engine_id="e", text="t", output_path="/tmp/x.wav"
        )
        task.on_cancel()  # Must not raise

    def test_validate_passes_with_valid_fields(self):
        task = ApiSynthesisTask(
            task_id="a1", engine_id="xtts", text="Hello", output_path="/tmp/x.wav"
        )
        task.validate()  # Should not raise

    def test_validate_raises_without_text(self):
        task = ApiSynthesisTask(
            task_id="a2", engine_id="xtts", text="", output_path="/tmp/x.wav"
        )
        with pytest.raises(ValueError, match="text"):
            task.validate()

    def test_validate_raises_without_engine_id(self):
        task = ApiSynthesisTask(
            task_id="a3", engine_id="", text="Hello", output_path="/tmp/x.wav"
        )
        with pytest.raises(ValueError, match="engine_id"):
            task.validate()

    def test_validate_raises_without_output_path(self):
        task = ApiSynthesisTask(
            task_id="a4", engine_id="xtts", text="Hello", output_path=""
        )
        with pytest.raises(ValueError, match="output_path"):
            task.validate()

    def test_describe_returns_task_context(self):
        task = ApiSynthesisTask(
            task_id="a5", engine_id="xtts", text="Hello", output_path="/tmp/x.wav"
        )
        ctx = task.describe()
        assert ctx.task_id == "a5"
        assert ctx.task_type == "api_synthesis"
        assert ctx.source == "api"


class TestResourceClaim:
    def test_none_claim(self):
        claim = ResourceClaim.none()
        assert claim.gpu is False
        assert claim.vram_mb == 0
        assert claim.cpu_heavy is False
        assert claim.exclusive is False

    def test_exclusive_claim(self):
        claim = ResourceClaim.exclusive_claim()
        assert claim.gpu is False
        assert claim.vram_mb == 0
        assert claim.cpu_heavy is False
        assert claim.exclusive is True

    def test_gpu_heavy_claim(self):
        claim = ResourceClaim.gpu_heavy(vram_mb=6000)
        assert claim.gpu is True
        assert claim.vram_mb == 6000
        assert claim.cpu_heavy is True
        assert claim.exclusive is False

    def test_from_engine_manifest(self):
        manifest = type("M", (), {
            "resource": type("R", (), {
                "gpu": True, "vram_mb": 4000, "cpu_heavy": True
            })()
        })()
        claim = ResourceClaim.from_engine_manifest(manifest)
        assert claim.gpu is True
        assert claim.vram_mb == 4000

    def test_from_engine_manifest_no_resource(self):
        manifest = type("M", (), {})()
        claim = ResourceClaim.from_engine_manifest(manifest)
        assert claim.gpu is False


def test_run_post_success_bookkeeping_cannot_fail_the_task(monkeypatch, tmp_path):
    # Audit task 003: a raise while persisting synthesis_duration_seconds after
    # a successful synthesize must not flip the result to failed.
    from unittest.mock import MagicMock, patch

    task = ApiSynthesisTask(
        task_id="api-job-1",
        engine_id="xtts",
        text="Hello",
        output_path=str(tmp_path / "out.wav"),
    )

    mock_bridge = MagicMock()
    mock_bridge.synthesize.return_value = {"status": "ok", "duration_sec": 2.0}

    with patch("app.engines.bridge.create_voice_bridge", return_value=mock_bridge), \
         patch("app.db.state.update_job", side_effect=RuntimeError("state store unavailable")):
        result = task.run()

    assert result.status == "completed"

"""Tests for ApiSynthesisTask."""

from __future__ import annotations

import pytest

from app.orchestration.tasks.api_synthesis import ApiSynthesisTask
from app.orchestration.scheduler.resources import ResourceClaim


class TestApiSynthesisTask:
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

    def test_source_is_always_api(self):
        task = ApiSynthesisTask(
            task_id="x", engine_id="e", text="t", output_path="/tmp/x.wav"
        )
        assert task.source == "api"

    def test_submitted_at_is_set(self):
        task = ApiSynthesisTask(
            task_id="x", engine_id="e", text="t", output_path="/tmp/x.wav"
        )
        assert isinstance(task.submitted_at, float)
        assert task.submitted_at > 0


class TestResourceClaim:
    def test_none_claim(self):
        claim = ResourceClaim.none()
        assert claim.gpu is False
        assert claim.vram_mb == 0
        assert claim.cpu_heavy is False

    def test_gpu_heavy_claim(self):
        claim = ResourceClaim.gpu_heavy(vram_mb=6000)
        assert claim.gpu is True
        assert claim.vram_mb == 6000
        assert claim.cpu_heavy is True

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

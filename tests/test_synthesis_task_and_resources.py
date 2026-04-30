"""Tests for SynthesisTask, registry TTS Server mode, and GPU admission."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.orchestration.tasks.synthesis import SynthesisTask
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult
from app.orchestration.scheduler.resources import (
    GpuAdmissionGate,
    ResourceClaim,
    reserve_task_resources,
    release_task_resources,
    get_gpu_gate,
)


# ---------------------------------------------------------------------------
# SynthesisTask
# ---------------------------------------------------------------------------


class TestSynthesisTask:
    def _make(self, **kwargs) -> SynthesisTask:
        defaults = dict(
            task_id="s1",
            engine_id="xtts",
            script_text="Hello world",
            output_path="/tmp/s1.wav",
        )
        defaults.update(kwargs)
        return SynthesisTask(**defaults)

    def test_is_studio_task_subclass(self):
        assert issubclass(SynthesisTask, StudioTask)

    def test_source_is_ui(self):
        assert SynthesisTask.source == "ui"

    def test_validate_passes_valid_inputs(self):
        self._make().validate()

    def test_validate_raises_missing_task_id(self):
        task = self._make(task_id="")
        with pytest.raises(ValueError, match="task_id"):
            task.validate()

    def test_validate_raises_missing_engine_id(self):
        task = self._make(engine_id="")
        with pytest.raises(ValueError, match="engine_id"):
            task.validate()

    def test_validate_raises_empty_script_text(self):
        task = self._make(script_text="")
        with pytest.raises(ValueError, match="script_text"):
            task.validate()

    def test_validate_raises_whitespace_script_text(self):
        task = self._make(script_text="   ")
        with pytest.raises(ValueError, match="script_text"):
            task.validate()

    def test_validate_raises_missing_output_path(self):
        task = self._make(output_path="")
        with pytest.raises(ValueError, match="output_path"):
            task.validate()

    def test_describe_returns_task_context(self):
        task = self._make(
            project_id="proj1", chapter_id="ch1", render_batch_id="rb1"
        )
        ctx = task.describe()
        assert isinstance(ctx, TaskContext)
        assert ctx.task_id == "s1"
        assert ctx.task_type == "synthesis"
        assert ctx.source == "ui"
        assert ctx.project_id == "proj1"
        assert ctx.chapter_id == "ch1"

    def test_describe_payload_has_engine_id(self):
        task = self._make(engine_id="voxtral")
        ctx = task.describe()
        assert ctx.payload["engine_id"] == "voxtral"

    def test_describe_payload_has_render_batch_id(self):
        task = self._make(render_batch_id="batch-42")
        ctx = task.describe()
        assert ctx.payload["render_batch_id"] == "batch-42"

    def test_describe_payload_has_reconciliation_fields(self):
        task = self._make(requested_revision={"source_revision_id": "rev-abc"})
        ctx = task.describe()
        assert ctx.payload["task_revision_id"] == "rev-abc"
        assert ctx.payload["scope"] == "job"

    def test_on_cancel_does_not_raise(self):
        self._make().on_cancel()

    def test_run_returns_completed_on_ok_result(self):
        task = self._make()
        mock_bridge = MagicMock()
        mock_bridge.synthesize.return_value = {"status": "ok", "output_path": "/tmp/s1.wav"}
        with patch("app.engines.bridge.create_voice_bridge", return_value=mock_bridge):
            result = task.run()
        assert result.status == "completed"

    def test_run_returns_failed_on_non_ok_status(self):
        task = self._make()
        mock_bridge = MagicMock()
        mock_bridge.synthesize.return_value = {"status": "error", "message": "engine crash"}
        with patch("app.engines.bridge.create_voice_bridge", return_value=mock_bridge):
            result = task.run()
        assert result.status == "failed"

    def test_run_returns_failed_on_exception(self):
        task = self._make()
        mock_bridge = MagicMock()
        mock_bridge.synthesize.side_effect = RuntimeError("GPU OOM")
        with patch("app.engines.bridge.create_voice_bridge", return_value=mock_bridge):
            result = task.run()
        assert result.status == "failed"
        assert "GPU OOM" in (result.message or "")
        assert result.retriable is False

    def test_run_sets_retriable_on_engine_unavailable(self):
        task = self._make()
        mock_bridge = MagicMock()
        from app.engines.bridge_remote import EngineUnavailableError
        mock_bridge.synthesize.side_effect = EngineUnavailableError("TTS Server restarting")
        with patch("app.engines.bridge.create_voice_bridge", return_value=mock_bridge):
            result = task.run()
        assert result.status == "failed"
        assert result.retriable is True

    def test_orchestrator_can_submit_synthesis_task(self):
        from app.orchestration.scheduler.orchestrator import TaskOrchestrator
        progress = MagicMock()
        progress.publish.return_value = None
        progress.reconcile.return_value = {"artifact_state": "valid", "can_reuse": True}

        bridge = MagicMock()
        orch = TaskOrchestrator(progress_service=progress, voice_bridge=bridge)
        task = self._make()
        task_id = orch.submit(task)
        assert task_id == "s1"
        # Reuse → no dispatch
        bridge.synthesize.assert_not_called()

    def test_orchestrator_publishes_retriable_reason_code(self):
        from app.orchestration.scheduler.orchestrator import TaskOrchestrator
        progress = MagicMock()
        progress.publish.return_value = None
        progress.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}

        bridge = MagicMock()
        from app.engines.bridge_remote import EngineUnavailableError
        bridge.synthesize.side_effect = EngineUnavailableError("Network split")

        orch = TaskOrchestrator(progress_service=progress, voice_bridge=bridge)
        task = self._make()

        # We need to mock resource reservation so it doesn't wait
        with patch("app.orchestration.scheduler.orchestrator.reserve_task_resources", return_value={"admitted": True}):
            orch.submit(task)

        published_reasons = [c.kwargs.get("reason_code") for c in progress.publish.call_args_list]
        assert "synthesis_error_retriable" in published_reasons


# ---------------------------------------------------------------------------
# GpuAdmissionGate
# ---------------------------------------------------------------------------


class TestGpuAdmissionGate:
    def _fresh_gate(self) -> GpuAdmissionGate:
        gate = GpuAdmissionGate()
        return gate

    def test_first_acquire_succeeds(self):
        gate = self._fresh_gate()
        admitted, reason = gate.try_acquire("t1")
        assert admitted is True
        assert reason is None

    def test_second_acquire_denied(self):
        gate = self._fresh_gate()
        gate.try_acquire("t1")
        admitted, reason = gate.try_acquire("t2")
        assert admitted is False
        assert reason is not None
        assert "t1" in reason

    def test_release_allows_next_acquire(self):
        gate = self._fresh_gate()
        gate.try_acquire("t1")
        gate.release("t1")
        admitted, _ = gate.try_acquire("t2")
        assert admitted is True

    def test_release_wrong_task_id_ignored(self):
        gate = self._fresh_gate()
        gate.try_acquire("t1")
        gate.release("t-wrong")  # should not release
        admitted, _ = gate.try_acquire("t2")
        assert admitted is False

    def test_active_task_id_property(self):
        gate = self._fresh_gate()
        assert gate.active_task_id is None
        gate.try_acquire("t1")
        assert gate.active_task_id == "t1"
        gate.release("t1")
        assert gate.active_task_id is None

    def test_reset_force_releases(self):
        gate = self._fresh_gate()
        gate.try_acquire("t1")
        gate.reset()
        assert gate.active_task_id is None
        admitted, _ = gate.try_acquire("t2")
        assert admitted is True


class TestReserveTaskResources:
    def setup_method(self):
        """Reset the module-level GPU gate before each test."""
        get_gpu_gate().reset()

    def test_cpu_only_task_always_admitted(self):
        result = reserve_task_resources(
            task_type="export",
            resource_claims={"task_id": "e1", "gpu": False, "vram_mb": 0, "cpu_heavy": False},
        )
        assert result["admitted"] is True
        assert result["waiting_reason"] is None

    def test_gpu_task_admitted_when_slot_free(self):
        result = reserve_task_resources(
            task_type="synthesis",
            resource_claims={"task_id": "g1", "gpu": True, "vram_mb": 4000},
        )
        assert result["admitted"] is True

    def test_gpu_task_denied_when_slot_taken(self):
        reserve_task_resources(
            task_type="synthesis",
            resource_claims={"task_id": "g1", "gpu": True, "vram_mb": 4000},
        )
        result = reserve_task_resources(
            task_type="synthesis",
            resource_claims={"task_id": "g2", "gpu": True, "vram_mb": 4000},
        )
        assert result["admitted"] is False
        assert "g1" in result["waiting_reason"]

    def test_release_frees_slot_for_next(self):
        reserve_task_resources(
            task_type="synthesis",
            resource_claims={"task_id": "g1", "gpu": True, "vram_mb": 4000},
        )
        release_task_resources(
            task_id="g1",
            resource_claims={"task_id": "g1", "gpu": True},
        )
        result = reserve_task_resources(
            task_type="synthesis",
            resource_claims={"task_id": "g2", "gpu": True, "vram_mb": 4000},
        )
        assert result["admitted"] is True

    def test_result_carries_no_fake_reserved_key(self):
        """The old 'reserved: True' unconditional key must not exist."""
        result = reserve_task_resources(
            task_type="synthesis",
            resource_claims={"task_id": "g3", "gpu": True},
        )
        assert "reserved" not in result

    def test_admitted_key_present_in_result(self):
        result = reserve_task_resources(
            task_type="synthesis",
            resource_claims={"task_id": "g4", "gpu": False},
        )
        assert "admitted" in result


# ---------------------------------------------------------------------------
# Registry TTS Server mode
# ---------------------------------------------------------------------------


class TestRegistryTtsServerMode:
    def test_tts_server_mode_returns_empty_when_watchdog_none(self):
        with patch("app.core.feature_flags.os") as mock_os:
            mock_os.getenv.return_value = "true"
            with patch("app.engines.registry.get_watchdog", return_value=None):
                from app.engines.registry import _load_tts_server_registry
                result = _load_tts_server_registry()
        assert result == {}

    def test_tts_server_mode_returns_empty_when_unhealthy(self):
        watchdog = MagicMock()
        watchdog.is_healthy.return_value = False
        with patch("app.engines.registry.get_watchdog", return_value=watchdog):
            from app.engines.registry import _load_tts_server_registry
            result = _load_tts_server_registry()
        assert result == {}

    def test_tts_server_mode_returns_empty_on_client_error(self):
        watchdog = MagicMock()
        watchdog.is_healthy.return_value = True
        watchdog.get_url.return_value = "http://127.0.0.1:7862"

        client = MagicMock()
        client.get_engines.side_effect = ConnectionError("refused")

        with patch("app.engines.registry.get_watchdog", return_value=watchdog):
            with patch("app.engines.registry.TtsClient", return_value=client):
                from app.engines.registry import _load_tts_server_registry
                result = _load_tts_server_registry()
        assert result == {}

    def test_tts_server_mode_builds_registration_from_payload(self):
        watchdog = MagicMock()
        watchdog.is_healthy.return_value = True
        watchdog.get_url.return_value = "http://127.0.0.1:7862"

        client = MagicMock()
        client.get_engines.return_value = [
            {
                "engine_id": "test_engine",
                "display_name": "Test Engine",
                "capabilities": ["tts"],
                "verified": True,
                "version": "1.2.3",
            }
        ]
        client.health.return_value = {
            "engines": [{"engine_id": "test_engine", "status": "ready"}]
        }

        with patch("app.engines.registry.get_watchdog", return_value=watchdog):
            with patch("app.engines.registry.TtsClient", return_value=client):
                from app.engines.registry import _load_tts_server_registry
                result = _load_tts_server_registry()

        assert "test_engine" in result
        reg = result["test_engine"]
        assert reg.manifest.engine_id == "test_engine"
        assert reg.manifest.verified is True
        assert reg.manifest.version == "1.2.3"
        assert reg.health.ready is True
        assert reg.health.status == "ready"

    def test_tts_server_proxy_synthesize_raises(self):
        from app.engines.registry import _TtsServerEngineProxy
        proxy = _TtsServerEngineProxy(engine_id="e1", server_url="http://localhost:7862")
        with pytest.raises(NotImplementedError, match="VoiceBridge"):
            proxy.synthesize({})

    def test_tts_server_proxy_preview_raises(self):
        from app.engines.registry import _TtsServerEngineProxy
        proxy = _TtsServerEngineProxy(engine_id="e1", server_url="http://localhost:7862")
        with pytest.raises(NotImplementedError, match="VoiceBridge"):
            proxy.preview({})

    def test_tts_server_proxy_health_falls_back_on_error(self):
        from app.engines.registry import _TtsServerEngineProxy
        proxy = _TtsServerEngineProxy(engine_id="e1", server_url="http://localhost:7862")
        with patch("app.engines.registry.TtsClient") as MockClient:
            MockClient.return_value.health.side_effect = ConnectionError("refused")
            health = proxy.describe_health()
        assert health.available is False
        assert health.status == "unavailable"

    def test_manifest_from_tts_server_payload_missing_engine_id_skipped(self):
        watchdog = MagicMock()
        watchdog.is_healthy.return_value = True
        watchdog.get_url.return_value = "http://127.0.0.1:7862"

        client = MagicMock()
        # No engine_id — should be skipped
        client.get_engines.return_value = [{"display_name": "Broken"}]
        client.health.return_value = {"engines": []}

        with patch("app.engines.registry.get_watchdog", return_value=watchdog):
            with patch("app.engines.registry.TtsClient", return_value=client):
                from app.engines.registry import _load_tts_server_registry
                result = _load_tts_server_registry()

        assert result == {}

from __future__ import annotations

import ast
import importlib
from pathlib import Path

import pytest

from app.domain.artifacts.manifest import (
    build_artifact_manifest,
    build_artifact_request_fingerprint,
    is_artifact_stale,
    validate_artifact_manifest,
)
from app.domain.artifacts.models import ArtifactOutputModel
from app.domain.chapters.models import ChapterModel
from app.domain.projects.models import ProjectModel
from app.domain.projects.snapshots import build_project_snapshot, validate_project_snapshot
from app.domain.settings.ownership import build_settings_ownership_chain
from app.domain.voices.compatibility import validate_voice_compatibility
from app.domain.voices.models import VoiceAssetModel, VoicePreviewRequestModel, VoiceProfileModel
from app.domain.voices.preview import preview_voice_profile


@pytest.fixture(autouse=True)
def _disable_external_engines_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure tests run against a stable baseline by disabling external engine side-effects.

    Uses ``importlib.import_module`` to obtain the target modules and patches the
    module objects directly, rather than pytest's dotted-string ``setattr`` form.
    Real plugin/job-handler discovery (e.g. ``app.jobs.registry.initialize_default_handlers``,
    exercised for real by ``tests/core/test_boot.py``) registers synthetic
    ``sys.modules["tts_engines.tts_voxtral"]``/``sys.modules["tts_engines.tts_xtts"]`` entries
    without binding them as attributes on the real ``plugins`` package. That leaves
    pytest's dotted-string attribute-chain resolution (``monkeypatch.setattr("tts_engines.tts_voxtral...")``)
    broken for the rest of the test session, since ``plugins.tts_voxtral`` can never
    resolve via ``getattr`` even though the submodule is importable. Importing the
    modules directly sidesteps that dependency on collection/execution order.
    """
    voxtral_app_adapter = importlib.import_module("tts_engines.tts_voxtral.plugin.studio.app_adapter")
    xtts_app_adapter = importlib.import_module("tts_engines.tts_xtts.plugin.studio.app_adapter")
    monkeypatch.setattr(voxtral_app_adapter, "resolve_mistral_api_key", lambda: None)
    monkeypatch.setattr(xtts_app_adapter, "XTTS_ENV_ACTIVATE", Path("/nonexistent/activate"))
    monkeypatch.setattr(xtts_app_adapter, "XTTS_ENV_PYTHON", Path("/nonexistent/python"))
    from app.engines.registry import load_engine_registry

    load_engine_registry.cache_clear()
    yield
    load_engine_registry.cache_clear()


def test_artifact_manifest_fingerprint_and_staleness() -> None:
    output = ArtifactOutputModel(duration_ms=15320, sample_rate=24000, channels=1)
    manifest = build_artifact_manifest(
        artifact_hash="sha256:artifact",
        source_revision_id="rev-1",
        engine_id="engine-1",
        engine_version="2.0.0",
        voice_asset_id="voice-123",
        block_revision_hash="sha256:block",
        text_hash="sha256:text",
        settings_hash="sha256:settings",
        output=output,
        chapter_id="chapter-1",
        project_id="project-1",
    )

    expected_fingerprint = build_artifact_request_fingerprint(
        source_revision_id="rev-1",
        engine_id="engine-1",
        engine_version="2.0.0",
        voice_asset_id="voice-123",
        block_revision_hash="sha256:block",
        text_hash="sha256:text",
        settings_hash="sha256:settings",
        chapter_id="chapter-1",
        project_id="project-1",
    )

    assert manifest.request_fingerprint == expected_fingerprint
    assert not is_artifact_stale(
        manifest=manifest,
        source_revision_id="rev-1",
        engine_id="engine-1",
        engine_version="2.0.0",
        voice_asset_id="voice-123",
        block_revision_hash="sha256:block",
        text_hash="sha256:text",
        settings_hash="sha256:settings",
        chapter_id="chapter-1",
        project_id="project-1",
    )

    assert is_artifact_stale(
        manifest=manifest,
        source_revision_id="rev-1",
        engine_id="engine-1",
        engine_version="2.0.1",
        voice_asset_id="voice-123",
        block_revision_hash="sha256:block",
        text_hash="sha256:text",
        settings_hash="sha256:settings",
        chapter_id="chapter-1",
        project_id="project-1",
    )

    with pytest.raises(ValueError):
        validate_artifact_manifest(
            manifest=manifest,
            source_revision_id="rev-1",
            engine_id="engine-1",
            engine_version="2.0.1",
            voice_asset_id="voice-123",
            block_revision_hash="sha256:block",
            text_hash="sha256:text",
            settings_hash="sha256:settings",
            chapter_id="chapter-1",
            project_id="project-1",
        )


@pytest.mark.parametrize(
    ("field_name", "field_value"),
    [
        ("settings_hash", "sha256:other-settings"),
        ("voice_asset_id", "voice-999"),
        ("block_revision_hash", "sha256:other-block"),
        ("project_id", "project-2"),
        ("chapter_id", "chapter-2"),
    ],
)
def test_artifact_manifest_detects_non_text_input_changes(
    field_name: str, field_value: str
) -> None:
    output = ArtifactOutputModel(duration_ms=15320, sample_rate=24000, channels=1)
    manifest = build_artifact_manifest(
        artifact_hash="sha256:artifact",
        source_revision_id="rev-1",
        engine_id="engine-1",
        engine_version="2.0.0",
        voice_asset_id="voice-123",
        block_revision_hash="sha256:block",
        text_hash="sha256:text",
        settings_hash="sha256:settings",
        output=output,
        chapter_id="chapter-1",
        project_id="project-1",
    )

    expected = {
        "source_revision_id": "rev-1",
        "engine_id": "engine-1",
        "engine_version": "2.0.0",
        "voice_asset_id": "voice-123",
        "block_revision_hash": "sha256:block",
        "text_hash": "sha256:text",
        "settings_hash": "sha256:settings",
        "chapter_id": "chapter-1",
        "project_id": "project-1",
    }
    expected[field_name] = field_value

    assert is_artifact_stale(manifest=manifest, **expected)


def test_project_snapshot_portability_and_validation() -> None:
    project = ProjectModel(
        id="project-1",
        title="Portable Project",
        author="Author",
        series="Series",
        cover_asset_ref="cover.jpg",
    )

    snapshot = build_project_snapshot(
        project=project,
        revision_id="rev-1",
        chapter_ids=["chapter-1", "chapter-1", "chapter-2"],
        artifact_hashes=["sha256:a", "sha256:a", "sha256:b"],
    )

    assert snapshot.project_id == "project-1"
    assert snapshot.chapter_ids == ["chapter-1", "chapter-2"]
    assert snapshot.artifact_hashes == ["sha256:a", "sha256:b"]
    validate_project_snapshot(snapshot, expected_project_id="project-1")

    snapshot.metadata_json["cover_path"] = "/absolute/path/that/is/not/portable"
    with pytest.raises(ValueError):
        validate_project_snapshot(snapshot, expected_project_id="project-1")

    with pytest.raises(ValueError):
        validate_project_snapshot(snapshot, expected_project_id="other-project")


def test_settings_ownership_chain_order() -> None:
    """The intended Studio 2.0 ownership precedence: global < project < module
    < profile_preview. Note this alone doesn't prove build_settings_ownership_chain()
    actually *sorts* -- describe_settings_ownership()'s static list already
    happens to be in this order. See test_settings_ownership_chain_sorts_out_of_order_input
    below for a fixture that actually exercises the sort."""
    chain = build_settings_ownership_chain()

    assert [item.scope for item in chain] == [
        "global",
        "project",
        "module",
        "profile_preview",
    ]
    assert [item.precedence for item in chain] == [0, 1, 2, 3]


def test_settings_ownership_chain_sorts_out_of_order_input(monkeypatch: pytest.MonkeyPatch) -> None:
    """build_settings_ownership_chain() wraps describe_settings_ownership() in
    sorted(..., key=precedence). Feed it deliberately out-of-precedence-order
    data to prove the sort is real, not a no-op over an already-sorted list."""
    from app.domain.settings.models import SettingsOwnershipModel

    unsorted = [
        SettingsOwnershipModel(scope="module", owner="x", description="", precedence=2),
        SettingsOwnershipModel(scope="global", owner="x", description="", precedence=0),
        SettingsOwnershipModel(scope="profile_preview", owner="x", description="", precedence=3),
        SettingsOwnershipModel(scope="project", owner="x", description="", precedence=1),
    ]
    monkeypatch.setattr(
        "app.domain.settings.ownership.describe_settings_ownership",
        lambda: unsorted,
    )

    chain = build_settings_ownership_chain()

    assert [item.precedence for item in chain] == [0, 1, 2, 3]
    assert [item.scope for item in chain] == ["global", "project", "module", "profile_preview"]


def test_preview_payload_trims_script_text_but_preserves_request_context() -> None:
    response = preview_voice_profile(
        VoicePreviewRequestModel(
            voice_profile_id="voice-1",
            script_text="  hello world  ",
            engine_id="engine-1",
            reference_text="reference",
            reference_audio_path="/tmp/reference.wav",
            voice_asset_id="asset-1",
        )
    )

    assert response["status"] == "ok"
    assert response["bridge"] == "tts-server-preview-bridge"
    assert response["preview_request"]["script_text"] == "hello world"
    assert response["preview_request"]["voice_asset_id"] == "asset-1"
    assert response["ephemeral"] is True


def test_voice_compatibility_rejects_asset_owner_mismatch() -> None:
    profile = VoiceProfileModel(id="voice-1", name="Narrator", default_engine_id="engine-1")
    asset = VoiceAssetModel(id="asset-1", voice_profile_id="voice-2", engine_id="engine-1")

    with pytest.raises(ValueError, match="does not belong"):
        validate_voice_compatibility(profile=profile, engine_id="engine-1", asset=asset)


def test_voice_compatibility_rejects_engine_mismatch_for_asset() -> None:
    profile = VoiceProfileModel(id="voice-1", name="Narrator", default_engine_id="engine-1")
    asset = VoiceAssetModel(id="asset-1", voice_profile_id="voice-1", engine_id="voxtral")

    with pytest.raises(ValueError, match="not compatible"):
        validate_voice_compatibility(profile=profile, engine_id="engine-1", asset=asset)


def test_preview_voice_profile_routes_through_remote_bridge() -> None:
    """Exercises the real preview.py -> VoiceBridge -> RemoteBridgeHandler
    chain; only the TTS Server HTTP client itself is mocked (network boundary,
    R2-compliant) via the autouse mock_tts_server_watchdog fixture -- "real
    bridge" here means the routing code, not an unmocked network call."""
    response = preview_voice_profile(
        VoicePreviewRequestModel(
            voice_profile_id="voice-1",
            script_text="hello world",
            engine_id="engine-1",
        )
    )

    assert response["status"] == "ok"
    assert response["bridge"] == "tts-server-preview-bridge"
    assert response["preview_request"]["engine_id"] == "engine-1"
    assert response["preview_request"]["script_text"] == "hello world"


@pytest.mark.parametrize(
    "module_path",
    [
        "app/domain/artifacts/manifest.py",
        "app/domain/projects/snapshots.py",
        "app/domain/settings/ownership.py",
        "app/domain/voices/compatibility.py",
        "app/domain/voices/preview.py",
    ],
)
def test_new_domain_modules_do_not_import_web_or_jobs(module_path: str) -> None:
    source = (Path(__file__).resolve().parents[2] / module_path).read_text(encoding="utf-8")
    tree = ast.parse(source, filename=module_path)

    forbidden = {"app.api.web", "app.jobs"}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module in forbidden:
            raise AssertionError(f"{module_path} imports forbidden module {node.module}")
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in forbidden:
                    raise AssertionError(f"{module_path} imports forbidden module {alias.name}")

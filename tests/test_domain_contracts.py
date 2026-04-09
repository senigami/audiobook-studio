from __future__ import annotations

import ast
from pathlib import Path

import pytest

from app.domain.artifacts.manifest import (
    build_artifact_manifest,
    build_artifact_request_fingerprint,
    is_artifact_stale,
    validate_artifact_manifest,
)
from app.domain.artifacts.models import ArtifactOutputModel
from app.domain.chapters.batching import (
    compute_block_revision_hash,
    derive_render_batches,
)
from app.domain.chapters.drafting import normalize_chapter_draft
from app.domain.chapters.models import ChapterModel, ProductionBlockModel
from app.domain.projects.models import ProjectModel
from app.domain.projects.snapshots import build_project_snapshot, validate_project_snapshot
from app.domain.settings.ownership import build_settings_ownership_chain
from app.domain.voices.compatibility import validate_voice_compatibility
from app.domain.voices.models import VoiceAssetModel, VoicePreviewRequestModel, VoiceProfileModel
from app.domain.voices.preview import preview_voice_profile


@pytest.fixture(autouse=True)
def _disable_voxtral_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.engines.voice.voxtral.engine.resolve_mistral_api_key", lambda: None)
    from app.engines.registry import load_engine_registry

    load_engine_registry.cache_clear()
    yield
    load_engine_registry.cache_clear()


def _make_block(
    *,
    block_id: str,
    order_index: int,
    text: str,
    voice_assignment_id: str = "voice-1",
    engine_id: str = "xtts",
    engine_version: str = "2.0.0",
    character_id: str | None = None,
    estimated_work_weight: int = 1,
    synthesis_settings: dict[str, object] | None = None,
) -> ProductionBlockModel:
    return ProductionBlockModel(
        id=block_id,
        chapter_id="chapter-1",
        order_index=order_index,
        stable_key=f"stable-{block_id}",
        text=text,
        normalized_text=text,
        voice_assignment_id=voice_assignment_id,
        resolved_engine_id=engine_id,
        resolved_engine_version=engine_version,
        character_id=character_id,
        estimated_work_weight=estimated_work_weight,
        synthesis_settings=synthesis_settings or {"speed": 1.0},
    )


def test_artifact_manifest_fingerprint_and_staleness() -> None:
    output = ArtifactOutputModel(duration_ms=15320, sample_rate=24000, channels=1)
    manifest = build_artifact_manifest(
        artifact_hash="sha256:artifact",
        source_revision_id="rev-1",
        engine_id="xtts",
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
        engine_id="xtts",
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
        engine_id="xtts",
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
        engine_id="xtts",
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
            engine_id="xtts",
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
        engine_id="xtts",
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
        "engine_id": "xtts",
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


def test_render_batch_derivation_groups_compatible_blocks() -> None:
    chapter = ChapterModel(id="chapter-1", project_id="project-1", title="Chapter 1")
    blocks = [
        _make_block(block_id="block-1", order_index=0, text="A" * 1000),
        _make_block(block_id="block-2", order_index=1, text="B" * 1000),
        _make_block(block_id="block-3", order_index=2, text="C" * 1000),
    ]

    batches = derive_render_batches(chapter=chapter, blocks=blocks)

    assert len(batches) == 2
    assert batches[0].block_ids == ["block-1", "block-2"]
    assert batches[1].block_ids == ["block-3"]
    assert batches[0].resolved_engine_id == "xtts"
    assert batches[0].resolved_voice_assignment_id == "voice-1"
    assert batches[0].batch_revision_hash.startswith("sha256:")

    changed = compute_block_revision_hash(_make_block(block_id="block-1", order_index=0, text="A" * 1000, engine_version="2.0.1"))
    assert changed != compute_block_revision_hash(blocks[0])


def test_render_batch_derivation_rejects_unknown_subset_ids() -> None:
    chapter = ChapterModel(id="chapter-1", project_id="project-1", title="Chapter 1")
    blocks = [
        _make_block(block_id="block-1", order_index=0, text="One"),
        _make_block(block_id="block-2", order_index=1, text="Two"),
    ]

    with pytest.raises(ValueError, match="Unknown block ids"):
        derive_render_batches(chapter=chapter, blocks=blocks, block_ids=["block-1", "missing-block"])


def test_render_batch_derivation_keeps_subset_order_from_chapter() -> None:
    chapter = ChapterModel(id="chapter-1", project_id="project-1", title="Chapter 1")
    blocks = [
        _make_block(block_id="block-1", order_index=0, text="One"),
        _make_block(block_id="block-2", order_index=1, text="Two"),
        _make_block(block_id="block-3", order_index=2, text="Three"),
    ]

    batches = derive_render_batches(
        chapter=chapter,
        blocks=blocks,
        block_ids=["block-3", "block-1"],
    )

    assert len(batches) == 1
    assert batches[0].block_ids == ["block-1", "block-3"]


def test_render_batch_derivation_splits_on_incompatible_adjacent_blocks() -> None:
    chapter = ChapterModel(id="chapter-1", project_id="project-1", title="Chapter 1")
    blocks = [
        _make_block(block_id="block-1", order_index=0, text="One", voice_assignment_id="voice-1"),
        _make_block(block_id="block-2", order_index=1, text="Two", voice_assignment_id="voice-2"),
        _make_block(block_id="block-3", order_index=2, text="Three", voice_assignment_id="voice-2"),
    ]

    batches = derive_render_batches(chapter=chapter, blocks=blocks)

    assert [batch.block_ids for batch in batches] == [["block-1"], ["block-2", "block-3"]]


def test_render_batch_derivation_splits_on_weight_limits() -> None:
    chapter = ChapterModel(id="chapter-1", project_id="project-1", title="Chapter 1")
    blocks = [
        _make_block(block_id="block-1", order_index=0, text="One", estimated_work_weight=6),
        _make_block(block_id="block-2", order_index=1, text="Two", estimated_work_weight=6),
        _make_block(block_id="block-3", order_index=2, text="Three", estimated_work_weight=6),
    ]

    batches = derive_render_batches(chapter=chapter, blocks=blocks)

    assert [batch.block_ids for batch in batches] == [["block-1", "block-2"], ["block-3"]]


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
    chain = build_settings_ownership_chain()

    assert [item.scope for item in chain] == [
        "global",
        "project",
        "module",
        "profile_preview",
    ]
    assert [item.precedence for item in chain] == [0, 1, 2, 3]


def test_preview_payload_trims_script_text_but_preserves_request_context() -> None:
    response = preview_voice_profile(
        VoicePreviewRequestModel(
            voice_profile_id="voice-1",
            script_text="  hello world  ",
            engine_id="xtts",
            reference_text="reference",
            reference_audio_path="/tmp/reference.wav",
            voice_asset_id="asset-1",
        )
    )

    assert response["status"] == "error"
    assert response["bridge"] == "voice-preview-bridge"
    assert response["reason"] == "engine_unavailable"
    assert response["preview_request"]["script_text"] == "hello world"
    assert response["preview_request"]["voice_asset_id"] == "asset-1"
    assert response["ephemeral"] is True


def test_voice_compatibility_rejects_asset_owner_mismatch() -> None:
    profile = VoiceProfileModel(id="voice-1", name="Narrator", default_engine_id="xtts")
    asset = VoiceAssetModel(id="asset-1", voice_profile_id="voice-2", engine_id="xtts")

    with pytest.raises(ValueError, match="does not belong"):
        validate_voice_compatibility(profile=profile, engine_id="xtts", asset=asset)


def test_voice_compatibility_rejects_engine_mismatch_for_asset() -> None:
    profile = VoiceProfileModel(id="voice-1", name="Narrator", default_engine_id="xtts")
    asset = VoiceAssetModel(id="asset-1", voice_profile_id="voice-1", engine_id="voxtral")

    with pytest.raises(ValueError, match="not compatible"):
        validate_voice_compatibility(profile=profile, engine_id="xtts", asset=asset)


def test_normalize_chapter_draft_generates_revision_hashes() -> None:
    draft = normalize_chapter_draft(
        chapter_id="chapter-1",
        raw_text="First block\n\nSecond block",
    )

    assert draft.revision_id.startswith("rev_")
    assert [block.order_index for block in draft.blocks] == [0, 1]
    assert all(block.render_revision_hash and block.render_revision_hash.startswith("sha256:") for block in draft.blocks)


@pytest.mark.skip(reason="Documenting expected future behavior: duplicate text blocks should preserve distinct prior identities.")
def test_normalize_chapter_draft_preserves_duplicate_block_identity() -> None:
    first = _make_block(block_id="block-1", order_index=0, text="Repeat me")
    second = _make_block(block_id="block-2", order_index=1, text="Repeat me")

    draft = normalize_chapter_draft(
        chapter_id="chapter-1",
        raw_text="Repeat me\n\nRepeat me",
        existing_blocks=[first, second],
    )

    assert [block.id for block in draft.blocks] == ["block-1", "block-2"]
    assert len({block.stable_key for block in draft.blocks}) == 2


def test_preview_voice_profile_routes_through_real_bridge() -> None:
    response = preview_voice_profile(
        VoicePreviewRequestModel(
            voice_profile_id="voice-1",
            script_text="hello world",
            engine_id="xtts",
        )
    )

    assert response["bridge"] == "voice-preview-bridge"
    assert response["reason"] == "engine_unavailable"
    assert response["preview_request"]["engine_id"] == "xtts"
    assert response["preview_request"]["script_text"] == "hello world"


def test_preview_voice_profile_rejects_non_wav_bridge_format(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.engines.voice.voxtral.engine.resolve_mistral_api_key", lambda: "token")

    response = preview_voice_profile(
        VoicePreviewRequestModel(
            voice_profile_id="VoiceA",
            engine_id="voxtral",
            script_text="Hello there",
            output_format="mp3",
        )
    )

    assert response["status"] == "error"
    assert response["reason"] == "invalid_request"
    assert "output_format='wav' only" in response["message"]
    assert response["preview_request"]["output_format"] == "mp3"


@pytest.mark.skip(reason="Documenting expected artifact validation behavior: reuse checks should accept explicit non-text revision inputs from the caller.")
def test_artifact_service_validate_reuse_accepts_full_revision_inputs() -> None:
    raise AssertionError("ArtifactService.validate_reuse should compare caller-supplied revision inputs, not stored manifest values.")


@pytest.mark.parametrize(
    "module_path",
    [
        "app/domain/artifacts/manifest.py",
        "app/domain/chapters/batching.py",
        "app/domain/projects/snapshots.py",
        "app/domain/settings/ownership.py",
        "app/domain/voices/compatibility.py",
        "app/domain/voices/preview.py",
    ],
)
def test_new_domain_modules_do_not_import_web_or_jobs(module_path: str) -> None:
    source = (Path(__file__).resolve().parents[1] / module_path).read_text(encoding="utf-8")
    tree = ast.parse(source, filename=module_path)

    forbidden = {"app.web", "app.jobs"}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module in forbidden:
            raise AssertionError(f"{module_path} imports forbidden module {node.module}")
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in forbidden:
                    raise AssertionError(f"{module_path} imports forbidden module {alias.name}")

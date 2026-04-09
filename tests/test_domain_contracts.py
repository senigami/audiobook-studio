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
from app.domain.chapters.models import ChapterModel, ProductionBlockModel
from app.domain.projects.models import ProjectModel
from app.domain.projects.snapshots import build_project_snapshot, validate_project_snapshot
from app.domain.settings.ownership import build_settings_ownership_chain


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


def test_render_batch_derivation_groups_compatible_blocks() -> None:
    chapter = ChapterModel(id="chapter-1", project_id="project-1", title="Chapter 1")
    blocks = [
        ProductionBlockModel(
            id="block-1",
            chapter_id="chapter-1",
            order_index=0,
            stable_key="a",
            text="A" * 1000,
            normalized_text="A" * 1000,
            voice_assignment_id="voice-1",
            resolved_engine_id="xtts",
            resolved_engine_version="2.0.0",
            synthesis_settings={"speed": 1.0},
        ),
        ProductionBlockModel(
            id="block-2",
            chapter_id="chapter-1",
            order_index=1,
            stable_key="b",
            text="B" * 1000,
            normalized_text="B" * 1000,
            voice_assignment_id="voice-1",
            resolved_engine_id="xtts",
            resolved_engine_version="2.0.0",
            synthesis_settings={"speed": 1.0},
        ),
        ProductionBlockModel(
            id="block-3",
            chapter_id="chapter-1",
            order_index=2,
            stable_key="c",
            text="C" * 1000,
            normalized_text="C" * 1000,
            voice_assignment_id="voice-1",
            resolved_engine_id="xtts",
            resolved_engine_version="2.0.0",
            synthesis_settings={"speed": 1.0},
        ),
    ]

    batches = derive_render_batches(chapter=chapter, blocks=blocks)

    assert len(batches) == 2
    assert batches[0].block_ids == ["block-1", "block-2"]
    assert batches[1].block_ids == ["block-3"]
    assert batches[0].resolved_engine_id == "xtts"
    assert batches[0].resolved_voice_assignment_id == "voice-1"
    assert batches[0].batch_revision_hash.startswith("sha256:")

    changed = compute_block_revision_hash(
        ProductionBlockModel(
            id="block-1",
            chapter_id="chapter-1",
            order_index=0,
            stable_key="a",
            text="A" * 1000,
            normalized_text="A" * 1000,
            voice_assignment_id="voice-1",
            resolved_engine_id="xtts",
            resolved_engine_version="2.0.1",
            synthesis_settings={"speed": 1.0},
        )
    )
    assert changed != compute_block_revision_hash(blocks[0])


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


@pytest.mark.parametrize(
    "module_path",
    [
        "app/domain/artifacts/manifest.py",
        "app/domain/chapters/batching.py",
        "app/domain/projects/snapshots.py",
        "app/domain/settings/ownership.py",
        "app/domain/voices/compatibility.py",
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

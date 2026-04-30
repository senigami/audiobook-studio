# Implementation Blueprint: Domain Data Model & Persistence (Studio 2.0)

This is the missing foundation under the rest of the 2.0 plans. Before queueing, editor, and reuse logic can be trustworthy, we need a concrete model for what the system is storing and how those entities relate.

## 1. Goals

- Make project, chapter, block, voice, artifact, and queue state explicit.
- Support revision-safe rerender and recovery.
- Keep projects portable while still allowing safe shared-cache reuse.
- Preserve clear ownership between library data, project data, and immutable artifacts.

## 2. Core Entities

### Project

- `id`
- `title`
- `author`
- `series`
- `cover_asset_ref`
- `default_voice_id`
- `default_output_preset`
- `pronunciation_profile_id`
- `status`
- `created_at`
- `updated_at`

### Chapter

- `id`
- `project_id`
- `title`
- `order_index`
- `source_revision`
- `active_draft_revision`
- `status`
- `word_count`
- `character_count`

### ProductionBlock

- `id`
- `chapter_id`
- `order_index`
- `stable_key`
- `text`
- `normalized_text`
- `character_id`
- `voice_assignment_id`
- `render_revision_hash`
- `last_rendered_artifact_id`
- `status`
- `last_error`

### RenderBatch

- `id`
- `chapter_id`
- `block_ids`
- `stable_batch_key`
- `resolved_engine_id`
- `resolved_voice_assignment_id`
- `batch_revision_hash`
- `estimated_work_weight`
- `status`

### VoiceProfile

- `id`
- `name`
- `default_engine_id`
- `capabilities`
- `labels`
- `created_at`
- `updated_at`

### VoiceAsset

- `id`
- `voice_profile_id`
- `engine_id`
- `engine_version`
- `asset_type`
- `path_ref`
- `metadata`
- `status`

### RenderArtifact

- `id`
- `artifact_hash`
- `engine_id`
- `engine_version`
- `voice_asset_id`
- `request_fingerprint`
- `duration_ms`
- `sample_rate`
- `channels`
- `manifest_path`
- `audio_path`
- `created_at`

### QueueJob

- `id`
- `job_type`
- `parent_job_id`
- `project_id`
- `chapter_id`
- `render_batch_id`
- `resource_profile`
- `priority`
- `status`
- `attempt_count`
- `max_attempts`
- `payload_json`
- `reason_code`
- `reason_detail`
- `recovered_from_interruption`
- `created_at`
- `started_at`
- `finished_at`

### Snapshot

- `id`
- `project_id`
- `label`
- `source_revision`
- `metadata_json`
- `created_at`

## 3. Critical Relationships

- A project owns chapters, snapshots, and output presets.
- A chapter owns ordered production blocks and draft revisions.
- A chapter may derive ordered render batches from adjacent compatible production blocks.
- A block may reference a compatible voice assignment and the last valid artifact for its current revision.
- A render batch represents an execution-time grouping, not a replacement for editorial identity.
- A voice profile may have many engine-specific voice assets.
- A render artifact is immutable and may be referenced by multiple projects safely.
- A queue job may have child jobs and may target a project, chapter, or block set.
- A queue job may also target a render batch derived from one or more adjacent production blocks when batching rules allow.

## 3.1 Editing Unit Versus Rendering Unit

Studio 2.0 must preserve an important current behavior: the unit the user edits is not always the unit we render.

- **Production block**: the editorial/source-of-truth unit
- **Render batch**: the execution unit used for synthesis when adjacent blocks are compatible

Compatibility for batching may depend on:

- resolved voice assignment
- engine
- character continuity
- text-size limits
- synthesis settings that affect output

The plan must preserve both:

- stable editorial identity for undo/history/selection
- efficient grouped rendering for throughput and audio continuity

## 4. Revision Hash Rules

The block render revision hash must include:

- normalized text
- voice assignment reference
- engine id and version
- synthesis settings that affect output
- normalization or post-processing options that affect the produced waveform

If any of those change, the prior artifact becomes stale for that block revision.

## 5. Artifact Manifest Contract

Each stored artifact should have a manifest like:

```json
{
  "artifact_hash": "sha256:...",
  "request_fingerprint": "sha256:...",
  "engine": {
    "id": "xtts",
    "version": "2.0.0"
  },
  "voice_asset_id": "voice_asset_123",
  "block_revision_hash": "sha256:...",
  "text_hash": "sha256:...",
  "settings_hash": "sha256:...",
  "output": {
    "duration_ms": 15320,
    "sample_rate": 24000,
    "channels": 1
  }
}
```

## 6. Persistence Rules

- Projects must remain portable without depending on absolute machine-specific paths.
- Immutable artifact cache entries must never be modified in place.
- Project-local state may reference cached artifacts, but it must do so via stable IDs or relative refs, not fragile absolute paths.
- Recovery logic must validate artifact manifests against the current requested revision before reuse.

## 7. Implementation Procedure

1. Define Python models for the core entities.
2. Define DB schema or table migrations for the new entities.
3. Introduce repositories that hide storage details from route handlers and queue tasks.
4. Implement render-batch derivation rules in the chapter domain.
5. Implement manifest writing and validation helpers.
6. Add tests for stale detection, artifact reuse, grouped render-batch derivation, and project portability.

## 8. Invariants We Must Protect

- A block cannot be marked rendered for a revision that does not match its current hash.
- A shared artifact cannot be mutated after publication.
- A project import/export must remain valid without rebuilding unrelated library state.
- Queue recovery must never silently reuse stale output.

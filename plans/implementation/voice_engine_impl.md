# Implementation Blueprint: Universal Voice Interface (Studio 2.0)

This document turns the voice system plan into concrete implementation work.

## 1. Files I Want To Create

- `app/engines/voice/base.py`
- `app/engines/registry.py`
- `app/engines/bridge.py`
- `app/engines/voice/xtts/engine.py`
- `app/engines/voice/xtts/manifest.json`
- `app/engines/voice/xtts/settings_schema.json`
- `app/engines/voice/voxtral/engine.py`
- `app/engines/voice/voxtral/manifest.json`
- `app/engines/voice/voxtral/settings_schema.json`

## 2. Procedure

### Step 1: Define Shared Contracts

- `EngineCapabilities`
- `EngineHealth`
- `SynthesisRequest`
- `EngineResult`
- `VoiceAssetBuildRequest`
- `VoiceAssetBuildResult`

### Step 2: Build The Registry

- Discover internal engine modules from the known engine directory.
- Load and validate manifests.
- Expose engine capabilities, settings schema, and health checks.

### Step 3: Build The Bridge

- Resolve voice profile and voice asset
- Validate request compatibility
- Normalize engine invocation
- Convert engine result into artifact publication inputs

### Step 4: Wrap XTTS And Voxtral

- Keep current engine-specific behavior but move it behind the shared contract.
- Preserve XTTS subprocess isolation through the wrapper.
- Normalize cloud engine results into the same result shape as local engines.

## 3. Required Engine Behaviors

- validate environment
- validate request
- synthesize to a temp output
- report progress or translated phase events
- emit enough metadata for artifact manifest creation

## 4. Artifact Safety Procedure

1. The engine writes audio to a temp location.
2. The bridge validates the file.
3. The artifact manifest is written.
4. The artifact is atomically published into the immutable cache.
5. The related block revisions are updated to point at the new valid artifact.

## 5. Testing Plan

- Unit tests for manifest loading and validation
- Unit tests for bridge preflight validation
- XTTS and Voxtral wrapper tests with mocked dependencies
- Mock engine tests for artifact publication behavior

## 6. Guardrails

- No route handler or queue task should call engine-specific code directly.
- No engine wrapper should decide queue policy.
- No engine result should bypass artifact manifest publication.

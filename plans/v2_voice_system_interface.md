# Proposal: Universal Voice System Interface (Studio 2.0)

This is the engine boundary I want us to build around. The goal is not just “support more engines.” The goal is to prevent engine-specific concerns from leaking into queueing, project state, and UI decisions.

## 1. Objectives

- Standardize how synthesis engines are registered, configured, validated, and called.
- Separate canonical voice identity from engine-specific voice assets.
- Make engine setup and health visible to users before a job fails.
- Support future engines without forcing queue, project, and editor rewrites.

## 2. Core Concepts

### Voice Profile

A user-facing reusable voice identity. It can be used across projects and may have multiple engine-specific assets.

### Voice Asset

An engine-specific artifact that makes a voice profile usable for one engine. Examples include XTTS latents, speaker wav bundles, or cloud provider references.

### Preview/Test Configuration

A lightweight voice-level configuration used for fast validation, preview samples, or test synthesis without forcing a full project render flow.

### Engine Module

An internal module that implements the standard contract and declares its capabilities through a manifest.

### Voice Bridge

The only service allowed to route synthesis requests to an engine implementation.

## 3. Engine Contract

```python
class BaseVoiceEngine(Protocol):
    engine_id: str
    engine_version: str

    def validate_environment(self) -> EngineHealth:
        ...

    def validate_request(self, request: SynthesisRequest) -> ValidationResult:
        ...

    def synthesize(self, request: SynthesisRequest) -> EngineResult:
        ...

    def build_voice_asset(self, request: VoiceAssetBuildRequest) -> VoiceAssetBuildResult:
        ...

    def list_capabilities(self) -> EngineCapabilities:
        ...
```

## 4. What I Want To Create

### 4.1 Engine Registry

- Loads internal engine modules from `app/engines/voice/`
- Reads a manifest for each engine
- Exposes engine capabilities, settings schema, health, and resource profile

### 4.2 Voice Bridge

- Resolves voice profile to a compatible voice asset
- Performs preflight validation
- Builds the final engine request
- Normalizes engine results into artifact and progress events

### 4.3 Voice Module Management

- Dedicated UI for module readiness, setup, health, and advanced settings
- Hand-designed module cards first, schema-generated advanced settings second
- Test action for generating a quick sample with visible diagnostics
- Clear privacy disclosure when a module sends text or audio off-machine to a cloud provider

### 4.4 Voice Preview/Test Flow

- A standardized lightweight test path for validating a voice profile or engine setup
- Support for profile-level preview settings such as test text, engine choice, and optional reference sample
- Fast failure messaging when preview configuration is incomplete

Implementation alignment:

- preview/test behavior should live alongside the voice domain and engine bridge, not as an orphaned utility path
- preview outputs should remain distinct from canonical project render artifacts unless explicitly promoted

## 5. Manifest Requirements

Each engine manifest must declare:

- `engine_id`
- `display_name`
- `engine_version`
- `min_app_version`
- `resource_profile`
- `supported_languages`
- `supported_voice_asset_types`
- `supports_local_execution`
- `supports_cloud_execution`
- `settings_schema_version`
- `requires_network`
- `health_checks`

## 6. Request And Result Contracts

### SynthesisRequest must include

- project id
- chapter id
- block ids
- normalized text
- target output format
- voice profile id
- resolved voice asset id
- engine id and version
- synthesis settings
- output normalization settings
- request fingerprint

### EngineResult must include

- status
- warnings
- engine logs or normalized progress events
- output temp path
- output metadata
- request fingerprint

## 7. Critical Procedures

### Before Queueing

1. Resolve the voice profile.
2. Resolve a compatible voice asset for the selected or default engine.
3. Validate engine readiness and capability support.
4. Build the request fingerprint and block revision hashes.
5. Reject invalid requests before they enter the queue.

### Before Preview/Test Generation

1. Resolve the voice profile and preview/test configuration.
2. Validate engine readiness and required voice assets.
3. Run a lightweight generation path with clear diagnostics.
4. Keep preview/test outputs isolated from canonical chapter render artifacts unless we explicitly choose to promote them.

### During Synthesis

1. Write output to a temp location.
2. Validate the produced file.
3. Write artifact manifest metadata.
4. Atomically publish the artifact to the immutable cache.
5. Emit standardized progress and result events.

### After Synthesis

1. Associate the artifact with the relevant block revisions.
2. Publish completion through the progress and queue services.
3. Surface warnings without collapsing the artifact into a generic success/failure binary.

## 8. UX Requirements

- Users must see if an engine is `Ready`, `Needs Setup`, `Offline`, `Invalid Config`, or `Incompatible`.
- Engine-specific settings must not clutter project and chapter screens.
- The UI must show when changing a module setting invalidates cached renders or only affects future renders.
- Silent engine fallback is prohibited. If fallback is supported, it must be explicit at queue time and visible in the UI.
- Cloud engines must clearly disclose that text and optional reference audio leave the local machine.

## 9. Known Risks And Planned Solutions

- **Risk: Voice profiles become coupled to one engine**
  Solution: keep canonical voice identity separate from engine-specific assets.
- **Risk: Dynamic settings forms feel opaque**
  Solution: combine schema-driven advanced settings with opinionated setup dashboards.
- **Risk: Engine wrappers leak special cases back into the queue**
  Solution: force every engine-specific behavior through the bridge contract and result normalization.
- **Risk: preview/test functionality disappears in the architecture rewrite**
  Solution: model preview/test as an explicit supported flow in the bridge and library plans.

## 10. Implementation References

- `plans/implementation/domain_data_model.md`
- `plans/implementation/voice_engine_impl.md`
- `plans/v2_project_library_management.md`

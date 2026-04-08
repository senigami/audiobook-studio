# Proposal: Universal Voice System Interface (Studio 2.0)

## 1. Objective
Create a common API that abstracts away the specific implementation details of various text-to-speech engines, allowing for rapid integration of new models (XTTS, Voxtral, OmniVoice, Local Voxtral, etc.) without modifying core application logic.

> [!NOTE]
> See the [Detailed Implementation Blueprint](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/plans/implementation/voice_engine_impl.md) for specifics on modular settings, manifest schemas, and the VUI bridge.

## 2. The `BaseVoiceEngine` Interface
Each engine module will implement a standardized class interface.

```python
class BaseVoiceEngine:
    def __init__(self, config: Dict): ...
    
    def generate(self, text: str, voice_profile: str, out_path: Path, **kwargs) -> EngineResult:
        """Core synthesis method."""
        pass

    def build_profile(self, sample_wavs: List[Path], profile_name: str) -> bool:
        """Extract latents or create engine-specific profile assets."""
        pass

    def get_status(self) -> EngineStatus:
        """Health check (e.g. model loaded, API key valid)."""
        pass
```

## 3. Pluggable Architecture

### 3.1 `EngineRegistry`
A central registry that loads installed engine modules. 
- **Dynamic Loading**: Engines can be added as standalone python packages or modules in an `engines/` directory.
- **Manifests**: Each engine provides a `manifest.json` describing its capabilities (e.g., handles emotions, supports local GPU, requires internet).

### 3.2 Standardized Input/Output
- **`SynthesisRequest`**: A common object containing text, parameters (speed, emotion), and output preferences.
- **`EngineResult`**: A common return object with status, log streams, and the path to the generated audio.

## 4. "Installed Voice Modules" UI (UX Improvement)
To keep the main Studio interface clean, module-specific configurations will be relocated to a dedicated "Installed Voice Modules" page.
- **Dynamic Configuration**: Editors for Voxtral API keys or OmniVoice constraints live here, separated from the project layout.
- **Custom ETA Multipliers**: Each module exposes an `engine_speed_multiplier` setting. Users can tune this to make ETA predictions universally more accurate for their specific hardware.

## 5. Specific Engine Wrappers (Examples)

- **`XTTSModule`**: Wraps the existing subprocess logic for local execution.
- **`VoxtralCloudModule`**: Wraps the cloud API calls.
- **`OmniVoiceModule` (future)**: Would only require implementing the standard interface to become instantly available in the UI.

## 6. Global Voice System (Bridge Pattern)
The application logic doesn't call an engine directly. Instead, it interacts with the `VoiceBridge`.
- **Responsibility**: Routing requests to the correct engine based on the speaker profile settings.
- **Abstraction**: Handles common tasks like "Final MP3 conversion" or "Loudness normalization" that apply to all engines.

## 7. Planned Benefits
- **Future-Proofing**: New AI models can be integrated in days, not weeks.
- **Modular UX**: The global Studio interface remains simple. Complex, engine-specific settings are tucked away in module configurations.
- **Hardware Agnostic**: The system can intelligently route jobs to local GPU engines if available, or fall back to cloud engines.

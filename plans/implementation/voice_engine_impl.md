# Implementation Blueprint: Universal Voice Interface (Studio 2.0)

## 1. Objective
Standardize the integration of disparate TTS models, ensuring that global application logic remains simple while giving each engine full control over its own settings and hardware requirements.

## 2. Engine Module Structure
Each module (e.g., `engines/xtts/`, `engines/voxtral/`) will contain:
- **`engine.py`**: Implementation of the `BaseVoiceEngine` interface.
- **`settings_schema.json`**: A JSONSchema defining the engine's custom settings (e.g., API keys, temperature, repetition penalty).
- **`manifest.json`**: Metadata (Name, Icon, Capabilities, Default `speed_multiplier`).

## 3. The `VoiceBridge` Service (Backend)
- **Settings Injection**: When a `SynthesisRequest` is made, the `Bridge` retrieves the relevant engine settings from the DB and injects them into the engine instance.
- **Unified Progress Stream**: Standardizes log/status messages from engines into the `ProgressService` format.

## 4. Modular Settings Management (Installed Voice Modules UX)
To keep the global interface simple, we use a **Dynamic Form** approach hosted on a dedicated "Installed Voice Modules" page.
- **Settings Tab Overview**: Shows a list of installed engines. Clicking an engine renders a form dynamically generated from its `settings_schema.json`.
- **Isolation**: Voxtral settings (API Key) are stored under `engine_settings:voxtral`, completely separate from XTTS settings and global project settings.
- **Speed Multiplier**: Every engine has a reserved `global_speed_multiplier` setting. Users can tune this if they find the ETA predictions are consistently off for their specific hardware.

## 5. Voice Profile Integration
- **Engine Selection**: A voice profile is bound to an engine module.
- **Capabilities Check**: Before a job starts, the `Bridge` checks if the engine is "Available" (e.g., handles the requested language, has a valid API key).

## 6. Logic Sample: The Synthesis Call

```python
# The Global Interface stays simple:
result = voice_bridge.generate(
    text="Hello world", 
    voice_profile="NarratorA", 
    out_path="./output.wav"
)

# Internally, the Bridge handles:
# 1. Resolve 'NarratorA' -> uses 'XTTS' engine
# 2. Fetch 'XTTS' settings from DB
# 3. Call XTTS.generate(text, settings, out_path)
```

## 7. Planned Benefits
- **Zero-Core Changes**: Adding a new engine like OmniVoice requires 0 changes to `web.py` or `worker.py`.
- **Dynamic UI**: No need to manually build React components for every new engine setting.
- **Personalized ETA**: The `speed_multiplier` allows users to self-tune the system for their specific machine performance.

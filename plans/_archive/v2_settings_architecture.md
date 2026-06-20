# Proposal: Settings Architecture (Studio 2.0)

This document defines the structure, UX patterns, and ownership model for Studio's settings as the application grows beyond the current popover tray.

## 1. Problem

The current settings are implemented as a popover tray (SettingsTray.tsx) that opens from the header. It contains synthesis preferences (Safe Mode, Produce MP3, Backfill MP3s) and Voxtral cloud voice configuration (API key, model selector, enable toggle).

This works for two engines and five settings. It will not scale when:

- More TTS engines are added as plugins, each with their own configuration
- A local TTS API is introduced with bind address, priority, and authentication settings
- Additional application-level settings are needed (themes, export defaults, etc.)

## 2. Solution: Tabbed Settings Page

A dedicated settings page accessible via the navigation, with tabs for logical groupings. This follows the standard UX pattern used by VS Code, Discord, Obsidian, and other professional tools that outgrow a single settings panel.

### 2.1 Route Structure

```text
/settings              → General tab (default)
/settings/engines      → TTS Engines tab
/settings/api          → API tab
/settings/about        → About tab
```

Each tab is deep-linkable. Users can bookmark, share, or navigate directly to a specific settings section.

### 2.2 Page Layout

```text
┌──────────────────────────────────────────────────────────────────┐
│ ⚙️  Settings                                          [Search]  │
├──────────┬───────────────────────────────────────────────────────┤
│          │                                                       │
│ General  │  (Content area for the active tab)                    │
│          │                                                       │
│ TTS ━━━━━│                                                       │
│ Engines  │                                                       │
│          │                                                       │
│ API      │                                                       │
│          │                                                       │
│ About    │                                                       │
│          │                                                       │
├──────────┴───────────────────────────────────────────────────────┤
│ Changes auto-save · Audiobook Studio v2.0.0                      │
└──────────────────────────────────────────────────────────────────┘
```

- Left sidebar: tab navigation with icons
- Right content area: scrollable settings for the active tab
- Footer: save indicator and version info
- Search bar: filters settings across all tabs (future enhancement)

## 3. Tab Specifications

### 3.1 General Tab

Migrated from the current SettingsTray:

| Setting | Control | Description |
|---------|---------|-------------|
| Safe Mode | Toggle | Auto-recover engine after errors |
| Produce MP3 | Toggle | Generate MP3 alongside WAV output |
| Backfill MP3s | Action button | Generate missing MP3s for existing renders |

Future additions:
- Default output format (WAV, MP3, OGG)
- Default language
- Theme selection (when dark/light theme is implemented)
- Export defaults (bitrate, sample rate)

### 3.2 TTS Engines Tab

Displays all installed engine plugins as collapsible cards. Each card groups the engine's status, verification state, and settings together.

#### Card Layout (Collapsed)

```text
┌─── XTTS v2.0.1 ──────────────────── 🟢 Verified ─────────────┐
│ Local GPU · English, Spanish                                   │
│                                                    [▼ Expand]  │
└────────────────────────────────────────────────────────────────┘
```

#### Card Layout (Expanded)

```text
┌─── XTTS v2.0.1 ──────────────────── 🟢 Verified ─────────────┐
│ Local GPU · English, Spanish                                   │
│                                                                │
│ ┌─ Settings ────────────────────────────────────────────────┐  │
│ │ Temperature          [0.7    ▼]  Controls randomness      │  │
│ │ Repetition Penalty   [2.0    ▼]  Reduces repeated tokens  │  │
│ │ Speed Multiplier     [1.0    ▼]  Playback speed factor    │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                │
│ [Test Voice]  [Verify]  [View Logs]  [Deactivate]             │
└────────────────────────────────────────────────────────────────┘
```

#### Status Badges

| Badge | Color | Meaning |
|-------|-------|---------|
| `Verified` | Green 🟢 | Environment OK, test synthesis passed |
| `Ready` | Blue 🔵 | Environment OK, not yet verified |
| `Needs Setup` | Yellow 🟡 | Missing dependencies or configuration |
| `Unverified` | Orange 🟠 | Environment OK, test synthesis failed |
| `Invalid Config` | Red 🔴 | Environment check failed |
| `Not Loaded` | Gray ⚪ | Manifest invalid or engine import failed |

#### Schema-Driven Settings Forms

Engine settings are rendered dynamically from each plugin's `settings_schema.json`:

| JSON Schema Type | Rendered Control |
|-----------------|-----------------|
| `number` with `minimum`/`maximum` | Slider with number input |
| `number` without range | Number input |
| `string` | Text input |
| `string` with `format: "password"` | Password input (masked) |
| `string` with `enum` | Dropdown select |
| `boolean` | Toggle switch |
| `integer` | Integer input |

Fields are displayed in the order they appear in the schema's `properties`. The `title` field is used as the label, and `description` is shown as helper text beneath each control.

#### Engine Actions

| Action | Behavior |
|--------|----------|
| Test Voice | Run a quick preview synthesis with a default text |
| Verify | Re-run verification synthesis and update status badge |
| View Logs | Show recent engine logs in a collapsible panel |
| Deactivate | Disable the engine without removing the plugin |
| Install Dependencies | Run `pip install -r requirements.txt` (shown only when deps are missing) |
| Remove Plugin | Delete the plugin folder (with confirmation prompt) |

#### Cloud Engine Disclosure

For engines where `cloud: true` or `network: true` in the manifest:

```text
⚠️ Privacy: This engine sends text and optional reference audio to
   external servers. Keep your workflow local by using a local engine.
```

This disclosure is shown prominently in the card, consistent with the existing Voxtral privacy warning.

#### Bottom Actions

```text
[+ Install Plugin]  [Refresh Plugins]
```

- **Install Plugin**: Opens a file picker to select a plugin folder to copy into `plugins/`
- **Refresh Plugins**: Calls `POST /plugins/refresh` on the TTS Server to re-scan the directory

### 3.3 API Tab

Configuration for the local TTS API:

| Setting | Control | Description |
|---------|---------|-------------|
| Enable API | Toggle | Start/stop the API endpoints |
| Network Access | Dropdown | `Local Only` (127.0.0.1) or `LAN` (0.0.0.0) |
| API Key | Password input + Generate button | Optional authentication key |
| Task Priority | Dropdown | `Studio First`, `Equal`, `API First` |
| Max Pending Jobs | Number input | Maximum queued API jobs (default: 10) |

When the API is enabled, the tab shows the base URL and a sample curl command:

```text
API Base URL: http://127.0.0.1:7860/api/v1/tts

Example:
  curl -X POST http://127.0.0.1:7860/api/v1/tts/synthesize \
    -H "Content-Type: application/json" \
    -d '{"engine_id": "xtts", "text": "Hello world"}' \
    --output output.wav
```

### 3.4 About Tab

| Item | Content |
|------|---------|
| Studio Version | `v2.0.0` |
| TTS Server Status | `Running on port 7862` / `Not running` |
| Installed Engines | Count and names |
| Python Version | Runtime version info |
| CUDA Available | Yes/No + GPU info |
| Links | GitHub, Wiki, Pinokio, Issue tracker |

## 4. SettingsTray Migration

The current SettingsTray popover stays as a **quick-access widget** for the most common toggles:

### What Stays In The Tray

- Safe Mode toggle
- Produce MP3 toggle
- "All Settings →" link to the full settings page

### What Moves To The Settings Page

- Voxtral configuration (API key, model, enable toggle) → TTS Engines tab
- Backfill MP3s action → General tab

The tray becomes a lightweight shortcut, not a full settings surface.

## 5. Settings Ownership Model

Following the modular architecture rules, settings ownership is explicit:

| Category | Owner | Storage | Access |
|----------|-------|---------|--------|
| General app settings | Studio `app/domain/settings/` | Studio database | Settings API |
| Per-engine settings | TTS Server `plugins/tts_<name>/settings.json` | Plugin folder | TTS Server API |
| API configuration | Studio `app/core/config.py` | Studio database or `.env` | Settings API |
| Project-level engine overrides | Studio project domain | Project database record | Project API |

Key rules:
- The Settings UI writes to the appropriate owner via the correct API
- Engine settings go through the TTS Server, not directly to the plugin folder
- Project-level overrides (e.g., "use temperature 0.5 for this project") override global engine settings but do not modify the global values

## 6. Search (Future Enhancement)

When the settings page has enough options to warrant it, a search bar will filter settings across all tabs:

- Search matches against setting names, descriptions, and tab names
- Matching settings are highlighted in their tab
- Non-matching settings are hidden or dimmed
- Clicking a result navigates to the correct tab and scrolls to the setting

This is not a launch requirement but should be planned for in the component architecture.

## 7. Responsive Design

- On wide screens (>1200px): side tab navigation + content area
- On narrow screens (<800px): tabs collapse to a top dropdown or horizontal scrollable tabs
- Settings cards (engine cards) are full-width on all screen sizes
- Form controls maintain minimum touch target sizes on all screen sizes

## 8. Implementation References

- `plans/v2_voice_system_interface.md` — voice module management concept
- `plans/v2_plugin_sdk.md` — settings schema format and engine card data
- `plans/v2_local_tts_api.md` — API tab requirements
- `plans/v2_tts_server.md` — TTS Server health data for About tab
- `plans/phases/phase_7_editor_and_voice_ux.md` — Phase 7 deliverables
- `frontend/src/components/SettingsTray.tsx` — current settings implementation to migrate

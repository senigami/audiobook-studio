# Plugin Submission Guidelines

Thank you for building a plugin for Audiobook Studio! We welcome third-party contributions that expand the ecosystem of high-performance local TTS engines.

This document outlines the submission process, review criteria, and security expectations for plugins intended for inclusion in the official repository or recommended community lists.

## 🚀 Submission Process

1.  **Preparation**: Ensure your plugin follows the [Plugin Guide](plugin-guide.md) and passes the [Submission Checklist](plugin-guide.md#submission-checklist).
2.  **Packaging**:
    *   **Folder-Dropin**: Recommended for early development or narrow use cases.
    *   **Pip-Installed**: Recommended for stable, shared plugins. Your plugin must expose the `studio.tts` entry point in its `pyproject.toml` or `setup.py`.
3.  **Fork and PR**:
    *   Fork the repository.
    *   Add your plugin to the `plugins/` directory (if folder-dropin) or update the documentation/links (if pip-installed).
    *   Submit a Pull Request (PR) with a clear description of the engine's capabilities and dependencies.

---

## 🔍 Review Process

Maintainers will review your plugin against three primary categories: **Safety**, **Stability**, and **Compatibility**.

### 1. Safety and Security Audit
Because plugins run as raw Python code, we perform a strict manual audit of the source code:
*   **Imports**: No imports from `app.*` or other internal Studio modules.
*   **File Access**: No reads or writes outside the plugin's own folder or the requested `output_path`.
*   **Network**: No unauthorized outbound network calls (e.g., telemetry or auto-updates) unless explicitly documented and user-disclosable.
*   **Dependencies**: Review of `requirements.txt`. We avoid plugins that require conflicting versions of core dependencies (e.g., `torch`, `fastapi`).

### 2. Stability and Performance
*   **Environment Check**: Does `check_env()` provide a clear and helpful error message if dependencies (like FFmpeg or GPU drivers) are missing?
*   **Resource Management**: Does the plugin correctly release VRAM/RAM in `shutdown()`? Does it avoid blocking the main thread during heavy computation?
*   **Verification**: The plugin must pass a **Verification Synthesis** pass in a standard environment.

### 3. User Experience
*   **Settings Schema**: Is the `settings_schema()` intuitive? Does it use appropriate field types (e.g., ranges for sliders, enums for dropdowns)?
*   **Documentation**: Does the plugin include a `README.md` with setup instructions and model licensing information?

---

## ✅ Acceptance Criteria

To be accepted into the official repository, a plugin should:
1.  **Pass all security audits**.
2.  **Be self-contained**: It should not require manual system-level configuration beyond standard `pip install` (or a guided `check_env()` setup).
3.  **Provide a "Good" default**: The default settings should produce high-quality audio out of the box.
4.  **Have a clear license**: The plugin code must be compatible with the project's license (MIT/GPL), and the underlying TTS model must have a clear usage policy.

## ⚖️ Maintenance Expectation

By submitting a plugin to the official repository, you agree to:
*   **Fix breaking changes**: Keep the plugin updated as the Studio SDK evolves.
*   **Respond to issues**: Help users who report engine-specific bugs.

*Note: Maintainers reserve the right to move under-maintained or broken plugins to a "Legacy" category or remove them if they pose security risks.*

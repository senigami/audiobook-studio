# Voxtral CLI Builder Harness

This directory contains a standalone CLI builder harness for the Voxtral plugin. It allows you to compose CLI commands, test the plugin's data contract, and persist test inputs without needing a web server or a running Studio instance.

> [!IMPORTANT]
> This harness is a technical development tool for CLI testing. For an accurate visual preview of the plugin settings UI, use **Studio Dev Mode** (available in the Studio app when `dev.enabled` is set in the manifest).

## Usage

1. Open `index.html` directly in your web browser.
2. Use the state buttons at the top to simulate different plugin conditions (Ready, Missing Key, API Error, etc.).
3. Adjust the settings fields in the "Engine Settings" panel.
4. Fill in the "Harness Inputs" (Text, Reference Audio, Out) to compose a CLI command.
5. Copy the generated command from the "CLI Command Composer" panel to test audio generation in your terminal.
6. Observe the "Studio State Object" on the right. This represents the JSON contract that Studio consumes from the plugin.

## Manual Verification

- **Ready State**: Status should be green/ready; message should indicate readiness.
- **Missing Key**: Status should be amber; message should prompt for API key.
- **Settings Sync**: Changing any value in the form should immediately update the matching value in the JSON State Object and the CLI Command.
- **Persistence**: Refreshing the page should preserve your "Harness Inputs" (stored in `localStorage`).
- **JSON Integrity**: The JSON panel should always show a valid object containing `id`, `status`, `message`, and `settings`.

## Design Goal

This harness ensures that the plugin's metadata translates correctly to a functional CLI command and a valid JSON contract. Visual fidelity is handled exclusively by Studio's internal rendering components.

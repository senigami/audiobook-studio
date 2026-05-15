# XTTS Static Developer Harness

This directory contains a standalone developer harness for the XTTS plugin. It allows you to visualize the plugin's data contract, test the CLI command composer, and persist test inputs without needing a web server.

> [!IMPORTANT]
> This harness is a development tool. Audiobook Studio 2.0 remains the authoritative source for the actual plugin UI. Use this page to verify that your `manifest.json` and `settings_schema.json` produce the expected state objects.

## Usage

1. Open `index.html` directly in your web browser (e.g., drag and drop it into Chrome or Firefox).
2. Use the state buttons at the top to simulate different plugin conditions (Ready, Needs Setup, Error, etc.).
3. Adjust the settings fields in the "Engine Settings" panel.
4. Fill in the "Harness Inputs" (Text, Voice, Out) to compose a CLI command.
5. Copy the generated command from the "CLI Command Composer" panel to test audio generation in your terminal.
6. Observe the "Studio State Object" on the right. This represents the JSON contract that Studio consumes from the plugin.

## Manual Verification

- **Ready State**: Status should be green/ready; message should indicate readiness.
- **Needs Setup**: Status should be amber; message should mention missing dependencies.
- **Settings Sync**: Changing any value in the form should immediately update the matching value in the JSON State Object and the CLI Command.
- **Persistence**: Refreshing the page should preserve your "Harness Inputs" (stored in `localStorage`).
- **JSON Integrity**: The JSON panel should always show a valid object containing `id`, `status`, `message`, and `settings`.

## Design Goal

This harness ensures that the plugin's metadata (manifest and schema) translates correctly to the Studio 2.0 UI before the plugin is ingested into a repository or distributed to users.

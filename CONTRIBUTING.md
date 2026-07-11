# Contributing to Audiobook Studio

First off, thank you for considering contributing to Audiobook Studio! It’s people like you who make this tool better for everyone.

To keep the project organized and ensure code quality, please follow these guidelines.

## 🛠️ How to Contribute

To prevent clutter in the main repository and maintain a clean history, we use a **Fork and Pull Request** workflow.

1.  **Fork the Repository**: Create your own copy of the project by clicking the "Fork" button at the top of the repository page.
2.  **Clone Your Fork**: Work on the code locally on your machine.
3.  **Create a Branch**: Create a descriptive branch name in *your* fork (e.g., `fix-xtts-pathing` or `add-ffmpeg-validation`).
4.  **Commit Your Changes**: Ensure your code is tested and follows the project's style.
5.  **Submit a Pull Request**: Push your changes to your fork and then open a Pull Request (PR) to our `main` branch.

## 🧪 Pull Request Guidelines

* **No Direct Pushes**: You cannot push branches directly to this repository. All contributions must come via a fork.
* **Review Process**: All PRs must be reviewed and approved by the maintainer before merging. 
* **Squash and Merge**: To keep the git history clean, all PRs will be **squashed** into a single commit upon merging.
* **Keep it Focused**: A PR should ideally do one thing. If you have multiple unrelated fixes, please submit them as separate PRs.

## 🔌 Plugin Development

Audiobook Studio supports a modular plugin architecture for TTS engines. If you are interested in creating a plugin:

*   **Read the Guide**: See the [Plugin Guide](docs/plugin-sdk/plugin-guide.md) for the full SDK contract and lifecycle hooks.
*   **Security Boundary**: Review the [Security Boundary and Trust Model](docs/plugin-sdk/plugin-guide.md#security-boundary-and-trust-model) before writing code. Plugins are trusted user-level code and must respect Studio's isolation boundaries.
*   **Submit Your Plugin**: Follow the [Plugin Submission Guidelines](docs/plugin-sdk/plugin-submission-guidelines.md) for info on packaging, review criteria, and acceptance.
*   **Use the Template**: Start by copying the [Plugin Template](docs/plugin-sdk/plugin-template/) as a proof-of-concept.

### Contributing a new TTS engine plugin (lifecycle)

This is the short version of the plugin lifecycle for anyone adding a new engine to this
repository (either as a `plugins/tts_<name>/` drop-in, or a fork adding one). For the full
contract, always defer to [`docs/plugin-sdk/plugin-guide.md`](docs/plugin-sdk/plugin-guide.md)
and the binding spec at [`design-docs/specs/plugin-contract.md`](design-docs/specs/plugin-contract.md) —
this section is a map, not a restatement.

1.  **Folder structure**: a plugin is a self-contained mini-repo:
    ```text
    plugins/tts_myengine/
    ├── manifest.json        # declares engine_id, capabilities, behavior, resource needs
    ├── settings_schema.json # JSON Schema (object) for the engine's configurable settings
    ├── interface.py          # entry class — the stable public surface Studio loads
    ├── plugin/               # recommended internal layout (server/, studio/, core/)
    └── tests/                # plugin-local test suite (collected by the root pytest run)
    ```
2.  **Manifest declares the contract, not the app**: `manifest.json` is the single source of
    truth for what an engine can do — `capabilities`, `behavior` (chunk limits, progress
    pattern, feature flags), and `resource` (GPU/VRAM/CPU needs). See
    [Manifest And Hook Declaration Rules](docs/plugin-sdk/plugin-guide.md#manifest-and-hook-declaration-rules)
    for the full field list rather than duplicating it here.
3.  **Register via manifest, never via engine-ID branches**: new engines register purely
    through the manifest + the standard `StudioTTSEngine` contract. Studio core, queue code,
    and routes must not special-case a specific `engine_id` — that is a binding architectural
    rule (see `.agent/rules/modular_architecture.md`, "Engine-specific logic lives behind the
    engine registry + voice bridge"). If you find yourself writing `if engine_id == "myengine"`
    anywhere outside the plugin folder, that's a sign the behavior belongs in the manifest or
    an SDK hook instead.
4.  **Versioned contracts are required, not optional**: every manifest declares explicit,
    validated-at-load-time versions — `studio_tts_manifest`, `contract_version`,
    `sdk_version`, `settings_schema_version`, and `event_envelope_version`. A plugin that omits
    or mismatches these fails to load rather than being silently accepted (see the Owner
    directives in `CLAUDE.md` and `design-docs/specs/plugin-contract.md`).
5.  **Test your plugin in isolation**: each plugin ships its own `tests/` directory, collected
    by the repo's root pytest run (`pytest.ini` scans both `tests/` and `plugins/`). Run just
    your plugin's suite while iterating:
    ```bash
    ./venv/bin/python -m pytest plugins/tts_myengine/tests
    ```
6.  **Submit it**: once the manifest validates, the engine loads, and preview/synthesis both
    work, follow [Plugin Submission Guidelines](docs/plugin-sdk/plugin-submission-guidelines.md)
    for packaging, the review checklist, and acceptance criteria.

## 🌐 TTS Gateway Integration

If you are building an external tool that needs to use Studio's high-performance TTS engines:

*   **Read the API Guide**: See [Studio as a Local TTS Gateway](docs/studio-as-tts-gateway.md) for configuration and usage examples.
*   **Interactive Docs**: Once Studio is running, visit `/api/v1/tts/docs` for the full OpenAPI/Swagger surface.

## 🐛 Reporting Bugs & Suggestions

* **Check Existing Issues**: Before opening a new issue, please search to see if it has already been reported.
* **Use the Templates**: Please use the provided Bug Report or Feature Request templates to ensure we have all the technical details needed to help.
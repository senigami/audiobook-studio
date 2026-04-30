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

*   **Read the Guide**: See the [Plugin Guide](docs/plugin-guide.md) for the full SDK contract and lifecycle hooks.
*   **Security Boundary**: Review the [Security Boundary and Trust Model](docs/plugin-guide.md#security-boundary-and-trust-model) before writing code. Plugins are trusted user-level code and must respect Studio's isolation boundaries.
*   **Submit Your Plugin**: Follow the [Plugin Submission Guidelines](docs/plugin-submission-guidelines.md) for info on packaging, review criteria, and acceptance.
*   **Use the Template**: Start by copying the [Plugin Template](docs/plugin-template/) as a proof-of-concept.

## 🌐 TTS Gateway Integration

If you are building an external tool that needs to use Studio's high-performance TTS engines:

*   **Read the API Guide**: See [Studio as a Local TTS Gateway](docs/studio-as-tts-gateway.md) for configuration and usage examples.
*   **Interactive Docs**: Once Studio is running, visit `/api/v1/tts/docs` for the full OpenAPI/Swagger surface.

## 🐛 Reporting Bugs & Suggestions

* **Check Existing Issues**: Before opening a new issue, please search to see if it has already been reported.
* **Use the Templates**: Please use the provided Bug Report or Feature Request templates to ensure we have all the technical details needed to help.
# 15 · Plugin Author  ☆ INFERRED

**Identity:** "I need to implement the exact contract Studio expects, declare the right capabilities in my manifest, and be confident my plugin will behave identically in production as it does in my local dev fixture — before I submit."

## Goals
- Understand the full `StudioTTSEngine` interface contract: which methods are required, what each must return, and what Studio does when a method is absent or returns an unexpected shape
- Declare accurate capabilities in `manifest.json` (engine_id, text_chunk_limit, progress_pattern, resource requirements) and verify Studio actually enforces those declarations at runtime
- Test the plugin using the real plugin_loader path, not a hand-rolled mock, so validation gaps surface before submission
- Keep manifest schema and interface contract in sync — catch drift between what the manifest declares and what the interface delivers before Studio accepts the plugin
- Ship a plugin that works correctly under the TTS server's concurrent request model, not just under a single-threaded test harness

## Context & environment *(INFERRED)*
- macOS dev machine, Python 3.11; has both the main venv and a separate `~/xtts-env` reference to understand plugin isolation patterns
- Came to Studio as a third-party TTS provider wanting a distribution channel; read the plugin SDK docs in `docs/plugin-sdk/plugin-guide.md` before writing any code
- Works in the `plugins/` directory, running `./venv/bin/python -m pytest plugins/tts_<name>/tests` between iterations
- Has been burned previously: a prior plugin passed `plugin_loader.py` validation but failed at runtime because a required method returned a dict missing a field the app expected silently

## Key workflow moments
- **Scaffolding the plugin:** Creates `plugins/tts_<name>/manifest.json`, `interface.py`, and `plugin/` implementation directory — needs a canonical minimal example that is demonstrably the smallest valid plugin, not a full-featured reference
- **Declaring manifest capabilities:** Sets `text_chunk_limit`, `progress_pattern`, and resource requirements — needs to know exactly which fields are required versus optional, and what Studio does when an optional field is absent versus wrong
- **Running plugin validation:** Wants a single command that runs `plugin_loader.py`'s validation path against his plugin directory and reports every contract violation before the TTS server boots, not after
- **Writing plugin-local tests:** Uses `plugins/tts_<name>/tests/` collected by pytest; needs guidance on which parts of the Studio test infrastructure are safe to import versus which are internal-only
- **Dev mode vs. production parity:** Some test fixtures bypass the real HTTP synthesis path; the Plugin Author needs to know exactly where the fixture boundary is so they do not write tests that pass only because they skip the code they are shipping

## Top friction points *(INFERRED)*
- **F1 — Required method list is implicit:** The `StudioTTSEngine` interface contract is defined in code; there is no single spec file that enumerates every required method, its expected signature, and its expected return shape — they assemble this by reading multiple files
- **F2 — Manifest schema drift:** The manifest JSON schema in `docs/plugin-sdk/` and the schema validated by `plugin_loader.py` can get out of sync; the Plugin Author writes a manifest that passes the docs but fails loader validation, or vice versa
- **F3 — Silent acceptance of bad contracts:** `plugin_loader.py` may accept a plugin with a missing or mistyped field and defer the failure to synthesis time — the plugin loads cleanly, appears in `GET /engines`, and fails only when the first real job runs
- **F4 — Dev fixtures hide production failures:** The test suite for `tts_mixed` (and similar) uses fixtures that mock at the HTTP boundary; they copy the pattern, their tests pass, but their plugin fails in the real TTS server because the fixture masked a response shape error
- **F5 — Concurrency assumptions untested:** The Plugin Author's plugin works correctly for one request at a time but has a shared state bug (e.g., a class-level dict) that only surfaces under the TTS server's concurrent dispatch — no standard guidance exists for testing this locally

## What they need from the studio
- A single authoritative file (or generated spec) listing every required `StudioTTSEngine` method, its signature, and its expected return type — linked from the plugin guide
- A `validate-plugin` CLI command (or pytest fixture) that runs the full `plugin_loader.py` validation path against a local plugin directory and exits non-zero with structured errors on any contract violation
- A canonical minimal plugin (`plugin-template/`) that is the smallest possible passing example, with inline comments marking every required versus optional element
- Clear documentation of which test boundaries are safe to mock (network calls to the external provider) versus which must not be mocked (the interface method itself, the manifest validation path)
- A concurrency smoke test fixture that issues two simultaneous synthesis requests through the real plugin interface and asserts both complete without corrupting each other's state

## Review lens — questions they ask of any screen
- "Is this method required, or will Studio skip it gracefully if I omit it?"
- "If my manifest declares `text_chunk_limit: 400`, will Studio reject a 500-char request at the API layer, or will it reach my plugin and blow up there?"
- "Does this test actually exercise the code path that runs in the TTS server, or is it testing a mock of my own plugin?"
- "What is the exact JSON shape my `synthesize()` method must return — is `audio_path` always required, or only when `stream` is false?"
- "If plugin_loader validates my manifest successfully, am I guaranteed to appear in `GET /engines`?"
- "Will my plugin be initialized once and reused across requests, or re-instantiated per job?"

## Red flags that make them quit or distrust the app
- A plugin that passes `plugin_loader.py` validation but fails silently on the first real synthesis job
- Test patterns in the existing plugins that mock the interface itself — making it impossible to know if the real contract is correct
- Manifest schema docs that are out of date with what the loader actually validates
- No way to distinguish a plugin registration failure from a successful registration with deferred errors
- A required field in the return type that is only documented in a comment inside the application source, not in any spec or SDK doc

**Evidence basis:** INFERRED. Interview two or three developers who have shipped or attempted to ship plugins for extensible local tools (Obsidian, Home Assistant, LM Studio), and ask specifically about the moment they discovered their plugin passed development validation but failed in the production runtime and how long it took to diagnose.

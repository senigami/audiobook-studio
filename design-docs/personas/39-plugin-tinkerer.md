# 39 · "Victor Zhang" — Plugin Tinkerer  ☆ INFERRED

**Identity:** "A technically literate hobbyist who treats TTS plugins like a curated collection — methodically tested, categorized by genre fit, and always one bad manifest away from a broken install."

## Goals
- Install new plugins quickly and confirm they are working before investing time in a test render
- Compare output quality across plugins against a standard sample chapter
- Understand what a plugin actually supports (voice count, format constraints, chunk limits) before committing to it
- Recover cleanly from failed or misconfigured installs without manual filesystem cleanup
- Know immediately whether a failure is the app's fault or the plugin's

## Context & environment *(INFERRED)*
- Hobbyist running the app on a personal Mac; uses the UI exclusively — faster than poking manifests by hand
- Discovered Audiobook Studio through the plugin SDK docs; attracted by the extensible architecture
- Maintains a personal spreadsheet comparing plugins by genre: narration warmth, multi-character separation, latency
- Installs plugins in batches, often after a new TTS model is announced in a community forum
- Has hit manifest validation failures, missing `engine_id` fields, and mis-declared capability flags at least once each

## Key workflow moments
- **Install and validate:** Drops a plugin folder into the plugins directory, expects the app to surface a clear pass/fail validation result with the specific field that failed — not a silent load error
- **First preview:** Wants to fire a one-sentence test render immediately after install, without creating a project first
- **Capability inspection:** Opens plugin details to check declared `text_chunk_limit`, supported formats, and `progress_pattern` before running a full chapter
- **Side-by-side comparison:** Renders the same short segment through two plugins back-to-back; needs output labeled by plugin name, not timestamp
- **Broken plugin triage:** When a render errors, wants to see whether the failure originated in the plugin process or the Studio orchestrator — separate stack traces, not a merged log blob

## Top friction points *(INFERRED)*
- **F1 — Silent manifest rejection:** Plugin loads without an error but produces no voices in the casting panel; no validation feedback points to the broken field
- **F2 — Preview requires a project:** Can't hear a plugin's output without setting up a project, casting a character, and queuing a job — full ceremony for a one-line test
- **F3 — Fault ambiguity on failure:** Queue shows "render failed" with a generic message; Victor can't tell if the plugin subprocess crashed, returned bad audio, or if Studio's bridge rejected the response
- **F4 — No reload path:** After fixing a manifest field, there is no "reload plugin" action; Victor must restart the whole app to pick up the change

## What they need from the studio
- Manifest validation with field-level error messages shown in the plugin detail panel
- A lightweight "test this plugin" action that renders a fixed sentence without requiring a project
- Fault attribution in job failure messages: plugin-originated vs. orchestrator-originated errors shown distinctly
- A "reload plugin" button that re-reads the manifest and re-registers the engine without restarting Studio
- Plugin capability card showing all declared manifest fields, not just the name and status dot

## Review lens — questions they ask of any screen
- "If this plugin has a bad manifest field, where exactly does the app tell me which field and what value it expected?"
- "Can I test this plugin's output in under 60 seconds without opening a project?"
- "When a job fails, does the error message tell me whether to file a bug against Studio or against the plugin?"
- "Does the plugin list show me when each plugin was last validated, and whether validation passed?"
- "If I update a manifest file on disk, how do I get Studio to pick up the change?"
- "Can I compare audio output from two plugins against the same text without extra tooling?"
- "Does disabling a plugin cancel queued jobs that were assigned to it, or let them fail silently?"

## Red flags that make them quit or distrust the app
- Plugin installs and appears active but no voices show up — no error, no explanation
- A render failure shows only "Error: synthesis failed" with no engine context
- Fixing a manifest requires a full app restart with no confirmation that the fix was picked up
- The plugin panel shows a green status dot for a plugin that returns broken audio on every call
- No distinction anywhere between plugin errors and Studio errors in logs or the UI

**Evidence basis:** INFERRED. Interview power users who maintain local plugin collections to validate whether manifest validation UX and fault attribution messaging match real diagnostic behavior.

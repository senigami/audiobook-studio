# Studio 2.0 Final Release Plan — Overview

**Created 2026-06-10** from a full audit of the codebase, `plans/`, and `wiki/`, plus owner directives. This folder is the coordinated, execution-ready plan that takes Studio 2.0 from Phase 12.2 to public release. It supersedes nothing wholesale — the existing `plans/` docs remain the design record — but where this folder and an older plan disagree, **this folder wins** (each conflict is itemized in doc 01).

## Where the project stands

Phases 0–11 of the v2 conversion are complete; the app runs v2-only (TaskOrchestrator, TTS Server subprocess, plugin manifests, live event stream). Phase 12 (polish) is in progress on `studio2/phase-12.2-polish-and-cleanup`; Phase 13 (release docs/distribution) is deferred until Phase 12 closes. The big remaining gaps versus the owner's vision: plugins aren't yet extractable to standalone repos (their studio-side halves import app internals), voices carry no selection metadata despite a finalized taxonomy + schema, there's no dark theme or complete responsive story, and the live demo is a static placeholder.

## Owner directives (binding on every doc)

1. **Clean break:** Studio 2.0 is not in production. Legacy/v1 code is deleted, not preserved — only the v1→v2 data migration path survives. Backward-compatibility obligations begin at the v2.0.0 release, not before.
2. **Versioned contracts:** every contract, manifest, and schema (plugin manifest, SDK, settings schema, event envelope, voice bundle, casting card) declares an explicit version validated at load time, so future versions can coexist after release.
3. **Haiku-executable plans:** every actionable item carries exact paths, the specific change, and an acceptance criterion. Destructive steps carry backup steps and `OWNER_CONFIRMED` flags.

## The documents

| Doc | What it is |
|---|---|
| [01](01_discrepancies_and_corrections.md) | Wiki/plans/code discrepancy catalog with corrections and an ownership map |
| [02](02_plugin_communication_contract.md) | **The plugin communication contract**: server-side `StudioTTSEngine`, the new studio-side `StudioPluginContext` SDK (calls + callbacks with full signatures), manifest + versioning rules, event/topic mapping, migration plan |
| [03](03_plugin_interface_template.md) | Copyable standalone-plugin template (`docs/specs/plugin_template/`) — the "fill in these functions" checklist for plugin authors |
| [04](04_voice_metadata_and_tagging.md) | Voice attributes (taxonomy v1.0), tag/icon UI, AI casting card + recommendation contract |
| [05](05_standalone_plugin_repos.md) | Standalone **GitHub** plugin repos (supersedes the GitLab plan): repo shape, install/update flow, extraction steps |
| [06](06_code_organization_cleanup.md) | Repo cleanup: root cruft, legacy-path deletion, dead stubs, frontend reorganization |
| [07](07_frontend_themes_and_responsive.md) | Design tokens, light/dark theme, responsive completion, viewport×theme verification |
| [08](08_release_sequence.md) | **The execution order** — six stages from stabilization to v2.0.0 |
| [09](09_logic_audit.md) | Verified logic errors + redundancy (31 findings + queue/progress addendum), fixes and tests |
| [10](10_ux_improvements.md) | Apple-HIG UX pass: 12 quick wins + 14 ranked improvements |
| [11](11_accessibility_and_performance.md) | WCAG 2.2 AA blockers and render-performance fixes |
| [12](12_security_and_opportunities.md) | Security release blockers + hardening; post-release product idea backlog |
| [13](13_wiki_corrections.md) | Wiki fact-check: 9 incorrect claims to fix, 6 missing-coverage additions |
| [14](14_live_demo_revamp.md) | Rebuild the live demo from real components with scripted event playback |
| [15](15_progress_confidence_model.md) | ETA trust-handoff design for the predictive progress bar |

## How to execute

Work [08_release_sequence.md](08_release_sequence.md) top to bottom — it orders the other docs into six gated stages (Stabilize → Clean house → Plugin contract → Voice metadata & repos → Frontend polish → Release). Within a doc, execute checkboxes in order; every checkbox states its own acceptance check. Items flagged **OWNER-VETOABLE** / **OWNER_CONFIRMED** / "owner decision" pause for Steven; everything else proceeds.

Open owner decisions at time of writing: doc 04 D7 (migration default for untagged voices) and D8 (`default_variant` placement), doc 04 §2.3 (voice `class`: hard filter vs strong score), doc 05/02 (`synthesis_mixed`: rename to `tts_mixed` vs registration allowlist), doc 06 (deletion confirmations), doc 13 W13 (keep mp3 preview support or go WAV-only).

# 19 - Demo Gap Analysis

Status: first-pass audit and planning seed  
Date: 2026-06-25  
Scope: the public demo surface (`docs/index.html`, `docs/v1.html`, `docs/demo/`) and the interactive demo source under `frontend/src/demo/`.

This doc distills the current demo gaps into a smaller planning artifact. The fuller reconciliation inventory remains [10_mock_reconciliation.md](../reference/site_redesign_rollout/10_mock_reconciliation.md); this file is the short list of what still needs to appear on the demo page or be called out more honestly before the demo can be treated as current.

## Current demo surfaces

- `frontend/src/demo/DemoApp.tsx` provides hash routing, the stage index, embed mode, the theme toggle, the demo-mode badge, and the blocked-action toast.
- `frontend/src/demo/stages/siteMockupStage.tsx` already covers the broad product areas: Library, Book pipeline, Studio, Publish, Voices, Activity, Engines, Integrations, Settings, and Splash.
- `docs/index.html` is the public landing page and already routes visitors to the interactive demo and the showcase.
- `docs/v1.html` is still the public showcase wrapper. The token sync is wired, but the screenshots are still the stale part called out in the release plan.

## Plan docs that already govern demo/UI work

| Doc | What it contributes |
|---|---|
| [14_live_demo_revamp.md](14_live_demo_revamp.md) | Defines the demo as a real-component showcase, requires `build:demo`, and keeps `sync:showcase-tokens` in the release checklist. |
| [10_ux_improvements.md](10_ux_improvements.md) | Holds the UI/UX target list that most directly affects the demo presentation, especially U15 and U16. |
| [08_release_sequence.md](08_release_sequence.md) | Keeps demo/showcase work in the release order and still lists the screenshot refresh and demo wiring. |
| [road_to_v2.md](road_to_v2.md) | Still tracks demo/showcase release wiring and the Pinokio/demo bundle dependencies. |
| [../reference/site_redesign_rollout/10_mock_reconciliation.md](../reference/site_redesign_rollout/10_mock_reconciliation.md) | Best current inventory of mock/site gaps and stale copy. |

## What is already represented

- Shell routing, theme toggle, and the demo-mode framing.
- The broad app areas the demo should communicate: library, book pipeline, voice work, queue/activity, engines, integrations, settings, and onboarding/splash.
- The interactive demo CTA on the public site.
- The release wiring for token sync and demo rebuild, even if the showcase screenshot pass still lags.

## What is still missing or underrepresented

| Gap | Why it matters | Plan source |
|---|---|---|
| Unified audio player surface | U16 wants one player model for segment vs chapter playback. The current demo still reads as multiple audio affordances instead of one coherent surface. | [10_ux_improvements.md](10_ux_improvements.md) |
| Layout / navigation simplification | U15 asks for a navigation map and one obvious purpose per screen. The demo has the major panes, but not the final IA simplification the plan calls for. | [10_ux_improvements.md](10_ux_improvements.md) |
| Global player consistency | The player should feel persistent and owned by one surface across panes, not feel fragmented by context. | [10_mock_reconciliation.md](../reference/site_redesign_rollout/10_mock_reconciliation.md) |
| First-run and empty-library onboarding | The demo still does not clearly represent the first-run path, empty-library guidance, or the demo-bundle story. | [10_ux_improvements.md](10_ux_improvements.md), [16_pinokio_distribution.md](16_pinokio_distribution.md) |
| Voice Lab route/detail fidelity | Route-level voice lab behavior, top-level actions, metadata editing, samples, variants, and phase-aware CTAs are not yet shown as one cohesive workflow. | [10_mock_reconciliation.md](../reference/site_redesign_rollout/10_mock_reconciliation.md), [04_voice_metadata_and_tagging.md](04_voice_metadata_and_tagging.md) |
| Taxonomy v2 and metadata editing | The voice data model still needs the v2 language/accent/style presentation and the actual edit flow, not just read-only pills. | [10_mock_reconciliation.md](../reference/site_redesign_rollout/10_mock_reconciliation.md), [04_voice_metadata_and_tagging.md](04_voice_metadata_and_tagging.md) |
| Integrations API generate/retrieve flow | The public story says Studio can act as a local TTS gateway; the demo still needs an explicit request-and-result flow to prove it. | [10_mock_reconciliation.md](../reference/site_redesign_rollout/10_mock_reconciliation.md), `docs/studio-as-tts-gateway.md` |
| Publish / review / backup exactness | The book-pipeline areas exist, but some of the more specific assembly, review, and backup states still need a sharper pass in the demo. | [10_mock_reconciliation.md](../reference/site_redesign_rollout/10_mock_reconciliation.md) |
| Mobile navigation and focus behavior | Release-facing keyboard/focus behavior still needs to be represented as a verified interaction story, not just assumed from layout. | [11_accessibility_and_performance.md](11_accessibility_and_performance.md), [07_frontend_themes_and_responsive.md](07_frontend_themes_and_responsive.md) |
| Public showcase freshness | `docs/v1.html` still needs current screenshots and copy parity once the demo content settles. | [14_live_demo_revamp.md](14_live_demo_revamp.md), [08_release_sequence.md](08_release_sequence.md) |

## Explicitly future, not demo claims

These items should stay labeled future/post-v2 unless a release plan explicitly promotes them:

- AI casting suggestions that only recommend and never auto-assign.
- Hugging Face discover/publish browsing.
- Open-ended GitHub plugin browsing/search/update UX.
- Plugin signing and checksum hardening.

## Recommended order to close the gaps

1. Resolve the UI/UX foundation first: U15 navigation map, U16 unified player surface, and the global player consistency question.
2. Close the release-facing interaction gaps next: focus behavior, mobile nav, empty-library onboarding, and first-run/demo-bundle representation.
3. Finish the domain proofs: Voice Lab detail actions, taxonomy v2 / metadata editing, Integrations API generate/retrieve, and the sharper Publish/Review/Backups story.
4. Refresh the public showcase after the demo story stabilizes: screenshots, copy parity, and the release checklist wiring that rebuilds `docs/demo/`.

## Acceptance for the next demo pass

- A visitor can understand the navigation map without reading the plans.
- The player model is coherent across chapter, segment, and review contexts.
- The first-run path is visible without relying on external docs.
- Voice, publish, and integrations each show one clearly useful workflow, not just a collection of cards.
- The public showcase matches the shipped demo story instead of lagging behind it.

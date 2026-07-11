# Test Value Audit — Other frontend pages — 2026-07-10

Scope: 20 files, 118 total test cases reviewed, across `frontend/tests/unit/pages/{ProjectDetail,ProjectLibrary,Queue,Settings,Engines,Integrations,Activity,LiveOutput,DevProgressBar}/`.

Files reviewed:
- `ProjectDetail/ProjectViewRoute.test.tsx` (6)
- `ProjectLibrary/ProjectLibraryControls.test.tsx` (5)
- `ProjectLibrary/ProjectLibraryEmptyState.test.tsx` (3)
- `ProjectLibrary/ProjectLibraryPage.test.tsx` (4)
- `Queue/QueueRoute.test.tsx` (4)
- `Settings/JsonSchemaForm.test.tsx` (6)
- `Settings/SettingsRoute.test.tsx` (7)
- `Settings/components/GeneralSettingsPanelDevMode.test.tsx` (3)
- `Settings/components/GeneralSettingsPanelParallelCap.test.tsx` (4)
- `Engines/EnginesPage.test.tsx` (1)
- `Engines/EnginesPageModuleSettings.test.tsx` (3)
- `Engines/OfficialRegistryPanel.test.tsx` (4)
- `Engines/ServerDiagnostics.test.tsx` (5)
- `Engines/components/EngineCard.test.tsx` (24)
- `Engines/components/EngineCardInstall.test.tsx` (6)
- `Integrations/IntegrationsPage.test.tsx` (4)
- `Activity/ActivityPage.test.tsx` (1)
- `Activity/components/ActivityStatsCards.test.tsx` (2)
- `LiveOutput/LiveOutputPage.test.tsx` (10)
- `DevProgressBar/DevProgressBarPage.test.tsx` (16)

## DEFINITE delete candidates

- `frontend/tests/unit/pages/Integrations/IntegrationsPage.test.tsx:6` — `IntegrationsPage > renders the integrations heading and swagger link` — `IntegrationsPage.tsx` is 100% static hardcoded JSX (no props, no state, no branches); the test only asserts hardcoded text/links exist and can never fail except on an intentional content edit.
- `frontend/tests/unit/pages/Integrations/IntegrationsPage.test.tsx:14` — `IntegrationsPage > renders the developer integration guide cards` — same static-presence pattern as above, same component, no interaction or branch exercised.
- `frontend/tests/unit/pages/Integrations/IntegrationsPage.test.tsx:22` — `IntegrationsPage > renders all three numbered endpoint sections` — same static-presence pattern; three tests in this file collectively just enumerate hardcoded strings in a page with zero logic.
- `frontend/tests/unit/pages/Integrations/IntegrationsPage.test.tsx:30` — `IntegrationsPage > renders endpoint rows with paths` — same static-presence pattern; no state/props/interaction anywhere in this file.
- `frontend/tests/unit/pages/LiveOutput/LiveOutputPage.test.tsx:32` — `LiveOutputPage & Table Consumer Filters > renders the header and description of the page` — pure static-presence check of hardcoded header/description text and static `LIVE_EVENT_CONSUMERS` config labels; no interaction, no state change, and the config-derived labels are already exercised functionally (via click) in `uses event map consumer names as topic presets for the table` later in the same file.
- `frontend/tests/unit/pages/LiveOutput/LiveOutputPage.test.tsx:119` — `LiveOutputPage & Table Consumer Filters > still renders the event map consumer labels for routing reference` — re-asserts the same static button labels (`main-queue`, `chapter-state`, etc.) with zero interaction; fully redundant with the interaction-based `uses event map consumer names as topic presets for the table` test that clicks these same buttons and asserts real filtering behavior.
- `frontend/tests/unit/pages/Settings/SettingsRoute.test.tsx:346` — `SettingsRoute > renders the platform hint banner in the general panel` — the "Platform hint" banner in `GeneralSettingsPanel.tsx` is rendered unconditionally with no props/state gating it; the test is pure static-presence with no interaction or branch.

## DISCUSS (borderline, needs a human call)

- `frontend/tests/unit/pages/Engines/EnginesPageModuleSettings.test.tsx:58` — `EnginesPage — Module Settings tab (WIRE-2) > shows the Module Settings tab button` — static presence of a tab button with no click; the very next test in the same file (`switches to the Module Settings tab and renders the plugin schema settings`) already clicks this same button, implicitly proving it exists and is clickable, so this test's unique value is thin (only guards against the button disappearing while the tab is still switchable, an unlikely combination).
- `frontend/tests/unit/pages/Engines/components/EngineCard.test.tsx:84` and `:90` — `formatEngineTestGeneratedAt > formats unix seconds as a locale string` / `formats ISO timestamps as a locale string` — assertions only check the output is not `'Unknown'` and does not contain `'Invalid Date'`; they would still pass if the seconds→milliseconds multiplication in `engineFormatters.ts` were silently broken (e.g. missing `* 1000`), since the resulting `Date` would still be valid, just wrong. Needs either a tighter assertion (e.g. checking the year/known substring) or an owner call on whether locale-format brittleness is an acceptable tradeoff.
- `frontend/tests/unit/pages/Engines/components/EngineCard.test.tsx:373` — `EngineCard dependency installation > proves the calibration block appears before other sections in the expanded card` — verifies DOM ordering by `indexOf` on `document.body.innerHTML`; this is a real design requirement (R5-T10 ordering) but is a fragile implementation-detail assertion (string search over serialized HTML) rather than an accessible/observable-order check (e.g. via testing-library's document-order helpers). Keep if the ordering guarantee matters enough to accept the fragility, otherwise consider a more robust order assertion.
- `frontend/tests/unit/pages/LiveOutput/LiveOutputPage.test.tsx:41` — `LiveOutputPage & Table Consumer Filters > renders topic toggle buttons without the old all-minus-logs shortcut` — mostly static-presence (topic buttons exist) but does carry a real negative-regression check (a previously-removed "All minus tts.logs" shortcut must stay gone). Uncertain whether the regression-guard value outweighs the largely-static bulk of the assertion.
- `frontend/tests/unit/pages/DevProgressBar/DevProgressBarPage.test.tsx:379` — `ProgressBarTestPage > proves the preview bar renders with data-testid="dev-progress-bar-preview"` — single `toBeInTheDocument()` check with no interaction; the same `data-testid` is already relied upon (and thus implicitly proven to exist) by numerous other tests in this file (e.g. the segment-checkpoint-mode test at line 307). Low marginal value but nearly free to keep.
- `frontend/tests/unit/pages/ProjectLibrary/ProjectLibraryPage.test.tsx:59` — `ProjectLibrary > shows created and updated dates in the default grid view` — waits for real fetched data to render, but only asserts that literal `"Created"`/`"Updated"` label prefixes exist — never checks that the actual formatted date values (`1000`, `2000` unix timestamps) map to the expected displayed date, so a broken `formatDate` call would not be caught.
- `frontend/tests/unit/pages/ProjectLibrary/ProjectLibraryPage.test.tsx:84` — `ProjectLibrary > does not contain hardcoded XTTS-v2 copy` — a narrow historical regression guard (checks absence of a specific old string, `"Model: XTTS-v2"`); nothing in the current multi-engine architecture would plausibly reintroduce this exact string, so its ongoing regression-catching value is likely low, though it's cheap to keep.

## Notable KEEP (high-value tests worth calling out)

- `Engines/ServerDiagnostics.test.tsx` — all 5 tests are strong: async data-derived status rendering, disabled-during-restart state, colored unhealthy state, and re-fetch-after-restart sequencing, all exercising real component state machines with only the API boundary mocked.
- `Engines/OfficialRegistryPanel.test.tsx` — all 4 tests are strong: loading/error/disabled-while-importing branches plus a real form-submit interaction, each asserting externally observable behavior.
- `Activity/ActivityPage.test.tsx` (single test) — despite being one test, it exercises a full realistic scenario: multiple job/queue shapes, a history-filter click, a details-collapse click, and asserts the resulting filtered visibility set — this is exactly the shape of test the "low value" definition wants to see more of, not less.
- `DevProgressBar/DevProgressBarPage.test.tsx` — the socket-event tests (e.g. `reflects segments.progress payload...`, `proves unrelated topics do not update DevProgressBar state...`) correctly build frames via `publishStudioSocketMessage` per R3 and assert real source-of-truth precedence (launch config vs. socket vs. manual update), a meaningfully hard piece of logic to get right.
- `Settings/components/GeneralSettingsPanelParallelCap.test.tsx` — all 4 tests assert the actual JSON body POSTed to `/api/settings`, not just that a save function fired; this is the right level of assertion for a settings-toggle test.

## Summary

- 7 definite-delete candidates, 7 discuss, out of 118 total tests reviewed.
- Overall this slice of the frontend test suite is healthy. The large majority of tests (over 90%) exercise real state transitions, async data flows, or user interactions with only network/API boundaries mocked, consistent with R2. The handful of low-value tests cluster in two patterns: (1) an entire test file for a page component that has no logic at all (`IntegrationsPage.test.tsx` — the whole file is a candidate for deletion or, better, folding into a single "renders without missing key content" smoke test), and (2) individual static-presence assertions embedded as standalone `it` blocks inside otherwise-strong test files (`LiveOutputPage.test.tsx`, `SettingsRoute.test.tsx`), where a real-interaction test in the same file already covers the same ground more rigorously. No R1/R2/R3/R4 rule violations were found (no mocking of the unit under test, no hand-rolled socket frames, no sleep-based timing).

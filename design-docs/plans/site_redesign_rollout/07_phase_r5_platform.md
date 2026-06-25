# Phase R5 — Platform pages (Voices catalog + Voice Lab, Engines, Integrations, Settings thinned, Activity completion)

*Read `00_execution_contract.md` and `01_overview_and_phases.md` first. All hard rules (R-A…R-I)
apply to every task below. Reference mock panes: `frontend/src/demo/stages/siteMockup/panes/voices.tsx`
(catalog + VoiceLab), `platform.tsx` (Engines + Integrations), `settings.tsx` (thinned Settings),
`activity.tsx` (Activity). The mock is layout truth only — rebuild with real components, real data,
tokens, and tests. Depends on R1 (rail routes `/voices`, `/activity`, `/engines`, `/integrations`,
`/settings` exist). Can run in parallel with R2–R4.*

Conventions for this phase:

- New Voices-page components live in `frontend/src/pages/Voices/components/`; new Voice Lab page
  components in `frontend/src/pages/VoiceLab/` (new page dir) per the styling rules; Engines page
  in `frontend/src/pages/Engines/`; Integrations in `frontend/src/pages/Integrations/`.
- Tests mirror the source layout under `frontend/tests/unit/` (existing examples:
  `frontend/tests/unit/pages/Voices/VoicesPage.test.tsx`,
  `frontend/tests/unit/pages/Settings/components/EngineCard.test.tsx`).
- Verification per task: `npm -C frontend run test -- --run && npm -C frontend run lint && npm -C frontend run build`.
  No task in this phase touches `app/` or `plugins/` (R-F).

---

### R5-T1 — Attribute pill system (`VoicePill` + tint map + ordering)

**Goal** A reusable, taxonomy-agnostic pill component set that renders ANY attribute fields the
metadata API returns, with category-tinted fills per north star decision 12.

**Read first**
- `frontend/src/types/index.ts` (or wherever `VoiceMetadata` is declared — grep `VoiceMetadata`)
- `frontend/src/pages/Voices/VoicesPage.tsx` lines 14–38 (CLASS/GENDER/AGE option lists)
- Mock: `frontend/src/demo/stages/siteMockup/panes/voices.tsx` lines 7–14 (pill look)
- `frontend/src/theme/tokens.css` (existing hue tokens)

**Create/Modify**
- Create `frontend/src/pages/Voices/components/VoicePills.tsx`
- Modify `frontend/src/theme/tokens.css` (pill tint tokens, light + dark)
- Create `frontend/tests/unit/pages/Voices/components/VoicePills.test.tsx`

**Steps**
1. Add tokens: `--pill-class-*`, `--pill-gender-*`, `--pill-age-*`, `--pill-extended-*` (one
   shared hue for all extended/secondary attributes), `--pill-tag-*` (neutral ghost for free
   tags) — each with `-bg`, `-border`, `-text` variants, defined for `:root` and
   `[data-theme="dark"]`.
2. Implement `voicePillsFromMetadata(meta: VoiceMetadata): PillSpec[]`: walk the metadata object
   dynamically — known core keys (`class`/`voice_class`, `gender`, `age`) map to their category
   hue; any OTHER scalar attribute field present on the object maps to the extended hue; entries
   of a `tags`/free-tag array map to the ghost style. Do NOT hardcode the field universe — a new
   API field must render without a code change. Fixed display order: class → gender → age →
   extended (alphabetical by key) → tags.
3. Implement `<VoicePill spec={...}/>` (small rounded chip, tinted bg/border/text via the tokens)
   and `<VoicePillRow pills max>` which renders up to `max` pills plus a `+N` overflow chip;
   clicking/tapping `+N` expands the row in place (state-local), clicking again collapses.
4. Untagged voice (`is_untagged` or empty metadata): render no pills; export a small
   `UntaggedBadge` (⚠ "missing attributes") for the card to use.

**Capabilities re-homed** None (new shared primitive).

**Tests** Render test: given metadata `{voice_class:'human', gender:'feminine', age:'adult', accent:'irish', tags:['warm','bright']}`
assert 5 pills in fixed order with the correct class names/tokens; given an unknown future field
`timbre:'gravel'` assert it renders as an extended pill (proves no hardcoded set); `+N` expand/
collapse interaction test; dark-theme smoke (set `data-theme="dark"`, assert render).

**Verify** Suite green; `npm -C frontend run build`.

**Out of scope** Card layout, filtering, taxonomy v2 backend fields (render-what-you-get only).

---

### R5-T2 — `voicePhase` derivation + phase-appropriate CTA helper

**Goal** A pure helper that maps a voice's profiles to a phase (`samples → build → test → ready`)
and the matching primary CTA label/action, derived from the existing `getStatusInfo` logic.

**Read first**
- `frontend/src/pages/Voices/components/NarratorCard.tsx` lines 87–133 (`getStatusInfo`)
- `frontend/src/utils/voiceProfiles.ts` (`isVoiceProfileSelectable`, `getVoiceProfileEngine`)

**Create/Modify**
- Create `frontend/src/pages/Voices/voicePhase.ts`
- Modify `frontend/src/pages/Voices/components/NarratorCard.tsx` (extract `getStatusInfo` into
  `voicePhase.ts` as `getStatusInfo(profile, engines, buildingProfiles)` and import it — do not
  fork the logic)
- Create `frontend/tests/unit/pages/Voices/voicePhase.test.ts`

**Steps**
1. Move `getStatusInfo` verbatim into `voicePhase.ts` (exported, pure); update `NarratorCard` to
   import it. Existing NarratorCard tests must stay green unchanged.
2. Add `getVoicePhase(profiles, engines, buildingProfiles): 'samples'|'build'|'test'|'ready'`
   mapping status labels: `NO SAMPLES`/`NOT READY` → samples; `BUILD TO TEST`/`NEW SAMPLES`/
   `REBUILD REQUIRED`/`SETTINGS CHANGED`/`SAMPLES MISSING`/`BUILDING...` → build; `PREVIEW STALE`
   → test; `READY` → ready; `DISABLED` → ready with a disabled flag.
3. Add `getPrimaryCta(phase)` → `{label, intent}`: samples → "Add samples", build → "Build voice",
   test → "Test voice", ready → "Edit voice".

**Capabilities re-homed** `getStatusInfo` (moved, not duplicated).

**Tests** Table-driven unit test over representative `SpeakerProfile` fixtures covering every
status branch → expected phase + CTA. (R2: do not mock `voicePhase` itself.)

**Verify** Suite green incl. existing `NarratorCard`-related tests.

**Out of scope** Any UI.

---

### R5-T3 — Voices catalog grid cards

**Goal** Replace the expanding `NarratorCard` list with the mock's catalog grid: avatar icon,
name, pill row, ▶ preview, phase CTA, ⋯ overflow menu, ★ default badge, ⚠ untagged badge.

**Read first**
- Mock: `voices.tsx` lines 506–565 (grid + card)
- `frontend/src/pages/Voices/components/NarratorCard.tsx` (header, status chip, ActionMenu items
  at lines 262–292: Rename / Export Voice Bundle / Delete Voice + set-default)
- `frontend/src/pages/Voices/components/VoicesTabContent.tsx` (current list wiring)
- `frontend/src/components/ui/ActionMenu.tsx`
- R5-T1 (`VoicePills.tsx`), R5-T2 (`voicePhase.ts`)

**Create/Modify**
- Create `frontend/src/pages/Voices/components/VoiceCatalogCard.tsx`
- Modify `frontend/src/pages/Voices/components/VoicesTabContent.tsx` (render grid of catalog
  cards: `display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr))`)
- Modify `frontend/src/theme/components.css` (`.voice-catalog-card` block, tokens only)
- Create `frontend/tests/unit/pages/Voices/components/VoiceCatalogCard.test.tsx`

**Steps**
1. Build `VoiceCatalogCard`: circular avatar (voice icon if metadata has one, else `User` lucide
   icon on `var(--accent-tint-bg)`), name, `<VoicePillRow max={3}>` from R5-T1, ★ default badge
   top-right when any profile `is_default`, `UntaggedBadge` when untagged, engine badge reuse
   from NarratorCard's `activeEngineBadge` shape.
2. ▶ Preview button: plays the active profile's `preview_url` (reuse whatever NarratorCard/
   VariantEditor use to play previews today — same audio element pattern; in R4+ worlds route
   through playerBus if it exists, else local `<audio>`).
3. Primary CTA from `getPrimaryCta(getVoicePhase(...))`: "Edit voice" (and samples/build/test
   variants) navigates to `/voices/:id` (Voice Lab, R5-T5); "Build voice" may also call
   `handleBuildNow` directly — wire CTA intents to the existing `useVoiceManagement` handlers
   passed down through `VoicesTabContent`.
4. ⋯ `ActionMenu` with the EXACT existing NarratorCard items: Set as default, Rename, Edit
   metadata (opens `MetadataEditorModal` via existing `onEditMetadata`), Export Voice Bundle,
   Delete Voice (all variants, with the existing confirm copy).
5. Remove the expand/collapse rendering path from `VoicesTabContent` (expanded card body now
   lives in Voice Lab) but keep `NarratorCard.tsx` and its child components untouched on disk —
   they are deleted in R6, not here (R-C: every expanded-body capability is re-homed by R5-T5/T6
   before deletion).

**Capabilities re-homed** Card-level actions (preview, build, test, default, rename, export,
delete, metadata edit) onto the catalog card; expand-to-edit replaced by navigation (target built
in R5-T5).

**Tests** Card renders name/pills/badges from fixture metadata; CTA label matches phase fixture;
⋯ menu lists all five actions and fires callbacks; preview button toggles play (mock the audio
boundary only).

**Verify** Suite green; open `/voices` in dev server if running — grid renders.

**Out of scope** Voice Lab itself; search/filter restyle (T4); Local/Discover tabs (T4).

---

### R5-T4 — Voices header restyle: search + facet chips + engine filter + Local/Discover tabs

**Goal** Restyle the existing search/facet/engine filtering into the mock's chip row and add
My Voices / 🤗 Discover tab pills (Discover = "planned" placeholder panel).

**Read first**
- `frontend/src/pages/Voices/components/VoicesTabHeader.tsx` (all existing controls: search,
  engine filter, class/gender/age facets, Import/Export/Guide/New voice buttons)
- Mock: `voices.tsx` lines 469–518 (tab pills + toolbar + filter chips) and 568–623 (Discover)
- `frontend/tests/unit/pages/Voices/components/VoicesTabHeader.test.tsx`

**Create/Modify**
- Modify `frontend/src/pages/Voices/components/VoicesTabHeader.tsx`
- Create `frontend/src/pages/Voices/components/DiscoverPlaceholder.tsx`
- Modify `frontend/src/pages/Voices/VoicesPage.tsx` (tab state; render `DiscoverPlaceholder`)
- Modify `frontend/tests/unit/pages/Voices/components/VoicesTabHeader.test.tsx` (updated DOM)

**Steps**
1. Keep EVERY existing control and its handler props (search query, engine filter incl. the
   `disabled` option, class/gender/age facet selects, import .zip input, export, recording guide,
   + New voice). Restyle: facets become chip-style controls per mock; toolbar right-aligned
   buttons per mock row.
2. Add tab pills row: "My Voices" / "🤗 Discover". Local tab = current content. Discover tab
   renders `DiscoverPlaceholder`: planned-chip panel ("Community voices from Hugging Face —
   planned") — NO HF fetching, no install logic (contract: do NOT build HF).
3. Active-filter chips must use the same tint tokens as R5-T1 pills for class/gender/age.

**Capabilities re-homed** All header controls survive in place (restyle only).

**Tests** Update header test for new DOM; add: Discover tab shows placeholder and no network
call; facet chip selection still calls `setClassFilter` etc.

**Verify** Suite green; filtering still narrows the grid (existing `useVoicesData` tests stay green).

**Out of scope** Any Hugging Face integration.

---

### R5-T5 — Voice Lab route + page shell + phase stepper

**Goal** New `/voices/:id` page ("Voice Lab") replacing the expanding card: back link, avatar +
name + pills + description header, phase stepper (Samples → Build → Test → Ready), section layout.

**Read first**
- Mock: `voices.tsx` lines 84–158 (VoiceLab header + stepper)
- `frontend/src/app/` router (wherever R1 registered routes — grep `path="/voices"`)
- `frontend/src/pages/Voices/VoicesPage.tsx` (data hooks: `useVoiceManagement`, `useVoicesData`,
  metadata fetch) — Voice Lab needs the same speaker/profile/metadata sources for one voice
- R5-T2 `voicePhase.ts`

**Create/Modify**
- Create `frontend/src/pages/VoiceLab/VoiceLabPage.tsx`
- Create `frontend/src/pages/VoiceLab/components/PhaseStepper.tsx`
- Modify router file (add `/voices/:id` route)
- Modify `frontend/src/theme/components.css` (`.voice-lab-*` blocks)
- Create `frontend/tests/unit/pages/VoiceLab/VoiceLabPage.test.tsx`

**Steps**
1. Route `/voices/:id` where `:id` is the speaker/voice-group id used by the catalog card CTA
   (R5-T3 step 3). Unknown id → redirect to `/voices`.
2. Page shell resolves the speaker + profiles + `VoiceMetadata` (reuse the same props/hooks the
   Voices page uses — lift shared data up or re-fetch via `api.listVoicesWithMetadata()`; prefer
   reusing the existing hydration source per `frontend-state.md`).
3. Header: ← Voices back link, 56px avatar, name, `<VoicePillRow>` (full, no overflow cap),
   description text from metadata, "Edit metadata" affordance opening the SAME
   `MetadataEditorModal` (modal stays reachable from both card and lab — import it here too).
4. `PhaseStepper`: 4 steps driven by `getVoicePhase(...)`; past = ✓ accent, active = filled,
   future = muted; tokens only.
5. Body renders placeholder section anchors (Samples / Variants / Engine settings / Test /
   Export) — filled by T6–T8. Keep page < 300 lines; sections are child components.

**Capabilities re-homed** Metadata editor reachable from lab (in addition to card).

**Tests** Route renders for a fixture voice; stepper marks the phase from fixture profiles;
unknown id redirects; Edit-metadata opens the modal (focus-trap content present).

**Verify** Suite green; navigating card CTA → lab → back works in dev server.

**Out of scope** Section content (T6–T8), icon upload/prompt (T7).

---

### R5-T6 — Voice Lab sections: re-home SampleManager + VariantEditor (+ Speed, Move, Script)

**Goal** The lab's Samples and Variants sections, reusing the existing components wholesale.

**Read first**
- `frontend/src/pages/Voices/components/SampleManager.tsx` (list, play, delete, drop-zone upload)
- `frontend/src/pages/Voices/components/VariantEditor.tsx` (per-variant settings, SpeedPopover
  usage, default star, rename, delete, move trigger)
- `frontend/src/pages/Voices/components/ScriptEditor.tsx` (test/preview script editing)
- `frontend/src/pages/Voices/components/VoiceModals.tsx` + `frontend/src/components/VoicesModals.tsx`
  (Add variant, Move variant, Rename modals and their state plumbing in `useVoicesTabState`)
- Mock: `voices.tsx` lines 160–254 (Samples + Variants sections)

**Create/Modify**
- Create `frontend/src/pages/VoiceLab/components/SamplesSection.tsx` (wraps `SampleManager`)
- Create `frontend/src/pages/VoiceLab/components/VariantsSection.tsx` (wraps `VariantEditor` rows
  + "+ Add variant" button)
- Modify `frontend/src/pages/VoiceLab/VoiceLabPage.tsx` (mount sections; host the Add/Move/Rename
  variant modals using the existing modal components + `MoveVariantModal` plumbing)
- Tests: `frontend/tests/unit/pages/VoiceLab/VariantsSection.test.tsx`,
  `SamplesSection.test.tsx`

**Steps**
1. `SamplesSection`: render `SampleManager` for the voice with its existing upload/delete/play
   props; styling adjusted to the mock's framed list + dashed drop row via wrapper CSS only — do
   NOT fork SampleManager.
2. `VariantsSection`: one row per profile reusing `VariantEditor` (or its row subcomponent if it
   splits cleanly) — keeps SpeedPopover, default-star toggle, per-variant engine settings edit,
   rename ✎, ⋯ menu (Rename / Move to another voice / Delete).
3. Move-variant flow: reuse the existing Move Variant modal + `handleMoveVariant` action wiring
   (from `useVoicesTabActions`) hosted at the lab page level.
4. If `VariantEditor`/`SampleManager` import things that assumed the expanded-card context
   (e.g. expansion callbacks), pass no-op/lab equivalents — change their prop types only if
   strictly required, updating their existing tests' imports (R-D), never deleting them.

**Capabilities re-homed** SampleManager (upload/play/delete samples), VariantEditor (variant
settings, default, rename, delete), SpeedPopover, MoveVariantModal, Add-variant — all from the
expanded NarratorCard body into Voice Lab.

**Tests** VariantsSection renders fixture profiles with default star + per-variant actions firing
callbacks; SamplesSection lists fixture samples and fires delete/upload handlers (mock the api/
file boundary only).

**Verify** Suite green; in dev server: add sample, add variant, move variant from the lab.

**Out of scope** Test strip (T8), export/delete page actions (T8).

---

### R5-T7 — Voice Lab: icon upload + "Copy icon prompt" button

**Goal** Avatar icon management in the lab header: upload a voice icon image, plus a copy-icon-
prompt button that builds an image-generation prompt from attributes + description and copies it
to the clipboard (doc `design-docs/plans/final_release/04_voice_metadata_and_tagging.md` item C6 — build it here).

**Read first**
- `frontend/src/pages/Voices/components/MetadataEditorModal.tsx` (existing icon/metadata fields —
  check whether an icon upload endpoint/field already exists; reuse it if so)
- `frontend/src/api/` client. The backend icon endpoint EXISTS: `POST /api/voices/{id}/icon`
  (app/api/routers/voices_metadata.py, multipart image, 1:1 aspect enforced) — use it; do NOT
  add backend endpoints (R-F).
- Mock: `voices.tsx` lines 98–121

**Create/Modify**
- Create `frontend/src/pages/VoiceLab/components/VoiceIconControls.tsx`
- Create `frontend/src/pages/VoiceLab/iconPrompt.ts` (pure string builder)
- Modify `frontend/src/pages/VoiceLab/VoiceLabPage.tsx` (mount in header)
- Create `frontend/tests/unit/pages/VoiceLab/iconPrompt.test.ts`

**Steps**
1. `buildIconPrompt(meta: VoiceMetadata): string` — deterministic template, e.g.
   `"Circular avatar portrait icon, flat illustration, uniform style: <class>, <gender>, <age>, <extended attrs joined>, described as: <description>. Neutral background, centered, no text."`
   Include only fields present (taxonomy-agnostic, same dynamic walk as R5-T1).
2. "📋 Copy icon prompt" button: `navigator.clipboard.writeText(buildIconPrompt(meta))` + a
   transient "Copied" state; helper caption per mock ("image prompt from attributes +
   description — uniform icons").
3. Icon upload: if the metadata API already carries an icon field/upload path, wire a small
   upload control (file input, image preview in the avatar circle) through the EXISTING save
   path. If no frontend-reachable storage exists, render the upload control disabled with a
   tooltip "icon storage pending" and log a question in `99_progress_log.md` (R-C stop rule
   does not apply — this is a NEW capability, not a removed one).

**Capabilities re-homed** None removed; adds C6.

**Tests** `buildIconPrompt` unit table (full metadata, partial, untagged → name-only prompt);
copy button writes to clipboard (mock clipboard boundary) and shows Copied state (fake timers,
R4: no sleeps).

**Verify** Suite green.

**Out of scope** Actual image generation; uniform-icon batch tooling.

---

### R5-T8 — Voice Lab: test strip, export bundle, delete voice

**Goal** The lab's Test section (engine + reference sample pickers, script, generate, playback,
edit-preview-script) and page-level Export bundle / Delete actions.

**Read first**
- `frontend/src/pages/Voices/components/ScriptEditor.tsx` and the test-text modal plumbing in
  `useVoicesTabState`/`useVoicesTabActions` (`handleSaveTestText`, `handleResetTestText`,
  `editingProfile`, `referenceSample`, `engineVoiceId`)
- `useVoiceManagement` (`handleTest`, `handleDelete`, test progress wiring via `testProgress`)
- Export flow: `handleConfirmExportVoice`, `exportVoiceName`, `includeSourceWavs` in
  `VoicesPage.tsx` lines 184–187 / 252–258
- Mock: `voices.tsx` lines 256–297

**Create/Modify**
- Create `frontend/src/pages/VoiceLab/components/TestSection.tsx`
- Modify `frontend/src/pages/VoiceLab/VoiceLabPage.tsx` (Export bundle button → existing export
  modal with `includeSourceWavs` checkbox; Delete voice → existing ConfirmModal copy from
  NarratorCard ⋯ menu)
- Create `frontend/tests/unit/pages/VoiceLab/TestSection.test.tsx`

**Steps**
1. `TestSection`: engine select (existing `SearchableSelect`/engine options pattern), reference
   sample select (profile samples), script text, "Generate test" → `handleTest`, progress via
   the existing `testProgress` record (render `PredictiveProgressBar`), playback row for the
   produced preview, "Edit preview script" → existing ScriptEditor modal.
2. Export: button opens the existing export-voice modal (re-hosted at lab level) pre-set to this
   voice; keep the include-source-WAVs option.
3. Delete: danger action with the existing confirm message ("Delete voice '<name>' and all N
   variants…"); on success navigate back to `/voices`.

**Capabilities re-homed** Test/build-preview flow, ScriptEditor, export bundle, delete — the last
expanded-card/⋯ capabilities now exist in the lab. After this task the expanded NarratorCard body
has NO unique capability left (precondition for R6 deletion).

**Tests** Generate-test fires `handleTest` with chosen engine/sample/script; progress fixture
renders the bar; delete confirm fires `handleDelete` and navigates (mock router boundary).

**Verify** Suite green; manual: run a sample test from the lab if the dev stack is up.

**Out of scope** Publish-to-HF (planned chip only — render disabled chip).

---

### R5-T9 — Engines page: route + diagnostics box + panel re-home

**Goal** `/engines` becomes a real page re-homing `EnginesPanel` (import plugin + trust modal,
refresh, logs) and adding the mock's "TTS Server diagnostics" box.

**Read first**
- `frontend/src/pages/Settings/components/EnginesPanel.tsx` (full — engines load, refresh,
  import + `PluginTrustModal`, logs via `useLiveTtsLogLines`)
- Mock: `platform.tsx` lines 17–121 (toolbar, trust dialog, diagnostics box)
- `frontend/src/pages/Settings/components/AboutSettingsPanel.tsx` (where server health/restart
  data comes from today — reuse the same api calls for the diagnostics rows)
- R1 route registration for `/engines`

**Create/Modify**
- Create `frontend/src/pages/Engines/EnginesPage.tsx`
- Create `frontend/src/pages/Engines/components/ServerDiagnostics.tsx`
- Move `frontend/src/pages/Settings/components/EnginesPanel.tsx` →
  `frontend/src/pages/Engines/components/EnginesPanel.tsx` (git mv; update all imports)
- Update test imports: any test importing the old path (grep `Settings/components/EnginesPanel`)
- Create `frontend/tests/unit/pages/Engines/ServerDiagnostics.test.tsx`

**Steps**
1. `EnginesPage` = page header + `ServerDiagnostics` + moved `EnginesPanel` (unchanged props;
   wire `onShowNotification`/`onRefresh`/`startupReady` from the shell the same way
   `SettingsRoute` does today).
2. `ServerDiagnostics`: Server status row (status dot via existing pattern — not StatusOrb,
   that's for chapters; running/port/uptime), last-health-check row, Restart server button —
   reuse the SAME api calls the About panel uses for TTS Server health/restart (grep
   `restart` in `AboutSettingsPanel.tsx` and `frontend/src/api/`). No new endpoints.
3. Keep the import-plugin (.zip) + `PluginTrustModal` flow and Refresh exactly as-is, restyled
   to the mock's toolbar row.
4. Do NOT remove the Settings engines tab yet (T13 handles the redirect) — for now the tab can
   render the moved panel via its new import path.

**Capabilities re-homed** EnginesPanel wholesale (engine list, refresh, plugin import + trust
modal, logs viewer) from Settings → `/engines`; server restart surfaced on Engines page.

**Tests** ServerDiagnostics renders health fixture + restart fires api (mock network boundary);
existing EnginesPanel/EngineCard tests green at new import paths.

**Verify** Suite green; `/engines` renders the full panel in dev server.

**Out of scope** EngineCard restyle (T10), store section (T11), Settings redirects (T13).

---

### R5-T10 — Engine cards restyled per mock (keep every EngineCard capability)

**Goal** Restyle `EngineCard` to the mock's expandable row-card: enable toggle (ON pill), status
+ VERIFIED chips, calibration chip + reset, expand body with JsonSchemaForm settings, sanitize
override chips, Output QA row, run-test/verify/install-deps/uninstall actions, dev-gated
`EngineDevPanel`.

**Read first**
- `frontend/src/pages/Settings/components/EngineCard.tsx` (690 lines — full capability list:
  enable/disable, verify, run test + latest test sample playback, install deps, uninstall,
  `JsonSchemaForm` settings, sanitize overrides, output QA / max plausible speech rate,
  calibration display + reset baseline, cloud privacy note, docs link, `EngineDevPanel` gate,
  `EngineMetadataPanel`)
- `frontend/src/pages/Settings/components/{JsonSchemaForm,EngineDevPanel,EngineMetadataPanel,engineFormatters,engineScenarioMerge}.*`
- Mock: `platform.tsx` lines 123–352 (XTTS expanded, Voxtral expanded, Mixed/builtin compact,
  user-installed card)
- Existing tests: `frontend/tests/unit/pages/Settings/components/EngineCard*.test.tsx`

**Create/Modify**
- Move `EngineCard.tsx` + its helpers (`JsonSchemaForm`, `EngineDevPanel`,
  `EngineMetadataPanel`, `engineFormatters.ts`, `engineScenarioMerge.ts`) to
  `frontend/src/pages/Engines/components/` (git mv; update imports + test imports)
- Modify `EngineCard.tsx` (layout only: collapsed header row per mock — chevron, engine avatar,
  name + id·version, ☁ cloud glyph, ON pill, READY/VERIFIED status chips, Verify button,
  calibration chip + "Reset calibration" link; expanded body sections per mock order)
- Modify `frontend/src/theme/components.css` (`.engine-card-*` blocks; statusChip-style tokens)
- Modify existing EngineCard tests for new DOM hooks (behavior assertions unchanged)

**Steps**
1. Inventory every interactive element in the current `EngineCard` before editing (write the
   list into the task commit message body) — each must exist after restyle (R-C).
2. Restyle collapsed header + chips. Built-in engines (e.g. mixed) get the 🔒 built-in chip;
   user-installed plugins get the user-installed chip + Uninstall (existing logic decides which
   — do not branch on engine IDs, use manifest/engine flags).
3. Expanded body order per mock: Engine settings (`JsonSchemaForm`), sanitize override chips
   (toggle pills), Output QA row, calibration block (speed, confidence, samples-since, reset
   baseline, "calibrates estimates, not speaking speed" caption), config/docs/privacy (cloud
   engines), Latest Test Sample playback row, footer: Run Test · Verified badge · Uninstall.
4. Dev-gated row: `DEV console ▸ SCENARIOS` opens `EngineDevPanel`, visible only via
   `useDevMode()` (existing gate).
5. EngineCard is 690 lines — if restyling it pushes structure further, split along the existing
   section boundaries above (per CLAUDE.md >600-line rule), not mechanically.

**Capabilities re-homed** None lost; all EngineCard features survive restyle in place.

**Tests** Existing EngineCard + EngineCardInstall tests updated and green; add: collapsed header
shows ON/READY/VERIFIED chips from engine fixture; sanitize chip toggle calls the existing save
handler; dev row hidden when dev mode off.

**Verify** Suite green; expand XTTS card on `/engines` in dev server, toggle a sanitize chip.

**Out of scope** Any change to engine API payloads or verification behavior.

---

### R5-T11 — Engines page: "Browse store" planned placeholder

**Goal** The mock's Browse store section as a static planned panel — no GitHub discovery.

**Read first** Mock: `platform.tsx` lines 354–383; the shared planned-chip pattern used by R1+
(grep `PlannedChip`-equivalent in real app, e.g. existing "planned" chips; create one in
`frontend/src/components/` if R1 didn't).

**Create/Modify**
- Create `frontend/src/pages/Engines/components/StorePlaceholder.tsx`
- Modify `frontend/src/pages/Engines/EnginesPage.tsx` (mount after Installed list)
- Test: extend `frontend/tests/unit/pages/Engines/` with a render assertion

**Steps**
1. Section head "Browse store" + planned chip + caption "plugin store — GitHub discovery".
2. Render NO fake store entries (unlike the mock — fake install buttons would violate "do not
   build" while looking functional). Instead a single muted panel: "Discover and install engine
   plugins from GitHub — planned. Until then, use Import plugin (.zip)." Keep the unsandboxed-
   plugins warning line (real, reuse trust-modal copy).
3. Record the intentional deviation from the mock (no fake cards) in `99_progress_log.md`.

**Capabilities re-homed** None. **Tests** Renders planned chip; no install buttons present.
**Verify** Suite green. **Out of scope** Store backend, GitHub API.

---

### R5-T12 — Integrations page: re-home ApiSettingsPanel per mock

**Goal** `/integrations` page with the mock's structure: header + request-count chip, Developer
Integration Guide cards (Unified Orchestration / Direct Synthesis), security note, numbered
endpoint doc sections with code blocks, Swagger link, configuration block.

**Read first**
- `frontend/src/pages/Settings/components/ApiSettingsPanel.tsx` (148 lines — current guide
  cards, security note, endpoint sections, swagger link; inventory everything)
- Mock: `platform.tsx` lines 434–538
- `app/api/tts_api.py` docs path `/api/v1/tts/docs` (link target only — no backend edits)

**Create/Modify**
- Create `frontend/src/pages/Integrations/IntegrationsPage.tsx`
- Move `ApiSettingsPanel.tsx` → `frontend/src/pages/Integrations/components/ApiSettingsPanel.tsx`
  (git mv; update imports incl. `SettingsRoute.tsx` and any tests)
- Modify the moved panel for mock layout (section heads, `MonoBlock`-style code blocks via a
  small shared `CodeBlock` if one exists, endpoint rows with method-colored tags)
- Create/extend `frontend/tests/unit/pages/Integrations/IntegrationsPage.test.tsx`

**Steps**
1. Move panel, keep all current content/links (especially the real Swagger URL and security
   note text — keep the REAL app's wording where it differs from mock placeholder JSON).
2. Restyle into the mock sections: guide cards row, amber security note, "1. Resource
   Discovery" / "2. Orchestration & Generation" / "3. Direct TTS Server Access" with endpoint
   rows + code samples drawn from the panel's existing content.
3. Configuration block: render ONLY config rows that exist in the real panel today (API key /
   rate limit / priority if present). Mock-only rows (Host LAN toggle) get a planned chip or are
   omitted — log the choice in `99_progress_log.md`.

**Capabilities re-homed** ApiSettingsPanel from Settings → `/integrations`.

**Tests** Page renders guide cards + security note + swagger link (assert href); endpoint
sections present; old Settings import path gone (build catches).

**Verify** Suite green; `/integrations` renders in dev server.

**Out of scope** API key management backend, LAN exposure.

---

### R5-T13 — Settings thinned: General + About + Developer; Engines/API tabs → redirects

**Goal** Settings keeps General / About / Developer only; `/settings/engines` and `/settings/api`
become redirects to `/engines` and `/integrations`.

**Read first**
- `frontend/src/pages/Settings/settingsRouteConfig.ts` + `settingsRouteHelpers.ts` +
  `SettingsRoute.tsx` (tab table, path validation, dev-mode gating)
- `frontend/src/pages/Settings/components/{GeneralSettingsPanel,AboutSettingsPanel,DeveloperSettingsPanel}.tsx`
- Mock: `settings.tsx` (thin General list incl. the "Engines & Integrations live under PLATFORM"
  hint; About cards; Developer links)
- Tests: `frontend/tests/unit/pages/Settings/SettingsRoute.test.tsx`,
  `GeneralSettingsPanelDevMode.test.tsx`, `frontend/tests/e2e/settings-navigation.spec.ts`

**Create/Modify**
- Modify `settingsRouteConfig.ts` (remove engines/api tabs from `SETTINGS_TABS`; keep paths in
  a redirect map)
- Modify `SettingsRoute.tsx` (`/settings/engines` → `<Navigate to="/engines" replace/>`,
  `/settings/api` → `/integrations`; drop the moved panel imports)
- Modify `GeneralSettingsPanel.tsx` (restyle to mock's row list: Theme, Stability Mode, Default
  Engine, Default Voice, Developer Mode toggle — keep every existing General control even if
  the mock omits it; add the PLATFORM hint banner)
- Modify `AboutSettingsPanel.tsx` (restyle to mock: version / engine-plugins / production-tally
  cards w/ Reset + "resetting starts a new count" caption, Runtime Diagnostics rows incl. TTS
  Server healthy + Restart — keep all real data sources)
- Update the three test files for new tabs/redirects (R-D)

**Steps**
1. Tab table → General, About, Developer (dev-gated as today). Update `VALID_SETTINGS_PATHS`.
2. Add redirects (R-G: old URLs keep working — redirect, not 404).
3. General restyle per mock; anything in today's General not in the mock stays (inventory first,
   list kept-extras in the commit body).
4. About restyle per mock using the real panel's existing data (version, plugins loaded, tally +
   reset endpoint, runtime diagnostics rows, server restart).
5. Developer tab: keep `DeveloperSettingsPanel` content; restyle to mock's link list if trivial.

**Capabilities re-homed** Engines/API tabs → route redirects (content re-homed in T9/T12).

**Tests** SettingsRoute test: visible tabs = General/About(/Developer); navigating
`/settings/engines` lands on `/engines`; e2e settings-navigation spec updated; tally Reset still
calls its api (mock boundary).

**Verify** Suite green incl. e2e if run in CI config; manual: old bookmarks redirect.

**Out of scope** Removing the Settings page itself; rail nav (R1 owns it).

---

### R5-T14 — Activity page completion: history filters, pause queue, calibration table, tally

**Goal** Close any gaps R1's Activity page left vs the mock: Now list with pause-queue, History
with All/Renders/Samples/API filters, Stats column (per-engine calibration table + production
tally mini-chart).

**Read first**
- The R1-built Activity page (grep `ActivityPage` under `frontend/src/pages/`); if R1 shipped
  it complete, this task is a verify-and-log no-op — check before coding
- Mock: `activity.tsx` (all 102 lines)
- `frontend/src/components/queue/{GlobalQueue,QueueItem,QueueStats}.tsx` (existing queue list,
  pause control, stats — reuse; do not fork)
- `frontend/src/api/` history endpoints (grep `processing_queue`/`history`) and performance/
  calibration data source used by `EngineCard` calibration chip (T10) and About tally

**Create/Modify**
- Modify `frontend/src/pages/Activity/ActivityPage.tsx` (or R1's actual path)
- Create `frontend/src/pages/Activity/components/HistoryList.tsx`,
  `frontend/src/pages/Activity/components/EngineCalibrationTable.tsx` (as needed)
- Tests under `frontend/tests/unit/pages/Activity/`

**Steps**
1. Diff the R1 Activity page against the mock; implement only the missing pieces.
2. Now column: in-flight jobs via the existing store/queue components with
   `PredictiveProgressBar`; "⏸ Pause queue" wired to the EXISTING pause control used by the
   queue drawer (`QueueStats`/store action — same action, two surfaces).
3. History: rows from the queue-history API with client-side filter chips All/Renders/Samples/
   API (filter on the job/task type field the API already returns).
4. Stats: Engine calibration table (engine · chars/s · confidence dot) from the same calibration
   source as T10; Production card reusing the About tally figures (shared fetch/hook, not a
   second endpoint contract).
5. If a needed history/type field doesn't exist in the API response, do NOT add backend (R-F):
   render what exists, log the gap in `99_progress_log.md`.

**Capabilities re-homed** Queue pause + stats get a second (page) surface; nothing removed —
queue drawer stays (owner decision 9).

**Tests** Filter chips narrow a fixture history list; pause button dispatches the existing store
action (R3: any socket frames via `liveEvents.ts` contracts + `publishStudioSocketMessage`);
calibration table renders fixture engines.

**Verify** Suite green; `/activity` shows now/history/stats in dev server.

**Out of scope** New history retention/backend; charts beyond the 7-day mini bars.

---

## Acceptance checklist (run at phase boundary before R6)

- [ ] `npm -C frontend run test -- --run`, `lint`, `build` all green on the phase head commit.
- [ ] `/voices` shows the catalog grid: pills tinted per decision 12, fixed order, +N overflow
      expands on tap; an unknown extra metadata field renders as an extended pill (spot-check
      with a hand-edited metadata entry).
- [ ] Card ▶ preview plays; primary CTA label matches voice phase; ⋯ menu has set-default,
      rename, edit-metadata, export bundle, delete.
- [ ] Discover tab is a planned placeholder (no network activity).
- [ ] `/voices/:id` Voice Lab: stepper reflects phase; samples upload/play/delete; variants
      add/rename/move/delete/default + SpeedPopover; engine settings edit; test generate +
      playback + edit preview script; copy-icon-prompt copies a sensible prompt; export bundle
      and delete work; MetadataEditorModal opens from BOTH card and lab.
- [ ] `/engines`: diagnostics box (status, health, restart), engine cards with toggle/chips/
      verify/run-test/install-deps/uninstall/JsonSchemaForm/sanitize/QA/calibration+reset,
      dev panel gated by dev mode, plugin import shows trust modal; store section is a planned
      placeholder.
- [ ] `/integrations`: guide cards, security note, endpoint sections, working Swagger link,
      config rows.
- [ ] Settings shows only General/About(/Developer); `/settings/engines` → `/engines` and
      `/settings/api` → `/integrations` redirects work; About shows version/plugins/tally+reset/
      runtime diagnostics.
- [ ] `/activity` has now + pause queue, filtered history, calibration table, production tally.
- [ ] Every task logged in `99_progress_log.md`; intentional mock deviations recorded.
- [ ] All of the above eyeballed in BOTH light and dark themes.

# Site Shell & Book Pipeline

```
spec_version: 1.9.0
status: active
created: 2026-06-13
updated: 2026-06-27
sources:
  - frontend/src/app/App.tsx
  - frontend/src/app/layout/AppShell.tsx
  - frontend/src/app/layout/NavRail.tsx
  - frontend/src/app/layout/TopBar.tsx
  - frontend/src/components/layout/Layout.tsx
  - frontend/src/pages/Book/
  - frontend/src/pages/ProjectDetail/
  - frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx
  - frontend/src/demo/stages/siteMockup/rail.tsx
  - design-docs/plans/reference/site_redesign_rollout/
  - design-docs/plans/reference/site_experience_north_star.md
```

> **TL;DR:** The app shares one standard shell for every page, and book work lives in routed stages under `/book/:bookId/...`. Global chrome belongs in the shell; book workflow belongs in the stage routes; legacy deep links redirect into the book pipeline instead of owning their own page chrome.

## Changelog

| Version | Date       | Change |
|---------|------------|--------|
| 1.0.0   | 2026-06-13 | Initial canonical spec for the shared app shell and routed book pipeline |
| 1.1.0   | 2026-06-13 | Deepened §3.2 Studio (book view primary / script view secondary, cast palette painting, analysis strip, commit-resync, rail chapter switching — R3 target); replaced the §3.2 Review placeholder with the follow-along player + section-anchored annotations + re-render-in-place contract (R4 target, player bus owned by audio-player.md); added §2.6 Platform & Manage destinations (Engines/Integrations re-homed out of Settings, thin Settings, redirects — current); added §5 Frontend state ownership (API-hydrated canonical entities vs. store overlays/drafts, queue-row authority) |
| 1.2.0   | 2026-06-13 | Added Manuscript chapter-preview analysis strip (chars, words, sentences, segments, estimated generation time) alongside the chapter list orb placement contract |
| 1.3.0   | 2026-06-13 | Added the shared left-rail drag resize handle contract with persisted expanded width and layout-shifting main column behavior |
| 1.4.0   | 2026-06-13 | Casting: Narrator (default) is the pinned, non-deletable FIRST row of the characters list (not a separate block) and the sole place the default voice is set; add-character form must not suggest "Narrator". Studio cast palette: requires a `Narrator (default)` clear/unassign brush and MUST NOT contain a default-voice selector. Studio analysis-strip segment count MUST use the render-group count (text-processing.md §6). |
| 1.5.0   | 2026-06-16 | Added §2.7 Library cover-size control (target): Finder-style inline snap slider (grid view only, hidden < 768px) with the approved 12-step cover ramp `48…512`, per-step tick dots, scale-grid-and-cover-together behavior, and keyboard/`aria-label` accessibility. |
| 1.6.0   | 2026-06-21 | Amends the 1.4.0 Studio default-voice rule (owner decision): Studio's cast palette MAY carry a **per-chapter** default-voice override merged into the `Narrator (default)` entry (effective voice shown in small print + an "Override voice" selector writing `chapter.speaker_profile_name`), alongside (not replacing) the clear/unassign brush. Casting remains the sole place the **project** default is set; the per-chapter override is a distinct, chapter-scoped value. |
| 1.7.0   | 2026-06-27 | **Director's Console + three-view Studio (mock-validated, persona panel).** §3.2 Studio: three-panel layout (rail · text · right-hand Director's Console); console is the RIGHT column hosting mode tools + the active mode's contextual palette (Cast palette is one such panel) — read→act in reading order ([ADR-0014](../decisions/ADR-0014-directors-console-layout.md)). View model corrected from "one ScriptView, two modes (book/script)" to **three views** — Book (prose, primary) / Screenplay (Hollywood: centered names+parentheticals, dialogue full-width at indent) / Stage (BBC stage-play: `CHARACTER:` + variation label beneath, dialogue column) — still one editor surface. Added attribution-encoding cross-ref to design-system.md §9.6 (color=identity-only; variation=text; collision=⚠ flag — [ADR-0015](../decisions/ADR-0015-attribution-color-is-identity.md)). §2.4 rail: collapse control MUST be a real `button` with `aria-expanded`/`aria-controls`, ≥24px target, exactly one (no duplicate), distinct from the drag-resize handle; contextual chapter list = `StatusOrb` + abbreviated `Ch N` (full title in tooltip + breadcrumb dropdown). |
| 1.8.0   | 2026-06-27 | **Rail collapse handle visual form (pill, not circle-in-bar).** §2.4: collapse control visual shape specified as a **thin vertical pill** — 14px wide × 44px tall, `border-radius` = half-width (7px) for fully-rounded sides — centered at the rail's vertical midpoint. The button hit target spans the full rail height at ≥24px wide (WCAG 2.5.8); only the pill element lights up on hover (background + border-color transition). There is no collapse chevron in the bottom row; the trailing-edge pill is the sole collapse affordance. Pill is designed to double as a drag-resize handle affordance in a future phase — keep the two controls visually consistent (see §2.4 drag-resize paragraph). |
| 1.9.0   | 2026-06-27 | **Director's Console Cast mode sub-tools (mock-validated).** §3.2 Studio: documented the four Cast sub-tools (Select/Voice/Stage/Cue + S/V/G/C shortcuts), brush-size scope model (paragraph brush outlines/paints all same-`para` blocks), floating painting indicator (position:fixed, upper-right of text area), stage direction interaction (Voice tool converts stage→speech; Select inspector shows textarea + assign-speaker chips), and the Performance Cue three-axis model: Delivery (Whisper/Normal/Loud = pitch, volume-only), Speed (Slow/Normal/Fast = rate, pacing-only), and Emotion (24-item dropdown) as **independent axes** combined into `[Delivery · Speed · Emotion]` label format. |

---

## 1. Purpose

This spec documents the shared frontend chrome and the book-workflow route structure that the site redesign established. It is the binding reference for the shell, the route-level book stages, and the legacy redirect behavior that keeps old bookmarks working.

Specs and code are jointly authoritative. If this spec and the implementation disagree, resolve the drift explicitly by changing one or the other in the same PR.

Cross-reference: repository layout and frontend placement rules live in [code-organization.md](code-organization.md).

---

## 2. App Shell

### 2.1 Shell ownership

The app shell MUST live under `frontend/src/app/layout/`. The current implementation lives in `frontend/src/app/layout/AppShell.tsx`.

`frontend/src/components/layout/Layout.tsx` is a compatibility export only. It MUST not become a second shell implementation or a page-specific wrapper.

### 2.2 Shell composition

Every routed page MUST render inside the shared shell with these layers:

1. A top bar spanning the full width.
2. A left rail for global navigation.
3. A body column that holds the routed page content.
4. A mobile drawer that reuses the same navigation model on small screens.

Global navigation MUST NOT be duplicated per page. Page components may render page-local headings, tabs, or toolbars, but they MUST NOT create their own separate top-level navigation chrome.

### 2.3 Top bar behavior

The top bar MUST provide:

- A breadcrumb/context slot for the active page.
- A book identity slot when the current route is inside `/book/:bookId/*`.
- A connection indicator derived from shell hydration state.
- A Queue button that opens the shared queue drawer and reflects the queue count.

The book identity line is the canonical place for book metadata in the shell. Book pages MUST not recreate a separate header strip above the stage content.

### 2.4 Rail behavior

The rail MUST provide the grouped primary navigation:

- CREATE: Library, Voices
- MONITOR: Activity
- PLATFORM: Engines, Integrations
- MANAGE: Settings
- DEVELOPER: Progress test, Event stream, only in developer mode

The rail MUST remain collapsible, MUST preserve its state across reloads, and MUST reuse the same theme toggle and navigation model everywhere it appears. When collapsed, it MAY show hover/focus expansion as an overlay, but that overlay MUST not mutate the persisted collapsed state.

The collapse control MUST be a real focusable `button` (never a non-interactive `div`/`role="separator"`), MUST expose `aria-expanded` reflecting the collapsed state and `aria-controls` pointing at the rail, and MUST meet the ≥24px minimum target size (WCAG 2.5.8). There MUST be exactly **one** collapse control — duplicate collapse affordances (e.g. an edge handle *and* a bottom chevron) are not allowed. The collapse toggle and the drag-resize handle below are distinct, complementary affordances on the trailing edge, not the same control.

The collapse control's **visual form** is a thin vertical **pill**: 14px wide × 44px tall, `border-radius` equal to half its width (7px), producing fully-rounded short sides (stadium/capsule shape). The pill is centered at the rail's vertical midpoint — **not** a full-height strip or a circle. The `<button>` element spans the full rail height and ≥24px wide for the WCAG 2.5.8 hit target; only the inner pill span is visible. On hover, the pill's background and border-color transition on (default: transparent background, `var(--border)` border; hover: `var(--surface-alt)` background, `var(--text-secondary)` border). There is **no** collapse chevron in the bottom row — the trailing-edge pill is the sole visual affordance. The pill is intentionally designed to double as a drag-resize handle in a future phase; keep the two controls visually consistent.

The rail MUST expose a draggable resize handle on its trailing edge when expanded. Dragging the handle MUST change the shared rail width, MUST persist the expanded width across reloads, and MUST shift the main content column rather than overlaying it. The resize affordance MUST be independent from the collapsed state.

The rail MUST show queue status on Activity. It MUST preserve the `StatusOrb` component anywhere chapter status is shown; plain dots are not acceptable stand-ins.

Where the rail shows the contextual chapter list, each chapter MUST be represented by its `StatusOrb` + an abbreviated **`Ch N`** label (the number, not the full title — full titles truncate at rail width and become unreadable noise). The full title MUST stay available on demand: in the row's `title`/tooltip and in the center-column breadcrumb chapter dropdown, which is the canonical full-name chapter switcher. The rail list (abbreviated, always-visible position map) and the breadcrumb dropdown (full names, on demand) are complementary, not redundant.

### 2.5 Mobile drawer behavior

At mobile widths, the rail MAY be hidden and the same navigation data MUST be rendered in the mobile drawer. The drawer MUST share the same route map and theme toggle behavior as the rail.

### 2.6 Platform & Manage destinations (Engines / Integrations / thin Settings)

Engines and the API/Integrations surfaces were RE-HOMED out of Settings into top-level rail destinations under the **PLATFORM** group (Engines, Integrations). Settings is intentionally **THIN**: nothing you do weekly should live in Settings. This is current behavior — the pages exist as real routes (`/engines`, `/integrations`) and the redirects below are live.

- **Engines** → `/engines`. The former Settings "TTS Engines" tab content (engine cards: enable-gated-on-verify, calibration reset, run test, verify, install deps via the trust modal, uninstall, metadata, schema settings, dev panel; footer: import plugin `.zip`, refresh, diagnostics log viewer; server-restart surfacing). Engine *backend* mechanics — discovery, manifests, the engine registry/voice bridge — are NOT specified here; see [engines-and-plugins.md](engines-and-plugins.md).
- **Integrations** → `/integrations`. The former Settings "API" tab content — the external `/api/v1/tts` gateway surface (guide cards, security note, endpoint sections, Swagger link, request-count chip). Ships docs-first with honest "coming" labels for unbuilt config (north-star Q5).
- **Settings stays thin** with three areas:
  - **General**: theme/appearance, stability mode, default engine/voice, dev-mode toggle.
  - **About**: version, runtime diagnostics + restarts, production tally (with reset), plugins list.
  - **Developer** (only when developer mode is on): dev links (progress test, event stream).

Legacy Settings deep links MUST keep working by redirecting (current behavior, R5-T13): `/settings/engines` → `/engines` and `/settings/api` → `/integrations`. Redirect, never 404.

### 2.7 Library cover-size control (target)

**Status: target** — approved and implemented in the North-Star mock (`frontend/src/demo/stages/siteMockup/panes/library.tsx`); to be wired into the real Library page (tracked in `design-docs/plans/reference/site_redesign_rollout/`).

The Library **grid** view offers a macOS Finder–style **cover-size slider** for choosing cover-art display size, placed inline in the "All Books" controls row beside the sort chips and the grid/list toggle. The contract (the step values and default below are the approved decision — do not change them without an owner decision):

- **Inline, always visible — not a popover.** The control's purpose is quick, exploratory "what fits my screen" adjustment, so it favors direct manipulation (HIG). It is shown **only in grid view** (meaningless in list view) and **hidden below 768px** (covers use a fixed size on small screens).
- **Snap-to-step** across a fixed cover-size ramp (the BookCover `size`, in px) — smooth ~1.12–1.33 ratios between steps, no doubling:
  `48 · 64 · 80 · 96 · 128 · 160 · 208 · 256 · 320 · 384 · 432 · 512`.
- The grid **column width and the cover scale together**. Square covers render at the step value; book-aspect covers at `size × 1.32`. The top step `512` displays square covers at 512px tall.
- **Tick dots** mark every snap point along the track (one dot per step), positioned across the thumb's exact travel; the accent thumb rides above them. Small/large square glyphs flank the track and are clickable shortcuts to the min/max step.
- **Default** opens at a small step (index 1 = `64`) so the page opens compact; users scale up from there.
- **Accessibility:** the control is a native `<input type="range">` with `aria-label="Cover size"` (fully keyboard-operable). Track, dots, and thumb are token-driven (`--border`, `--text-muted`, `--accent`) and theme-correct in light and dark; decorative ticks are `aria-hidden`. Icon set per [design-system.md](design-system.md) §9.

---

## 3. Book Pipeline

### 3.1 Book routes

The book workspace MUST live at:

- `/book/:bookId`
- `/book/:bookId/manuscript`
- `/book/:bookId/casting`
- `/book/:bookId/studio`
- `/book/:bookId/review`
- `/book/:bookId/publish`

`/book/:bookId` MUST redirect to the last visited stage for that book, defaulting to `studio` when no persisted choice exists.

The stage tabs MUST be real routes. The route itself is authoritative for which stage is active.

### 3.2 Stage responsibilities

#### Manuscript

Manuscript owns chapter organization and source-text editing:

- Chapter table with reorder, rename, add/import, queue, reset audio, delete, and export-sample actions.
- Lifecycle pills derived from chapter data, not from a backend lifecycle field.
- Selected chapter preview/edit surface.
- A lightweight manuscript analysis strip in the preview/edit column with chars, words, sentences, segments, and estimated generation time when available.
- Focus mode for a distraction-free writing view that auto-collapses the rail and restores it on exit.

Chapter lifecycle MUST be derived by code from chapter fields. Do not add a lifecycle column or backend field to support the pills. The derived mapping used by the implementation is the spec:

- Rendered: audio done or rendered output files exist.
- Cast: chapter has begun segment work or is actively processing.
- Ready: chapter has text and analyzed segments.
- Draft: everything else.

#### Casting

Casting owns character roster management and the project default voice:

- The `Narrator (default)` row MUST be the **pinned first entry of the characters & voices list itself** — not a separate block above the roster. It carries the project default voice selector and reads as the top voice selection alongside the cast.
- The Narrator row is **non-deletable**: it MUST render without a delete control (a lock affordance in the delete slot is the established treatment) because the default voice cannot be removed.
- The default narrator row MUST be the fallback for any unassigned line.
- Casting is the **only** place the **project** default / narrator voice is set. Other stages consume the project default and MUST NOT present a *project* default-voice selector. (Studio MAY present a **per-chapter** default-voice override — a chapter-scoped value distinct from the project default — on its `Narrator (default)` entry; see the Studio section.)
- The remaining characters render below the pinned Narrator row; the add-character form MUST NOT suggest "Narrator" as an example name (it already exists as the pinned default).
- If the project default voice engine is unavailable, the stage MUST show the warning state rather than silently hiding the issue.

#### Studio

Studio is the chapter editing / performance entry point and the per-line voice-assignment surface.

**Current (shipping):**

- It MUST mount the chapter-editing surface against the selected chapter (today the existing `ChapterEditor`).
- It MUST read and update the `chapter=` query parameter for chapter-to-chapter navigation.
- It MUST fall back to the first chapter when the query parameter is absent.

**Target (binding once built — tracking phase R3, `design-docs/plans/reference/site_redesign_rollout/05_phase_r3_studio.md`):**

The R3 redesign re-homes the ChapterEditor's orchestration into Studio's own chrome. The hooks and render plumbing survive nearly verbatim; only the chrome changes. The following are the binding contract once R3 lands:

- **Three-panel layout: navigation rail (left) · chapter text (center) · Director's Console (right).** The chapter reads in the center column, flanked by the app rail and a right-hand **Director's Console** — a single panel carrying the mode tools (the contextual editing modes) atop the contextual palette for the active mode (the Cast palette below is the Cast mode's panel). The console sits on the **right**, not the left, so the read→act loop runs in reading order: the eye tracks the speaker-colored bar at a line's leading edge, across the text, to the controls on the right; assignment/adjustment then lands under the mouse hand. The console MUST be a third column beside the text, never stacked between the rail and the text. (Rationale and rejected alternatives: [ADR-0014](../decisions/ADR-0014-directors-console-layout.md).)
- **Studio offers three read/format views of the same chapter, toggled in one place** (amends north-star Q3): **Book** (flowing prose — the PRIMARY/default view, because that is how people read books; speaker-colored sentence underlines, in-place build-status highlighting as audio is produced, inline per-sentence play); **Screenplay** (US/Hollywood format — character names and parentheticals **centered** over the dialogue, dialogue left-aligned at an indent and running full width, action lines plain and non-italic); and **Stage** (BBC stage-play manuscript format — a `CHARACTER:` label with the performance-variation label beneath it, dialogue in an adjacent column, stage directions italic and full width). These are view/format toggles over **one** editor surface — never multiple editors. Book is editing-primary; Screenplay and Stage are read-through / performance-review formats.
- **Speaker color, performance variation, and voice collisions follow the attribution-encoding rules in [design-system.md](design-system.md) §9.6:** character color encodes **identity only** — exactly one color per character, never the assigned voice, the variation, or a state; performance variation (Natural / Whisper / Urgent / custom labels) is a **text label** rendered beneath the speaker name, never a color; a voice shared by two characters surfaces as an `AlertTriangle` **⚠ flag** on the cast row (and a count on its tier header), never by re-coloring. (Rejected alternative — color-by-voice — and rationale: [ADR-0015](../decisions/ADR-0015-attribution-color-is-identity.md).)
- **Safe-text and section-number (`#`) toggles are kept** as dev-leaning view options in both modes. Safe text is rendered **per-engine** and MAY differ per section depending on the voice's engine — it is not a single global rewrite.
- **Voice assignment via the CAST PALETTE — the Cast mode panel of the right-hand Director's Console (voice painting is the primary gesture).** The palette lists each character (color dot + avatar + name). Click a character swatch to **arm a brush**, then click sentences in the prose to assign — the underline re-colors live. A second click on the armed swatch disarms it. The palette is placed in-page next to the text (not in the rail) because painting needs the chapter list and the palette visible at once, and the rail is wayfinding. The Casting stage remains the roster/table view (who is in the book, voice per character); Studio is where per-line assignment happens.
- **The palette's first entry MUST be a `Narrator (default)` clear/unassign brush.** Arming it and clicking sentences reverts them to the default narrator (the existing `CLEAR_ASSIGNMENT` mechanism). Without this, an assigned sentence cannot be un-assigned — so it is a required capability, not optional.
- **Studio's cast palette MUST NOT set the _project_ default voice** — that belongs to Casting (see the Casting section). It MAY, however, carry a **per-chapter default-voice override** merged into the `Narrator (default)` entry: the entry shows the effective narrator voice in small print (the per-chapter override if set, otherwise the project default it consumes from Casting), with an "Override voice" selector beneath it that writes `chapter.speaker_profile_name`. The override selector MUST sit **alongside** (not replace) the clear/unassign brush gesture on that entry — arming the brush and setting the override are independent affordances on the same `Narrator (default)` card.
- **Sub-sentence span assignment** (the mixed `«"He excelled," Dove said…»` case — quoted span carries the character's underline, the remainder is narrator) extends the same painting gesture. This is a future increment; the layout MUST reserve room for it but it does not ship in the first R3 cut.
- **Analysis strip** under the view-pills row: chars · words · sentences · segments · estimated runtime, plus long-sentence badges — a green "N/N auto-fixed" badge and an amber, expandable "ACTION REQUIRED" badge listing unresolvable segments with an Edit jump into Manuscript. The **segments** figure MUST be the canonical render-group count (`renderGroupCount`), NOT the raw sentence/packed-segment count — per [text-processing.md](text-processing.md) §6, any UI surface presenting a segment count derives it from `build_chunk_groups`.
- **Commit / resync flow.** Editing a produced chapter's text re-analyzes the affected sections with best-effort assignment preservation, surfaced through the `ResyncPreviewModal`. This flow MUST be reachable from BOTH Manuscript and Studio off the same shared hook state — do not fork it.
- **Chapter SWITCHING lives in the rail chapter list** (per §2.4 and the rail contextual block), driven by the `chapter=` param. Studio's in-page chapter rail is REMOVED so the prose column takes the full width.

- **The Director's Console exposes four Cast mode sub-tools**, each with a single-key shortcut displayed as a small badge on the toolbar button. Pressing the shortcut also switches to Cast mode if not already active:
  - **Select** (`S`) — click any block to open an inspector panel showing the block's speaker, performance cue, and (for stage directions) an editable textarea; the panel does not modify the text.
  - **Voice** (`V`) — arm a character from the cast list to paint speaker assignments; click blocks to assign. A floating pill indicator (`position: fixed`) appears in the upper-right of the text area while a character is armed, showing the character name and current brush scope ("click Ns to assign"). The pill MUST be positioned above and outside the text-area overflow container so it is never clipped.
  - **Stage** (`G`) — toggle a block between speech/unassigned and stage direction (`type: 'stage'`, `renderable: false`).
  - **Cue** (`C`) — attach or update a performance cue on the selected block.

  All four sub-tools share the same **brush-size selector**: Word / Sentence / Paragraph. Brush size controls the painting scope: Paragraph brush paints all blocks sharing the same `para` value in one click and outlines them all on hover — it MUST NOT limit painting to the single hovered block when in Paragraph mode.

- **Voice tool stage-direction interaction.** The Voice tool MUST treat `type: 'stage'` blocks the same as unassigned speech blocks: clicking one with a character armed converts it to `type: 'speech'` assigned to that character. Only structural `type: 'perf-cue'` marker blocks are skipped by voice painting. The cursor MUST show `crosshair` over stage direction blocks when the Voice tool is armed and a character is selected. The **Select inspector for a stage direction block** MUST provide: (1) a `<textarea>` for editing the direction text; (2) an "Assign speaker" section with cast-member chips — clicking one converts the block to speech in that character's voice without switching tools.

- **Performance Cue tool — three independent axes, never combined.** The Cue panel exposes Delivery, Speed, and Emotion as separate controls because a line can be Loud at a Slow pace, or Whisper at a Fast pace; conflating them loses expressive range:
  - **Delivery** (volume/projection): Whisper · Normal · Loud — three-button toggle, maps to TTS `pitch`. Default = Normal (no label emitted).
  - **Speed** (pacing): Slow · Normal · Fast — three-button toggle, maps to TTS `rate`. Default = Normal (no label emitted).
  - **Emotion**: a dropdown of 24 options (angry, anxious, bitter, calm, cheerful, confused, content, dejected, excited, fearful, frustrated, grief, happy, hopeful, melancholic, nervous, nostalgic, playful, sad, sarcastic, surprised, tender, tense, weary) plus a free-text custom prompt field. Default = none.

  Non-default values are combined into a **cue label** rendered as `[Delivery · Speed · Emotion]` (e.g. `[Whisper · Slow · Angry]`). Only non-Normal / non-empty parts appear. The label renders: as a parenthetical beneath the affected line in Screenplay and Stage views; as a `[cue]` chip in Book view. Delivery and Speed MUST be separate controls — they MUST NOT be merged into a single "delivery" axis.

#### Review

Review is the follow-along player workspace.

**Current (shipping):** Review is a routed stage that MAY render a placeholder until the workspace is implemented. The route itself MUST exist now so the pipeline is complete.

**Target (binding once built — tracking phase R4, `design-docs/plans/reference/site_redesign_rollout/06_phase_r4_player_review.md`):**

- **Follow-along text panel.** The text panel highlights the currently-playing sentence/section; past sections are dimmed; the current section auto-scrolls into view; tapping a section seeks playback to it ("play from here").
- **Transport row** with replay and skip-back controls, scoped to the chapter being reviewed.
- **Annotations are ANCHORED TO SECTIONS (`§N`), NOT timestamps.** Re-renders change audio timing, so timestamp anchors would drift; section ids are stable. Annotations attach to `§N` and survive re-renders unmoved (owner decision, round 4 — supersedes the round-3 "timestamped annotations" lean).
- **Re-render-section in place is the primary gesture.** It reuses the existing single-segment rebuild action; while a section re-renders, the re-render highlight follows progress exactly like the Studio build view.
- **Playback mechanism ownership:** the audio playback mechanism itself (the single global player and its position bus) is owned by the **[audio-player.md](audio-player.md)** spec. The player bus position drives the follow-along highlight; Review does not own a second `<audio>` element. Cross-reference that spec for the player contract.

> **Timing limitation (R4):** there is no per-segment timestamp/offset data into the assembled chapter WAV, so v1 highlights by the currently-playing **section/segment scope**, not by intra-section position. Per-WAV timing is future backend work. The contract above is binding once Review is built; the placeholder behavior above governs until then.

#### Publish

Publish owns the ship-ready book surface:

- Inline book info editing.
- Cover display/change.
- Assembly selection and assembly progress.
- Backups and audiobook downloads.

### 3.3 Stage tabs and persistence

The stage tab set is fixed by the pipeline and MUST remain in this order:

1. Manuscript
2. Casting
3. Studio
4. Review
5. Publish

When a stage tab is activated, the selection MUST be persisted per book so the next visit returns to the last chosen stage.

---

## 4. Legacy Route Compatibility

The following legacy routes MUST keep working by redirecting into the book pipeline:

- `/project/:id`
- `/project/:id?tab=characters`
- `/project/:id?tab=assemblies`
- `/project/:id?tab=backups`
- `/chapter/:id`

`/project/:id` query parameters MUST be translated into the matching book stage. Unknown query parameters MUST be preserved unless they conflict with the redirect target.

`/chapter/:id` MUST resolve the owning project before redirecting to the Studio stage with `?chapter=<id>`.

The legacy `ProjectDetail` surface may remain as a compatibility boundary while the pipeline is being completed, but new behavior MUST NOT be added there once the stage routes own the capability.

---

## 5. Frontend State Ownership

This section formalizes `design-docs/engineering-rules/frontend-state.md` for the shell and book pipeline. It is binding for every page and stage described above.

- **Canonical entity data comes from API hydration.** Projects, chapters, blocks/segments, voices, characters, and settings are loaded through API-backed loading hooks. These hooks are the source of truth for entity data; pages MUST read canonical state from them, not from the store.
- **The frontend store owns ONLY**: live overlays (queue/progress that arrive over the socket), reconnect state, notifications, and the local editor session / drafts. The store MUST NOT become a second database — do not mirror canonical entities into it or infer canonical completion state from local UI assumptions or stale props.
- **Queue-row authority.** `queue.items` frames are the **sole authority** for which rows exist and their canonical fields. Other socket topics MUST only update overlay fields (e.g. live progress) on rows that already exist — they MUST NOT create, remove, or re-key rows. See [live-events.md](live-events.md) for the exact `QUEUE_OVERLAY_FIELDS` set that other topics are permitted to touch.
- **Local editor drafts** live in `frontend/src/store/editor-session.ts`. They are session/local state and MUST NOT blindly overwrite canonical server state — when canonical data re-hydrates, drafts reconcile against it rather than clobbering it.

---

## 6. Cross-References

- Route and component placement rules: [code-organization.md](code-organization.md)
- Chapter status / progress presentation: [progress-presentation.md](progress-presentation.md)
- Job lifecycle and queue state: [queue-jobs.md](queue-jobs.md)
- Live event topics and queue-row overlay fields: [live-events.md](live-events.md)
- Audio playback / global player bus (drives Review follow-along): [audio-player.md](audio-player.md)
- Engine backend mechanics (registry, manifests, voice bridge): [engines-and-plugins.md](engines-and-plugins.md)
- Architecture and startup boundaries: [system-architecture.md](system-architecture.md)

# Site Shell & Book Pipeline

```
spec_version: 1.4.0
status: active
created: 2026-06-13
sources:
  - frontend/src/app/App.tsx
  - frontend/src/app/layout/AppShell.tsx
  - frontend/src/app/layout/NavRail.tsx
  - frontend/src/app/layout/TopBar.tsx
  - frontend/src/components/layout/Layout.tsx
  - frontend/src/pages/Book/
  - frontend/src/pages/ProjectDetail/
  - plans/site_redesign_rollout/
  - plans/site_experience_north_star.md
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

The rail MUST expose a draggable resize handle on its trailing edge when expanded. Dragging the handle MUST change the shared rail width, MUST persist the expanded width across reloads, and MUST shift the main content column rather than overlaying it. The resize affordance MUST be independent from the collapsed state.

The rail MUST show queue status on Activity. It MUST preserve the `StatusOrb` component anywhere chapter status is shown; plain dots are not acceptable stand-ins.

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
- Casting is the **only** place the project default / narrator voice is set. Other stages (notably Studio) MUST NOT present a chapter/project default-voice selector — they consume the value, they do not set it.
- The remaining characters render below the pinned Narrator row; the add-character form MUST NOT suggest "Narrator" as an example name (it already exists as the pinned default).
- If the project default voice engine is unavailable, the stage MUST show the warning state rather than silently hiding the issue.

#### Studio

Studio is the chapter editing / performance entry point and the per-line voice-assignment surface.

**Current (shipping):**

- It MUST mount the chapter-editing surface against the selected chapter (today the existing `ChapterEditor`).
- It MUST read and update the `chapter=` query parameter for chapter-to-chapter navigation.
- It MUST fall back to the first chapter when the query parameter is absent.

**Target (binding once built — tracking phase R3, `plans/site_redesign_rollout/05_phase_r3_studio.md`):**

The R3 redesign re-homes the ChapterEditor's orchestration into Studio's own chrome. The hooks and render plumbing survive nearly verbatim; only the chrome changes. The following are the binding contract once R3 lands:

- **Book view is the PRIMARY Studio mode.** Prose paragraphs with speaker-colored sentence underlines, in-place build-status highlighting (the rendering span lights up as audio is produced), and inline per-sentence play. It defaults to book view because that is how people read books.
- **Script view is a SECONDARY preview mode** — a final read-through / play-script, not the center of Studio. This amends north-star Q3: there is still exactly **one `ScriptView` component with two routed/toggled modes** (book primary, script secondary), never two editors.
- **Safe-text and section-number (`#`) toggles are kept** as dev-leaning view options in both modes. Safe text is rendered **per-engine** and MAY differ per section depending on the voice's engine — it is not a single global rewrite.
- **Voice assignment via a right-hand CAST PALETTE (voice painting is the primary gesture).** A slim right-hand palette lists each character (color dot + avatar + name). Click a character swatch to **arm a brush**, then click sentences in the prose to assign — the underline re-colors live. A second click on the armed swatch disarms it. The palette is placed in-page next to the text (not in the rail) because painting needs the chapter list and the palette visible at once, and the rail is wayfinding. The Casting stage remains the roster/table view (who is in the book, voice per character); Studio is where per-line assignment happens.
- **The palette's first entry MUST be a `Narrator (default)` clear/unassign brush.** Arming it and clicking sentences reverts them to the default narrator (the existing `CLEAR_ASSIGNMENT` mechanism). Without this, an assigned sentence cannot be un-assigned — so it is a required capability, not optional.
- **Studio's cast palette MUST NOT contain a chapter/project default-voice selector.** Setting the default voice belongs to Casting (see the Casting section). Studio only paints assignments and clears them; it consumes the default but never sets it.
- **Sub-sentence span assignment** (the mixed `«"He excelled," Dove said…»` case — quoted span carries the character's underline, the remainder is narrator) extends the same painting gesture. This is a future increment; the layout MUST reserve room for it but it does not ship in the first R3 cut.
- **Analysis strip** under the view-pills row: chars · words · sentences · segments · estimated runtime, plus long-sentence badges — a green "N/N auto-fixed" badge and an amber, expandable "ACTION REQUIRED" badge listing unresolvable segments with an Edit jump into Manuscript. The **segments** figure MUST be the canonical render-group count (`renderGroupCount`), NOT the raw sentence/packed-segment count — per [text-processing.md](text-processing.md) §6, any UI surface presenting a segment count derives it from `build_chunk_groups`.
- **Commit / resync flow.** Editing a produced chapter's text re-analyzes the affected sections with best-effort assignment preservation, surfaced through the `ResyncPreviewModal`. This flow MUST be reachable from BOTH Manuscript and Studio off the same shared hook state — do not fork it.
- **Chapter SWITCHING lives in the rail chapter list** (per §2.4 and the rail contextual block), driven by the `chapter=` param. Studio's in-page chapter rail is REMOVED so the prose column takes the full width.

#### Review

Review is the follow-along player workspace.

**Current (shipping):** Review is a routed stage that MAY render a placeholder until the workspace is implemented. The route itself MUST exist now so the pipeline is complete.

**Target (binding once built — tracking phase R4, `plans/site_redesign_rollout/06_phase_r4_player_review.md`):**

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

This section formalizes `.agent/rules/frontend-state.md` for the shell and book pipeline. It is binding for every page and stage described above.

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

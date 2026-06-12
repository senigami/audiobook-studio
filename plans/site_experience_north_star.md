# Audiobook Studio — Site Experience North Star (Proposal)

*Author: Claude (Fable 5), 2026-06-11. Status: PROPOSAL — for discussion, nothing here is committed work.*
*Companion mockups: the design spec sheet at `/demo/#/styleguide` (U15/U16/U8/U1 cards). Appendix A is the factual map of today's site; Appendix B is the inventory of recorded future goals. Both were compiled fresh from the repo on this date.*

---

## 1. The honest diagnosis

The current site is organized around **data types**: a page for projects, a page for voices, a page for settings. That's how engineers naturally structure an app, and it served the build-out well. But the user doesn't think in data types — they think in a **production workflow**: *I have a manuscript, I need to cast it, perform it, check it, and ship it.* Today that workflow is smeared across surfaces: voice assignment lives in four places, chapter actions are scattered over three toolbars plus a sidebar, assembly ping-pongs between tabs, and the queue is a drawer pretending not to be a page.

Meanwhile, every plan in the repo points the product somewhere bigger than "a local app with settings": a **voice marketplace** (HuggingFace browse/publish), an **engine ecosystem** (GitHub plugin repos, submission pipeline, trust model), a **local TTS service** other apps consume (gateway API), and an **AI-assisted casting studio** (casting cards, recommendations). The current IA has no home for any of that — plugins are a settings panel, voice acquisition is a .zip import button, the API is a documentation tab that promises configuration it doesn't have.

So the proposal is built on one idea:

> **The app is called Audiobook Studio. Organize it like a studio — rooms for stages of production — and give the platform ambitions (voices, engines, API) front doors instead of settings panels.**

---

## 2. The two audiences

1. **The producer** (primary): an author, narrator hobbyist, or small publisher making audiobooks. They live in the production pipeline.
2. **The integrator** (growing): a developer using Studio as a local TTS service, or building an engine plugin. Today they get a docs tab; the plans (gateway API, plugin SDK, submission guidelines) say they deserve a real surface.

The IA below gives the producer the center of the app and the integrator a clearly-marked side entrance — without either crowding the other.

---

## 3. Proposed top-level navigation

A persistent **left rail** (collapsible to icons; drawer on mobile), grouped by intent — this is the U15 mockup, refined:

```
  AUDIOBOOK STUDIO
  ─────────────────
  CREATE
   📚 Library          ← home: your books
   🎙  Voices           ← the voice catalog (local + discover)
  MONITOR
   ⚡ Activity          ← queue, history, production stats
  PLATFORM
   🧩 Engines           ← plugin store + engine management
   🔌 Integrations      ← gateway API: keys, docs, status
  MANAGE
   ⚙  Settings          ← thin: appearance, defaults, advanced
  ─────────────────
  ▶ [Global player bar — bottom, persistent]
```

Why a rail and not the current top bar: the top bar caps us at ~5 ungrouped destinations, which is exactly why Engines and the API are buried in Settings today. A grouped rail expresses hierarchy, scales to the platform surfaces, and leaves the top edge of every screen free for **context** (breadcrumb + stage tabs) instead of global nav. Tradeoff: ~80px width and changed muscle memory — mitigated by keeping the same five familiar names visible.

**The Queue stops pretending.** Keep the slide-over drawer for at-a-glance monitoring from anywhere (it's genuinely good), but make **Activity** a real page: full job history, per-engine performance/calibration stats, the Production Tally (currently hiding in Settings→About), and insights ("23 hours generated this month"). Drawer = glance; page = depth. The dead `/queue` route finally gets a job.

**The global player bar (U16).** One persistent bottom player — like a music app — that owns all audio playback: segment auditions, rendered chapters, voice previews, assembled books. A scope indicator shows what's loaded ("Chapter 3 · segment 14" ↔ "Chapter 3 · full render"); prev/next operates within the scope. This kills the current VCR-player-vs-chapter-player competition and means audio keeps playing while you navigate — which is exactly what a *listening review* workflow needs (see §5, Review).

---

## 4. The Book workspace — the biggest change

Today `/project/:id` is four data-type tabs (Chapters / Assemblies / Backups / Characters) and `/chapter/:id` secretly renders the whole project page with an editor swapped in. Propose instead: opening a book lands you in a **pipeline**, with stages as tabs that mirror how an audiobook actually gets made:

```
  My Book ▸ [ Manuscript | Casting | Studio | Review | Publish ]
```

Each stage answers one question. Each has one obvious primary action. A thin **stage-progress strip** under the tabs shows where the book stands (e.g. "Manuscript ✓ · Casting 80% · Studio 12/30 chapters · Review — · Publish —"), making the pipeline itself the project dashboard.

### 4.1 Manuscript — *"What's the text?"*
- Chapter list (reorder, rename, add/import, delete) — today's Chapters tab minus render concerns.
- Source-text editing with the resync preview; committing changed text offers **"Commit & re-render affected"** right there (closes the U11 gap, and diff-aware re-render from the opportunity list lands here naturally).
- Import improvements (epub/docx splitting, future) belong to this stage.

### 4.2 Casting — *"Who speaks what?"* (one home for everything voice-assignment)
- **Cast list**: characters with assigned voices, colors, line/word counts.
- **The script, in casting mode**: the span-assignment editor (including the planned sub-sentence selection — the marquee authoring feature) lives here as the way you *do* casting, not as a tab inside an editor inside a project page.
- **AI casting assistant** (planned casting cards): "Detect speakers" → suggested cast → per-character voice recommendations with reasons → accept/adjust. Recommend, never auto-assign.
- **Voice defaults collapse to a visible cascade**: Book default → character voice → span override, all set *here*, each showing what it inherits from ("Narrator — inherited from book default"). Global default stays in Settings as the bottom of the cascade. Four scattered surfaces become one cascade in one room.
- **Audition A/B** (planned): render one line across 2–4 candidate voices inline.

### 4.3 Studio — *"Make the audio."*
- The render dashboard for this book: chapter rows with status orbs, queue/requeue/stop controls, the predictive progress system, per-chapter ETA — i.e. today's render-related controls, gathered.
- Script view in **performance mode**: segments lighting up as they render (read-focused, not assignment-focused — same component, different mode).
- Scoped view of the global queue (this book's jobs), with per-job cancel (U12).

### 4.4 Review — *"Does it sound right?"* *(new room — the biggest workflow gap in the plans)*
- Listening mode: chapter audio with waveform + playhead, segment boundaries marked.
- **Timestamped annotations** that convert to targeted re-render jobs ("flag at 12:31 → re-render segment 87 with note").
- Failed-segment recovery surface (U6): "3 segments failed — retry failed / view errors."
- Pronunciation lexicon + "test pronunciation" sits here (you discover pronunciation problems by listening).

### 4.5 Publish — *"Ship it."*
- Assembly (today's Assemblies tab) without the ping-pong: select chapters *here*, assemble *here*.
- Book metadata: cover, title, author, narrator credit — publish-grade, with export presets (ACX/M4B/podcast) and the planned loudness QA gate ("Audible-ready ✓").
- Backups live here too (a publish-adjacent safety concern), demoted to a panel.

**Migration honesty:** this is the most invasive change in the proposal. It can land incrementally — the stages are mostly *re-homing* existing components (ChapterList, ScriptView, CharacterSidebar content, AssemblyPanel) under a new shell, and ScriptView already has the mode seams (assignment vs. status display). Review is the only genuinely new room.

---

## 5. Voices — from CRUD page to catalog

Today: one page of NarratorCards with ~8 peer actions each and two duplicate export entry points. The plans (HF taxonomy, metadata, discovery) want a *catalog*. Proposed:

- **My Voices** (default tab): the local catalog — voice cards with icon, class/gender/age/accent facets, tag search, playable preview. Faceted filtering per the voice-taxonomy spec.
- **Discover** (new tab): browse/search HuggingFace (`audiobook-studio-voice` tag) — preview samples, one-click install, trust/source labeling. The .zip import stays as the offline path in a corner of this tab.
- **Voice detail page** (replaces the expanding card): the "Voice Lab" — phase-driven per U8: *Empty → Add samples → Build → Test → Ready*, one primary CTA per phase, variants/engine settings/sample manager as sections, publish/export (to HF or .zip) as the final action. The recording guide appears contextually when the dropzone is empty.

A voice card anywhere in the app (casting recommendations, discover results, my voices) is the **same component** with the same affordances: portrait, facets, play-preview, status.

## 6. Engines — from settings panel to platform surface

- **Installed** (default): today's EngineCards — verify, test, settings, diagnostics — they're already good; they just deserve daylight instead of a Settings sub-tab.
- **Browse** (new): the plugin store the plans describe — official `audiobook-studio` org plugins + community plugins via GitHub topic, trust badges (official/verified/community/legacy), install = clone, update = pull. The PluginTrustModal is already the right consent pattern; it becomes the standard install gate. .zip import remains the offline path.
- **For developers**: a visible link cluster — plugin guide, template, SDK contract docs, submission guidelines. This is the ecosystem's recruiting poster; today it's invisible.

## 7. Integrations — the gateway grows up

The API tab currently *documents* configuration that doesn't exist. When the gateway is a real product surface (the plans clearly intend it), it needs: enable/disable + LAN binding controls, **API key management**, rate-limit settings, live request log, and the Swagger link — plus copy-paste recipes (Home Assistant, curl). One page, honestly named **Integrations**. Until the config backend exists, this page ships as docs + status only — but it's *positioned* where it will grow.

## 8. Settings — thin on purpose

What remains after Engines and Integrations move out: **Appearance** (theme), **Defaults** (engine, voice, stability mode), **Advanced** (diagnostics, restarts, resets), **About** (version). Settings being boring is the sign the IA is right: nothing you do *weekly* should live in Settings.

## 9. First-run & onboarding

- The demo bundle makes first-run a **pre-stocked studio**: demo book + Studio Voice installed.
- Empty library shows a 3-step checklist (Create a book → Pick a voice → Render a chapter) instead of a marketing hero + external wiki link (Q12/U13). The hero belongs on the website, not in the app.
- The interactive demo (now live) is the try-before-install front door on the website; in-app onboarding never points outward.

## 10. What this kills, deliberately

- The dead `/queue` route ambiguity (drawer + real Activity page, each with a job).
- Voice assignment in four places (one cascade in Casting).
- Two .zip-import idioms (each lives in its surface's Discover/Browse tab as the offline path).
- The chapter editor rendering inside the project page (stages are real routes).
- Settings as the junk drawer (Engines/Integrations promoted out).
- Confirm-modal-as-default (undo toasts per U1; modals only for project delete / bulk reset).

## 11. Phasing — toward the North Star without stopping the release

**Phase 0 (in flight, v2.0):** doc 10 quick wins, dark theme (done), type/space tokens (U3), z-index discipline (U10). No IA change.

**Phase A (v2.0.x): the shell.** Left rail + grouped nav; Activity page (route + stats + tally); player bar v1 (unify the two existing players, scope toggle). All re-homing, no new features. *This alone fixes the worst "where am I" problems.*

**Phase B (v2.1): the Book pipeline.** Stage tabs as routes; Manuscript/Casting/Studio re-home existing components; Publish absorbs Assemblies+Backups+metadata. Casting becomes the single voice-assignment home (cascade UI). Sub-sentence assignment lands *into* Casting.

**Phase C (v2.x): the platform surfaces.** Voices Discover (HF), voice detail page with phases, Engines Browse (GitHub store), Integrations config (keys/binding/limits). Each independent; each shippable alone.

**Phase D (future): the new room.** Review — waveform, annotations→re-renders, pronunciation lexicon, loudness QA in Publish. The biggest net-new build, and the one that most differentiates Studio from "a TTS frontend."

## 12. Open questions for the owner — ANSWERED 2026-06-11 (all leans accepted)

Decisions: **Q1 left rail** · **Q2 five stages** · **Q3 one ScriptView, two routed modes** · **Q4 voice detail is a full page** · **Q5 Integrations ships docs-first with honest "coming" labels** · **Q6 player bar collapses when empty**. Phase A approved, to land as its own PR after #124 merges.

**Follow-up decisions (owner, 2026-06-12, after reviewing the styleguide mockups):**

- **Q1 amendment — rail must be manually collapsible.** Three states: full rail (icons + labels) → icon-only rail (~56px; via manual collapse toggle, persisted, or automatically at medium viewports) → mobile drawer (existing). In the collapsed state, hover/focus expands the rail as a temporary overlay without reflowing content. Owner accepted the rail over a top-bar-with-grouping alternative on the strength of Phase A shipping 6 grouped destinations into it from day one.
- **U16 amendment — waveform display in the player bar.** Audacity-style waveform strip, user-toggleable (persisted preference); bar expands in height when on. Library decision: **wavesurfer.js** (decode + peak cache + seek-on-click). Mocked in the styleguide U16 card.
- **U1 approved** as specced (undo toasts replace confirm modals; modals remain only for project delete and bulk audio reset).
- **U3 typography scale approved** as shown in the styleguide proposal.
- **U8 card content set** (2026-06-12): catalog card shows voice icon (uploaded image), class/gender/age badges, one-line description, ▶ preview, single phase CTA + overflow. New feature recorded as doc 04 C6: copyable image prompt generated from attributes + description so user-made icons stay stylistically uniform.
- **PENDING — full-site mockup.** Owner is reviewing this doc; next design deliverable is a mockup of the whole site interface (rail + pipeline + player together), NOT further piecemeal styleguide specimen enlargements. Hold U15 specimen-scale rework until that request comes.

| # | Question | My lean |
|---|---|---|
| 1 | Left rail vs. keeping top bar + adding a second-level nav? | Rail — hierarchy is the whole point (mockup in styleguide) |
| 2 | Are five book stages too many? Could merge Studio+Review. | Keep five — Review has distinct *listening* posture; merging recreates the toolbar pile-up |
| 3 | Does Casting own the script editor, with Studio getting a read-only performance mode — or one editor with a mode switch? | One ScriptView component, two routed modes; never two editors |
| 4 | Voice detail as page vs. modal-over-catalog? | Page — it's a workspace (build/test cycles), not a quick edit |
| 5 | Should Integrations ship as a visible-but-docs-only page before key management exists? | Yes — positioning beats hiding; label the unbuilt parts "coming" honestly |
| 6 | Player bar always visible vs. collapses when nothing loaded? | Collapses to nothing in Library/Settings; persists within a book |

---

## Appendix A — Current IA map (factual, 2026-06-11)

*(Compiled by codebase survey; routes → pages → capabilities, plus friction list.)*

### Routes & nav
Top nav: Library (`/`), Queue (drawer toggle; `/queue` route is dead — App.tsx intercepts and redirects), Voices (`/voices`), Settings (`/settings/*`). Hidden dev routes: `/progress-test`, `/event-stream`. `/project/:id` and `/chapter/:id` both render `ProjectView` (the chapter editor is conditionally embedded, not its own route component). Orphan stub: `VoiceModulesRoute`.

### Capabilities by page
- **Library**: hero + New Project + external docs link; grid/list, sort; create modal (cover/title/author/series); per-project delete (typed confirm).
- **Project Detail**: breadcrumbs w/ chapter dropdown; header (cover/metadata modals, runtime + predicted runtime); assembly progress strip; tabs **Chapters** (assemble mode, queue remaining, project speaker select, sort, add chapter; rows: drag reorder, rename, StatusOrb→queue menu, download/reset/delete), **Assemblies** (list/edit/download/delete; "Start New Assembly" bounces to Chapters), **Backups** (create/edit/download/delete), **Characters** (add, voice assign, color, delete).
- **Chapter Editor** (inside ProjectView): top bar (title, save&prev/next, export WAV/MP3); tabs **Script** (book/script modes, safe-text toggle, segment numbers, click-assign character, span voice override, per-batch generate, per-segment play, selection popover assign) and **Source Text** (stats, destructive edit→commit→ResyncPreviewModal; manual re-queue after); toolbar (Queue/Rebuild, Stop All, Commit, Debug, save chip, inline chapter player, live progress); right CharacterSidebar (chapter default voice, character assign modes, color picker); bottom VCR segment player.
- **Voices**: search, engine filter pills, Import/Export voice .zip, New Voice, Recording Guide; NarratorCards (status badge; menu: default/rename/export/delete) expanding to VariantEditor (engine, ref sample, test text + script editor modal, per-engine settings, Build/Test, move/add/delete variant) + SampleManager (upload/play/delete WAVs).
- **Settings**: General (theme, stability mode, default engine/voice); TTS Engines (EngineCards: enable gated on verify, calibration reset, run test, verify, install deps→trust modal, uninstall, metadata, schema settings, dev panel; footer: import plugin .zip, refresh, diagnostics log viewer); API (static docs only; blurb promises auth/priority config that doesn't exist); About (version, tally + reset, runtime diagnostics + restarts).
- **Queue drawer**: stats, pause/resume all, clear completed/all, refresh, drag reorder pending, per-job progress/expand/copy-debug/cancel.

### Friction (corroborated by the doc-10 HIG audit)
1. Dead `/queue` route; drawer/nav active-state ambiguity. 2. Chapter editor not a real route. 3. Orphan dev pages/stubs. 4. Assembly tab ping-pong. 5. Duplicate voice-export entries; two .zip idioms (voices vs plugins). 6. Voice defaults set in 4 places. 7. API tab is docs-not-settings. 8. Resync→re-queue manual gap. 9. Editor offers only Stop All (no per-job cancel). 10. ~14 confirm-modal sites, default destructive. 11. Voice card action overload (~8 peers). 12. Library hero vs empty-state competition; onboarding points to external wiki. 13. Blocking startup overlay; colliding hardcoded z-indexes. 14. Chapter actions scattered across 3 toolbars + sidebar.

## Appendix B — Future-direction signals (recorded in repo, 2026-06-11)

**Voices ecosystem**: HF as voice host (import/browse/publish, `audiobook-studio-voice` tag); HF-compatible voice.json bundles; full metadata taxonomy (class/gender/age/accent/tone/timbre/pace/use_case/quality + tags + icon) for catalog-grade search; voice image upload; AI casting cards + recommendation contract (recommend, never auto-assign); A/B audition; multilingual post-release; Studio Voice ships free as default.

**Plugins & engines**: standalone GitHub plugin repos (install=clone, update=pull, topic discovery, official org, trust warnings); in-app GitHub plugin search (deferred); versioned SDK + contract validation at load; submission pipeline w/ review criteria + Legacy category; .zip import via Settings today; emotion-aware synthesis/custom batching/plugin voice catalogs as future hooks; per-engine sanitize_text categories; keep_model_loaded warm-holding; signing/checksums post-release; namespace future: `tts_engines/` vs app-extension `plugins/`.

**API & integration**: `/api/v1/tts` gateway for Home Assistant/automation/games/chatbots (discovery endpoints, inline vs queued synthesis, Bearer auth, LAN binding, rate limiting, Swagger); third-party-use-case audit; versioned WS live-event contract; settings architecture → tabbed deep-linkable + search; SSML-lite markup post-release.

**Authoring & casting**: sub-sentence speaker assignment (v2.0 target); dialogue detection + cast suggestions (local NLP); listening review mode w/ waveform + timestamped annotations → re-render jobs ("biggest workflow gap"); diff-aware re-render; pronunciation lexicon; silence/breath control; ACX loudness QA; export presets; project templates; insights dashboard; crash-recovery checkpoints; onboarding tour; guided project-creation wizard; ETA trust-handoff progress model.

**Distribution & install**: Pinokio one-click wrapper (own repo, torch backend auto-select); demo bundle as required first-run feature; local-first/no-cloud positioning vs ElevenLabs (cost comparison is a marketing surface); dual-audience coming-soon pages (developers/hobbyists) already exist.

**Release & docs**: interactive demo rebuilt from real components (done 2026-06-11), rebuilt each release; six-stage release sequence to v2.0.0; canonical versioned specs (3 doc tiers: wiki/user, specs/authoritative, plugin-author); dark theme + tokens + responsive release-gated (done 2026-06-11); WCAG 2.2 AA gates; versioned-contracts directive for post-2.0 ecosystem evolution.

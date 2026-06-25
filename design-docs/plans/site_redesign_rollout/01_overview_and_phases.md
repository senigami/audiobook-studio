# Overview & Phase Map

*Read after `00_execution_contract.md`. This subsumes the earlier phasing in
`design-docs/plans/site_experience_north_star.md` §11 and `design-docs/plans/site_shell_phase_a_plan.md` — those remain
as design rationale; THIS folder is the execution truth for the conversion.*

## What we're building (one paragraph)

A persistent left **rail** (grouped nav: CREATE Library/Voices · MONITOR Activity · PLATFORM
Engines/Integrations · MANAGE Settings; collapsible to icons; theme toggle + chevron at the
bottom; contextual book block with stage links + chapter list when inside a book), a slim
**top bar** (breadcrumb + book identity line that links to Publish + connection dot + Queue
drawer button), a **Book pipeline** replacing project/chapter views (stage tabs as routes:
Manuscript / Casting / Studio / Review / Publish), a full-width bottom **player bar** (one
audio owner, scope chip, hidden when empty), the **Activity** page (queue depth view), and
re-homed **Voices / Engines / Integrations / Settings** pages. Reference mock:
`frontend/src/demo/stages/siteMockup/` — open the demo (`npm -C frontend run dev:demo`,
first card) to see every screen.

## Phase map (each phase = one PR-sized arc, shippable at its boundary)

| Phase | File | Delivers | Depends on |
|---|---|---|---|
| R1 — Shell | `03_phase_r1_shell.md` | NavRail + TopBar + queue-drawer retention + Activity page + route skeleton + theme toggle. Old pages render inside the new shell unchanged. | — |
| R2 — Book pipeline routes | `04_phase_r2_pipeline.md` | `/book/:id/{manuscript,casting,studio,review,publish}` routes; Manuscript (chapter table + lifecycle + editor + import); Publish (book info + assemblies + backups + export); Casting (roster + pinned Narrator); redirects from `/project/:id`,`/chapter/:id`. | R1 |
| R3 — Studio | `05_phase_r3_studio.md` | Book-view-primary editor re-home: view pills, cast palette painting, analysis strip, commit/resync flow, per-section controls, chapter list in rail. | R2 |
| R4 — Player bar + Review | `06_phase_r4_player_review.md` | playerBus + global PlayerBar (replaces VCR + inline players); Review stage v1 (follow-along text + per-section annotations stored locally first). | R2 (R3 for full Review) |
| R5 — Platform pages | `07_phase_r5_platform.md` | Voices catalog cards + Voice Lab page; Engines page (diagnostics, cards, store placeholder); Integrations (API guide page); Settings thinned (General/About/Developer). | R1 |
| R6 — Parity & polish | `08_phase_r6_parity.md` | Per-screen audit vs mock + capability inventory; responsive (rail drawer ≤768px); dark/light pass; a11y pass; retire dead routes/components; wiki screenshot refresh. | all |

R5 can run in parallel with R2–R4 if two agents work simultaneously (different file areas);
otherwise run in numeric order.

## Owner decisions that BIND this conversion (condensed; full log in north star §12)

1. Rail: manual collapse (chevron) + icon-only state + hover-overlay expand; theme toggle
   bottom-left (row with chevron when expanded, stacked when collapsed).
2. Rail contextual block inside a book: cover+title → stage links → full chapter list (with
   StatusOrb + render bar + ⋯ actions) under Studio when Studio active.
3. Top bar book identity line (cover chip · title · author · series · runtime · predicted) —
   clicking goes to Publish. No book header strip on stage pages.
4. Book metadata editing lives in Publish ("Book info"). Manuscript preview is read-only;
   text EDITING in Manuscript only for Draft/Ready chapters; Cast/Rendered chapters require
   the Edit-text unlock with the best-effort-assignment warning. Focus mode = distraction-free
   editor presentation.
5. Default narrator = pinned first row of Casting ("fallback for any unassigned line").
6. Studio: book view PRIMARY, script view secondary preview; safe-text + section-number
   toggles kept (dev-leaning); voice painting via right-hand Cast palette; sub-sentence
   assignment is future but the layout must leave room for it.
7. Review: follow-along player; annotations attach to SECTIONS (§N) never timestamps;
   re-render-section is the primary gesture.
8. Player bar: full-window-width bottom dock; hidden when nothing loaded; scope chip cycles;
   waveform is a later toggle (reserve height-expansion slot, no wavesurfer dep yet).
9. Queue drawer is KEPT (glance from anywhere without losing place); Activity is the page
   (now/history/stats/tally).
10. StatusOrb (progress ring) is preserved everywhere chapter status appears — never plain dots.
11. Theme: System/Light/Dark continues working everywhere (no-flash bootstrap already exists).
12. Voice pills: category-tinted fills (class/gender/age distinct hues; extended shared hue;
    free tags neutral ghost), fixed order, +N overflow. (Taxonomy v2 fields ship separately —
    doc 04 Phase G; the pill system must not hardcode the v1-only field set.)

## What this plan does NOT cover (explicitly out of scope)

- Taxonomy v2 backend (doc 04 Phase G) — separate work; the UI here renders whatever
  attribute fields the API returns.
- Sub-sentence assignment, waveform rendering, HF Discover, plugin store, loudness QA,
  pronunciation lexicon — all "planned" chips in the mock; do NOT build them.
- Any backend/orchestration changes. PR #124 content is frozen separately.

## Known-broken caveat (owner accepted)

Some live-site issues exist from recent platform work. Do NOT detour to fix app/ or plugins/
bugs found along the way unless a task says so — log them in `99_progress_log.md` under
"Found bugs" and continue. (Owner: fixing pre-redesign UI bugs before re-homing is wasted
work; they get re-verified at R6 parity.)

## Branch & PR strategy

All phases on branch `studio2/site-redesign` (cut from the merged studio-2.0 line, or from
the current branch if directed). One PR per phase targeting `studio-2.0` (NEVER main),
stacked if needed: R1 PR merges before R2 opens, etc. PR body = the phase file's acceptance
checklist with checkboxes.

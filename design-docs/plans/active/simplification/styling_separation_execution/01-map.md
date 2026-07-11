# Implementation map

## The big picture

One monolithic stylesheet (`frontend/src/theme/components.css`, 4,440 lines) gets split by domain
into `frontend/src/theme/components/*.css`, re-assembled through one `@import`-ordered index so the
rendered cascade never changes. In parallel/after, ~470 inline `style={{}}` occurrences across 14
hotspot files (20 counting already-split children) get converted to classes — reusing new shared
classes where patterns repeat, leaving genuinely dynamic values inline as `var(--token)`. Specs and
a CI guard close the loop.

**No behavior or markup changes anywhere in this map.** Every part below is a pure move or a
1:1 `style={{}}` → `className` substitution.

## Part 1 — CSS domain split (ST-1)

Current `components.css` boundaries, verified by grep on 2026-07-10 (re-verify at execution time —
dead-selector deletion runs first and shifts everything below it):

| # | New file | Domain | Current lines | First selector (grep anchor) |
|---|---|---|---:|---|
| 1 | `theme/components/core.css` | `.btn-*` + shared primitives | 1–198 | `.btn-` at top of file |
| 2 | `theme/components/nav.css` | nav rail, mobile drawer, top bar | 199–1089 | `.nav-rail {` (L199) |
| 3 | `theme/components/book.css` | book/chapter layout + workspace | 1090–2004 | `.book-layout {` (L1090) |
| 4 | `theme/components/book-tabs.css` | Casting + Lexicon tabs | 2005–2273 | `.casting-stage {` (L2005) |
| 5 | `theme/components/publish.css` | Publish tab + book info/assembly cards | 2274–2982 | `.publish-stage {` (L2274) |
| 6 | `theme/components/activity.css` | Activity page | 2983–3029 | `.activity-page {` (L2983) |
| 7 | `theme/components/shared.css` | orphan utilities: `sr-only`/`input-group`/`input-field`/`popover-panel`/`icon-circle`/`as-*`/`form-input` | 3030–3332 | first rule after `.activity-page__main` block ends |
| 8 | `theme/components/player.css` | `.player-bar` family | 3333–3562 | `.player-bar {` (L3333) |
| 9 | `theme/components/voice-lab.css` | Voice catalog + Voice Lab pages | 3563–3877 | `.voice-catalog-card {` (L3563) |
| 10 | `theme/components/review-tools.css` | Review/Revise/Write tools | 3878–4225 | `.review-main {` (L3878) |
| 11 | `theme/components/misc.css` | `.switch`, modal-close-btn, color-swatch-picker, control-target, segment-render-monitor | 4226–4440 | `.switch {` (L4226) |

**Invariant I1 — cascade order is load-bearing.** The index file (`theme/components/index.css`,
or extend `theme/index.css` if that's the existing single import point — check
`frontend/src/theme/index.css` or wherever `components.css` is currently imported from) must
`@import` these 11 files in **exactly this order** (1→11). `shared.css` and `misc.css` are
non-contiguous slices of the original file for a reason: keeping them as two separate files (not
merged into one) preserves their original relative cascade position. Merging them would move
`misc.css`'s rules earlier in the cascade than `player.css`/`voice-lab.css`/`review-tools.css`,
which is a real (if narrow) specificity-tie-break regression risk — don't do it.

**Invariant I2 — pure move, no rule edits**, except: (a) the 5 dead selectors (`.btn-home`,
`.btn-menu-destructive`, `.action-menu-item`, `.select-glass`, `.engine-chunk`) are deleted before
the split (task 001), not moved into any new file; (b) **tokenization** (owner-requested addition,
see Part 5 below) — a bare literal value with an exact/obvious matching design token gets
substituted for that token as part of the move. Selectors, structure, and property order are never
touched; only bare literal values with a clear token equivalent change.

## Part 2 — ST-2 shared classes

Add to `theme/components/core.css` (or `shared.css` if core.css is judged the wrong home at
execution time — either works, keep them together):

| Class | Inline pattern replaced | Occurrences |
|---|---|---|
| `.label-micro-muted` | `{fontSize:'var(--type-micro)', color:'var(--text-muted)'}` | 49 |
| `.label-micro-muted-strong` | `{fontSize:'var(--type-micro)', fontWeight:700, color:'var(--text-muted)'}` | 16 |
| `.label-caption-strong` | `{fontSize:'var(--type-caption)', fontWeight:700, color:'var(--text-primary)'}` | 11 |
| `.label-micro-muted-italic` | `{fontSize:'var(--type-micro)', color:'var(--text-muted)', fontStyle:'italic'}` | 11 |
| `.label-uppercase-sm` | `{fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:600, display:'block', marginBottom:'0.25rem'}` | 8 |
| `.label-uppercase-md` | `{fontSize:'0.75rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--text-muted)', marginBottom:'0.5rem', display:'block'}` | 8 |

(Class names above are suggestions consistent with the existing `.input-field`/`.form-label`-style
naming in `core.css` — an executor may pick clearer names, but keep them semantic, not
presentational, and record the final names in the task's completion note so ST-3 tasks that
consume them can find them.)

`input-field` (4 occurrences: `CharactersTab.tsx:187,265` + the rule definitions themselves) and
`form-label` (0 literal hits) need **no new work** — `input-field` already exists and is already
correctly used; `form-label` was never real. Don't manufacture either.

**Do NOT add classes for** `alignItems:'center'` (73×) or `flex:1` (51×) — `.items-center` /
`.flex-1` already exist in `theme/utilities.css` (lines 351/353). That's a missed-utility-usage bug,
tracked separately as `tasks/017-followup-missed-utility-usage.md` (optional, not gating this
plan's success criteria).

## Part 3 — ST-3 file conversion map

Shared procedure lives in `tasks/000-conversion-procedure.md` — every task below links to it
instead of repeating it. Files, in priority order (current confirmed `style={{` counts):

| Task | File(s) | Count | Note |
|---|---|---:|---|
| 004 | `pages/Book/studio/CastPalette.tsx` | 48 | doubled since parent doc — re-ranked to top |
| 005 | `pages/ProjectLibrary/ProjectLibraryPage.tsx` | 68 | highest count |
| 006 | `pages/Voices/components/VoiceModals.tsx` | 44 | |
| 007 | `components/queue/GlobalQueue.tsx` | 42 | |
| 008 | `pages/ChapterEditor/components/ResyncPreviewModal.tsx` | 37 | LIVE (see 00-overview §4) — keep |
| 009 | `pages/Engines/components/OfficialRegistryPanel.tsx` | 33 | |
| 010 | `pages/Voices/components/VariantEditor.tsx` | 31 | |
| 011 | `pages/Welcome/WelcomePage.tsx` | 30 | |
| 012 | `pages/Voices/components/ScriptEditor.tsx` | 27 | |
| 013 | `pages/LiveOutput/LiveOutputPage.tsx` | 26 | |
| 014 | `pages/Voices/components/MetadataEditorModal.tsx` + `pages/Voices/components/metadata/{IconUpload,ManySelect,OneSelect,TagsInput,chip}.tsx` | 52 combined | split 2026-07-04, convert all 6 files |
| 015 | `pages/Engines/components/EngineCard.tsx` + `EngineCalibrationSection.tsx` + `EngineSettingsForm.tsx` + `EngineTestSample.tsx` | 52 combined | split 2026-07-04, convert all 4 files |
| 016 | `pages/Voices/components/VoicesTabHeader.tsx` | 21 | |
| 017 | `pages/Voices/components/SampleManager.tsx` | 21 | |

`EditTab.tsx` is **not** in this table — confirmed dead code, dropped (00-overview §4).

**Invariant I3 — no markup/behavior change.** Every ST-3 task's acceptance criteria include: DOM
structure unchanged, all props/handlers unchanged, only `style={{...}}` → `className="..."` (plus
any genuinely-needed new class definitions in the matching `theme/components/*.css` file).

**Invariant I4 — dynamic stays inline.** A value computed from props/state/a measurement (width %,
transform, conditional token switch) is NOT converted — it stays inline but must resolve to
`var(--token)` if it currently has a hardcoded literal.

## Part 4 — ST-4 spec + guard map

| File | Current version | Target version |
|---|---|---|
| `design-docs/specs/code-organization.md` | 1.1.0 | 1.2.0 |
| `design-docs/specs/design-system.md` | **1.13.0** (not 1.2.0 as the parent doc assumed) | 1.14.0 |

New CI guard: a script under `scripts/` (matching this repo's existing `.py`/`.mjs` script
convention — see `scripts/validate_plugin_manifests.py` for the pattern of a repo-hygiene script
wired into CI) that greps `frontend/src` (excluding `frontend/src/demo/` **and**
`frontend/src/theme/tokens.css` itself — that file's whole job is defining the hex/rgb source
values every token points to, so its own literals are not violations) for hardcoded hex/rgb
colors or raw px literals inside `style={{...}}` blocks and fails if any are found. Wire it into
`.github/workflows/ci.yml` alongside the existing lint/test steps.

## Part 5 — Tokenization (owner-requested addition, 2026-07-10)

While converting/moving any CSS or inline style in this plan, standardize bare literal values onto
the existing token registry in `frontend/src/theme/tokens.css` wherever an exact/obvious match
exists. This is **substitution against the existing registry, not new-token design** — inventing a
new token is a separate decision outside this plan's scope (flag a gap, don't fill it ad hoc).

| Category | Tokens | Values |
|---|---|---|
| Core colors | `--surface`, `--surface-alt`, `--surface-light` | `#ffffff`, `#f0f3f9`, `#f8fafc` |
| Action/accent | `--accent`/`--action-primary`, `--action-primary-hover`, `--action-primary-active`, `--action-danger`(+hover/active) | `#1e4fd8`, `#1a45c0`, `#163aa3`, `#c41a1a`(+`#a81515`/`#901010`) |
| Text | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-subtle` | `#1c2b4a`, `#475569`, `#5c6a80`, `#69788f` |
| Border | `--border`, `--border-strong`, `--hairline` | `#e6eaf2`, `#c3cbdb`, `rgba(15,23,42,.08)` |
| Status | `--success`(+`-muted`/`-strong`/`-text`), `--warning` | `#10b981` family, `#f59e0b` |
| Spacing | `--space-1`…`--space-8` | 4/8/12/16/24/32/40/48px |
| Type size | `--type-display/large-title/title/headline/body/reading/callout/caption/micro` | see `tokens.css` L215-223 |
| Type weight | `--type-weight-display/title/headline/body/caption/micro` | see `tokens.css` L224-229 |

**Where this applies:** task 002 (CSS split — tokenize as each domain's rules are moved) and every
ST-3 task via `000-conversion-procedure.md` step 3 (tokenize as inline styles are converted).
**Where it doesn't:** don't retroactively tokenize CSS/JSX this plan doesn't otherwise touch — that
would be a separate, much larger sweep outside this plan's blast radius; this plan tokenizes
exactly what it's already moving/converting for ST-1–ST-3.

**Aggregation:** every task logs any hardcoded value it found with **no** matching token (file:line
+ value) in its completion note. Task `018-st4-spec-bump-and-guard.md` collects these into a short
"token gaps found" list in its completion note for the user — real candidates for new tokens in a
future session, not decided here.

## Risks & open questions

- **R1 — cascade regression in the split.** Mitigated by I1 (exact import order) + a build-time
  visual diff, not just "build succeeds." `npm -C frontend run build` proves no import errors; it
  does NOT prove pixel-identical rendering — that needs the owner visual pass in `02-roadmap.md`.
- **R2 — a "static, repeated" pattern that turns out to have a subtle per-instance difference**
  (e.g. one occurrence has a slightly different `marginBottom`). If ST-3 finds a near-match that
  isn't exact, don't force it into the shared class — either add a modifier class or leave that
  one instance's difference inline. Judgment call, not a blocker.
- **Open question — exact class names for Part 2.** Left to the executing agent's judgment
  (semantic naming, not exact strings) — record final names in the task's completion note.

# Phase 2 — Styling separation (the core ask)

> Map: [00_overview.md](00_overview.md). This is the "Zen-garden" workstream: move styling out of
> the JSX and into token-keyed CSS, with semantic class names in the markup. **No Tailwind**
> (decision §1 of the overview). High churn, low logic-risk — phased by hotspot, each file an
> isolated, owner-verifiable task.

> **AUDIT CORRECTION (2026-07-01):** Headline counts no longer reproduce: `form-label` as a literal
> class = **0 hits repo-wide** (doc claimed 52×/21 files); `input-field` = **4 occurrences / 2
> files** (doc claimed 8/3); `components.css` is now **3,772 lines** (doc said 2,956 — it grew by
> ~800). All 5 QW-6 dead selectors (`.btn-home`, `.btn-menu-destructive`, `.action-menu-item`,
> `.select-glass`, `.engine-chunk`) are still present. The `theme/components/` split directory does
> not exist yet. **Executor instruction:** re-run the frequency scans fresh (e.g.
> `grep -roh "style={{[^}]*}}" frontend/src | sort | uniq -c | sort -rn`) before ST-2/ST-3 — do not
> trust the doc's cited counts.

---

## The strategy (read before touching anything)

The frontend already has the right foundation: a single token registry (`tokens.css`), a
`utilities.css`, and a (too-large) `components.css`. The debt is **~1,661 inline `style={{}}`
blocks** in production JSX that should be classes. The win is *separation + dedup*, not a rewrite.

**Conversion rule (the contract this phase establishes):**

| Inline style is… | Action |
|------------------|--------|
| Static + uses tokens + **repeated** across components | → shared class in `theme/components/*.css` |
| Static + uses tokens + **one-off** | → page/component class if it aids readability; otherwise may stay inline (don't manufacture single-use classes for everything) |
| **Dynamic** (value computed from props/state/measurement: width `%`, `transform`, conditional token) | → **stays inline**, but must use `var(--token)`, never a hardcoded literal |
| Contains a **hardcoded color/length** | → fix to a token (this is the §2.2 mandate; see QW-7) |

Sequence within the phase: **ST-1 (split the stylesheet) → ST-2 (add shared classes for the big
repeats) → ST-3 (convert hotspots) → ST-4 (spec bump + guard).** ST-2 before ST-3 because the
repeated-pattern classes give the most leverage per edit.

---

## ST-1 — Split `components.css` (2,956 lines) by domain

**Why:** single monolith; exceeds `code-organization.md` §7's 600-line norm; hard to navigate.
The file already has natural section dividers along these block prefixes (verified line ranges):

| New file | Contents | approx lines |
|----------|----------|-------------|
| `theme/components/core.css` | `.btn-*` + shared primitives (`.sr-only`, `.input-group`, `.input-field`, `.icon-circle`, `.as-*`, `.form-input`) | ~250 |
| `theme/components/nav.css` | `.nav-rail`, `.rail-book-block`, `.mobile-nav-drawer`, `.top-bar` | ~889 |
| `theme/components/book.css` | `.book-layout`, `.book-stage-*`, `.manuscript-stage`, `.chapter-table`, `.chapter-text-panel`, `.studio-*`, `.casting-stage`, `.publish-stage`, `.book-info-card`, `.assembly-picker` | ~956 |
| `theme/components/activity.css` | `.activity-page` | ~50 |
| `theme/components/player.css` | `.player-bar` section (has its own divider already) | ~601 |

**Steps:**
1. Do this **after QW-6** (dead-selector deletion) so you don't move dead rules.
2. Cut each domain block into its file verbatim (no rule edits — pure move). Keep one
   `theme/components/index.css` (or extend `theme/index.css`) that `@import`s them in the current
   order so cascade is byte-identical.
3. Each new file stays under 600 lines (`book.css`/`nav.css` are close — fine, they're single
   domains; split further only if a real sub-domain seam exists).
4. Verify the rendered app is pixel-identical (cascade order preserved).

**Verify:** `npm -C frontend run build`; owner visual diff on a few representative pages (nav, a
book stage, the player). Because it's a pure move, screenshots before/after should match.
**Effort:** M · **Risk:** low. **Spec:** `code-organization.md` §5 layout table (list
`theme/components/`); `design-system.md` `sources:` if it pins `components.css`; update
`progress-presentation.md` / `site-shell-and-book-pipeline.md` `sources:` **only** if their pinned
CSS paths move (no version bump for unchanged-CSS path moves).

---

## ST-2 — Add shared classes for the high-frequency repeats

**Why:** a handful of inline objects are copy-pasted dozens of times. One class each kills the most
duplication for the least work.

**Confirmed repeats:**
1. **Form-label pattern — 52 occurrences across 21 files.** The same ~7-property object
   (`fontSize ~0.7rem`, `color var(--text-muted)`, `textTransform uppercase`,
   `letterSpacing 0.05em`, `fontWeight 600`, `display block`, `marginBottom 0.25rem`).
   → add `.form-label` to `theme/components/core.css` using tokens (`--type-micro`, `--text-muted`,
   `--space-*`). Promote the existing `.input-group label` rule (currently scoped) into this
   standalone class.
2. **Input/textarea pattern — 8 occurrences in 3 files** duplicating the existing `.input-field`
   (`background var(--surface-light)`, `border 1px solid var(--border)`, `color var(--text-primary)`).
   → just use `className="input-field"`; keep any genuine padding override inline.

**Also (cheap scan):** before ST-3, run a frequency pass to catch the next 3–5 repeats —
e.g. `grep -roh "style={{[^}]*}}" frontend/src --include=*.tsx | sort | uniq -c | sort -rn | head -40`.
Likely candidates: section-header rows, card shells, flex-row-with-gap. Add a class for any pattern
appearing ≥ ~6 times; leave the long tail for ST-3 per-file judgment.

**Verify:** new classes render identically to the inline originals (compare one converted instance
per class in both themes).
**Effort:** M · **Risk:** low. **Spec:** these are new shared primitives → covered by the ST-4 bump.

---

## ST-3 — Convert inline styles to classes, hotspot by hotspot

**Why:** the bulk of the separation. Done per-file so each is a small, reviewable, owner-verifiable
unit — **not** a single mega-PR.

**Order (top 15 by inline-style count, ~470 occurrences combined):**

| # | File | count |
|---|------|------:|
| 1 | `pages/ProjectLibrary/ProjectLibraryPage.tsx` | 63 |
| 2 | `pages/Voices/components/MetadataEditorModal.tsx` | 52 |
| 3 | `pages/Engines/components/EngineCard.tsx` | 52 |
| 4 | `pages/Voices/components/VoiceModals.tsx` | 44 |
| 5 | `components/queue/GlobalQueue.tsx` | 40 |
| 6 | `pages/ChapterEditor/components/ResyncPreviewModal.tsx` | 37 |
| 7 | `pages/Engines/components/OfficialRegistryPanel.tsx` | 33 |
| 8 | `pages/Voices/components/VariantEditor.tsx` | 31 |
| 9 | `pages/Welcome/WelcomePage.tsx` | 30 |
| 10 | `pages/Voices/components/ScriptEditor.tsx` | 26 |
| 11 | `pages/LiveOutput/LiveOutputPage.tsx` | 26 |
| 12 | `pages/ChapterEditor/components/EditTab.tsx` | 26 |
| 13 | `pages/Book/studio/CastPalette.tsx` | 24 |
| 14 | `pages/Voices/components/VoicesTabHeader.tsx` | 21 |
| 15 | `pages/Voices/components/SampleManager.tsx` | 21 |

**Important interaction with Phase 1:** items 6 and 12 (`ResyncPreviewModal`, `EditTab`) are in the
**dead ChapterEditor tree** — if Phase 1 (DC-1b) runs first, they vanish and drop off this list.
Sequence Phase 1 before ST-3 to avoid converting code you're about to delete. Several #2/#3 files
are also LF- split candidates (Phase 3) — when a file is slated for both, **split first, then
convert** so you style smaller components.

**Per-file procedure (one commit per file):**
1. Apply the conversion rule above. Reuse ST-2 classes; add file-local classes for that file's
   repeated static patterns; leave dynamic styles inline (token-only).
2. Put new file-scoped classes in the matching `theme/components/*.css` (or a co-located
   `Page.css` if the page is self-contained — follow the existing `ScriptView.css` precedent, but
   prefer the central domain files for cross-page reuse).
3. No behavior/markup-structure change — only `style={{}}` → `className`.

**Verify (every file):** `npm -C frontend run build` + relevant unit tests; **owner visual check of
that screen in light + dark** (the only reliable regression catch for styling — per the working
rule, ask the owner rather than self-previewing each one). A `preview_screenshot` before/after on
the page is a good attachment for the owner.
**Effort:** L (the phase's bulk) · **Risk:** low logic / real visual-regression surface → mitigated
by per-file scope + owner sign-off. **Spec:** ST-4 covers it.

> Pragmatism guard: the goal is *separation and dedup*, not zero inline styles as dogma. Dynamic
> values legitimately belong inline. Don't bloat the CSS with hundreds of single-use classes — that
> trades one mess for another. Convert the repeats and the static blocks; leave principled inline.

---

## ST-4 — Spec bump + regression guard

**Spec (same commit as the convention's first landing):**
- `design-system.md` **1.2.0 → 1.3.0**: changelog row + a short subsection codifying the conversion
  rule from this doc (class-based styling keyed off tokens; inline reserved for dynamic, token-only
  values). This makes the new convention *binding* so the debt doesn't silently regrow.
- `code-organization.md` **1.1.0 → 1.2.0**: §5 layout reflects `theme/components/*.css`.

**Optional but recommended guard (forward-looking):**
- Add **stylelint** with a rule rejecting raw `#hex`/`rgb()`/`rgba()` in `frontend/src/**/*.css`
  (enforces §2.2 mechanically; the spec-impact audit flagged this as the missing CI gate). Wire it
  into `npm -C frontend run lint` and CI.
- Optionally an ESLint rule discouraging static (non-expression) inline `style` objects to keep new
  code on the class path. Tune to avoid false positives on dynamic styles.

**Effort:** S · **Risk:** low. **Spec:** this *is* the spec work.

---

### Phase 2 done-check
`components.css` is a folder of <600-line domain files; the top hotspots carry semantic classes;
repeated patterns are single classes; dynamic styles remain inline and token-only; `design-system.md`
1.3.0 + `code-organization.md` 1.2.0 landed; optional stylelint gate green. Owner has visually
signed off on the converted screens in both themes. Dated `wiki/Changelog.md` entry.

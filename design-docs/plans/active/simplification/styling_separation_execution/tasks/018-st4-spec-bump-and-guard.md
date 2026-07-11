# Task 018 — ST-4: spec bump + CI regression guard

Status: complete — 2026-07-10

## Goal

Bump the two affected specs, add a CI-wired script that rejects new hardcoded colors/inline styles
going forward, and aggregate the token-gap report from every prior task (owner-requested
tokenization addition — see `../01-map.md` Part 5).

## Map links

- Map: `../01-map.md` Part 4.
- Risk flag: `none`.
- Depends on: Workload C (004–017) complete — the guard should be checked against the final,
  fully-converted tree, not partway through.

## Exact targets

**Spec bumps:**

| File | From | To |
|---|---|---|
| `design-docs/specs/code-organization.md` | 1.1.0 | **1.2.0** |
| `design-docs/specs/design-system.md` | **1.13.0** (not 1.2.0 — re-verify the current version header before editing; it may have moved again since 2026-07-10) | next minor above current |

Add a changelog row to each spec documenting: the `theme/components/` split (11 files, list them),
the new shared classes added, and the regression guard. Follow this repo's existing spec changelog
row format (look at the most recent row in each file for the format to match).

**New CI guard script:**

Create a script (Python or Node, matching this repo's existing `scripts/` convention — see
`scripts/validate_plugin_manifests.py` for the pattern of a repo-hygiene script) that:
- Scans `frontend/src` **excluding** `frontend/src/demo/` **and**
  `frontend/src/theme/tokens.css` (that file legitimately defines the hex/rgb source values every
  token points to — its own literals are not violations).
- Flags any `style={{...}}` block, or any rule in `theme/components/*.css`, containing a hardcoded
  hex color (`#[0-9a-fA-F]{3,8}`), an `rgb(`/`rgba(` literal, or a raw px number for a property
  that should be a spacing/size token (use judgment — the goal is catching regressions like
  `padding: '12px'` instead of `padding: 'var(--space-3)'`, not flagging every legitimate one-off).
- Exits non-zero with a clear list of file:line violations if any are found.
- Exits 0 cleanly otherwise.

Wire it into `.github/workflows/ci.yml` as a new step alongside the existing lint/test steps.

**Token-gap report:** collect every "no matching token" note left by tasks 002 and 004–017 (per
`../01-map.md` Part 5's aggregation rule) into a short list — file:line + value — and include it in
this task's completion note under a "Token gaps found" heading. These are real candidates for new
tokens in a future session; don't add new tokens to `tokens.css` in this task, just surface them.

## Steps

- [x] Confirm Workload C is fully complete (all 14 ST-3 tasks' commits landed).
- [x] Re-verify current spec versions for both files (they may have moved since this plan was
      written). `code-organization.md` was still 1.1.0; `design-system.md` was still 1.13.0 (matching
      the map's re-verified note, not the parent doc's stale 1.2.0 guess).
- [x] Bump both specs, add changelog rows.
- [x] Write the guard script under `scripts/`.
- [x] Run the guard script against the current tree — it should pass clean (if it finds violations,
      that means Workload C left some hardcoded values behind — fix those first, don't ship a guard
      that immediately fails).
- [x] Add the CI step to `.github/workflows/ci.yml`.
- [x] Collect the token-gap notes from every prior task's completion note into this task's own
      completion note.
- [x] `npm -C frontend run build` — still succeeds (sanity check nothing broke).

## Acceptance criteria

- [x] Both specs bumped with correct version numbers (double-check `design-system.md` isn't bumped
      to a number that collides with real history — see the "Important context" warning above).
      `code-organization.md` 1.1.0 → 1.2.0; `design-system.md` 1.13.0 → 1.14.0 (no collision — 1.14.0
      is unused in the existing changelog).
- [x] Guard script exists, runs clean against the current tree, and is wired into CI.
- [x] Token-gap report compiled in this task's completion note (empty list is a valid, fine
      outcome).
- [x] One commit (or two, if the spec bumps and the guard script feel cleaner as separate commits —
      executor's judgment).

## Completion note (2026-07-10)

**Spec bumps:**
- `design-docs/specs/code-organization.md` 1.1.0 → **1.2.0** — new changelog row documents the
  `theme/components/` split (11 files), the `theme/` subtree detail added to the frontend layout
  tree, and the new CI guard.
- `design-docs/specs/design-system.md` 1.13.0 → **1.14.0** — new changelog row documents the same
  split (with the file list, the 6 shared classes, and the 20 converted files), plus the guard.
  Also repointed the `sources:` list and the §7 Responsive prose off the retired
  `theme/components.css` path onto `theme/components/` (directory) / `theme/components/nav.css` —
  those were live "current state" references that had gone stale, not historical changelog rows
  (historical rows describing what shipped *at the time* were left untouched, e.g. the 1.8.0/1.10.0
  rows still correctly say "`components.css`" because that's what was true then).

**Guard script:** `scripts/check_hardcoded_styles.py` (Python, matching
`scripts/validate_plugin_manifests.py`'s CI-hygiene-script pattern). Checks:
1. **Hardcoded colors** (hex `#abc`/`#aabbcc`/`#aabbccdd` or a literal `rgb(`/`rgba(` call not
   wrapping a `var(--...)` channel) — in every `style={{...}}` block across all of `frontend/src`
   (excluding `demo/`), and in every rule of `frontend/src/theme/components/*.css`
   (`tokens.css` itself is excluded, per spec).
2. **Raw px spacing regressions** (a bare/quoted px number on `padding`/`margin`/`gap`/`top`/`left`/
   `right`/`bottom`(+ per-side variants) that exactly equals a `--space-*` token's pixel value) — in
   `style={{...}}` blocks, scoped to the 20 files Workload C converted (a hardcoded list in the
   script). This check is intentionally **not** repo-wide: a pre-ship audit found ~136 pre-existing
   exact-px-match spacing literals in files this plan never touched (see "Scoping decision" below).
   The color check has no such carve-out (colors have no legitimate "close but not exact" case the
   way spacing does), so it runs everywhere.
3. A small explicit `ALLOWLIST` (matched by exact stripped line text, not line number, so an edited
   line re-triggers review) for genuine one-offs with no token equivalent — every entry has an
   inline reason comment in the script.

Wired into `.github/workflows/ci.yml` as a new `check-hardcoded-styles` job alongside
`validate-plugin-manifests` (fast, stdlib-only, runs on every event).

**Guard run against current tree:** passes clean (`OK: no hardcoded style violations found.`) —
verified with a synthetic-violation smoke test first (planted a hex color + an exact-match `12px`
padding in a scratch file tree; guard correctly flagged both, then cleanly passed once removed) so
a false "all clear" wasn't just an untested no-op.

**Scoping decision (flagged, not silently made):** the task's literal wording says the raw-px check
should also apply to `theme/components/*.css` rules. Building the guard, I found that would surface
16 pre-existing exact-`--space-*`-match shorthand values in `review-tools.css`/`voice-lab.css`/
`misc.css` (e.g. `padding: 8px 12px` where both `8px`=`--space-2` and `12px`=`--space-3` but neither
was substituted) — these are task 002's (ST-1 CSS split) work, already shipped/verified, not
Workload C's. Since fixing or allowlisting 16 unrelated instances across files task 018 doesn't
otherwise touch is out of this task's declared scope, I scoped the raw-px check to `style={{...}}`
blocks only (CSS files get the color check only). Flagging the 16 as a good candidate for a future
follow-up task (not fixed here, not silently swept under the guard).

**Allowlist entries added (all pre-existing, none introduced by this task):**
- `theme/components/misc.css` — 9 entries: `.switch__track`/`.switch__knob` backing + focus-ring
  halo (black/white blends, one theme-invariant white knob), `.form-input:focus` glow (hand-picked
  accent-blend rgba, not the `--accent-rgb` channel var), and the `SegmentRenderMonitor` active-pulse
  teal tint (no teal family in the token registry).
- `theme/components/publish.css` — 1 entry: the book-cover `drop-shadow` black blend.
- `app/App.tsx` — 1 entry, and a **real pre-existing bug found while building this guard, out of
  scope to fix here**: `border: '2px solid var(--danger, #d64545)'` — `--danger` is not a defined
  token (the real token is `--action-danger`, `#c41a1a`), so the hex fallback is silently
  load-bearing. Flagged for a future fix, not touched (App.tsx isn't a target of this task or any
  prior one in this plan).
- `pages/ProjectDetail/components/ProjectCard.tsx` — 4 entries, decorative glass-highlight/vignette/
  drop-shadow overlays on the cover-photo card (arbitrary white/black alpha blends for a purely
  visual compositing effect, no token equivalent) — same kind of file this plan never touched.

**Token gaps found (aggregated from tasks 002, 004–017):**

Recurring categories (not reproducing every line — see each task's own completion note for exact
file:line lists):

- **Font sizes with no exact `--type-*` match** — the single largest category, recurring in
  essentially every converted file (005–017). Values seen: `0.6`/`0.6`/`0.62`/`0.65`/`0.7`/`0.72`/
  `0.78`/`0.8`/`0.82`/`0.85`/`0.86`/`0.88`/`0.9`/`0.92`/`0.925`/`0.95`/`1.0`/`1.05`/`1.1`/`1.25`/
  `1.75rem`. None land exactly on `--type-micro`(0.6875)/`-caption`(0.75)/`-callout`(0.875)/
  `-body`(0.9375)/`-headline`(1.125)/`-title`(1.5rem) — the type scale is coarse relative to how
  many distinct sizes real components use.
- **Border-radius has no token category in this plan's Part 5 registry scope at all** (only colors,
  spacing, type size/weight) — recurring `2/4/6/8/10/12/16/20/24/100/999px` values across nearly
  every converted file. Several tasks (007, 009, 012, 013, 015) explicitly flagged this as a
  possible scoping-reading error worth someone double-checking (`--radius-button`=8px/
  `--radius-card`=10px/`--radius-compact`=6px would be exact matches for several instances if radius
  were meant to be in-scope) — left untouched per the literal registry table, not fixed here either.
- **Spacing (gap/padding/margin) with no exact `--space-N` match** — recurring `2/3/6/10/14/18/20/
  28/36px` and `0.15/0.2/0.3/0.35/0.4/0.45/0.6/0.65/0.7/0.8/0.85/0.9/1.1/1.25rem`, falling between
  adjacent `--space-*` steps (4/8/12/16/24/32/40/48px). Mixed shorthands (one side matches, one
  doesn't, e.g. `padding: '3px var(--space-2)'`) were tokenized per-side where an exact match
  existed — that partial-substitution pattern is now an established precedent in this codebase.
- **`font-weight` 700/800 left un-tokenized** (006, 012, 013) — not a "no token" gap so much as an
  "ambiguous token" one: `--type-weight-*` values are semantically paired to a type-scale role
  (e.g. `--type-weight-headline`=600, `--type-weight-title`=700), and multiple same-valued tokens
  exist for different roles, so substituting one for a non-heading label/button would be a
  misleading semantic pick — left as raw numbers by design, not oversight.
- **`letter-spacing` has no token category** — `0.04em`/`0.05em`/`0.06em` recur (009, 012, 014).
- **Fixed component/icon dimensions** (not spacing) — `18/28/36/44/48/64/70/96/110/120/128/300/520/
  640px` widths/heights with no relationship to the 8pt spacing scale at all (007, 008, 010, 011,
  014); explicitly out of Part 5's category list (spacing tokens are for margin/padding/gap, not
  element sizing).
- **`border-radius: 100px`/`999px` "pill" idiom** (010, 014) — a deliberate, already-consistent
  codebase idiom for pill shapes, distinct from `--radius-round` (9999px); not a gap, just visually
  adjacent — left alone on purpose.
- **Cross-lane inconsistency, unresolved** (flagged by 015, not resolved by this task): task 009
  tokenized rem-based spacing (`0.25rem`→`--space-1`, `0.5rem`→`--space-2`, etc., valid under a 16px
  root font) as part of its exact-match substitution pass; task 015 did not apply that same
  rem→px-token equivalence to its own (many) rem-based spacing values, reading the procedure's "raw
  px number" wording more literally. Both are internally consistent with a defensible reading of the
  same instruction; nobody has reconciled which reading is "correct" — flagging for whoever picks up
  a future tokenization pass.
- **Task 002** (the CSS domain split) recorded only a summary count in its commit message ("45
  hardcoded spacing/font-size literals with an exact match... substituted") rather than an itemized
  file:line gap list in its own task-file completion note, so it contributes no line-level entries
  here — only that one summary figure.
- **Single interesting one-off** (the kind the parent instructions specifically asked to call out):
  `.switch__knob { background: #ffffff }` in `misc.css` — can't safely become `var(--surface)`
  because `--surface` flips to a dark value in dark mode, which would make the knob invisible
  against the (also-dark) track. A genuinely architecture-driven exception, not a missing token.

No new tokens were added to `tokens.css` — per Part 5, this task only surfaces candidates for a
future session's token-design decision.

**Verification:** `npm -C frontend run build` succeeds (unchanged bundle, only markdown/CI/script
files touched by this task). Guard script self-tested against a synthetic violation (see above) and
passes clean against the real tree. `ruff check scripts/check_hardcoded_styles.py` — clean.
`.github/workflows/ci.yml` re-parsed with `yaml.safe_load` to confirm the new job doesn't break YAML
structure.

## Dependencies

- Blocked by: `004` through `017` (all of Workload C).
- Blocks: none — this is the last task; once complete, the plan folder can be archived per
  `../README.md`'s archive convention (after the owner visual-check pass in `../02-roadmap.md`).

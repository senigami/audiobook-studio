# Task 000 — Self-host Geist + Geist Mono + Source Serif 4; add --font-* tokens
STATUS: DONE — commit 3e3067ed (2026-06-20); spec_version 1.5.0

## Goal

Add self-hosted Geist (UI body), Geist Mono (logs/code), and Source Serif 4 (reading column) via `@fontsource`, alongside the already-self-hosted Inter and Space Grotesk. Introduce four `--font-*` CSS tokens that point the full font stacks. Repoint `base.css` body/heading/code stacks to the new tokens. Inter stays **first** in the `--font-ui` stack until Geist is confirmed resolving in-browser (R1 mitigation). Resolves open question **R1**.

## Why it matters

The Quiet Studio type identity requires Geist as the primary UI face, Space Grotesk for display/headings, Source Serif 4 for reading columns, and Geist Mono for code/log panels. Without `@fontsource` imports the named fonts never load — the app falls back silently to system-ui (the same pre-June-19 bug that Inter had before it was self-hosted). This phase delivers the fonts before the token re-skin (P1) so that M1 ("type identity live") is true the moment P0 ships.

## Map links

- `PART-fonts` — primary owner of this task
- `PART-tokens` — `--font-*` tokens are added to `tokens.css` here (values only; no color changes)
- `PART-base` — `base.css` body/heading/code stacks repointed
- `PART-spec` — §4.1 typeface section updated in lockstep
- `INV-1` — app must build and render after every phase; Inter stays as fallback
- `INV-3` — spec lockstep; `design-system.md` updated in same commit
- `R1` — open question resolved here: confirm `@fontsource-variable/geist`, `@fontsource/geist-mono`, `@fontsource/source-serif-4` resolve at registry; else vendor woff2 under `frontend/src/theme/fonts/`

## Files to touch

| File | Change |
|------|--------|
| `frontend/package.json` | Add `@fontsource-variable/geist`, `@fontsource/geist-mono`, `@fontsource/source-serif-4` |
| `frontend/package-lock.json` | Updated by `npm install` |
| `frontend/src/main.tsx` | Add three `@fontsource` imports after the existing Inter/Space Grotesk imports |
| `frontend/src/fontsource.d.ts` | Add three module declarations (type stubs for the new packages) |
| `frontend/src/theme/tokens.css` | Add four `--font-*` tokens to `:root` (theme-independent) |
| `frontend/src/theme/base.css` | Repoint `body` font-family stack + heading stack + `code, pre` stack to use the new `--font-*` tokens |
| `docs/specs/design-system.md` | §4.1 typeface section: record Geist/Geist Mono/Source Serif 4 as self-hosted; bump `spec_version` to 1.5.0; add changelog row |

## Target shape / contract

### R1 resolution
`@fontsource-variable/geist` is **confirmed available** at the npm registry (version 5.x). `@fontsource/geist-mono` and `@fontsource/source-serif-4` likewise resolve. No woff2 vendoring required. (Verified by `npm show @fontsource-variable/geist version` → `5.x.x`.)

### New imports in `frontend/src/main.tsx`
```ts
import '@fontsource-variable/inter';
import '@fontsource-variable/geist';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/700.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
```

### New module declarations in `frontend/src/fontsource.d.ts`
```ts
declare module '@fontsource-variable/inter';
declare module '@fontsource-variable/inter/*.css';
declare module '@fontsource-variable/geist';
declare module '@fontsource-variable/geist/*.css';
declare module '@fontsource/geist-mono/*.css';
declare module '@fontsource/source-serif-4/*.css';
declare module '@fontsource/space-grotesk/*.css';
```

### New `--font-*` tokens in `tokens.css` `:root` (theme-independent block)
```css
/* Typography stacks — updated by Task 000 */
--font-ui:      'Geist Variable', 'Geist', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
--font-display: 'Space Grotesk', 'Geist Variable', system-ui, sans-serif;
--font-reading: 'Source Serif 4', Georgia, 'Times New Roman', serif;
--font-mono:    'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
```

Inter is listed **third** in `--font-ui` as a committed fallback until Geist is confirmed rendering in-browser — this prevents a silent regression to system-ui if the import ever fails to resolve.

### Updated stacks in `base.css`
```css
body {
  font-family: var(--font-ui);
  /* Remove the inline stack — the token carries it */
}

h1, h2, h3, h4 {
  font-family: var(--font-display);
}

code, pre {
  font-family: var(--font-mono);
}
```

### Package additions to `frontend/package.json`
Under `"dependencies"`:
```json
"@fontsource-variable/geist": "^5.2.0",
"@fontsource/geist-mono": "^5.2.0",
"@fontsource/source-serif-4": "^5.2.0"
```

## Ordered steps

1. **Verify R1 resolution** (pre-condition): run `npm show @fontsource-variable/geist version && npm show @fontsource/geist-mono version && npm show @fontsource/source-serif-4 version` from the repo root. Confirm all three return a version number. If any fail, vendor the woff2 files under `frontend/src/theme/fonts/<family>/` and use `@font-face` declarations in a new `frontend/src/theme/fonts.css` imported in `main.tsx` — but do not proceed with the `@fontsource` path until confirmed.

2. **Install packages**: from `frontend/` (or with `-C frontend`):
   ```bash
   npm install @fontsource-variable/geist @fontsource/geist-mono @fontsource/source-serif-4
   ```
   Confirm `frontend/package.json` and `frontend/package-lock.json` are updated.

3. **Add module declarations** to `frontend/src/fontsource.d.ts`: append declarations for `@fontsource-variable/geist`, `@fontsource-variable/geist/*.css`, `@fontsource/geist-mono/*.css`, and `@fontsource/source-serif-4/*.css` alongside the existing ones.

4. **Add imports** to `frontend/src/main.tsx`: insert the three new `@fontsource` imports immediately after the existing `@fontsource-variable/inter` import, before the Space Grotesk imports. Order: Inter → Geist → Geist Mono → Source Serif 4 → Space Grotesk.

5. **Add `--font-*` tokens** to `frontend/src/theme/tokens.css`: in the `:root` block, locate the `/* Type scale tokens */` comment block. Add the four `--font-ui`, `--font-display`, `--font-reading`, `--font-mono` tokens **above** the existing `--type-*` size tokens. Keep exact stack strings from the Target shape section above.

6. **Repoint `base.css` font stacks**: in `frontend/src/theme/base.css`:
   - `body`: replace the literal `"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` with `var(--font-ui)`.
   - After the `h1, h2, h3, h4` block, add `font-family: var(--font-display);`.
   - After the existing `code, pre` rule (if present) or add a new one: `font-family: var(--font-mono); font-size: 0.8125rem;`.

7. **Update `docs/specs/design-system.md` §4.1**: replace the existing §4.1 "Typeface (current)" paragraph with the updated description: Geist Variable is the new primary UI face (self-hosted via `@fontsource-variable/geist`); Space Grotesk promoted from wordmark-only to display/heading face; Source Serif 4 for reading columns; Geist Mono for code/logs. Inter remains as explicit fallback in `--font-ui`. Four `--font-*` tokens registered in `tokens.css` and consumed by `base.css`. Bump `spec_version` from `1.4.0` to `1.5.0`. Add changelog row: `| 1.5.0 | 2026-06-XX | **P0 fonts.** Self-host Geist Variable + Geist Mono + Source Serif 4 via @fontsource; add --font-ui/--font-display/--font-reading/--font-mono tokens; repoint base.css stacks; Inter remains as fallback in --font-ui stack. Resolves R1. |`

8. **Build verification**: run `npm -C frontend run build` and confirm it exits 0 with no TypeScript errors about missing modules.

## Spec update (lockstep — INV-3)

- `docs/specs/design-system.md` §4.1: rewrite typeface paragraph as described in step 7.
- `spec_version`: `1.4.0` → `1.5.0`.
- Changelog row added (template in step 7).
- `voice-tone.md`: **no change** (no copy change in this phase).

## Acceptance criteria

- [ ] `npm show @fontsource-variable/geist version` returns a version (R1 resolved).
- [ ] `frontend/package.json` lists all three new `@fontsource` packages under `dependencies`.
- [ ] `frontend/src/main.tsx` contains import statements for `@fontsource-variable/geist`, `@fontsource/geist-mono/400.css`, `@fontsource/source-serif-4/400.css` (and weight variants).
- [ ] `tokens.css` `:root` block contains `--font-ui`, `--font-display`, `--font-reading`, `--font-mono` with the exact stacks from Target shape.
- [ ] `base.css` `body` uses `var(--font-ui)` (not a literal stack).
- [ ] `base.css` `h1, h2, h3, h4` includes `font-family: var(--font-display)`.
- [ ] `base.css` `code, pre` uses `var(--font-mono)`.
- [ ] `design-system.md` §4.1 updated; `spec_version` is `1.5.0`; changelog row present.
- [ ] All five verification commands exit 0 (see Verification).

## Verification

Run in order (targeted + memory-safe per test-run-memory-safety):

```bash
# 1. Backend — no Python changes, fast check
./venv/bin/python -m pytest -q

# 2. Backend lint
ruff check .

# 3. Frontend lint
npm -C frontend run lint

# 4. Frontend tests (targeted; --maxWorkers=1 for memory safety)
npm -C frontend run test -- --run --maxWorkers=1

# 5. Frontend build (must exit 0, no missing module errors)
npm -C frontend run build
```

TDD note: this phase adds no new React components — it is purely additive (new packages + token values + import lines). No new test file is required. The existing test suite must stay green.

## Dependencies

- No prior phase required (P0 is the first phase; it is the prerequisite for P1).

## Out of scope

- No color token changes (those are P1).
- No `base.css` reduced-motion guard or focus ring changes (those are P1).
- No vendoring of woff2 unless `npm show` confirms R1 is NOT resolved (per step 1).
- No changes to `@fontsource/space-grotesk` (already installed and imported correctly).
- No changes to reading-column layout or `--type-reading` token value.
- No changes to demo files (demo auto-re-skins via tokens once P1 lands).
- No `font-display: swap` override — `@fontsource` packages set this automatically.

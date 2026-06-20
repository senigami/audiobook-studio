# Task 006 — Demo Polish + Regenerate Baseline
STATUS: todo

## Goal

P6 is the final phase. Two sequential parts:

**Part 1 — Demo-specific polish:** Audit `siteMockup/` for hardcoded accent hex, hardcoded glass/blur values, and token mismatches that didn't re-skin automatically via P1 tokens. Fix the handful of non-token values; align `StyleguidePage.tsx` to present the Quiet Studio components. The demo uses `--accent` (now aliased to `var(--action-primary)` from P1) throughout — those references already re-skin. The only work is fixing the few explicit hex literals and hardcoded blur values.

**Part 2 — Regenerate `docs/style-guide/current.html`:** Now that the re-skin is shipped (P0–P5), unfreeze `current.html` per INV-7 and regenerate it as the new "after" baseline reflecting the Quiet Studio look. Update `docs/style-guide/README.md` with the new snapshot date. Note whether `proposed-quiet-studio.html` is now the shipped design (it is) or retire it to a `proposed/` subdirectory. Final full verification across all five commands.

This task MUST be last. It depends on P0+P1+P2+P3+P4+P5 all being complete and verified.

## Why it matters

- The demo (`/#/demo`) and the in-app `/#/styleguide` are the live, drift-free visual references that external contributors and the owner use to verify the system. If the demo's `siteMockup/` has residual hardcoded values that ignore the re-skin, the demo misrepresents the system.
- `docs/style-guide/current.html` is the committed "as-built" snapshot. Keeping the old pre-Quiet-Studio snapshot after shipping the re-skin would make it stale and misleading. INV-7 explicitly gates its regeneration until the end.
- Updating `README.md` closes the documentation loop: `proposed-quiet-studio.html` was the proposal; now it is (or near-is) the shipped design.

## Map links

- `PART-demo` — the named part this task implements
- `PART-baseline` — `current.html` regeneration + README update
- `INV-7` — `current.html` frozen until this task; only now is it unfrozen
- `INV-3` — spec lockstep (final spec bump + changelog for this phase)
- `INV-1` — final green on all five commands
- `R4` — demo drift (hardcoded tints not re-skinning via tokens — this task mops them up)

## Files to touch

### Part 1 — Demo polish

```
frontend/src/demo/stages/siteMockup/panes/platform.tsx
    (hardcoded backdropFilter: 'blur(4px)' × 3 — replace with var(--blur-glass) or remove)
frontend/src/demo/stages/siteMockup/panes/splash.tsx
    (filter: 'blur(6px)' on a decorative element — leave if intentional; comment if so)
frontend/src/demo/stages/siteMockup/shared.tsx
    (var(--accent) references already re-skin via alias — verify, no changes needed)
frontend/src/demo/stages/siteMockup/rail.tsx
    (var(--accent) references already re-skin via alias — verify, no changes needed)
frontend/src/demo/stages/siteMockup/MockTapeControls.tsx
    (var(--accent) references already re-skin via alias — verify, no changes needed)
frontend/src/demo/stages/siteMockup/panes/voiceEditor.tsx
    (AVATAR_COLORS: ['#3b82f6', ...] and avatarColor: '#F0B27A' — intentional character-color data;
     grandfathered unless they need the Quiet Studio palette, which is out of scope)
frontend/src/demo/stages/siteMockup/panes/voicePortrait.tsx
    (portrait gradient palettes: Warm/Deep/Bright/etc. — intentional portrait art; grandfathered)
frontend/src/demo/stages/siteMockup/panes/voices.tsx
    (AVATAR_COLORS picker — grandfathered character-color data)
frontend/src/demo/styleguide/StyleguidePage.tsx
    (verify PredictiveProgressBar specimen state names; add StatusOrb states if absent;
     align section labels to the shipped components)
```

### Part 2 — Baseline

```
docs/style-guide/current.html      (REGENERATE — the one INV-7-frozen file)
docs/style-guide/README.md         (update snapshot date; note proposed status)
```

## Target shape / contract

### Grandfathered demo-only hardcoded values

The following demo values are intentional presentational data and are NOT tokenized by this task:

- `voiceEditor.tsx` `AVATAR_COLORS` and `avatarColor: '#F0B27A'` — character avatar palette.
- `voicePortrait.tsx` gradient theme objects (Warm, Deep, Bright, etc.) — portrait artwork data.
- `voices.tsx` avatar color picker values — same as voiceEditor.
- `panes/splash.tsx` `filter: 'blur(6px)'` — decorative background blur on a non-interactive element; leave inline with a `/* decorative */` comment if not already commented.

### What DOES need fixing (the non-grandfathered set)

**`platform.tsx` — three `backdropFilter: 'blur(4px)'` inline values:**

These are small-element glass effects inside the demo UI. `blur(4px)` is not a token and is not one of the intentional glass values. Options in priority order:
1. If the element is a floating overlay (tooltip, panel): replace with `var(--blur-glass)` (the lighter standard glass token — verify it exists post-P1; it is defined as `saturate(120%) blur(12px)` or similar).
2. If the element is a decorative inset and not a real floating element: replace with `var(--blur-glass)` anyway — consistency over nuance.
3. If the element is part of a non-interactive backdrop: add `/* decorative — intentional 4px blur */` comment and leave.

The goal is: every `backdrop-filter` in the demo uses a named token or is explicitly commented as intentional.

**`mockup.css` — the `--blur-glass` reference:**

`mockup.css` already uses `var(--blur-glass)` (lines 12–13 per the earlier audit). This re-skins automatically via P1's token update. Verify; no change needed.

### StyleguidePage alignment

`StyleguidePage.tsx` currently renders `PredictiveProgressBar` specimens and some status states. After P3 ships the icon-insets, verify the specimens actually render icon-inset states. If `barOnly` prop or `status` prop values need updating to expose the new visual states, do so. Add a `StatusOrb` section if one is absent. No new sections required — align what is there.

### Regenerating `current.html`

`current.html` is a standalone HTML file with the theme CSS inlined verbatim. To regenerate:

1. Extract the final contents of `frontend/src/theme/tokens.css`, `base.css`, `components.css`, and `utilities.css` (in cascade order).
2. Replace the `<style>` block in `current.html` with the concatenated CSS, verbatim (no minification — the file is meant to be human-readable).
3. Update any section titles or component specimens in the HTML body that reference old token names or old color values. The HTML structure (color swatches, type scale, component demos) should remain; only token-name references in the specimen captions need updating if names changed.
4. Update the date comment at the top of the file.

No build tooling is required — this is a manual copy-paste + edit of the CSS and specimen captions. The file already has a clear structure; follow it.

### `README.md` update

```markdown
| `current.html`                   | The **current, as-built** visual catalog — snapshot dated 2026-06-xx. |
| `proposed-quiet-studio.html`     | The **Quiet Studio — Precision Pressroom** proposal that was shipped in the P0–P5 migration. Retained for historical reference. |
```

Note in the Provenance section: "`current.html` regenerated 2026-06-xx as the Quiet Studio baseline. `proposed-quiet-studio.html` is now the shipped design direction; it is retained as a historical artifact."

## Ordered steps

**Step 1 — Verify demo re-skin (P1 tokens in effect)**

Run `npm -C frontend run build` and open `/#/demo` (or the built demo at `docs/demo/`). Confirm the demo renders in the Quiet Studio color palette. Look for any remaining old-blue (`#2b6eff`) or non-token hex values visually.

**Step 2 — Grep for remaining hardcoded non-grandfathered hex in siteMockup**

```bash
grep -rn "#[0-9a-fA-F]\{3,6\}" \
  frontend/src/demo/stages/siteMockup/ \
  --include="*.tsx" --include="*.css" \
  | grep -v \
    "COLORS_64\|AVATAR_COLORS\|avatarColor\|voicePortrait\|voiceEditor\|voices\.tsx\|#[0-9a-fA-F]\{6\}.*comment"
```

Review each match. Categorize as: (a) grandfathered intentional data — document with a comment; (b) token-replaceable — replace with the nearest semantic token.

**Step 3 — Fix `platform.tsx` backdropFilter instances**

Replace the three `backdropFilter: 'blur(4px)'` with `backdropFilter: 'var(--blur-glass)'`. If `--blur-glass` does not exist post-P1 as a distinct lighter blur token, use `backdropFilter: 'saturate(120%) blur(12px)'` and open a note that the token should be added in a future cleanup (do not block P6 on a token-naming issue).

**Step 4 — Verify `splash.tsx` blur is decorative**

Inspect the element using `filter: 'blur(6px)'`. If it is a non-interactive background element, add `/* decorative */` comment and leave. If it is a floating panel, treat as step 3.

**Step 5 — StyleguidePage alignment**

Open `StyleguidePage.tsx`. Check:
- The `PredictiveProgressBar` specimens pass `status="running"` and `status="preparing"` and `status="done"` — these will show the new terminus icons from P3.
- Add a `StatusOrb` section if absent. A simple row of orbs with the six states (queued, running, done, cached, error, failed) — use real prop combinations from `StatusOrb`'s interface.
- Do not add new sections unless they expose shipped components.

**Step 6 — Regenerate `docs/style-guide/current.html`**

Follow the regeneration procedure described above. The output file should be a valid standalone HTML that opens in a browser from `file://` with no external dependencies.

Update the file header comment date.

**Step 7 — Update `docs/style-guide/README.md`**

Update the table and Provenance section as described in Target shape above.

**Step 8 — Final spec update**

In `docs/specs/design-system.md`:
- Add a final changelog row for P6: `| x.x.x | 2026-06-xx | P6: demo polish (siteMockup hardcoded blur tokenized); current.html regenerated as Quiet Studio baseline (INV-7 complete). |`
- Bump `spec_version` (minor).
- Confirm the `sources:` front-matter list still includes all relevant CSS files (it should; no sources were removed).

**Step 9 — Final full verification (all five commands).**

## Spec update (lockstep — INV-3)

**`docs/specs/design-system.md`**:
- Final P6 changelog row.
- `spec_version` bump (minor).
- If any section referred to `current.html` as the "before" snapshot, update to "the Quiet Studio baseline (regenerated 2026-06-xx)".

## Acceptance criteria

1. `grep -rn "backdropFilter.*blur(4px)" frontend/src/demo/stages/siteMockup/` returns zero unresolved matches (either replaced with token or commented as intentional).
2. `StyleguidePage.tsx` renders StatusOrb states and PredictiveProgressBar states showing the P3 icon-insets when the app is running.
3. `docs/style-guide/current.html` contains the Quiet Studio token values (verify `--bg: #f5f7fb` in light section, `--action-primary: #1e4fd8`, `--blur-glass-strong: saturate(180%) blur(28px)` — the post-P1 values, not the old ones).
4. `docs/style-guide/README.md` has the new snapshot date and the note about `proposed-quiet-studio.html` being the shipped design.
5. `docs/style-guide/current.html` opens in a browser from `file://` and renders both light and dark themes without external resource errors.
6. `design-system.md` final spec_version bump; P6 changelog row present.
7. All five verification commands green.
8. No regression on any previous phase's acceptance criteria.

## Verification

```bash
# 1. Backend
./venv/bin/python -m pytest -q

# 2. Backend lint
ruff check .

# 3. Frontend lint
npm -C frontend run lint

# 4. Frontend tests — full suite
npm -C frontend run test -- --run --maxWorkers=1

# 5. Build
npm -C frontend run build

# Demo hardcoded-hex audit (post-fix, should return only grandfathered items):
grep -rn "#[0-9a-fA-F]\{6\}" \
  frontend/src/demo/stages/siteMockup/ \
  --include="*.tsx" \
  | grep -v "COLORS_64\|AVATAR_COLORS\|avatarColor\|voicePortrait\.tsx\|voices\.tsx"
# Expected: zero non-grandfathered matches

# Verify current.html has Quiet Studio values:
grep "action-primary.*1e4fd8\|blur-glass-strong.*28px\|bg.*f5f7fb" docs/style-guide/current.html
# Expected: lines present
```

## Dependencies

**P6 depends on ALL prior phases: P0, P1, P2, P3, P4, P5.**

- P0 (fonts) must be complete — `current.html` must reflect the Geist / Space Grotesk stacks.
- P1 (token re-skin) must be complete — the core token values must be final before the baseline is captured.
- P2 (forms/Switch) must be complete — Switch must be in the current.html component catalog.
- P3 (status/progress) must be complete — StatusOrb icon-insets must be final before the baseline.
- P4 (glass audit) must be complete — `--blur-glass-strong` final value must be in the snapshot.
- P5 (cleanup) must be complete — no hardcoded radii/hex in the four primitives before the baseline.

This is the only task that explicitly unfreezes `current.html` per INV-7. Do not regenerate it as part of any earlier phase.

## Out of scope

- Do not re-open the design (`proposed-quiet-studio.html` was the proposal; it is retained as-is unless the owner asks to retire it to a `proposed/` subdirectory).
- Do not change any backend code.
- Do not add new demo stages or screens — only align existing ones to the shipped system.
- Do not convert the grandfathered demo character-color arrays (`COLORS_64`, `AVATAR_COLORS`, voicePortrait palettes) to tokens — they are intentional presentational data.
- Do not change the `/#/styleguide` routing or the `StyleguidePage` section structure beyond the StatusOrb addition and specimen alignment.

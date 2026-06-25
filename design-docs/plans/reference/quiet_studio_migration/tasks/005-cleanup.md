# Task 005 — Inline-Style Extraction + Hardcoded Color Tokenization
STATUS: done (sub-task A); sub-task B (--accent→--action-primary 94-file rename) DEFERRED — owner-gated, alias kept as permanent compatibility pointer

## Goal

Two separable sub-tasks, each independently committable:

**Sub-task A (required):** Extract the remaining four inline-styled form/modal primitives (`SearchableSelect`, `ColorSwatchPicker`, `VoiceDropzone`, `ConfirmModal`) into token-driven CSS classes. Tokenize approximately 15 legacy hardcoded hex/rgba color literals scattered across these files and any co-occurring utility CSS. The `ColorSwatchPicker` palette array (`COLORS_64`) is intentionally hardcoded character-color data — grandfathered, do not tokenize.

**Sub-task B (optional — owner gate required):** The full `--accent` → `--action-primary` rename across approximately 94 files (R3). This is only executed if the owner explicitly approves retiring the `--accent` alias. If the alias is kept permanently, this sub-task is dropped and the alias stays in `tokens.css` as a permanent pointer: `--accent: var(--action-primary)`.

## Why it matters

The four primitives listed carry 50–100+ inline style blocks combined. After P1 changes the token values these files will re-skin via `var(--accent)` / `var(--surface)` / `var(--border)` automatically, but they still carry hardcoded values like `'#94a3b8'` (muted text), `'#6366f1'` (old indigo), and pill radii like `borderRadius: '100px'`. These violate the §2.2 mandate ("components consume tokens, never hardcoded colors") and will not re-skin in dark mode or on future token changes. Cleaning them now stabilizes the token system before the baseline is regenerated in P6.

The `--accent` rename (sub-task B) is the `R3` risk item — high file count, high rebase risk. It is gated so it cannot accidentally land without owner sign-off.

## Map links

- `PART-switch` — partially (GlassInput pill-radius drop — the primitives this task touches are the remaining four per the spec)
- `PART-tokens` — `--accent` alias decision lives here
- `INV-1` — app builds at every phase boundary
- `INV-3` — spec lockstep
- `R3` — rename risk (sub-task B gate)
- Plans overlap: `design-docs/plans/simplification/03_styling_separation.md` ST-3 lists these files as conversion targets. Sub-task A must align with, not conflict with, that plan. See "Overlap with design-docs/plans/simplification/" below.

## Files to touch

### Sub-task A

```
frontend/src/components/forms/SearchableSelect.tsx
frontend/src/components/forms/ColorSwatchPicker.tsx
frontend/src/components/forms/VoiceDropzone.tsx
frontend/src/components/overlays/ConfirmModal.tsx
frontend/src/theme/components.css            (add shared classes for extracted patterns)
```

### Sub-task B (only if owner-approved)

- Mechanical: all files matching `grep -rn "var(--accent" frontend/src/` (~94 files)
- Key risk files: `frontend/src/theme/tokens.css` (change alias), `frontend/src/theme/components.css`, `frontend/src/theme/utilities.css`, `frontend/src/demo/stages/siteMockup/` (20+ files)
- Spec: `design-docs/specs/design-system.md` (rename documented)

## Target shape / contract

### The conversion rule (from `design-docs/plans/simplification/03_styling_separation.md` ST-2/ST-3)

| Inline style is... | Action |
|---|---|
| Static + uses tokens + **repeated** → shared class in `components.css` |
| Static + uses tokens + one-off → file-local class if it aids readability |
| **Dynamic** (value from props/state) → stays inline, but `var(--token)` only, no hex |
| Contains a **hardcoded color** → fix to the nearest semantic token |

### Grandfathered: ColorSwatchPicker palette

`COLORS_64` in `ColorSwatchPicker.tsx` is a 64-entry character-color data array. These are intentional presentational palette choices, not theme tokens. They are **grandfathered** — do not tokenize or change them. The inline style blocks that render swatches (mapping palette colors to `backgroundColor`) also stay inline because the value is dynamic (loop variable).

The `ColorSwatchPicker` trigger button and picker panel structure carry static styling (`position: 'relative'`, container layout) that CAN be extracted. The swatch `width`/`height`/`borderRadius` (currently strings like `'18px'` or `'24px'`) can use `--radius-compact` for the swatch roundness, but the literal dimensions are size-variant data — leave inline.

### Hardcoded colors to tokenize (confirmed from source review)

| File | Hardcoded value | Replace with |
|---|---|---|
| `SearchableSelect.tsx` | `background: 'var(--surface-light)'` | `var(--surface)` (post-P1 mapping) or keep token name if `--surface-light` still exists |
| `SearchableSelect.tsx` | `borderRadius: '12px'` (dropdown panel) | `var(--radius-card)` (10px post-P1) |
| `SearchableSelect.tsx` | `borderRadius: '8px'` (search input) | `var(--radius-compact)` (6px) or `var(--radius-button)` (8px) per context |
| `SearchableSelect.tsx` | `fontSize: '0.85rem'` (search input) | `var(--type-callout)` |
| `ColorSwatchPicker.tsx` | `borderRadius: '50%'` (trigger circle) | keep as `50%` (circle is intentional) |
| `ColorSwatchPicker.tsx` | `borderRadius: '12px'` (picker panel) | `var(--radius-card)` |
| `ColorSwatchPicker.tsx` | `boxShadow: '...'` hardcoded | `var(--shadow-lg)` |
| `VoiceDropzone.tsx` | `borderRadius: '99px'` (pill radii) | `var(--radius-button)` |
| `VoiceDropzone.tsx` | `borderRadius: '12px'` (file item cards) | `var(--radius-card)` |
| `ConfirmModal.tsx` | `borderRadius: '20px'` (modal surface) | `var(--radius-card)` |
| `ConfirmModal.tsx` | `borderRadius: '12px'` (buttons in footer) | `var(--radius-button)` |
| `ConfirmModal.tsx` | `backgroundColor: 'var(--error)'` inline on confirm button | remove inline; `className="btn-danger"` already present — the inline overrides the class; drop the override |
| `ConfirmModal.tsx` | `backgroundColor: 'var(--accent)'` inline on confirm button | remove inline; `className="btn-primary"` already applied |

Note: `#94a3b8` (muted slate) found in tokens.css as `--progress-preparing-fill` dark mode value — already handled by P1. The literal `#6366f1` (old indigo) is not found in these four files directly; it appears only in `tokens.css` as `--pill-class-*` and in the `ColorSwatchPicker` `COLORS_64` palette (grandfathered).

### Sub-task B: `--accent` alias decision

**If owner approves rename:**
- In `tokens.css`, change `--accent: var(--action-primary)` alias to a direct value (or delete the alias), and do the mechanical rename across ~94 files.
- Commit as a separate atomic commit with message: "Replace --accent alias with --action-primary across all consumers (R3 rename)".
- After the rename, update `design-docs/specs/design-system.md` §2: remove `--accent` from the token registry; note it is retired.

**If owner keeps the alias (default — no sub-task B):**
- `tokens.css` keeps `--accent: var(--action-primary)`. All 94 consumer files continue working unchanged.
- `design-system.md` §2 notes: "`--accent` is a permanent compatibility alias for `--action-primary`; new code should prefer `--action-primary`."
- No code changes needed.

The decision MUST be recorded in `design-system.md` either way.

## Overlap with `design-docs/plans/simplification/`

`design-docs/plans/simplification/03_styling_separation.md` ST-3 lists these same four files as conversion targets (items not in its top-15 by count, but they appear in the long tail). The alignment rule:

1. This task (P5) is scoped to the **re-skin requirement** — fix hardcoded radii, tokenize the handful of hardcoded colors that the Quiet Studio re-skin requires, and extract only the static patterns that are currently fighting the token system.
2. Sub-task A does NOT attempt the full ST-3 conversion of every inline style in these files. That is `design-docs/plans/simplification/` territory.
3. When `design-docs/plans/simplification/` ST-3 runs later, it should find these files already partially converted (no hardcoded hex, radii tokenized) and need only to extract the remaining static layout patterns.
4. If both tasks are running concurrently: coordinate via a rebase-aware commit sequence. This task goes first (smaller scope); simplification ST-3 picks up the remainder.

## Ordered steps

**Sub-task A — Extract + tokenize (required)**

1. **`ConfirmModal.tsx`**: Remove the two inline `backgroundColor` overrides on the confirm button (they fight the `btn-primary`/`btn-danger` classes). Change `borderRadius: '20px'` to `var(--radius-card)`. Change the icon wrapper `borderRadius: '12px'` to `var(--radius-card)`. Change button footer `borderRadius: '12px'` to `var(--radius-button)`. Extract the static close-button styles to a `.modal-close-btn` class in `components.css`. Leave `background: 'var(--surface)'` inline (dynamic per modal state is not an issue here — but it is a single static token use; extractable to the modal shell class). Run lint + build after each file.

2. **`SearchableSelect.tsx`**: Change the dropdown panel `borderRadius: '12px'` → `var(--radius-card)`. Change `borderRadius: '8px'` on the search input → `var(--radius-button)`. Change `fontSize: '0.85rem'` on the search input → `var(--type-callout)`. The `background: 'var(--surface-light)'` trigger button: if `--surface-light` exists post-P1 as a valid token, keep it; otherwise map to `var(--surface)`. Extract the trigger button static styles to a `.searchable-select-trigger` class if they match the `.form-input` class already (they use `className="form-input"` + inline overrides — inline overrides are the fight). The `isOpen` focus ring is dynamic (border-color + box-shadow) — keep inline as token expressions (`var(--action-primary)`, `var(--accent-glow)` if it exists, else `rgba(30,79,216,.15)`).

3. **`ColorSwatchPicker.tsx`**: Change picker panel `borderRadius: '12px'` → `var(--radius-card)`. Change `boxShadow` hardcoded to `var(--shadow-lg)`. The grid/swatch layout is largely static — extract the wrapper layout to `.color-swatch-picker` class. Leave swatch size inline (size-variant data). Leave `COLORS_64` completely untouched.

4. **`VoiceDropzone.tsx`**: Change any `borderRadius: '99px'` pill → `var(--radius-button)`. Change file-item card `borderRadius: '12px'` → `var(--radius-card)`. Extract the drag-zone static styles (border-type, gap, flex layout) to a `.voice-dropzone` class in `components.css`. Dynamic `isDragging` styles (border-color, background tint) stay inline as token expressions.

5. Add new classes to `components.css` in a clearly labeled section: `/* ─── Form Primitives (P5) ─── */`. Keep each class under 15 lines; no complex selectors.

6. Verify that each changed file has no hardcoded non-transparent hex color values (run `grep -n "#[0-9a-fA-F]\{3,6\}" filename.tsx` after each file, excluding the grandfathered `COLORS_64` block).

7. Update `design-docs/specs/design-system.md` §6 entries for the four primitives: note radius + shadow tokens adopted; inline-style scope reduced. Bump spec_version (minor). Add changelog row.

**Sub-task B — Owner gate**

8. If and only if the owner has explicitly approved the `--accent` → `--action-primary` rename: run the mechanical rename, commit separately, update the spec alias section.

9. If the alias stays: add the permanence note to `design-system.md` §2 ("permanent compatibility alias") and commit with the sub-task A spec changes.

## Spec update (lockstep — INV-3)

**`design-docs/specs/design-system.md`**:
- §2 Token Registry: document `--accent` alias permanence OR retirement (depending on sub-task B decision).
- §6 Shared Primitives: update `SearchableSelect`, `ColorSwatchPicker`, `VoiceDropzone`, `ConfirmModal` entries to note radius/shadow token adoption and reduced inline-style scope. Add note grandfathering `ColorSwatchPicker.COLORS_64`.
- `spec_version` bump (minor).
- Changelog row(s): separate rows for sub-task A and (if executed) sub-task B.

## Acceptance criteria

**Sub-task A:**
1. `ConfirmModal.tsx`: no inline `backgroundColor` override on confirm button; `borderRadius` uses `var(--radius-card)` / `var(--radius-button)`; close button uses CSS class.
2. `SearchableSelect.tsx`: dropdown panel and search input radii are token-driven; no hardcoded font-size literal.
3. `ColorSwatchPicker.tsx`: picker panel uses `var(--radius-card)` and `var(--shadow-lg)`; `COLORS_64` is unchanged.
4. `VoiceDropzone.tsx`: no `borderRadius: '99px'` — replaced with `var(--radius-button)`.
5. `grep -n "#[0-9a-fA-F]\{3,6\}" frontend/src/components/forms/SearchableSelect.tsx` returns no non-palette, non-comment hex literals.
6. `grep -n "#[0-9a-fA-F]\{3,6\}" frontend/src/components/overlays/ConfirmModal.tsx` returns zero matches.
7. `design-system.md` spec_version bumped; changelog row added.
8. All five verification commands green.

**Sub-task B (if executed):**
9. `grep -rn "var(--accent)" frontend/src/` returns zero real-app matches (only the alias definition in `tokens.css` if retained as a redirect, or zero if deleted).
10. Build passes; all tests pass; no visual regressions (owner visual check).

## Verification

```bash
# 1. Backend
./venv/bin/python -m pytest -q

# 2. Backend lint
ruff check .

# 3. Frontend lint
npm -C frontend run lint

# 4. Frontend tests
npm -C frontend run test -- --run --maxWorkers=1

# 5. Build
npm -C frontend run build

# Sub-task A hardcoded-color check (run after each file):
grep -n "#[0-9a-fA-F]\{3,6\}" \
  frontend/src/components/forms/SearchableSelect.tsx \
  frontend/src/components/forms/ColorSwatchPicker.tsx \
  frontend/src/components/forms/VoiceDropzone.tsx \
  frontend/src/components/overlays/ConfirmModal.tsx
# Expected: only COLORS_64 matches in ColorSwatchPicker.tsx; zero in the others

# Sub-task B (if executed) — confirm rename complete:
grep -rn "var(--accent)" frontend/src/ --include="*.tsx" --include="*.ts" --include="*.css"
# Expected: zero matches (or only the alias definition line)
```

## Dependencies

- **P1 (task 001) must be complete** — this task relies on `--radius-card`, `--radius-button`, `--radius-compact`, `--shadow-lg`, `--action-primary`, and `--surface-alt` having their updated Quiet Studio values in `tokens.css`.
- **P2, P3, P4 are independent** — P5 may run in parallel with them after P1.
- Sub-task B MUST NOT run until owner explicitly approves. It is blocked by owner gate, not technical dependencies.

## Out of scope

- Do not convert the full ST-3 hotspot list from `design-docs/plans/simplification/` — only the four primitives listed and only the hardcoded-color / pill-radius issues.
- Do not touch the `COLORS_64` palette array.
- Do not rename or remove any token name that has consumers — only change token values (alias-first).
- Do not add new components or change any behavior/logic in the four files.
- Demo `siteMockup/` cleanup is P6.

# Task 002 — Forms: Switch primitive, accent-color controls, drop pill radii, GlassInput token class
STATUS: todo

## Goal

Build a new `Switch` React component (`role="switch"`, ~48×26px pill, dual-encoded with position+color, reduced-motion snap per R6). TDD: failing test written first, confirmed red, then implemented. Confirm and size accent-color checkboxes and radios (18px, 44px interactive region via `.control-target`). Drop pill radii from `GlassInput` (100px) and `VoiceDropzone` (99px) to `var(--radius-button)`. Audit the `PredictiveProgressBar` badge 999px radius. Extract `GlassInput` inline styles to a token-driven `.form-input` CSS class.

## Why it matters

The Quiet Studio spec removes pill-radius from general form inputs — pill shape is reserved for `--radius-round` (9999px) uses like tags. Form inputs shift to `var(--radius-button)` (8px post-P1). The new `Switch` introduces a semantically correct `role="switch"` toggle that is currently missing; the two existing toggle-like patterns in the app use plain buttons without the ARIA role. The `GlassInput` inline-style extraction enables future callers to style via the class rather than re-inline, and removes a `transition: all` violation.

## Map links

- `PART-switch` — primary owner; new `Switch.tsx` + `GlassInput` extract + form-control sizing
- `PART-comp` — `components.css` gains `.form-input` class
- `PART-tokens` — consumed (P1 must be done first so `--action-primary`, `--radius-button: 8px`, `--radius-compact` are available)
- `PART-spec` — §6 (Switch, GlassInput) updated lockstep
- `INV-1` — app must build at phase end; no existing callers broken
- `INV-2` — Switch AA: `--action-primary` on `--surface` (both themes) verified
- `INV-3` — spec lockstep; `design-system.md` §6 updated
- `INV-4` — Switch is dual-encoded (position + color = knob translate + `--action-primary` ON tint / neutral OFF)
- `INV-5` — knob translate SNAPS to end state under reduced-motion (R6): `@media (prefers-reduced-motion: reduce)` removes the transition and the knob jumps directly
- `INV-6` — 44px interactive target region
- `R6` — Switch reduced-motion: knob MUST snap to final position, not freeze mid-translate

## Files to touch

| File | Change |
|------|--------|
| `frontend/src/components/ui/Switch.tsx` | **NEW** — the Switch component |
| `frontend/tests/unit/components/ui/Switch.test.tsx` | **NEW** — TDD test file (written first) |
| `frontend/src/theme/components.css` | Add `.form-input` class; add `.control-target` wrapper; add `.switch` CSS if component uses a pure-CSS track |
| `frontend/src/components/forms/GlassInput.tsx` | Replace inline border-radius `100px` → `var(--radius-button)`; replace inline transition `all 0.2s` with explicit property list; apply className `.form-input` (already used) but ensure inline style overrides are removed or reduced |
| `frontend/src/components/forms/VoiceDropzone.tsx` | Replace inline `borderRadius: '99px'` → `var(--radius-button)` |
| `frontend/src/components/progress/PredictiveProgressBar/PredictiveProgressBar.tsx` | Replace `borderRadius: '999px'` on badge → `var(--radius-compact)` |
| `docs/specs/design-system.md` | §6: add `Switch` component entry + updated `GlassInput` entry; bump `spec_version`; changelog row |

## Target shape / contract

### `Switch.tsx` — component API

```tsx
interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;           // accessible label (renders as aria-label if no visible text)
  id?: string;
  disabled?: boolean;
  className?: string;
}
```

Rendered as:
```html
<button
  role="switch"
  aria-checked="true|false"
  aria-label="<label prop if no visible text>"
  id="<id>"
  disabled=<disabled>
  class="switch switch--on|switch--off [className]"
>
  <!-- Track -->
  <span class="switch__track" aria-hidden="true">
    <!-- Knob -->
    <span class="switch__knob"></span>
  </span>
  <!-- Optional visible label -->
  {label && <span class="switch__label">{label}</span>}
</button>
```

States:
- `switch--on`: track background `var(--action-primary)`, knob translated right (`translateX(22px)`)
- `switch--off`: track background `var(--hairline)` or `rgba(0,0,0,.18)` light / `rgba(255,255,255,.18)` dark, knob at `translateX(2px)` (resting)

Sizing:
- Outer `<button>`: `min-height: 44px` (INV-6), `padding: 0`, `background: transparent`, `border: none`, display flex + align-items center, gap 8px
- Track: `width: 48px; height: 26px; border-radius: 13px` (pill = `--radius-round` applied to track); `background` switches per state; `position: relative`
- Knob: `width: 22px; height: 22px; border-radius: 50%; background: #ffffff; position: absolute; top: 2px; transition: transform var(--dur-fast) var(--ease-standard)`
- OFF knob: `transform: translateX(2px)`, ON knob: `transform: translateX(22px)`

Reduced-motion contract (R6 — INV-5):
```css
@media (prefers-reduced-motion: reduce) {
  .switch__knob {
    transition: none;
    /* transform jumps directly to the value set by switch--on/off class */
  }
}
```

This ensures the knob is never mid-translate under reduced-motion — it snaps immediately to the final position.

### CSS in `components.css` — `.switch` rules

```css
/* Switch track */
.switch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
}

.switch__track {
  position: relative;
  width: 48px;
  height: 26px;
  border-radius: 13px;
  background: rgba(0, 0, 0, .18);
  transition: background-color var(--dur-fast) var(--ease-standard);
  flex-shrink: 0;
}

[data-theme="dark"] .switch__track {
  background: rgba(255, 255, 255, .18);
}

.switch--on .switch__track {
  background: var(--action-primary);
}

.switch__knob {
  position: absolute;
  top: 2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffffff;
  transform: translateX(2px);
  transition: transform var(--dur-fast) var(--ease-standard);
  box-shadow: var(--shadow-sm);
}

.switch--on .switch__knob {
  transform: translateX(22px);
}

@media (prefers-reduced-motion: reduce) {
  .switch__knob {
    transition: none;
  }
  .switch__track {
    transition: none;
  }
}

.switch__label {
  font-size: var(--type-callout);
  color: var(--text-primary);
  user-select: none;
}

.switch:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.switch:focus-visible {
  outline: 3px solid var(--action-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px rgba(255, 255, 255, .55);
}

[data-theme="dark"] .switch:focus-visible {
  box-shadow: 0 0 0 5px rgba(0, 0, 0, .5);
}
```

### CSS in `components.css` — `.form-input` class

Extracted from `GlassInput.tsx` inline styles, token-driven:
```css
.form-input {
  padding: 10px 16px;
  border-radius: var(--radius-button);   /* was 100px pill — now 8px post-P1 */
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: var(--type-body);
  width: 100%;
  outline: none;
  color: var(--text-primary);
  transition:
    border-color var(--dur-fast) var(--ease-standard),
    box-shadow   var(--dur-fast) var(--ease-standard);
}

.form-input:focus {
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px rgba(30, 79, 216, .12);
}

[data-theme="dark"] .form-input:focus {
  box-shadow: 0 0 0 3px rgba(107, 159, 255, .15);
}

/* Icon padding variant — used by GlassInput when icon prop is provided */
.form-input--with-icon {
  padding-left: 40px;
}
```

### `GlassInput.tsx` changes

The component already applies `className="form-input"` to the `<input>`. After the P1 `.form-input` class is defined in `components.css`:
1. Remove the inline `borderRadius: '100px'` from the style prop.
2. Remove the inline `transition: 'all 0.2s ease'` from the style prop.
3. Remove the inline `border` / `borderColor` / `boxShadow` from the style prop (moved to CSS).
4. Keep `padding` only if the icon variant uses a different padding that can't be expressed via the `.form-input--with-icon` class. Prefer adding `form-input--with-icon` to className when `icon` is truthy.
5. Keep `color`, `background` inline only if they are necessary overrides — prefer removing them since `.form-input` already sets them.
6. The `isFocused` state and its `onFocus`/`onBlur` handlers can be removed if focus styling is fully in CSS via `:focus`. If callers rely on `isFocused` for other side effects, keep the state but remove the styling use. Remove the `useState` import if it becomes unused.

### `VoiceDropzone.tsx` change

Find `borderRadius: '99px'` at line 172 (approximately) and replace with `borderRadius: 'var(--radius-button)'`.

### `PredictiveProgressBar.tsx` change

Find `borderRadius: '999px'` on the badge element at approximately line 714 and replace with `borderRadius: 'var(--radius-compact)'`. The `--radius-compact` token is `6px` post-P1.

### Accent-color checkboxes and radios

In `components.css`, add:
```css
.control-target {
  display: inline-flex;
  align-items: center;
  min-height: 44px;   /* INV-6 */
  gap: var(--space-2);
  cursor: pointer;
}

input[type="checkbox"],
input[type="radio"] {
  accent-color: var(--action-primary);
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
}
```

## Ordered steps

1. **Write the failing test** (`frontend/tests/unit/components/ui/Switch.test.tsx`) — before any implementation:
   ```tsx
   import { render, screen, fireEvent } from '@testing-library/react'
   import { Switch } from '@/components/ui/Switch'
   import { describe, it, expect, vi } from 'vitest'

   describe('Switch', () => {
     it('renders with role="switch" and correct aria-checked when off', () => {
       render(<Switch checked={false} onChange={vi.fn()} label="Dark mode" />)
       const btn = screen.getByRole('switch', { name: 'Dark mode' })
       expect(btn.getAttribute('aria-checked')).toBe('false')
     })

     it('renders with aria-checked="true" when checked', () => {
       render(<Switch checked={true} onChange={vi.fn()} label="Dark mode" />)
       const btn = screen.getByRole('switch', { name: 'Dark mode' })
       expect(btn.getAttribute('aria-checked')).toBe('true')
     })

     it('calls onChange with toggled value on click', () => {
       const onChange = vi.fn()
       render(<Switch checked={false} onChange={onChange} label="Feature" />)
       fireEvent.click(screen.getByRole('switch'))
       expect(onChange).toHaveBeenCalledWith(true)
     })

     it('calls onChange with false when currently checked', () => {
       const onChange = vi.fn()
       render(<Switch checked={true} onChange={onChange} label="Feature" />)
       fireEvent.click(screen.getByRole('switch'))
       expect(onChange).toHaveBeenCalledWith(false)
     })

     it('does not call onChange when disabled', () => {
       const onChange = vi.fn()
       render(<Switch checked={false} onChange={onChange} label="Feature" disabled />)
       fireEvent.click(screen.getByRole('switch'))
       expect(onChange).not.toHaveBeenCalled()
     })

     it('has switch--off class when unchecked', () => {
       const { container } = render(<Switch checked={false} onChange={vi.fn()} />)
       expect(container.firstChild).toHaveClass('switch--off')
     })

     it('has switch--on class when checked', () => {
       const { container } = render(<Switch checked={true} onChange={vi.fn()} />)
       expect(container.firstChild).toHaveClass('switch--on')
     })
   })
   ```

2. **Confirm the test fails red**: run `npm -C frontend run test -- --run --maxWorkers=1 frontend/tests/unit/components/ui/Switch.test.tsx`. Confirm it fails because `@/components/ui/Switch` does not exist.

3. **Implement `Switch.tsx`** at `frontend/src/components/ui/Switch.tsx` matching the Target shape prop API and rendered structure above. Import only `React` — no external dependencies.

4. **Run the Switch test again** and confirm it passes green.

5. **Add Switch CSS to `components.css`**: add the `.switch`, `.switch__track`, `.switch__knob`, `.switch--on`, `.switch--off`, `.switch__label`, `.switch:disabled`, `.switch:focus-visible` rules from the Target shape above. Include the `@media (prefers-reduced-motion: reduce)` block for the knob (R6 / INV-5).

6. **Add `.form-input` and `.control-target` CSS to `components.css`**: add the blocks from Target shape above.

7. **Add accent-color checkbox/radio rules to `components.css`**: add the `input[type="checkbox"], input[type="radio"]` block.

8. **Edit `GlassInput.tsx`**: remove the inline `borderRadius`, `transition`, `border`, `borderColor`, `boxShadow` from the style prop. Add `form-input--with-icon` to className when `icon` prop is truthy. Remove `useState` / `isFocused` if no longer needed for non-styling logic (if `onFocus`/`onBlur` props are forwarded via `...props`, they still work via the spread).

9. **Edit `VoiceDropzone.tsx`**: replace `borderRadius: '99px'` with `borderRadius: 'var(--radius-button)'`.

10. **Edit `PredictiveProgressBar.tsx`**: replace `borderRadius: '999px'` on the badge with `borderRadius: 'var(--radius-compact)'`.

11. **Update `docs/specs/design-system.md` §6**: add a `Switch` entry:
    ```
    **Switch** (`frontend/src/components/ui/Switch.tsx`) — role="switch" aria-checked toggle. Props: `checked`, `onChange`, `label?`, `id?`, `disabled?`. ~48×26px pill track with `--action-primary` ON / neutral OFF. Knob translate snaps under reduced-motion (R6). 44px min-height interactive target. Dual-encoded: position + color. TDD.
    ```
    Update the `GlassInput` entry: note that inline styles are extracted to `.form-input` class in `components.css`; pill radius dropped to `var(--radius-button)`.
    Bump `spec_version` (e.g. `1.6.0` → `1.7.0` if following P1; else the next increment). Add changelog row: `| X.X.X | 2026-06-XX | **P2 forms/Switch.** New Switch component (role="switch", TDD); accent-color checkboxes/radios (18px, 44px region); drop pill radii GlassInput 100px + VoiceDropzone 99px → --radius-button; PredictiveProgressBar badge 999px → --radius-compact; GlassInput inline styles extracted to .form-input token class. |`

12. **Run all 5 verification commands** (see Verification). Fix any TypeScript errors before advancing.

## Spec update (lockstep — INV-3)

- `docs/specs/design-system.md` §6: `Switch` entry added; `GlassInput` entry updated.
- `spec_version` bumped.
- Changelog row added.
- `voice-tone.md`: **no change**.

## Acceptance criteria

- [ ] `frontend/src/components/ui/Switch.tsx` exists.
- [ ] `Switch` renders `role="switch"` and `aria-checked="true"|"false"` correctly.
- [ ] `Switch` has `switch--on` / `switch--off` class driven by `checked` prop.
- [ ] `Switch` `onChange` is called with the toggled boolean on click.
- [ ] `Switch` with `disabled` does NOT call `onChange` on click.
- [ ] `components.css` contains `.switch`, `.switch__knob`, `.switch--on` with `transform: translateX(22px)`, and `@media (prefers-reduced-motion: reduce) { .switch__knob { transition: none } }`.
- [ ] `components.css` contains `.form-input` class with `border-radius: var(--radius-button)` and NO `transition: all`.
- [ ] `GlassInput.tsx` has no inline `borderRadius: '100px'` or `transition: 'all ...'`.
- [ ] `VoiceDropzone.tsx` has no inline `borderRadius: '99px'`; uses `var(--radius-button)`.
- [ ] `PredictiveProgressBar.tsx` badge has no inline `borderRadius: '999px'`; uses `var(--radius-compact)`.
- [ ] `design-system.md` §6 documents `Switch`; `spec_version` bumped; changelog row present.
- [ ] All five verification commands exit 0.
- [ ] TDD protocol followed: test written first, confirmed red, then green (R1 from testing-standards.md).

## Verification

```bash
# 1. Backend — no Python changes
./venv/bin/python -m pytest -q

# 2. Backend lint
ruff check .

# 3. Frontend lint
npm -C frontend run lint

# 4. Frontend tests — target the new Switch test first to confirm TDD, then full suite
npm -C frontend run test -- --run --maxWorkers=1 frontend/tests/unit/components/ui/Switch.test.tsx
npm -C frontend run test -- --run --maxWorkers=1

# 5. Frontend build
npm -C frontend run build
```

TDD protocol (testing-standards.md R1):
- Step 1 writes the failing test.
- Step 2 confirms the test is red for the right reason (module not found).
- Step 3–4 implements and confirms green.
- Steps 8–10 are CSS/inline-style edits to existing components; re-run the full test suite after (the existing VoiceDropzone and GlassInput tests must still pass).

## Dependencies

- **P1 (task 001-token-reskin.md) must be complete** so that:
  - `--action-primary` is defined in `tokens.css` (needed by `.switch--on` track background and `.form-input:focus` shadow).
  - `--radius-button: 8px` is in effect (pill radius drop lands at the intended value).
  - `--radius-compact: 6px` exists for the badge fix.
  - `.form-input` focus ring uses `--action-primary` (consistent with the double-ring wired in P1).

## Out of scope

- `StatusOrb` or `PredictiveProgressBar` icon-inset changes (P3).
- Glass/material audit (P4).
- The SearchableSelect, ColorSwatchPicker, ConfirmModal inline-style extractions (P5 cleanup).
- Any caller migration to the new `Switch` (this task builds the primitive; callers adopt it separately when they are next touched).
- Demo-specific polish (P6).
- Wiring `Switch` into existing Settings panels (that is a feature adoption step, not a design-system primitive step).

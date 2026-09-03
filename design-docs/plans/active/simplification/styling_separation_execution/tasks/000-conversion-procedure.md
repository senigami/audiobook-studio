# Shared procedure: converting one file's inline styles to classes

Status: reference document, not a task — no status line to update.

Every ST-3 task (004–017) links here instead of repeating this. Read this once, then open the
specific task file for its file path(s) and any file-specific notes.

## Procedure (apply per file)

1. **Read the file.** List every `style={{...}}` occurrence.
2. **Classify each occurrence** against the rule table in `../00-overview.md`:
   - Static + uses `var(--token)` values + matches one of the Part 2 shared classes in
     `../01-map.md` → replace with `className="<shared-class>"` (append to existing `className` if
     one is already present — don't clobber it, merge with a template literal or `clsx`-style
     join if the file already uses one, otherwise a plain string concat).
   - Static + uses tokens + repeated **within this file** 3+ times but not a Part 2 shared class →
     add a new file-local class to the matching `theme/components/*.css` file (per `../01-map.md`
     Part 1's domain table — find which file that page/component's existing rules already live in,
     or `theme/components/core.css` if none obviously fits) and use it.
   - Static + uses tokens + genuinely one-off → convert to a local class ONLY if it aids
     readability; otherwise it's fine to leave inline (don't manufacture single-use classes for
     everything — see the "pragmatism guard" in `../../03_styling_separation.md`).
   - **Dynamic** (value from props/state/a measurement — width `%`, `transform`, a conditional
     token switch, anything computed at render time) → **leave inline**, but if it currently has a
     hardcoded literal (a hex color, a raw px number) instead of `var(--token)`, fix that to the
     matching token.
3. **Tokenize as you go (owner-requested addition).** For every value you touch — inline or newly
   moved into a class — check it against `frontend/src/theme/tokens.css`'s registry (colors:
   `--surface*`, `--accent`/`--action-*`, `--text-*`, `--border*`, `--success*`/`--warning*`/
   `--action-danger*`; spacing: `--space-1`…`--space-8` = 4/8/12/16/24/32/40/48px; type:
   `--type-display/large-title/title/headline/body/reading/callout/caption/micro` +
   `--type-weight-*`):
   - A hardcoded hex/rgb color, or a raw px/rem length that matches an existing token's value
     (e.g. `padding: '16px'` ≈ `var(--space-4)`, `color: '#5c6a80'` ≈ `var(--text-muted)`) →
     replace with that token.
   - A value with **no matching token** → leave the literal as-is (don't invent a new token ad hoc
     mid-file-conversion — that's a design call outside this task's scope), but note the exact
     value + file:line in your completion note. These accumulate into
     `018-st4-spec-bump-and-guard.md`'s final token-gap report for the user.
   - Don't force-fit a close-but-not-equal value onto a token (e.g. `13px` is not `var(--space-3)`
     which is 12px) — only substitute exact or clearly-intended matches.
4. **No markup/behavior change.** Same DOM structure, same props, same event handlers. The only
   diff should be `style={{...}}` → `className="..."` (plus, where genuinely needed, a new CSS rule
   in the matching `theme/components/*.css` file).
5. **Verify:**
   - `npm -C frontend run build` — succeeds.
   - `npm -C frontend run lint` — no new violations in the touched file.
   - `npm -C frontend run test -- --run` (or scope to the relevant test file if the touched
     component has one under `frontend/tests/`) — green.
   - `grep -c "style={{" <file>` — count should drop to only the genuinely-dynamic remainder;
     confirm none of the converted occurrences remain.
6. **One commit per file** (per the parent doc's explicit sequencing — keeps each conversion small
   and independently revertable/reviewable).
7. **Record in the task's completion note** which new classes (if any) you added and where, plus
   any untokenizable values found (step 3), so later tasks, the final visual-check pass, and
   018's token-gap report know what to look for.

## What NOT to do

- Don't touch `alignItems:'center'` / `flex:1` inline occurrences — those should use the existing
  `.items-center`/`.flex-1` utilities in `theme/utilities.css`, which is a separate, optional
  follow-up (`019-followup-missed-utility-usage.md`), not part of this task's acceptance criteria.
- Don't "improve" the component while you're in there (no unrelated refactors, no renamed props,
  no reordered JSX) — this phase is styling separation only.
- Don't self-preview and declare a screen visually correct — this repo's working rule is to ask the
  owner rather than self-verify visual output; batch your confirmation that build/lint/tests pass
  and let the final checklist in `../02-roadmap.md` carry the visual sign-off.

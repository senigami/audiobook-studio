# Task 019 — (Optional, non-gating) Missed-utility-usage cleanup

Status: pending

## Goal

Swap `style={{alignItems:'center'}}` (73 occurrences) and `style={{flex:1}}` (51 occurrences) for
the existing `.items-center`/`.flex-1` utility classes in `theme/utilities.css` (lines 351/353),
across `frontend/src` (excluding `demo/`).

## Why this is separate and non-gating

This is a real, found-in-passing bug (existing utilities not being used where they'd apply
directly) — but it's a distinct task from "add a new shared class for a repeated pattern" (ST-2's
actual scope), so it does not gate this plan's `00-overview.md` success criteria. Do this task if
time/priority allows; skip it without blocking anything else in this plan.

## Map links

- Map: `../01-map.md` Part 2 ("Do NOT add classes for...").
- Risk flag: `none`.

## Steps

- [ ] `grep -rn "style={{ *alignItems: *'center' *}}" frontend/src --include=*.tsx` (excluding
      `demo/`) and replace each with `className="items-center"` (merging with any existing
      `className` on the same element).
- [ ] Same for `style={{ *flex: *1 *}}` → `className="flex-1"`.
- [ ] Watch for combined objects (e.g. `style={{alignItems:'center', gap:'0.5rem'}}`) — only the
      `alignItems`/`flex` piece moves to the utility class; anything else in the same object stays
      per the normal conversion rule (dynamic stays inline, static-repeated gets its own
      class/utility, static-one-off may stay inline).
- [ ] `npm -C frontend run build`, `lint`, `test -- --run` all green.

## Acceptance criteria

- [ ] `grep -rn "style={{ *alignItems: *'center' *}}\|style={{ *flex: *1 *}}" frontend/src`
      (excluding `demo/`) returns 0 hits for the exact single-property forms.
- [ ] No DOM structure, prop, or handler changes anywhere touched.
- [ ] Build/lint/test green.

## Dependencies

- Blocked by: none (can run any time, independent of the rest of this plan).
- Blocks: none.

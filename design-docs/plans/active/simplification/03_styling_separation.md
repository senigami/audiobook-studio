# Phase 2 — Styling separation (the core ask) — DONE

> Map: [00_overview.md](00_overview.md). The "Zen-garden" workstream: styling moved out of JSX into
> token-keyed CSS with semantic class names. **No Tailwind** (decision §1 of the overview).

**Status: complete — 2026-07-10.** ST-1 through ST-4 all shipped. Verified in-repo:
`frontend/src/theme/components.css` retired and split into 11 domain files under
`frontend/src/theme/components/`; the shared label classes added to `core.css`; ~470 inline
`style={{}}` occurrences converted across the 20 hotspot files; CI guard
`scripts/check_hardcoded_styles.py` wired into `.github/workflows/ci.yml`; spec bumps landed
(`design-system.md` 1.14.0, `code-organization.md` 1.2.0 changelog rows).

The executable per-file task breakdown, exact CSS domain map, and completion record live in
[`styling_separation_execution/`](styling_separation_execution/) (`status.json` carries the
per-task commits). That subfolder supersedes the file lists / line counts once in this doc, which
had drifted (components.css grew to 4,440 lines; several targets were split or found dead before
execution).

## The conversion rule (the binding convention this phase established)

| Inline style is… | Action |
|------------------|--------|
| Static + tokens + **repeated** across components | → shared class in `theme/components/*.css` |
| Static + tokens + **one-off** | → local class if it aids readability; otherwise may stay inline |
| **Dynamic** (computed from props/state/measurement) | → **stays inline**, must use `var(--token)` |
| Contains a **hardcoded color/length** | → fix to a token (the §2.2 mandate) |

Now codified in `design-system.md` (§ styling convention) — the debt should not silently regrow.

## Remaining (optional, non-gating)

- **019 — missed-utility-usage cleanup**: swap `style={{alignItems:'center'}}` / `style={{flex:1}}`
  for the existing `.items-center` / `.flex-1` utilities. See
  [`styling_separation_execution/tasks/019-followup-missed-utility-usage.md`](styling_separation_execution/tasks/019-followup-missed-utility-usage.md).
  Does not gate this phase's success criteria.

## Owner sign-off

Code-complete; the final batched owner visual-check (light + dark) checklist lives in
[`styling_separation_execution/02-roadmap.md`](styling_separation_execution/02-roadmap.md). Archive
the execution subfolder once that pass is signed off.

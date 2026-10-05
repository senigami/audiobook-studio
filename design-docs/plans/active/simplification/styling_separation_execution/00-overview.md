# Overview — Styling separation execution — DONE (2026-07-10)

**Status: complete.** All tasks 001–018 shipped and accepted (per `status.json`); the code-side of
the plan is verified in-repo (`theme/components.css` retired into 11 `theme/components/*.css`
domain files, shared label classes added, ~470 inline styles converted across 20 files, CI guard
`scripts/check_hardcoded_styles.py` wired in, `design-system.md` 1.14.0 + `code-organization.md`
1.2.0 changelog rows landed). Only the optional non-gating follow-up (`tasks/019`) and the batched
owner visual sign-off (`02-roadmap.md`) remain before archiving.

## The task (for reference)

Moved styling out of frontend JSX into token-keyed CSS with semantic class names, per the
conversion rule in `../03_styling_separation.md`:

| Inline style is… | Action |
|---|---|
| Static + tokens + **repeated** | → shared class in `theme/components/*.css` |
| Static + tokens + **one-off** | → local class if it aids readability, else stays inline |
| **Dynamic** (computed from props/state/measurement) | → stays inline, must use `var(--token)` |
| Hardcoded color/length | → fixed to a token |

Sequence executed: **ST-1** (split `theme/components.css` into 11 domain files) → **ST-2** (6 shared
label classes) → **ST-3** (converted the hotspot files, 20 counting split children) → **ST-4** (spec
bumps + CI guard). The exact domain boundaries and per-file map are in `01-map.md`; the per-task
commits are in `status.json`; the token-gap report (values found with no matching token) is in
`tasks/018-st4-spec-bump-and-guard.md`'s completion note.

## Remaining

- `tasks/019-followup-missed-utility-usage.md` — optional, non-gating (`.items-center`/`.flex-1`
  swaps). Pending.
- Owner visual sign-off checklist in `02-roadmap.md` (light + dark), then archive the folder per
  `README.md`.

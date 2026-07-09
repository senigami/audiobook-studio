# Task 003 — Rebuild and verify the static demo output

Status: complete — 2026-07-10

## Session note (2026-07-09)

Build-side steps (typecheck, build:demo, docs/demo/ regeneration) were completed by an
implementer with no browser tool available. The orchestrator then completed live
verification directly (preview_start on the "demo (Vite dev)" launch config):

- Navigated Library → "The Whispering Vale" → confirmed **Book** is the first tab and
  is the default-landing tab (active/highlighted on entry, no click needed).
- `BookPane` renders as one region: cover placeholder, "The Whispering Vale" title,
  "R.E. Hartley · The Vale Cycle #1" identity line, description paragraph, a primary
  `PlayButton` + "Continue Listening" label + secondary "Download" button, and a muted
  "Runtime 6h 28m · Rendered · Created 2 days ago" footer line — matches the target
  shape exactly.
- Clicked **Contents** — still works, chapter list renders correctly, no regression.
- Clicked the Play button (`aria-label="Play book The Whispering Vale"`) — the demo's
  global player bar picked it up correctly: title, "Audiobook · full" badge, a running
  00:01/120:00 timer, and playing (pause icon shown) — confirming the demo's existing
  click-delegator-to-player-bus convention (INV-3) works with zero additional wiring.
- `preview_console_logs` (error level) — no console errors at any point in the above.

## Goal

Regenerate `docs/demo/` (the committed static build GitHub Pages serves) so it reflects the new Book tab, and verify the change live in a running preview before calling this plan done.

## Exact files/commands

- Build command (from `frontend/`, per `frontend/package.json:13`): `npm run build:demo` → `vite build --config vite.demo.config.ts` → outputs to `docs/demo/` (per repo convention, confirmed in `CLAUDE.md`/prior session memory: `docs/` is the public GitHub Pages site, `docs/demo/` is committed static output, never wired into `run.sh`).
- Typecheck: `npx tsc -b --force` (from `frontend/`).

## Steps

- [x] Run `npx tsc -b --force` from `frontend/` — must be clean (this catches both this plan's own changes and confirms nothing upstream broke).
- [x] Run `npm run build:demo` from `frontend/` — must succeed with no build errors.
- [x] Start the demo preview (used the "demo (Vite dev)" launch config) and navigate to the site-mockup stage's book workspace.
- [x] Confirm live: `Book` is the first tab and is the default-landing tab; `BookPane` renders cover+identity+description+Continue-Listening-CTA+muted-footer-line as one region; clicking `Contents` still works (Cast/Publish/Backups were not individually re-clicked but are unchanged by this plan and use the identical generic pane-switch mechanism already proven by Contents); clicking the `PlayButton` triggers the demo's global player bar with no console error.
- [x] Screenshot the result for the completion record (see session note above for what was captured).

## Acceptance criteria

- [x] `docs/demo/` is regenerated (check `git status`/`git diff --stat docs/demo/` shows the rebuild's output changed).
- [x] Live preview confirms all four items in the Steps' verification bullet above.
- [x] No new console errors introduced by the Book tab.
- [x] `npx tsc -b --force` and `npm run build:demo` both clean/succeed.

## Dependencies

Task 002 (the tab must be wired before there's anything to rebuild/verify).

## Map links

- This task closes the loop on the whole plan's success criteria (`00-overview.md`, items 1-4).
- Risk: `none` (rebuild + verification, no new source changes beyond what 001/002 already made — unless verification surfaces a bug, in which case route the fix back through a fresh Task 001/002-style edit, not silently patched here without updating those task files too).

## Out of scope

- Any further design iteration beyond what Tasks 001-002 specified — if live verification reveals the layout needs adjustment, make the fix, but note it in this task's completion note rather than silently deviating from the map.

Status: complete — 2026-07-10 (owner sign-off pending, see `../02-roadmap.md` Workload B)

# 005 — Passive block-position label + spec sync

Workload: B · DONE.

Added a plain `"Block N of M"` `subtitle` (owner-confirmed: not the richer speaker-labeled text) to every `loadAndPlay` call in `useChapterPlayback.ts`'s `playWithFallback`, using the block-leader queue from task 004. `PlayerBar.tsx` required zero changes (confirmed via diff — it already renders `subtitle` generically). Bumped `design-docs/specs/audio-player.md` 1.6.0 → 1.6.1 with a changelog row; added a `wiki/Changelog.md` entry.

One pre-existing unrelated failure noted (`tests/unit/demo/styleguide.test.tsx`) — confirmed to fail in isolation too, untouched by this task.

Remaining: owner visual sign-off (correct navigation + label visible in the running app) — tracked in `../02-roadmap.md`, not here.

See `status.json` for commits `19ccd0b9`, `ac5d350f`.

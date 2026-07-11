# Overview

## The task

Turn the Book tab (`frontend/src/pages/Book/stages/BookStage.tsx` + `BookInfoCard.tsx`) from a metadata panel into the "front door" it was designed to be, per `docs/design-critique/`. Three concrete capabilities are missing today; this plan builds them and restructures the hero layout around them.

## Scope

**In scope:**
- A working "Continue Listening" affordance on the Book tab, backed by the `availableAudiobooks` data already fetched by `useBookData.ts`, wired into the app's existing global player bus (`frontend/src/store/playerBus.ts`) rather than a new player.
- A real `description` field on `Project`: SQLite schema (additive migration), API param, frontend type + client + hook wiring, and the `InlineEdit` (multiline) binding in `BookStage.tsx`'s "Description" card (currently static placeholder copy).
- A slim, non-editable `BookIdentityStrip` (cover thumbnail + title + author) extracted from `BookInfoCard` and used in `PublishStage.tsx`'s sidebar in place of the current full editable card.
- The North Star hero-layout restructuring from `02-improvement-plan.md`: promote the listen CTA to the one primary action, let the description fill the ~29% of hero width currently sitting empty, demote the metadata pills one visual step down.

**Out of scope (explicitly):**
- Building a new audio player or waveform UI — that's `design-docs/plans/active/audio_player_waveform_scrubber/`, a separate, larger, already-active initiative. This plan only adds one more caller (`'book'` scope) to the existing player bus.
- Any change to Contents, Cast, or Lexicon tabs.
- Removing or renaming any existing `Project` field.
- Any change to how `series_position` or the other Phase-1-fixed fields behave — those are done and verified.

## Success criteria (definition of done)

1. Opening any book that has at least one assembled/rendered audiobook file shows a "Continue Listening" card on the Book tab with the file's title, duration, "created X ago," and two actions: **Play** (loads it into the global player bar) and **Download**. A book with no assembled file yet shows an honest empty state, not a broken or misleading one.
2. `Project` has a real `description` field: editable in place on the Book tab via multiline `InlineEdit`, persisted through a versioned, additive SQLite migration, round-tripping through `fetchProject`/`updateProject`.
3. Publish's sidebar shows the new slim `BookIdentityStrip` (cover + title + author, read-only) instead of the full editable `BookInfoCard`. Editing title/author/series/series-position is only possible from the Book tab.
4. The Book tab's hero reads as a single region (not two stacked cards): cover + identity on one side, description + Continue Listening CTA + de-emphasized metadata pills filling the other — matching the `02-improvement-plan.md` North Star sketch.
5. All new/changed code has passing tests (`npm -C frontend run test -- --run`, `./venv/bin/python -m pytest`), a clean typecheck (`npx tsc -p tsconfig.json --noEmit`), and a code-map queue entry per file changed.
6. Re-running `/design-critique` on this same scope afterward should show DC-003, DC-005, DC-006, and DC-007/DC-009 (the whitespace/cover-sizing polish items) resolved.

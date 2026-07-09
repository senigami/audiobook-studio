# Task 006 — Continue Listening card

Status: complete — 2026-07-09

## Goal

Build the single highest-leverage piece from the design critique (DC-003): a card on the Book tab that surfaces the most recently assembled audiobook file and lets the user play it (via the existing global player bar) or download it, with an honest empty state when nothing has been assembled yet.

## Why it matters

`useBookData.ts` already fetches `availableAudiobooks` for every book; nothing on the Book tab uses it today. This task is the one that actually makes the tab a "front door" instead of a metadata panel.

## Exact files

- `frontend/src/pages/Book/components/ContinueListeningCard.tsx` — **new file**.
- `frontend/src/pages/Book/stages/BookStage.tsx` — render the new card (replaces the current static "Description" aside's neighbor position — final placement is decided in Task 008; for this task, render it wherever it visually fits without breaking the existing layout, since Task 008 will move things).
- `frontend/src/theme/components.css` — new `.continue-listening-card*` rules.

## Data contract (already exists, do not change)

`frontend/src/types/index.ts:445-455`:
```ts
export interface Audiobook {
  filename: string;
  title: string;
  download_filename?: string;
  cover_url: string | null;
  url?: string;
  created_at?: number;
  size_bytes?: number;
  duration_seconds?: number;
  description?: string | null;
}
```
`availableAudiobooks: Audiobook[]` is available from `useBookDataContext()` (already threaded through `BookDataProvider` — confirmed via `useBookData.ts:242` returning it, and `BookLayout.tsx`'s `BookDataProvider` passing context through). **Resolved: the array is already sorted most-recent-first.** `app/api/routers/projects_assembly.py:66` (`api_list_project_audiobooks`) does `valid_files.sort(key=lambda x: x[2].stat().st_mtime, reverse=True)` before building the response — `availableAudiobooks[0]` is always the latest file, no frontend re-sort needed.

**Resolved: `Audiobook.cover_url` is always `null` from this endpoint** (`projects_assembly.py:75` hardcodes `"cover_url": None`) — this listing has no per-file cover art. Use the book's own `project.cover_image_path` for the card's thumbnail, not `latest.cover_url`. `ContinueListeningCard` therefore needs `project` (or just `coverImagePath`) as a prop alongside `audiobooks`.

## Player bus contract (from Task 001)

```ts
loadAndPlay({
  scope: 'book',
  title: audiobook.title || audiobook.filename,
  subtitle: 'Full audiobook',
  audioUrl: audiobook.url!,
});
```
`loadAndPlay` is imported from `frontend/src/store/playerBus.ts`. **Guard on `audiobook.url` being defined** — the type marks it optional; if absent, disable the Play action and fall back to Download-only (using `download_filename`/`filename`), since there is nothing to load into the player bus.

Resolved: `loadAndPlay` (`frontend/src/store/playerBus.ts:83-104`) defaults both `hasPrev`/`hasNext` to `false` via `opts.hasPrev ?? false` — safe to omit both for a one-off "Continue Listening" load, no prev/next queue needed.

## Target shape

```tsx
// frontend/src/pages/Book/components/ContinueListeningCard.tsx
import { Play, Download } from 'lucide-react';
import { loadAndPlay } from '@/store/playerBus';
import { formatLength, formatFileSize, formatRelativeTime } from '@/utils/format';
import type { Audiobook } from '@/types';

interface ContinueListeningCardProps {
  audiobooks: Audiobook[];
  coverImagePath: string | null;
}

export function ContinueListeningCard({ audiobooks, coverImagePath }: ContinueListeningCardProps) {
  const latest = audiobooks[0]; // already sorted most-recent-first by the backend, see data contract note above

  if (!latest) {
    return (
      <div className="continue-listening-card continue-listening-card--empty" aria-label="Continue listening">
        <p>Nothing rendered yet — head to Contents to start casting and rendering.</p>
      </div>
    );
  }

  const handlePlay = () => {
    if (!latest.url) return;
    loadAndPlay({ scope: 'book', title: latest.title || latest.filename, subtitle: 'Full audiobook', audioUrl: latest.url });
  };

  const handleDownload = () => {
    if (!latest.url) return;
    const link = document.createElement('a');
    link.href = latest.url;
    link.download = latest.download_filename || latest.filename;
    link.click();
  };

  return (
    <div className="continue-listening-card" aria-label="Continue listening">
      {/* cover thumbnail, title, duration, formatRelativeTime(latest.created_at) */}
      <button type="button" className="btn-primary" onClick={handlePlay} disabled={!latest.url}>
        <Play size={16} aria-hidden="true" /> Continue Listening
      </button>
      <button type="button" className="btn-ghost" onClick={handleDownload} disabled={!latest.url}>
        <Download size={16} aria-hidden="true" /> Download
      </button>
    </div>
  );
}
```
(This is the contract, not final markup — match this project's existing card/button conventions, e.g. `AssemblyPanel.tsx`'s cover-thumbnail block, when implementing.)

## Pattern to imitate

- `frontend/src/pages/ProjectDetail/components/AssemblyPanel.tsx`'s download-button handler (the `document.createElement('a'); link.href = ...; link.download = ...; link.click();` shape) — copy this exactly, it's the existing, working download pattern in this codebase.
- `frontend/src/theme/design-system.md`'s button conventions — use `.btn-primary` for Play (the one primary action per North Star) and `.btn-ghost` for Download (secondary), not two equally-weighted buttons.

## Steps

- [x] Create `ContinueListeningCard.tsx` per the contract above, using this project's real formatting utilities (`formatLength`, `formatFileSize`, `formatRelativeTime` — imported from `@/utils/format`, same as `PublishStage.tsx:9`).
- [x] Render `<ContinueListeningCard audiobooks={availableAudiobooks} coverImagePath={project.cover_image_path} />` in `BookStage.tsx`, pulling `availableAudiobooks` from `useBookDataContext()`.
- [x] Add `.continue-listening-card*` CSS — respect INV-4 (no `--text-subtle` for body text) and INV-2 (empty state must read as calm/honest, not broken).
- [x] Append a `docs/code-map/queue/` entry per the README's same-change rule.

## Acceptance criteria

- [x] A book with at least one assembled audiobook shows title, duration, "created X ago," a working Play button (verified via `vi.spyOn(playerBus, 'loadAndPlay')` asserting it's called with `{ scope: 'book', ... }` in the new test file) and a working Download button (verified the anchor `download`/`href` attributes are set correctly via a `document.createElement` spy).
- [x] A book with zero assembled audiobooks shows the empty-state message, no broken/disabled-looking fake card.
- [x] New unit test file `frontend/tests/unit/pages/Book/components/ContinueListeningCard.test.tsx` (no `BookStage.test.tsx` or component-level test exists yet for this surface — confirmed via directory listing — so this is a new file; mirror `BookInfoCard.test.tsx`'s structure/setup) covering both the populated and empty states.
- [x] `npx tsc -p tsconfig.json --noEmit` clean; `npm -C frontend run test -- --run tests/unit/pages/Book/components/ContinueListeningCard.test.tsx tests/unit/pages/Book/stages` passes (34/34). **Note:** a pre-existing, unrelated failure exists in `tests/unit/pages/Book/BookLayout.test.tsx` ("redirects /book/:bookId to the last visited stage when present" still expects a `'Book info'` region on the Publish route) — confirmed via `git stash` bisection that this predates this task's changes entirely (it's a gap left by Task 005's `PublishStage.tsx` → `BookIdentityStrip` swap, which updated `PublishStage.test.tsx` but not this assertion in `BookLayout.test.tsx`); flagging for the owner/Task 005 follow-up rather than fixing here (out of this task's scope). **Resolved by orchestrator** — updated the stale assertion in `BookLayout.test.tsx` to `'Book identity'`; full suite re-verified green.
- [x] Live verification in the dev preview: open a fully-rendered book, click Continue Listening, confirm the global player bar picks up the file and starts playing. **Confirmed by orchestrator** (2026-07-09, live dev preview against a real fully-rendered book): clicking Continue Listening produced a real `206 Partial Content` HTTP response for the exact assembled `.m4b` file URL (confirmed via `preview_network`), proving the full path — click → `loadAndPlay({scope:'book',...})` → playerBus state update → `PlayerBar`'s conditional `<audio src>` render → browser stream request — works end-to-end.

## Dependencies

Task 001 (`'book'` scope must exist on `PlayerScope` before this component can call `loadAndPlay` with it).

## Map links

- Part: **Continue Listening card** (`01-map.md` — The parts)
- Contract: **`Audiobook` type is already fully shaped for this** (`01-map.md` — Connections & contracts)
- Invariant: **INV-2** (no fabricated state), **INV-4** (contrast discipline)
- Risk: `multi-file` (new component + `BookStage.tsx` composition + CSS), `quality-sensitive` (this is the single most important UI change in the plan — the thing the owner explicitly asked for; get it adversarially reviewed even though the diff itself isn't large)

## Out of scope

- In-browser waveform scrubbing UI for the player bar — that's `design-docs/plans/active/audio_player_waveform_scrubber/`, a separate initiative. This task only needs `loadAndPlay` to work; whatever UI that other plan builds for scrubbing applies automatically once wired.
- Final hero layout placement (Task 008 moves this card into its final position).
- A "history of past assemblies" view — that's Publish's `AssemblyPanel`, unchanged by this plan.

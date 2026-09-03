# Roadmap

> **TL;DR:** 13 tasks in 5 workloads, ordered so each builds on verified ground. **Start with
> Workload 1 (real-app bugs)** — it's independent of the mock and fixes correctness the redesign assumes.

## Sequencing rationale

1. **Bugs first (WL1).** B1–B4 are real-app correctness issues with **zero overlap** with the mock the
   other worker is in, so they can start now and in parallel. B1 (voice change must invalidate audio) and
   B4 (variations regressed) directly underpin the render/voice model the redesign showcases — fixing
   them first means the mock prototypes real behavior.
2. **Mock structure before mock content (WL2 → WL3).** The book-level nav restructure (Contents hub) and
   the single Chapter Workspace are the skeleton; everything else hangs off them.
3. **Model before gestures (WL4).** The cast/character/temp/variation data shape must exist before the
   span-assignment gesture that writes to it.
4. **Authoring aids last (WL5).** Bookmarks and pronunciation are additive polish on a working workspace.

## Dependency graph

```
WL1 (independent):  001   002   003   004        # real-app bugs, no blockers, parallel-safe
WL2:                005 ──► 006
WL3:                005 ──► 007 ──► 008
WL4:                007 ──► 009 ──► 010 ──► 011
WL5:                006 ──► 012
                    007 ──► 013
```

- `001–004` block nothing in this plan (but B4/001 inform the *real* implementation of variation/voice features later).
- `005` (nav skeleton) blocks all other Track A work.
- `007` (workspace) is the hub the cast panel, switcher, bookmarks, and pronunciation live in.

## Workloads

### Workload 1 — Real-app bug fixes
- **Goal:** the voice/render/assignment loop behaves correctly in the real app.
- **Tasks:** 001, 002, 003, 004
- **Why now:** independent of the mock (no worker collision); B1/B4 fix behavior the redesign depends on.
- **Verify the workload:** each task ships a revert-checked test (red on pre-fix code); `./venv/bin/python -m pytest -q` and the targeted frontend tests pass; changing a voice deletes the segment's audio, and consecutive sentence paints in one section no longer 409.

### Workload 2 — Mock: book-level nav + Contents hub
- **Goal:** the book opens to a scope-clean `Contents · Cast · Publish · Backups` shell whose Contents is the command center.
- **Tasks:** 005, 006
- **Why now:** the structural skeleton everything else hangs on; first Track A step.
- **Verify the workload:** `npm -C frontend run build` passes; opening a book shows Contents with a per-chapter orb board, "render all remaining," a slim book header, and a Publish trigger that is disabled until all chapters are green.

### Workload 3 — Mock: single Chapter Workspace
- **Goal:** clicking a chapter opens one unified workspace (no separate Review) with a switcher + bookmark.
- **Tasks:** 007, 008
- **Why now:** the workspace is the home for cast, variations, bookmarks, and pronunciation.
- **Verify the workload:** build passes; there is no Review tab; the workspace plays/renders/edits on one highlighted-prose surface; `Contents ▾` + prev/next switch chapters without leaving the workspace; reopening a chapter resumes at its last-edited position.

### Workload 4 — Mock: cast, characters & assignment
- **Goal:** a chapter-aware Cast slide-out and a span-level `Character ▾ · Variation ▾` assignment gesture.
- **Tasks:** 009, 010, 011
- **Why now:** depends on the workspace (007); the data shape must precede the gesture.
- **Verify the workload:** build passes; the Cast panel shows 3 collapsible tiers (in-chapter favorites / chapter-scoped temps / rest); a temp character is auto-named `Ch{N} · Character {i}` and can be promoted; selecting a span and choosing a character + variation tints that exact range.

### Workload 5 — Mock: authoring aids
- **Goal:** bookmarks and pronunciation support the methodical author loop.
- **Tasks:** 012, 013
- **Why now:** additive polish on a working workspace/contents.
- **Verify the workload:** build passes; a named bookmark can be created and appears in a global cross-book list labeled "Book · Chapter · label"; "jump to next unrendered section" works; a word can be given a phonetic override scoped book/series/global and a one-time inline edit.

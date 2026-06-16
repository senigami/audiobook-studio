# Proposal — Book vs. Chapter workflow IA (two-level)

```
status: DRAFT — propose-before-mock. For quick iteration. No code, no mock until this is agreed.
date: 2026-06-16
problem owner: Steven
relates to: plans/ethereal-booping-frost.md (rail/library), audio-player.md (PlayerBar transport),
            the live BookLayout 5-stage pipeline, the old studio-2.0 chapter-centric layout
```

> **TL;DR:** The current book pipeline presents **five flat, book-level tabs** (Manuscript · Casting · Studio · Review · Publish), but **Studio and Review are really chapter-level work**. The fix is a clean **two-level IA**: a **Book workspace** (the chapter list + book-only actions) and a **Chapter workspace** you *enter by clicking a chapter* (Studio ⇄ Review for that one chapter, chapter pinned the whole time, prev/next to hop). This is what your old `studio-2.0` layout did well; the proposal brings that ease into the Apple-style shell.

---

## 1. The problem (today)

The live app routes `/book/:id/:stage` with five peer tabs, all rendered at the book level ([BookLayout.tsx](../frontend/src/pages/Book/BookLayout.tsx)):

| Stage | Really operates on | Mismatch |
|---|---|---|
| Manuscript | book (chapter list) ✓ | ok |
| Casting | book ✓ | ok |
| **Studio** | **a chapter** | presented as book-level; needs `?chapter=` |
| **Review** | **a chapter** | presented as book-level; needs `?chapter=` |
| Publish | book ✓ | ok |

Consequences you hit:
- Switching **Studio → Review loses the chapter** (the tab link dropped `?chapter=`). *(Patched as a stopgap — tabs now carry the chapter — but the real fix is structural: Review should be a mode of the chapter you're already in, so there's no chapter to "lose".)*
- The **Manuscript chapter row doesn't open the chapter** — it only selects locally ([ManuscriptStage.tsx](../frontend/src/pages/Book/stages/ManuscriptStage.tsx)); you then have to find Studio and re-pick the chapter.
- Book concerns (assembly, backups, book info) and chapter concerns (cast/render/review a chapter) sit in one flat strip, so the hierarchy is muddy.

## 2. What the old `studio-2.0` layout got right

Two screens, click-to-enter, chapter stays in context:

- **`/project/:id` — book view:** chapter list + book sub-tabs **Chapters · Assemblies · Backups · Characters**, plus book actions (add/reorder/delete chapters, set default voice, queue-all, **Assemble M4B**, backups, edit book info).
- **`/chapter/:id` — chapter editor (full screen):** per-span voice assignment, render/rebuild, preview playback, Script/Source tabs, character sidebar, **prev/next chapter** nav, breadcrumb back to the book.

The win: **book stuff lived with the book, chapter stuff lived with the chapter**, and you moved between chapters fluidly without losing your place. We want that, in the new look.

## 3. Proposed IA — two workspaces

### A) Book workspace — `/book/:id`
The book home. The **chapter list is the spine** (click a chapter → enter the Chapter workspace). Book-only surfaces grouped here (sub-sections, not peer tabs with chapter work):

- **Chapters** (default) — the list: add/reorder/delete, per-chapter status/progress, queue-all, **click a row to open the chapter**.
- **Casting** — book-wide character → voice mapping (genuinely book-level).
- **Publish / Assembly** — M4B assembly + the list of produced assemblies.
- **Backups** — project snapshots.
- **Book info** — cover, title, author, series, runtime (the header / an "Info" affordance).

### B) Chapter workspace — `/book/:id/chapter/:chapterId`
Entered by clicking a chapter. The chapter is **pinned** in a header (with prev/next + breadcrumb `Library › Book › Ch N`). Two modes for that chapter:

- **Studio** (`…/chapter/:id/studio`) — edit text, assign speakers per span, render/rebuild, preview. *(Casting is referenced here read-only — you assign within the chapter using the book's cast.)*
- **Review** (`…/chapter/:id/review`) — listen + follow-along + annotate, that same chapter.

Switching Studio ⇄ Review **cannot lose the chapter** — they're modes inside the chapter route. "Done" / breadcrumb returns to the Book workspace; prev/next moves to the adjacent chapter staying in the same mode.

### The split (book vs chapter)

| Book workspace (`/book/:id`) | Chapter workspace (`/book/:id/chapter/:id`) |
|---|---|
| Chapter list (add/reorder/delete) | Edit chapter text |
| Casting (character→voice, book-wide) | Assign speakers to spans (uses the cast) |
| Queue-all / render remaining | Render/rebuild this chapter + per-segment |
| Assemble M4B + assemblies list | Preview/playback this chapter (via PlayerBar) |
| Backups | Review/follow-along + annotate this chapter |
| Book info / cover / metadata | Export this chapter (WAV/MP3) |
| | Prev/next chapter, breadcrumb back to book |

## 4. Navigation & routing

- `/book/:id` → Book workspace, default **Chapters** section. (`/book/:id/casting`, `/publish`, `/backups` for the other book sections.)
- **Click a chapter row → `/book/:id/chapter/:chapterId/studio`** (enter the chapter, Studio by default).
- Inside: a **mode toggle Studio ⇄ Review** swaps `…/studio` ↔ `…/review`, chapter unchanged.
- **Prev/Next chapter** keeps the current mode and swaps `:chapterId`.
- **Breadcrumb / "Back to book"** → `/book/:id` (Chapters).
- Keeping the chapter in the *path* (not a `?chapter=` query) makes it structural — no more lost-chapter bugs, deep-linkable, and the rail can highlight the active chapter.

This supersedes the 5 flat stages: **Manuscript→Chapters (book)**, **Casting/Publish→book sections**, **Studio/Review→chapter modes**.

## 5. Mapping onto the Apple shell + rail

- The rail's nested **book tree** ([ethereal-booping-frost plan](ethereal-booping-frost.md)) lists the book's chapters under the book; clicking one routes into the Chapter workspace and highlights it — the rail becomes the chapter switcher.
- The Book workspace uses the existing Apple-style **PaneHeader / Card / segmented controls** (from the mock) for the Chapters/Casting/Publish/Backups sections.
- The Chapter workspace gets a **sticky chapter header** (breadcrumb + prev/next + render status), with Studio/Review as a segmented toggle — same primitives, chapter-scoped.
- Transport stays in the **global PlayerBar** (audio-player spec); the chapter workspace just exposes the *start* affordances (play chapter / per-segment), consistent with §4.1.

## 6. What this changes in code (sketch — for the eventual plan, not now)

- **Routing:** add `/book/:id/chapter/:chapterId/:mode(studio|review)`; make `/book/:id` the book workspace with `chapters|casting|publish|backups` sections. Studio/Review stages move under the chapter route and read `:chapterId` from the **path**, not `?chapter=`.
- **Manuscript chapter row → navigate** into the chapter workspace (today: local select only).
- **Regroup** the current 5 `BookStage`s into book-sections + chapter-modes; the `BookLayout` stage-tab strip becomes the book section nav, and a new `ChapterLayout` hosts the Studio/Review modes with the pinned chapter header + prev/next.
- The earlier `?chapter=` stopgap in `BookLayout` becomes unnecessary once Studio/Review live under the chapter path — but it's harmless to keep until then.

## 7. Open questions (decide before mocking)

1. **Casting placement** — book-level only (recommended), or also reachable read-only inside the chapter (assign-from-chapter using the book cast)? I lean: cast list lives at book level; the chapter Studio lets you *assign* spans to existing cast + quick-add.
2. **Book sections as tabs vs. a single scroll** — sub-tabs (Chapters/Casting/Publish/Backups) like old studio-2.0, or one scrolling book home with sections? (Old used tabs; tabs keep it tidy.)
3. **Manuscript naming** — keep "Manuscript" for the chapter-list/text-management section, or rename the book home to "Chapters"/"Overview"? (The old layout called it the project view with a Chapters tab.)
4. **Where book Info/metadata lives** — a header affordance vs. its own section.
5. **Does Review stay a separate mode, or fold into Studio** as a "listen" view? (I recommend keeping them distinct modes — Studio = build, Review = listen/annotate.)

## 8. Next steps

1. **Iterate this doc** with you (answer §7).
2. **Prototype in the mock** (`siteMockup`) — Book workspace + Chapter workspace + the enter/leave/prev-next flow, Apple-style. Owner sign-off on feel.
3. **Write the implementation plan** (its own `plans/` task folder) for the live routing/component restructure.
4. Land it (separate from the audio-player tape port, though they share the rail/PlayerBar).

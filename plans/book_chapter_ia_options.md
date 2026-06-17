# Book/Chapter IA — options & recommendations (§7 expanded)

```
status: DRAFT exploration — ideas only, no code. Companion to book_chapter_ia_proposal.md.
date: 2026-06-16
purpose: answer the 5 open questions with real alternatives + pros/cons, then a synthesized recommendation.
```

Recap of the agreed shape (from the proposal): **Book workspace** (chapter list + book-level stuff) and a **Chapter workspace** you enter by clicking a chapter (Studio ⇄ Review, chapter pinned). These options refine *how* the pieces are arranged.

---

## 1. Casting — where it lives

You named three real workflows, and they imply **two kinds of voice assignment**:

- **Cast members** — named, *recurring* characters (Maren, Dov…) with an assigned voice. The book's roster.
- **Spot voices** — a *throwaway* voice for a one-or-two-line background character (an innkeeper, a guard) you don't want cluttering the roster.

And two moments you need to act:
- *Manage the roster* (book-wide): see everyone, set/replace voices, view line counts.
- *Cast on the fly* (mid-chapter): you hit a new character and need to either **promote** them to the cast (recurring) or give them a **spot voice** (one-off) — without leaving the chapter.

### Option C1 — Book-section only
Cast managed solely in a book-level "Cast" section; in a chapter you can *assign* spans to existing cast, but to add anyone you go back to the book section.
- ✅ Simple, one source of truth, clean book overview.
- ❌ Breaks flow: you must leave the chapter to add a character — exactly the pain you described.

### Option C2 — Roster at book level + full casting *also* reachable in-chapter  ⭐ recommended
The canonical roster lives at book level, but casting actions are available wherever you assign:
- In **Studio**, the span-assign popover lists cast members + **"+ New character"** (promotes to the book roster, in place) + **"Spot voice…"** (assign a voice to just this span/character without adding to the roster).
- An **always-available "Cast" slide-over** (a panel you can pull from the chapter header) to add/edit a character anytime — "I just introduced someone" — without losing your place. It writes to the same roster.
- ✅ Matches all three of your workflows; never lose your place; roster stays the single source of truth.
- ✅ Spot voices keep the roster clean for true recurring characters.
- ❌ Slightly more UI (a slide-over + a richer assign popover) to design.

### Option C3 — Cast emerges from the chapters (no dedicated section)
No book "Cast" tab; the cast is just the set of characters that have been assigned somewhere, with a book-level *summary* view.
- ✅ Never leave the chapter; minimal chrome.
- ❌ Hard to get a deliberate book-wide casting overview / bulk re-voice; "manage the cast" becomes a scavenger hunt.

**Recommendation: C2.** Roster = book level (source of truth). Casting is *reachable everywhere* via the in-chapter assign popover + an always-available Cast slide-over. Distinguish **promote-to-cast** (recurring) from **spot voice** (one-off background) so the roster stays meaningful. This directly serves "quickly cast a background character" *and* "add the new character I just wrote."

> Open sub-decision: should a **spot voice** be (a) attached only to that span, or (b) a *chapter-local* mini-character (recurs within the chapter, never promoted to the book)? (b) is nicer when the innkeeper has 4 lines in this chapter only. I'd offer both: "this span" and "new local character (this chapter)".

---

## 2. Book home — how to present the sections

Four ways to arrange the book-level surfaces (Chapters, Cast, Publish/Assembly, Backups, Info).

### Plan A — Sub-tabs (old-layout-faithful)
A book header (cover + meta) with a sub-tab strip: **Chapters · Cast · Publish · Backups**. Chapters is default.
- ✅ Familiar (matches your old studio-2.0), tidy, each panel focused.
- ✅ Clear separation of book concerns.
- ❌ A *second* row of tabs (app rail + book sub-tabs); two tab layers can feel heavy.

### Plan B — Single scrolling book home
One page: **header (cover/title/meta)** → **chapter list (the hero, takes most space)** → lighter **Cast / Assemblies / Backups** as cards or a right-hand column below.
- ✅ Everything visible, fewer clicks, chapter list obviously primary.
- ✅ Feels like a modern "project home."
- ❌ Can get long; secondary sections compete for attention if not visually quieted.

### Plan C — Chapters-only home + "Book" menu/slide-over
The book home is **just the chapter list** (the spine). Cast / Publish / Backups / Info live behind a **"Book ▾" menu or slide-over panel**.
- ✅ Maximally focused on the main task (chapters); least chrome.
- ✅ Book actions are out of the way until needed.
- ❌ Discoverability: book actions are one click hidden; new users may not find Backups/Assembly.

### Plan D — Rail-driven (no book sub-tabs)  ⭐ recommended (pairs with the nested rail)
The left nav rail already nests the **book tree**. Put the book-level destinations there too, under the book:  `▸ Book Title  · Chapters · Cast · Publish · Backups`, with chapters expandable to the chapter list. The content area shows the selected one. No second tab strip.
- ✅ One navigation system (the rail) instead of rail + sub-tabs; very clean content area.
- ✅ Scales: the rail is already where you switch chapters, so book sections sit naturally beside them.
- ✅ The book header (cover/meta) can still sit atop the content.
- ❌ Rail gets a bit busier; needs careful visual hierarchy (book sections vs the chapter list within).

| Plan | Best when | Watch out for |
|---|---|---|
| A Sub-tabs | you want the familiar, contained feel | double tab layers |
| B Scrolling home | you want everything on one screen | length / visual noise |
| C Chapters-only + menu | chapters are 95% of the work | hidden discoverability |
| D Rail-driven | you lean into the nested rail | rail density |

**Recommendation: D, with B's book header.** Use the rail (which already holds the book tree) for the book sections, default to Chapters, and keep a slim book header (cover + title + runtime + edit) atop the content. If you'd rather not load the rail, **A** is the safe, familiar fallback.

---

## 3. Naming — a few coherent sets

Pick a *set* so terms feel consistent. (Left→right roughly = list → cast → produce → listen → ship → snapshots.)

### Set 1 — Plain & literal  ⭐ recommended
**Chapters · Cast · Studio · Review · Publish · Backups** (book Info in the header).
- ✅ Self-explanatory; "Cast"/"Studio"/"Review"/"Publish" are intuitive to authors and narrators.
- ✅ "Chapters" beats "Manuscript" for the list (Manuscript implies raw import/text, not the working list).

### Set 2 — Studio/production metaphor
**Contents · Cast · Produce · Review · Master · Snapshots.**
- ✅ Cohesive "recording studio" voice; "Master" for assembly is evocative.
- ❌ "Produce"/"Master"/"Contents"/"Snapshots" are less immediately obvious; more jargon.

### Set 3 — Verb-driven (action labels)
**Chapters · Cast · Edit · Listen · Assemble · Backups.**
- ✅ Action-forward; "Edit"/"Listen" describe the two chapter modes plainly.
- ❌ "Edit" undersells what Studio does (cast + render, not just text edit); "Listen" is narrower than "Review" (which includes annotate/re-render).

**Recommendation: Set 1.** Keep **"Chapters"** for the list (retire "Manuscript"), **"Studio"** and **"Review"** for the chapter modes, **"Cast"** and **"Publish"**. It reads cleanly for both authors and narrators. (If "Studio" feels too generic next to the app being "Studio", consider "Produce" from Set 2 just for that mode.)

---

## 4. Book info / metadata — where

- **Option I1 — Header affordance** ⭐: cover + title + author + series + total runtime sit at the top of the book home; an **Edit** button opens a modal (or inline edit). Info is reference, visible at a glance.
- **Option I2 — Its own section/tab:** "Details" as a peer of Chapters/Cast.
- **Option I3 — In a slide-over** with the other book actions (pairs with Plan C).

**Recommendation: I1 (header).** Metadata is *context*, not a workflow step — it shouldn't cost a tab. A persistent slim header (cover thumbnail + title + runtime + an Edit pencil) is the old-layout's best trait; keep it.

---

## 5. Review — distinct mode or folded into Studio

- **Option R1 — Distinct modes** ⭐: Studio (build: cast, edit, render) and Review (listen: follow-along, annotate, re-render) are two modes of the *same chapter workspace*, one toggle apart, chapter stays pinned.
  - ✅ Clear mental split: *produce* vs *QA/listen*; each screen stays uncluttered for its job.
  - ✅ Switching is one click and never loses the chapter (it's the same workspace).
- **Option R2 — Folded ("Listen" view inside Studio):** a toggle in Studio flips the prose into a follow-along listening view.
  - ✅ One fewer mode; everything in one place.
  - ❌ Studio is already dense (editing, cast, render controls); QA/listening is a different headspace and crowds it.

**Recommendation: R1 (distinct, co-located).** Keep them separate *modes within the chapter workspace* — distinct enough to stay focused, but a single toggle apart so it never feels like leaving the chapter.

---

## 6. The synthesized picture (if you took every recommendation)

- **App rail** nests the book: `▸ Book Title · Chapters · Cast · Publish · Backups`, Chapters expands to the chapter list. (Plan D)
- **Book home** = slim header (cover · title · runtime · Edit) atop whichever book section is selected; Chapters is default. (I1 + D)
- **Click a chapter** → **Chapter workspace**: pinned chapter header (breadcrumb · prev/next), **Studio ⇄ Review** toggle. (R1)
- **Casting**: roster at book level ("Cast"); in Studio, assign spans to cast, **+ New character** (promote) or **Spot voice / local character** (one-off); an **always-available Cast slide-over** to add/edit from anywhere. (C2)
- **Names**: Chapters · Cast · Studio · Review · Publish · Backups. (Set 1)

That gives you: chapters as the spine, book-stuff with the book, chapter-stuff with the chapter, casting reachable everywhere without losing your place, and a single navigation system (the rail) instead of stacked tab strips.

---

## What I'd want from you next
- React to the **recommendations** (✅ the ones you like, redirect the ones you don't).
- Especially: **Plan D vs A** for the book home (rail-driven vs sub-tabs), and the **spot-voice** sub-decision (span-only vs chapter-local mini-character).
- Then I'll fold your picks into `book_chapter_ia_proposal.md` and we prototype it in the mock.

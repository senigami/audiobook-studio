# Book View — Information Architecture Proposal

Alternatives to the current `Manuscript · Casting · Studio · Review · Publish` tab row, aimed at
fixing the scope/workflow mismatch. **Text proposal only — nothing here is built in the mock yet.**

---

## 1. The problem, precisely

The five tabs flatten two *different scopes* onto one tab bar, so the bar lies about what changes when
you click it:

| Tab | Real scope | Notes |
|-----|-----------|-------|
| **Manuscript** | Book **and** chapter | Book-level: import, chapter list, structure. Chapter-level: you click in and edit one chapter's text. It's doing two jobs. |
| **Casting** | Book | Canonical characters → voices for the whole book. |
| **Studio** | Chapter | Segment + assign speakers + render **one** chapter. |
| **Review** | Chapter | Follow-along playback + annotate + re-render **one** chapter. |
| **Publish** | Book | Assemble M4B, export the whole book. |

This produces the three pains you named:

1. **No drill-through.** From a chapter in Manuscript you can't say "open *this* chapter in Studio/Review." You leave the chapter, switch tabs, and re-find it.
2. **Chapter is stuck inside Studio.** Once in Studio you can't easily move to another chapter — the chapter you're on is implicit, not a first-class, switchable context.
3. **Lost the self-contained chapter.** The old model treated a chapter as a little workspace that owned edit→assign→render→review. The tab row dissolved that container.

Root cause: **chapter is not modeled as a persistent context.** It's re-selected implicitly per tab.
Every good option below makes "the chapter I'm working on" an explicit, switchable thing.

---

## 2. The entities and where they live

Any layout has to give each of these a sensible home:

| Function | Natural scope | Today | Friction |
|----------|--------------|-------|----------|
| Import / structure manuscript | **Book** | Manuscript | fine |
| Chapter list & status | **Book** | Manuscript | fine, but it's the only on-ramp to a chapter |
| Edit chapter text | **Chapter** | Manuscript (drill-in) | can't continue into assign/render |
| Cast: characters → voices | **Book** (global — one voice per character, **no per-chapter override**) | Casting | fine |
| **Scratch character/voice** (chapter-local **and** unsaved = one concept) | **Ephemeral / chapter** | *nowhere* | must pollute the book cast or save a throwaway |
| Create / tune a voice | **Global** (voice library) | Voices rail | fine |
| **Voice variations** (emotion variants of a voice) | defined at **voice** level, chosen **per segment** | *nowhere* | no way to shift emotion within a chapter |
| Segment & assign speakers | **Chapter** | Studio | locked to current chapter |
| Render chapter | **Chapter** | Studio | same |
| Review / annotate / re-render section | **Chapter** | Review | same |
| Assemble & publish | **Book** | Publish | fine |

> **Owner decisions (locked):**
> - **Character = a favorited voice + an alias** (the character's name). Lives in the **book cast**; book-global; **one voice per character, no per-chapter override**.
> - **Temp voice = a library voice used as-is**, found by **searching the full voice list**, assigned to lines **without** an alias. Ephemeral / chapter-local. **Promote** = give it a name → it becomes a character. (This is the one "scratch" concept — there is no separate scratch *kind* of voice, just "named character" vs "unnamed temp voice".)
> - **Voices carry variations** — a voice has a **default plus named variations** (emotion *or any* vocal variant — that's why it's "variation", not "emotion"). Assigning a voice exposes default + its variations; you **assign a variation to a span/segment**. Book-global voice→character binding; variation chosen per assignment. (Worked before, regressed — **B4**.)

Three things no current tab owns fall out of this:
- **Scratch (chapter-local + unsaved) characters/voices** — created inline, promotable later.
- **Per-segment emotion** — picking a voice's variation on an individual segment.
- A home for both that is reachable *in the moment* while assigning — not a trip to another tab.

---

## 3. Cross-cutting requirements (true for every option)

- **C1 — Chapter as a sticky context.** A single "active chapter" persists across chapter-scoped views; a switcher (prev/next + dropdown/list) is always reachable without leaving what you're doing.
- **C2 — Drill-through.** From the chapter list (or any chapter), one action takes you into that chapter's Edit / Studio / Review.
- **C3 — Stage continuity.** Inside a chapter you can move Edit → Studio → Review without re-selecting the chapter.
- **C4 — Inline cast/voice/emotion.** While assigning a speaker you can, without leaving the text: (a) add a **scratch** character/voice (chapter-local + unsaved, badged, promotable later); (b) pick the character's book voice; and (c) choose a **variation (emotion)** for *this segment* from that voice's variants.
- **C5 — Clear scope signals.** It's always obvious whether an action affects the whole book or just this chapter.

Each option below is scored against C1–C5.

---

## 4. The options

### Option A — Drill-in: Book Shell → Chapter Workspace

Two explicit levels. The book level is small; the chapter is its own workspace.

```
BOOK LEVEL (tabs):   Overview · Cast · Publish
                        │
   Overview = book metadata + chapter list (status per chapter)
                        │  click a chapter ──►
CHAPTER WORKSPACE:   ‹ Ch 4: A Vale at Dusk ▾ ›   [◄ prev] [next ►]   (× back to book)
   sub-tabs:         Text · Studio · Review
```

- Clicking a chapter in Overview opens the **Chapter Workspace** — a focused screen that owns Text/Studio/Review for that one chapter, with a chapter switcher in its header and a breadcrumb back to the book.
- This is the closest to the **old self-contained chapter**, but with book-level concerns (Cast, Publish) lifted cleanly above it.

**Handles:** C1 ✅ (switcher in workspace header) · C2 ✅ (click chapter → workspace) · C3 ✅ (sub-tabs) · C4 ⚠️ (needs an inline cast panel added) · C5 ✅ (two levels = obvious scope).

**Pros**
- Strong, legible scope separation; matches the mental model "I'm working *on a chapter* now."
- Restores the self-contained feel; per-chapter actions have an obvious home.
- Book level stays uncluttered.

**Cons**
- One extra navigation level (book → chapter).
- Jumping from *Ch 4 Review* to *Ch 7 Text* is: switch chapter (stays in Review) → switch sub-tab. Two moves.
- "Overview" must carry both book metadata and the chapter list well, or it becomes a junk drawer.

---

### Option B — Two axes: persistent Chapter rail × scope-grouped tabs

Make chapter and stage **independent axes**. A chapter list rail is always visible; the tab bar is grouped by scope.

```
┌───────────┬─────────────────────────────────────────────┐
│ CHAPTERS  │  BOOK: Manuscript · Cast · Publish           │
│ ▸ Ch1 ✓   │  CHAPTER (Ch 4): Text · Studio · Review      │
│ ▸ Ch2 ✓   ├─────────────────────────────────────────────┤
│ ▸ Ch3 ◐   │                                             │
│ ▶ Ch4 ●   │   (selected tab, scoped to selected chapter) │
│ ▸ Ch5 ○   │                                             │
└───────────┴─────────────────────────────────────────────┘
```

- The left rail lists every chapter with status; clicking one sets the active chapter **without changing the current tab** (switch chapter, stay in Studio).
- The tab bar is split into a **Book** group and a **Chapter** group so scope is visible at a glance.
- This is the smallest change from today — the rail already half-exists.

**Handles:** C1 ✅ (rail always there) · C2 ✅ (click chapter, pick a chapter tab) · C3 ✅ (chapter tabs persist across chapter changes) · C4 ⚠️ (add inline panel) · C5 ✅ if the two tab groups are visually distinct, ❌ if they blur together.

**Pros**
- **Fastest chapter switching** — always one click, from anywhere.
- No added navigation depth; flat and quick.
- Chapter and stage are orthogonal, which matches how you actually move around.
- Closest to the current code; lowest build cost.

**Cons**
- Two scopes on one screen; relies entirely on visual grouping to keep "book vs chapter" clear.
- The rail costs horizontal space (mobile needs it to collapse to a drawer).
- Clicking a *book* tab while a chapter is selected can feel ambiguous ("did I leave the chapter?").

---

### Option C — Chapter pipeline board (status hub) + stage jump

Replace "Manuscript" with a **board** that shows every chapter's position in the pipeline, with direct jump-in links.

```
CHAPTERS                Draft → Cast → Studio → Review → Rendered
Ch 1  The Hollow Road   ●──────●──────●────────●────────●   [Published]   ▸Text ▸Studio ▸Review
Ch 4  A Vale at Dusk    ●──────●──────◐ 60%────○────────○   [Studio]      ▸Text ▸Studio ▸Review
Ch 7  Whispers...       ●──────○──────○────────○────────○   [Drafting]    ▸Text ▸Studio ▸Review

Top-level:  Chapters (this board) · Cast · Publish
```

- The board is the hub: each row shows status across stages and has inline "jump to stage" links — go straight from here into *Ch 4 → Studio*.
- Book-level Cast and Publish are separate top destinations.

**Handles:** C1 ⚠️ (you return to the board to switch; a mini-switcher inside a stage helps) · C2 ✅ (direct stage jump from the board) · C3 ✅ (once in a chapter, stage tabs) · C4 ⚠️ (inline panel) · C5 ✅.

**Pros**
- Best **overview** — see what's done and what's blocked across the whole book at a glance.
- Direct jump from board into any stage of any chapter (great for "what needs attention?").
- Status-driven; scales well to many chapters.

**Cons**
- The board is a place you keep coming *back to*; less of a continuous editing flow.
- For a small book the board is overkill.
- Needs real per-chapter status data to not look fake.

---

### Option D — Single editor, mode lenses (Write / Cast / Listen)

One chapter editor screen; the **same text** stays put while a mode toggle swaps the interaction layer.

```
‹ Ch 4 ▾ ›  [◄ ►]                         Mode: ( Write | Cast & Assign | Listen )   [Render ▾]
┌──────────────────────────────────────────────┬───────────────┐
│  …chapter prose, re-skinned per mode…          │  CAST PANEL   │
│  Write:  plain editable text                   │  (dockable)   │
│  Cast:   speaker tints + click-to-assign       │  characters   │
│  Listen: follow-playback + annotate            │  + voices     │
└──────────────────────────────────────────────┴───────────────┘
Top bar also reaches: Book Cast · Publish
```

- The constant is the text; **Write / Cast & Assign / Listen** are lenses over it. Render controls are always present.
- A dockable **Cast panel** is available in every mode — add a scratch character/voice inline, and per segment pick `Character ▾ · Emotion ▾` (the voice's variation). This directly answers "I added a character while writing" and "this line should sound urgent."

**Handles:** C1 ✅ (header switcher) · C2 ✅ (open chapter → editor) · C3 ✅ (modes, no navigation) · C4 ✅✅ (the docked panel *is* the inline-cast answer) · C5 ⚠️ (book vs chapter cast must be clearly separated within the panel).

**Pros**
- **Least context switching** — your place in the text never resets; you just change lens.
- The text-is-constant model is elegant and fast for iterative author/edit/listen loops.
- Inline cast panel solves C4 better than any other option.

**Cons**
- Dense; risks overloading one screen (modes + panel + transport + render).
- Book-level concerns (manuscript structure, publish) still need a home outside this editor.
- Biggest departure from the current build → most work, most risk.

---

### Option E — **Recommended hybrid:** Book Home + Chapter Workspace + docked Cast/Voices panel

Option A's clear two-level scope, plus Option B's instant switching, plus Option D's inline cast panel.

```
BOOK HOME (book-level only)
   tabs:  Overview · Cast · Publish
   Overview = book metadata + chapter board (status, + New chapter)
        │  open a chapter ──►
CHAPTER WORKSPACE  (everything chapter-scoped lives here)
   header:  ‹ Ch 4: A Vale at Dusk ▾ ›   [◄ prev] [next ►]   ↩ Book
   stages:  Text · Studio · Review        ── stage persists when you switch chapters
   right:   ⟨ Cast & Voices panel ⟩  (collapsible; Book cast + Scratch)
```

- **Book Home** owns only book-level things; its Overview doubles as the chapter board (Option C's status, lighter).
- **Chapter Workspace** owns Text/Studio/Review for the active chapter, with a always-present chapter switcher (prev/next + dropdown) and a "↩ Book" exit. Stage selection persists across chapter switches.
- A **docked Cast & Voices panel** rides along in the workspace (collapsible), with **two** buckets: **Book cast** (character → one global voice) and **Scratch** (chapter-local + unsaved, each with "Promote to book cast / library"). Available while editing or assigning.
- The **per-segment assign control** is `Character ▾ · Variation ▾` — character resolves to its book voice; the **Variation** picker chooses that voice's default or one of its named variations for *that span only*. (Same control where you read the line.)

**Handles:** C1 ✅ · C2 ✅ · C3 ✅ · C4 ✅ · C5 ✅ — the only option that clears all five.

**Pros**
- Clear scope (two levels) *and* fast chapter switching (header switcher, stage sticky).
- Inline character/voice add — including throwaway scratch voices — right where you assign.
- Chapter-local cast finally has a home, keeping the book cast clean.
- Degrades gracefully: collapse the panel for a focused editor; the Overview board scales to long books.

**Cons**
- Most moving parts to design well (panel scoping, switcher, board).
- The Cast & Voices panel must make book vs chapter vs scratch unmistakable or it muddles C5.
- More than a tab rename — a real restructure (though it reuses Studio/Review you already have).

---

## 5. Side-by-side

| | A Drill-in | B Two-axis rail | C Pipeline board | D Mode lenses | **E Hybrid ★** |
|---|---|---|---|---|---|
| C1 Sticky chapter | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| C2 Drill-through | ✅ | ✅ | ✅ | ✅ | ✅ |
| C3 Stage continuity | ✅ | ✅ | ✅ | ✅ | ✅ |
| C4 Inline cast/scratch voice | ⚠️ | ⚠️ | ⚠️ | ✅✅ | ✅ |
| C5 Scope clarity | ✅ | ⚠️ | ✅ | ⚠️ | ✅ |
| Chapter-switch speed | ◐ | ⚡ | ◐ | ⚡ | ⚡ |
| Whole-book overview | ◐ | ◐ | ⚡ | ✗ | ⚡ |
| Build cost vs today | low–med | **low** | med | high | med–high |
| Departure from current | medium | small | medium | large | medium |

★ = recommended. **B** is the cheapest meaningful win if you want minimal change; **E** is the best end-state; **D**'s mode-lens idea and **C**'s status board are the two ideas worth stealing into whatever you pick.

---

## 6. Converged target (owner-driven) — "open the book, work the page"

The owner's workflow collapses the option space: **assigning, rendering, and listening are the same
process on the same text**, so there is **no separate Review screen**. The design is the book
metaphor — a Library of books, each book a set of chapters (a table of contents), and a single
**Chapter Workspace** you "flip to" and work top-to-bottom.

### 6.1 The loop this must serve (owner's words, as steps)

1. Open a book from the Library → it opens to its **Contents** (table of contents).
2. Pick the chapter being worked → flip to that page. It **resumes where I left off** (scroll / **bookmark**).
3. Read the next paragraph, decide who's speaking, **assign a voice** by selecting all the lines in that area for that character.
4. Need someone new? **Add a character** (a favorited voice + alias) **or grab a temp voice** (search the full voice list, no alias) — via a **slide-out** that keeps the text in view.
5. Optionally set the **emotion** (voice variation) for a line.
6. Either render this section now and **preview it**, **or** keep assigning down the whole chapter and render later.
7. When rendering, watch the **highlight animate block-by-block and listen as it's produced** — catch an error and **stop to fix it immediately**.
8. Or render the whole chapter, hit **play**, and when something sounds wrong, **stop and re-render that section** until it's right.
9. If a word is mispronounced, **edit its spelling phonetically right there** — without losing any speaker assignments — and re-render that bit.
10. Chapter done → return to **Contents** to see what's next and the **status orb** of every chapter at a glance (queued / rendering / done / error).
11. When **every chapter is green**, **publish from Contents** — the index is where the "is the book finished?" decision is made, so the Publish trigger lives right there.

### 6.2 The screen — one unified Chapter Workspace (replaces Studio **and** Review)

```
‹ Contents ▾  Ch 4: A Vale at Dusk ›   [◄ prev] [next ►]   🔖 bookmark      [Render ▾: section | chapter]
┌──────────────────────────────────────────────────────────┬───────────────────────┐
│  the chapter prose — ONE scrolling, highlighted surface     │  ⟨ slide-out ⟩        │
│                                                            │  Cast & Voices        │
│  • read & resume (bookmark)                                │  ─ Book cast (chars)  │
│  • select lines → assign character / temp voice            │     = fav voice+alias │
│  • per-segment  Character ▾ · Emotion ▾                    │  ─ Search all voices  │
│  • render section/chapter → SAME highlight animates as      │     (temp, → Promote) │
│    audio is produced; listen along; tap a line to play      │                       │
│  • hear a bad word → edit spelling inline, assignments kept │  (collapses to give   │
│                                                            │   text full width)    │
└──────────────────────────────────────────────────────────┴───────────────────────┘
```

The highlighted-prose surface does **triple duty** with one mechanism (the follow-scroll we already
built): **reading position**, **render progress** (highlight marches as each block renders), and
**playback** (highlight follows audio; tap to play from a line). That triple duty is *why* a separate
Review tab is redundant.

Supports both rhythms from step 6: **assign-all-then-render** (render top-to-bottom, stop on error)
and **section-by-section** (assign a block, render, preview, move on).

### 6.3 Resulting information architecture

```
Library  ──open──►  BOOK
                     tabs:  Contents · Cast · Publish        ← book-level
                     │  Contents = TABLE OF CONTENTS + COMMAND CENTER:
                     │    • every chapter with its status orb (queued/rendering/done/error)
                     │    • bookmark / "what's next", book metadata, manuscript import
                     │    • ► Publish readiness — lights up & triggers when all chapters green
                     │  open a chapter ──►
                   CHAPTER WORKSPACE  (the single screen in 6.2)   ← chapter-level
                     header: Contents ▾ switcher + prev/next + bookmark
```

- **Book level:** `Contents` (the hub — see 6.6), `Cast` (characters = favorited voices + aliases), `Publish` (assembly detail).
- **Chapter level:** the one Workspace — edit, assign, emotion, render, preview, fix — no sub-tabs, no Review.
- Switch chapters anytime from the header (`Contents ▾` or prev/next); the bookmark brings you back to where you stopped.

### 6.6 Contents as the hub — status overview & publish launch

Contents is where the owner *lives between chapters*: pick what's next, watch progress, and decide the
book is done. So it carries:

- **A status orb per chapter** — reuse the existing `StatusOrb` (DRY; same component the queue/rail use): queued · rendering (with %) · done/green · error. The owner scans this to see "which chapters still need rendering."
- **Bulk actions from the index** — "Render all remaining" (kick every not-green chapter) and jump-into-error.
- **Publish readiness** — a Publish affordance that is **dimmed until all chapters are green**, then activates ("Book ready — Publish ▸"). The *decision and trigger* happen here, on the screen that shows the whole book is finished; the `Publish` tab holds the assembly/export detail once triggered.

This makes the flow a closed loop: **Contents → work a chapter → back to Contents → … → all green → Publish**, all launched from the one screen that shows the whole-book state.

### 6.7 Cast & Voices panel — chapter-aware organization

When the slide-out is open inside a chapter, order the cast so the characters you need are at the top
and the long tail is out of the way. **Three collapsible tiers:**

1. **In-chapter favorites** (top, always open) — named/book characters **already used in this chapter**, auto-surfaced + starred. Picking an as-yet-unused book character from below promotes it into this tier (it becomes a chapter favorite).
2. **Chapter-scoped characters** (below favorites, collapsible) — temp characters created for this chapter, default-named e.g. **`Ch4 · Character 1`** (chapter number + index) so they're obviously chapter-local. ~10 here is normal (one-off background voices that appear once).
3. **All other characters** (bottom, collapsed by default) — the rest of the book roster not yet used here; pick one → it jumps to tier 1.

```
★ In this chapter        (favorites — used here, starred)      [open]
   Maren · Dov · Narrator
▸ Chapter-scoped         (Ch4 · Character 1, Ch4 · Character 2) [collapsible]
▸ Everyone else          (full book roster, not yet used here)  [collapsed]
```

**Backing data:** each character tracks the **chapters it appears in** (computed from assignments, or
encoded on the alias). That drives tiers 1 & 3 and lets the cast tab "bring this chapter's characters
to the top." **Promote** a chapter-scoped character → it becomes a named book character (leaves tier 2,
joins the roster). This keeps a 30-character cast navigable with zero scrolling for the 3–5 you're
actually using on the page.

### 6.8 Bookmarks & in-chapter navigation

- **Auto "last-edited" bookmark** — one per chapter, **moves with edits automatically**; opening a book/chapter resumes there. (Book also remembers the last chapter opened.)
- **Named bookmarks (a collection)** — the author can bookmark + label any spot (tag a scene) for quick reference. A bookmark keys on **(book, chapter, segment)** so it survives text edits (anchored to the segment, not a scroll offset).
- **Global bookmark collection across books** — all named bookmarks in one list, each shown as **"«Book title» · «Chapter» · «user label»"**, so you can jump anywhere from one place.
- **Jump to next unrendered section** — a control that moves to the next section whose audio isn't `done`. Render failures are **not** a special resume mode: a failed render just fails (surfaced on the queue + the chapter orb); this nav simply walks you to the gaps to fix/re-render them.

### 6.4 New capabilities this introduces (beyond moving tabs around)

| Capability | Why the workflow needs it |
|------------|---------------------------|
| **Bookmark / resume** | "scroll to where I left off" across sessions and chapter switches. |
| **Slide-out Cast & Voices** | add character / search temp voice **without leaving the text**. |
| **`Character ▾ · Variation ▾` per span** | apply a voice's default or a named variation to individual spans. |
| **Render-with-follow-highlight** | watch + listen as each block is produced; stop on error. |
| **Inline phonetic edit, assignments preserved** | fix mispronunciations in place without re-assigning speakers. |
| **Promote temp voice → character** | a temp voice that earns a name joins the book cast. |
| **Contents status hub + publish readiness** | scan every chapter's orb between chapters; publish becomes available (and is triggered) from Contents once all are green. |

### 6.5 Incremental path (each step shippable, and clear of the player-bar/minimap work)

1. **Merge Studio + Review into one Chapter Workspace** — drop the Review tab; reuse the follow-scroll already built for both render-progress and playback on the Studio prose.
2. **Add the chapter switcher + bookmark** to the workspace header (sticky chapter context; fixes the "stuck in Studio / can't change chapters" pain).
3. **Rename/restructure book tabs to `Contents · Cast · Publish`**, with drill-through from Contents into the workspace.
4. **Slide-out Cast & Voices panel** with character add + full-voice search (temp) + Promote; wire the `Character ▾ · Emotion ▾` segment control.
5. **Inline phonetic edit** that re-renders a section while preserving assignments.
6. **Make Contents the hub** — per-chapter `StatusOrb` (reused), "render all remaining," and a **Publish-readiness** trigger that activates when every chapter is green. Closes the loop end-to-end.

---

## 7. Resolved & remaining

**Resolved by owner:**
1. ~~Chapter-local vs scratch~~ → **one concept.** Character = favorited voice + alias; temp voice = unnamed library voice; promote a temp voice to make it a character.
2. ~~Per-chapter voice override~~ → **no.** Cast is book-global; one voice per character.
3. ~~Separate stages?~~ → **No separate Review.** Assign + render + listen + fix are one process on one **Chapter Workspace** (§6). Studio and Review merge.
4. ~~Manuscript import location~~ → **Book → Contents** (table of contents + import + status).
- **New model facts:** voices have **emotion variations** (chosen per segment); **bookmark/resume**; render shows a **follow-highlight animation** you can listen along to; **inline phonetic edits** must preserve assignments.

5. ~~Chapter switcher form~~ → **~16 chapters/book** → `Contents ▾` dropdown (mini-TOC with orbs) + prev/next in the header; full board on Contents. No permanent rail.

**Resolved (round 3):**

6. ~~Bookmark granularity~~ → bookmarks key on **(book, chapter, segment)**. An **auto "last-edited" bookmark** moves with edits; plus **named bookmarks in a collection** (tag a scene). A **global cross-book collection** labels each as **"«Book» · «Chapter» · «label»"**. (§6.8)
7. ~~Render-on-error~~ → **no resume/restart logic.** A failed render simply fails (already handled by the queue) and shows on the chapter orb; just add **"jump to next unrendered section."** (§6.8)

Everything is answered. See **§8** for traceability of the deeper questions.

---

## 8. Clarifying questions & edge cases

> **Answered in §9** (owner answers, grounded in the real `app/` + `frontend/src/` code). Kept here for traceability. **§10 = real bugs to fix. §11 = angles merged from the other agent's options doc.**

Each has my **recommended default in bold** so they can be confirmed quickly. Grouped by area.

### 8.1 What *is* a segment?
- **Q1.** Is a segment a **sentence**, a **contiguous same-speaker run**, or something finer? This is the unit of highlight, timeline, assignment, and re-render. Recommend **sentence-level by default, with sub-sentence splits when a line mixes speakers** (e.g. `"Run," she said.` → dialogue + tag), which Studio already supports via text-selection.
- **Q2.** Default speaker for unassigned text → **Narrator**? (So a chapter is renderable before you touch it.)

### 8.2 Assigning
- **Q3.** How do you "select all the lines in an area for a character" — **drag across a range**, shift-click first/last, or click each? Recommend **drag-select a range, then one click to assign**.
- **Q4.** Multi-speaker line — confirm sub-line assignment is needed (it exists in Studio today), or is line-level enough for the new workspace? Recommend **keep sub-line**.

### 8.3 Voices, characters, emotions
- **Q5.** Temp-voice search — find voices by **name only**, or also by **attributes** (gender/age/style)? Recommend **both** (search + filter), reusing the Voices browser.
- **Q6.** Promote temp → character — does promoting also **save the voice to the global library**, or only create the book-cast alias pointing at an already-global voice? Recommend **alias only** (the voice is already global; promote just names it for this book).
- **Q7.** Emotion variations — are they a **fixed set per voice defined in the voice itself** (neutral/urgent/whisper/…), and **does every voice have them**? Recommend **per-voice list; hide/disable the Emotion picker when a voice has none; default = neutral**.
- **Q8.** Can two characters share one underlying voice (two aliases → same voice)? Recommend **yes**.

### 8.4 Pronunciation / inline edit (important)
- **Q9.** When you "fix the spelling phonetically," should that change the **visible manuscript text**, or a **hidden pronunciation override** that leaves the printed prose intact? Recommend a **pronunciation-override layer** (the existing `safeText` concept) so "kolonel" never shows in your book. Confirm.
- **Q10.** Is the override **per-engine** (XTTS vs Voxtral pronounce differently — `safeText` is per-engine today) or one override regardless of engine? Recommend **per-engine, falling back to a shared override**.

### 8.5 Rendering & invalidation
- **Q11.** "Render this section" unit — your **current selection**, the **paragraph**, or **from here to end**? Recommend **selection if any, else the paragraph**, plus explicit "Render chapter."
- **Q12.** After you edit text or change an assignment, should the system **detect exactly which segments changed and re-render only those** (leaving the rest)? Recommend **yes — segment-level invalidation**; the chapter orb goes "needs re-render" until clean.
- **Q13.** Changing a character's voice (or a voice's variation) **after** chapters are rendered — auto-mark every affected chapter "needs re-render"? Recommend **yes**, surfaced as a stale/amber orb on Contents.
- **Q14.** Background rendering — while you edit chapter 4, chapter 7 can render in the queue; the Workspace follow-highlight animates only for the chapter you're viewing, Contents orbs show the rest. Confirm that's desired.

### 8.6 Status orbs (Contents)
- **Q15.** Confirm the status set to distinguish: **draft / not-started · queued · rendering (%) · done (green) · error · needs-re-render (stale)**. Anything missing?
- **Q16.** Partial chapter (some segments rendered, some not) — orb shows **% complete**? Recommend **yes**.

### 8.7 Publish
- **Q17.** Publish output = **M4B with chapter markers**? Where do **cover + metadata** get set — on Contents, the Cast/Publish tab, or book creation? Recommend **a book-settings area reachable from Contents**.
- **Q18.** Ever need to publish a **partial book / sample** (not all green), or is all-green a hard gate? Recommend **hard gate, with an explicit "export sample" escape hatch**.
- **Q19.** Re-publish after a later fix — overwrite, or **versioned output**? Recommend **overwrite with a timestamped backup** (matches existing backup row).

### 8.8 Ephemeral state persistence
- **Q20.** Temp voices and per-segment emotion choices must survive render + reload. Confirm they're **persisted with the book/project** (just not promoted to the global library) — "ephemeral" means *not global*, not *not saved*.

### 8.9 Navigation niceties
- **Q21.** From inside the Workspace, do you want the **mini-TOC (`Contents ▾`) as a slide-over** so you can switch chapters without losing your place, in addition to "↩ Contents"? Recommend **yes**.
- **Q22.** On "next chapter," **auto-save assignments** and land at that chapter's **bookmark** (or top if none)? Recommend **yes**.

---

## 9. Answers (locked by owner) — grounded in the existing code

References are to the **real app**, not the mock. These supersede the §8 defaults where they differ.

- **A1 — What a segment is (corrects §8.1).** A segment is **the largest block that renders to one audio file**: a **contiguous same-speaker run, capped by the engine's text-chunk limit** — XTTS 500 chars, Voxtral much larger. So a segment ranges from a single word to 500+ chars; **a speaker change always starts a new segment**. *Not* sentence-based. Code: speaker/character boundary split in `app/domain/chunk_groups.py:67-68`; per-engine cap `get_text_chunk_limit()` in `app/tts_server/.../behavior.py` (default `DEFAULT_ENGINE_TEXT_CHUNK_LIMIT = 500`). Segment shape (`app/db/segments.py:82-218`): `id, chapter_id, segment_order, text_content, sanitized_text, character_id, speaker_profile_name, audio_file_path, audio_status (unprocessed|processing|done|error|failed), audio_generated_at`. **The highlight/timeline/render unit is this segment.**

- **A2 — Default speaker = Narrator for the whole book**, then selecting a speaker for a span retains the right voices. (See A7.)

- **A7 — Assignment model.** *Current:* "paint" — arm a name in the CastPalette, click a sentence to reassign (`frontend/src/hooks/chapter/useChapterAssignments.ts:19-62`, optimistic update → POST with `base_revision_id`). Has a concurrency bug (**B2**). *Target (future, owner-requested):* **range/span selection** — select an arbitrary run of words (can cross sentences or be only part of one) and assign a voice. Enables "quote in the character's voice + the narrator naming that character" at fine grain. Narrator is the book-wide default; assigning a speaker to a span overrides within it.

- **A8 — Two characters may share a voice** (it's just an alias). *Optional nicety:* a warning "this voice is also assigned to «character»".

- **A9/A10 — Pronunciation: two mechanisms.**
  1. **One-time inline edit** of the text for a single spot (e.g. spelling out a number so it reads correctly).
  2. **Global per-word phonetic lexicon** — a word spelled phonetically *internally* so that at safe-text generation it's swapped everywhere. Fixes **every** occurrence — ideal for a name that's always mispronounced.
  Code reality: "safe text" = `sanitized_text` (one stored version per segment; engines filter *which* sanitize categories run via manifest `behavior.sanitize_categories`, so it's effectively per-engine at apply time — `app/utils/text/textops_cleaning.py:333`). **The per-word lexicon is scaffolded but NOT implemented** — `app/domain/text/pronunciation.py` `build_pronunciation_overrides()` raises `NotImplementedError`. That scaffold is the hook to build mechanism #2 on.

- **A11 — "Render this section" already exists.** Studio's by-the-numbers view numbers each section; sections are continuously evaluated, and render-section acts on them. (Confirms a "section" = a render batch of contiguous same-speaker, cap-bounded segments.)

- **A12/A13 — Voice change must invalidate + delete the audio.** On a speaker/voice change the segment's rendered audio should become **non-playable (deleted), not stale-but-listenable**. Code path exists — `app/db/segments.py:260-388` (`update_segment` sets `audio_status='unprocessed'`, clears path, deletes file) and the assignment SQL CASE in `app/domain/chapters/operations.py:194-206`. **It's currently broken — see B1.**

- **A15/A16 — Status orb already does what's wanted.** `frontend/src/components/ui/StatusOrb.tsx`: fill color = status (error→red, done+wav→green, stale/stuck→amber, rendering/queued→light, else neutral); **inner arc = doneSegments/totalSegments %** (amount of rendered audio); outer ring = M4A/assembly state. Reuse as-is; no new states needed.

- **A20 — Temp voices persist with the book.** Implement as **secondary / temporary characters** (auto-named, e.g. `TempGuard1`), saved with the book (a pointer to a global voice is fine); they are not promoted to the main cast. **Hard requirement: organize the cast as primary (top-level) vs secondary (temp/background) characters.** Promote = move a secondary character up / give it a real name.

- **Autosave already exists** — assignments save immediately (optimistic POST). Text edits debounce 1500ms (`frontend/src/pages/Book/lib/useChapterText.ts:58-75`). ⚠️ See **B3** (exit-before-debounce may not flush).

- **A9b — Lexicon scope (owner call deferred to me).** The phonetic lexicon is **per-book by default**, but **each entry carries a scope tag: `book` / `series` / `global`**, so a fix can be shared upward (a series name, a universally-mispronounced word). *Interface:* entries live in a book-level lexicon list with a per-entry scope selector; series/global entries are inherited (shown read-only with an "inherited" badge, editable at their own level). **Resolution = most-specific-wins:** a `book` entry overrides `series` overrides `global` for the same word, so a book can always override an inherited pronunciation. Build on the `app/domain/text/pronunciation.py` scaffold.

- **A-Variations (supersedes "emotion" everywhere).** A voice has a **default plus named variations**; "variation" because they need not be emotions — any vocal variant. Picking a voice exposes default + variations; you **assign one to a span/segment** via `Character ▾ · Variation ▾`. **This worked previously and regressed — see B4.**

- **A20b — Temp character naming & cast organization.** A temp character added in a chapter gets a **default chapter-scoped name** like `Ch4 · Character 1` (chapter # + index) — clearly chapter-local; ~10 per chapter is normal. **Each character tracks the chapters it appears in** (from assignments / on the alias). The Cast panel orders **chapter-aware** in three collapsible tiers — in-chapter favorites (starred) → chapter-scoped temps → the rest of the roster — detailed in **§6.7**. Promote a chapter-scoped character to make it a named book character.

---

## 10. Bugs to account for (found while grounding the answers)

- **B1 — Voice change leaves audio playable (should delete/invalidate).** The invalidation path in `app/db/segments.py` is gated on `audio_status` (≈ line 324 `!= "done"`, line 344 `if updates.get("audio_status") == "done"`). The likely regression: the speaker/voice-change caller no longer passes an `audio_status` update, so the file-cleanup branch is skipped and the old audio stays. **Fix:** invalidate + delete whenever `character_id` or `speaker_profile_name` changes, independent of whether `audio_status` is in the update.
- **B2 — "Changed by somebody else" when painting adjacent sentences.** Reassigning one sentence recomputes its **section's** aggregate status (`_aggregate_status`, `app/domain/chapters/.../helpers.py:59-73`), which changes the section's `base_revision_id`; the next click in the *same* section then fails the `RevisionMismatch` guard (`app/domain/chapters/operations.py:179-181`) → 409. **Fix direction:** scope the revision check to the affected span/segment, **or** return the new revision id in the assignment response and have the client adopt it so consecutive paints don't 409. (Related: status-regression guard `app/db/state_job_guards.py:57-82`.)
- **B3 — Verify text autosave-on-exit.** Exploration found `useChapterText.ts` *cancels* the 1500ms debounce on unmount with **no flush** — a fast exit could drop text edits. The owner believes exit-save was fixed; verify it still works (it may flush via a route-leave/`beforeunload` handler elsewhere) and restore it if it regressed.

- **B4 — Voice variation assignment regressed.** A voice's variations (default + named variants) used to be assignable to a span/segment and no longer apply. Find where variation selection was wired into assignment/synthesis and why it stopped taking effect (check the segment's stored voice/variation field and whether the synthesis path still reads it).

*(B1, B2, B4 are pre-existing real-app bugs, separate from the mock redesign — worth fixing regardless of the IA work.)*

---

## 11. Angles merged from the other agent's options doc (`book_chapter_ia_options.md`)

- **Adopt — Backups / Snapshots as a book-level surface.** We had omitted it. Versioned output / project snapshots belong beside Cast & Publish.
- **Adopt — slim persistent book header** (cover · title · runtime · Edit pencil). Metadata is context, not a workflow step; don't spend a tab on it (answers Q17).
- **Consider — rail-driven book nav (their Plan D).** The app already has a left rail nesting the book tree; putting book destinations (`Contents · Cast · Publish · Backups`) + the chapter list *in the rail* avoids a **second tab strip**. Compatible with "Contents = hub" (Contents stays the default and the publish launcher). Fallback: sub-tabs (their Plan A).
- **Naming.** They argue "Chapters" over "Manuscript"; we use **Contents** as the hub name with the chapter list inside it — keep that. (Either reads fine; "Manuscript" is retired.)
- **Divergence noted.** Their doc still recommends **Studio ⇄ Review as two modes** (their R1). Our owner-driven design **merges them — no separate Review** (their R2 direction). The owner's workflow ("playback, assigning, rendering are the same process") wins.
- **Their spot-voice sub-decision is resolved** by A20: a one-off voice becomes a **chapter-local secondary/temp character**, not just a span attachment.

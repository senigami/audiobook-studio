# 003 — Book/Chapter IA port + lost-feature restoration (W4) — PRIMARY redesign

**Owner decisions (06-20):**
- The **two-level Book + Chapter workspace IA is confirmed as the target.** It **replaces the live
  5-stage pipeline**, which "doesn't work right."
- **A design review of the 5-stage pipeline is pending** (owner-run). **Start the build after that
  review** so the new IA reflects its conclusions.
- The redesign **carries the lost-feature restoration**: RST-1..8 (from `simplification/07`) are
  acceptance criteria of this port — "as long as we know it's coming," nothing gets dropped.

**Goal:** restructure the live app from the (broken) 5-stage pipeline to the two-level IA (Book
workspace + Chapter workspace, Studio↔Review modes, chapter pinned header, prev/next), **restoring the
lost features in the process**.
**Authoritative sources:** [`book_view_redesign/`](../../book_view_redesign/README.md) (Track A, 06-17)
+ [`book_view_ia_proposal.md`](../../book_view_ia_proposal.md) (locked IA, 06-17) +
[`simplification/07`](../../simplification/07_restore_lost_functionality.md) (RST checklist).
**Supersedes:** `book_chapter_ia_proposal.md` (06-16), `book_chapter_ia_options.md` (archived).

**Open items — IA port:** book_view_redesign Track A tasks 005–013 (book nav restructure, Contents
hub, merge Studio/Review into a Chapter Workspace, chapter switcher + last-edited bookmark,
chapter-aware cast tiers, character/variation assign, range-span assignment, jump-to-next-unrendered,
pronunciation inline edit + lexicon) — done in the demo mock, **not yet ported to the live app**.

**CARRIED lost-feature checklist (must be satisfied by the port; from `simplification/07`):**
- RST-1 per-row live progress bar · RST-2 chapter play via **global player** · RST-3 audio download ·
  **RST-4 destructive-action guards (rebuild + large-chapter + delete/reset confirms)** · RST-5
  in-Studio source edit · RST-6 chapter default-voice picker · RST-7 engine-unavailable banner.
  *(RST-8 segment-aware player is delivered in 004 alongside this.)*

**Map links:** W4 (primary). **Carries RST-1..7; gates 005 DC-1b** (the port harvests from the old
trees, then they can be deleted — INV-2). RST-8 ↔ 004. Honors INV-1 (`site-shell-and-book-pipeline.md`),
INV-4 (preserve segment logic), INV-7.
**Dependencies:** **owner pipeline design review first**; then build. Coordinates with 004 (player).
**Acceptance:** live app on the two-level IA; **every carried RST item present** (checklist verified);
no feature regression; owner visual verification; `site-shell-and-book-pipeline.md` updated.
**Out of scope:** demo-mock work (done); audio-player internals (004); orphaned WIRE features (002).

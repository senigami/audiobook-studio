# 003 — Book/Chapter IA live-app port (W4)

**Goal:** port the two-level information architecture (Book workspace + Chapter workspace, Studio↔Review
modes, chapter pinned header, prev/next) from the demo mock into the live app. Track A of the redesign
is **done in the demo mock** but **not ported to production** `frontend/src/pages/Book/`.
**Authoritative source:** [`book_view_redesign/`](../../book_view_redesign/README.md) (Track A, 06-17)
+ [`book_view_ia_proposal.md`](../../book_view_ia_proposal.md) (the locked IA decision, 06-17).
**Supersedes:** `book_chapter_ia_proposal.md` (06-16) and `book_chapter_ia_options.md` (archived) per
the date rule.

**Open items:** book_view_redesign Track A tasks 005–013 (book nav restructure, Contents hub, merge
Studio/Review into a Chapter Workspace, chapter switcher + last-edited bookmark, chapter-aware cast
tiers, character/variation assign, range-span assignment, jump-to-next-unrendered, pronunciation
inline edit + lexicon) — all done in the mock, none ported live. Track B bug fixes are already shipped.

**Map links:** W4. **Shares the Book pipeline surface with W3 (002)** — the restored features (RST-*)
must land in this new IA, not the old 5-stage one, if the port goes first. Honors INV-1, INV-7.
**Dependencies:** ⚠️ **OWNER FORK (blocking):** (a) is the two-level IA still the target given the
5-stage pipeline already shipped? (b) sequence vs 002 — restore into current pipeline first, or fold
restoration into this port? Resolve before starting.
**Acceptance:** live app matches the locked IA; no regression of W3 restored features; owner visual
verification; `site-shell-and-book-pipeline.md` updated.
**Out of scope:** the demo-mock work (already done); audio-player internals (004).

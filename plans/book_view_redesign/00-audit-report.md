# State & Reconciliation — 2026-06-17

> **TL;DR:** The IA spec is complete and agreed; this is an execution plan, not an audit. Highest-leverage
> first move is **Track B (bugs B1–B4)** — they're real-app correctness issues, independent of the mock,
> and B1/B4 directly undermine the render/voice workflow the redesign is built around. The mock redesign
> (Track A) follows, sequenced around a concurrent worker in the mock.

## Scope

- **No audit pass was run.** The design was settled with the owner over several rounds and lives in
  [`../book_view_ia_proposal.md`](../book_view_ia_proposal.md) (§6 converged target, §9 locked answers,
  §10 bugs, §11 merged angles). This folder only sequences it.
- **Grounding sweep (read-only):** one `Explore` agent mapped the real-app systems the spec depends on
  (segments, invalidation, assignment/concurrency, status orb, autosave, pronunciation). Its file:line
  findings back the bug tasks below. The orchestrator authored the plan; task files were fanned out and
  spot-checked.
- **Dimensions skipped:** DRY/org/test-quality/UX audits — not applicable; we're implementing a known
  spec, not assessing an unknown codebase.

## What's healthy

- The **follow-scroll engine already exists and works** in the mock (`siteMockup/shared.tsx`
  `useChapterFollow` + `buildSegmentTimeline`), now shared by Studio and Review. The redesign reuses it
  for render-progress + playback — no new scroll machinery needed.
- **Status orb is already exactly what's wanted** (`frontend/src/components/ui/StatusOrb.tsx`): fill =
  status, inner arc = `doneSegments/total %`, outer ring = M4A. Reuse as-is.
- **Segment model is sound** (`app/db/segments.py`, `app/domain/chunk_groups.py`): segment = contiguous
  same-speaker run capped at the engine char limit; speaker change splits. The invalidation *logic*
  exists — it's just gated wrong (B1).
- **"Render this section" and assignment already exist** in Studio (by-the-numbers view).

## Findings

### Track B — real-app bugs (correctness; fix regardless of the redesign)

| ID | Sev | Location | Problem | Correction | Task |
|----|-----|----------|---------|------------|------|
| B1 | major | `app/domain/chapters/operations.py:194-206` (`save_script_assignments` bulk SQL); also `app/db/segments.py:260-388` | Changing a segment's voice/speaker should delete its rendered audio; it stays playable. **Likely root cause (per task 001 grounding):** `save_script_assignments` flips `audio_status` via direct bulk `UPDATE` and **never runs file cleanup**, so the on-disk WAV survives. | Route the assignment path's changed segments through the shared file-cleanup helper; delete audio on any `character_id`/`speaker_profile_name` change. | 001 |
| B2 | major | `frontend/src/hooks/chapter/useChapterAssignments.ts:19-62` (stale closure); server already returns fresh id (`operations.py:125`) | Painting one sentence recomputes its section's aggregate status → changes `base_revision_id`; the next click in that section 409s "changed by somebody else". **Mostly a client bug (per task 002 grounding):** the server already returns the new revision, but the hook reuses a stale `scriptViewData` closure. | Client adopts the returned `base_revision_id` synchronously (`useRef`) between paints; scoping the check to the span is the fallback. | 002 |
| B4 | major | voice variation selection → synthesis path (confirm during task) | A voice's variations (default + named variants) used to be assignable per span and no longer apply — regressed. | Find where variation selection was wired into assignment/synthesis and restore it; add a revert-checked test. | 003 |
| B3 | minor | `frontend/src/pages/Book/lib/useChapterText.ts:58-75` | Text autosave debounce appears to be cancelled on unmount with no flush; a fast exit may drop edits. Owner believes exit-save was fixed — may have regressed. | Verify; if no flush exists, flush pending text on unmount / route-leave. | 004 |

### Track A — mock IA gaps → tasks

| Area | Current mock state | Target (spec) | Task |
|------|--------------------|---------------|------|
| Book-level nav | 5 flat tabs mixing scopes (`Manuscript·Casting·Studio·Review·Publish`) | `Contents · Cast · Publish · Backups`; scope-clean | 005 |
| Contents | "Manuscript" chapter list | **Hub**: per-chapter orb, render-all-remaining, publish-readiness trigger, slim book header | 006 |
| Studio + Review | two separate tabs | **one Chapter Workspace** (drop Review; follow-scroll does render-progress + playback) | 007 |
| Chapter switching / resume | implicit; stuck-in-Studio | `Contents ▾` + prev/next switcher + auto last-edited bookmark in header | 008 |
| Cast panel | flat cast list | slide-out, **3 chapter-aware tiers**; character = fav voice+alias, temp = chapter-scoped `Ch4 · Character 1`, promote | 009 |
| Per-span voice control | speaker only | `Character ▾ · Variation ▾` (voice default + variations) | 010 |
| Assignment gesture | sentence "paint" | **range/span** selection across/within sentences; Narrator = book default | 011 |
| Bookmarks / nav | none | named bookmark collection + global cross-book list; jump-to-next-unrendered | 012 |
| Pronunciation | none in mock | inline one-time edit + per-word lexicon with `book/series/global` scope | 013 |

## Plan reconciliation

- **`book_view_ia_proposal.md`** — the authoritative spec. This folder executes it.
- **`book_chapter_ia_options.md`** (other agent) — exploratory options doc. Its genuinely-new angles
  (Backups surface, slim book header, rail-driven nav, naming) were merged into the spec §11. Its one
  conflict — keeping Studio/Review separate — is **resolved against it**: the owner's workflow merges
  them (task 007). No competing task files are created from that doc; it stays as background.
- **`player_piano_scrolling_plan.md`** — **largely done.** The follow-scroll it specifies is built and
  shipped in the mock (Studio + Review). Remaining ideas there are subsumed by task 007. No new tasks.
- No plan in `plans/` contradicts another after this reconciliation.

## Open decisions for the owner

- **None blocking** — every spec question is resolved (proposal §7/§9).
- **Coordination, not a fork:** Track A edits the mock files a second worker is in. Sequence (roadmap)
  starts with Track B (no overlap); begin Track A workloads only once the worker's player-bar/minimap
  changes have landed, or on explicitly non-overlapping files.

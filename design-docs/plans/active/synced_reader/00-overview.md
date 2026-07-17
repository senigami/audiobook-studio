# Synced Reader — Player-Piano Read-Along (overview)

**Status:** planned, not built. Target branch: `studio-2.0`.
**Relationship:** delivers the item explicitly deferred by
`design-docs/plans/active/audio_player_completion_004/00-overview.md`
("precompute per-segment timing so the reading view can track playback
position … logged separately, not part of this plan").

When this plan says "segment," it means what the code calls a **chunk
group** — the owner's mental model of segment-level granularity was always
group-level; this is a terminology alignment, not a scope change (see §01).

## The heart of it

When a chapter's rendered group WAVs are stitched into the chapter WAV, record
a **durable, versioned per-group timing sidecar** that maps each group to its
real `[start_ms, end_ms)` in the assembled audio (from measured WAV durations —
**no estimation, no forced alignment**). Feed that sidecar to a **player-piano
reader**: one group at a time fades into the upper third of a scoped reading
view; the fraction played through the current group drives the scroll/fade;
the user never manually scrolls. Clicking a group in a detail/list view seeks
the audio to that group's start and the reader jumps to match (bidirectional).

## Confirmed owner decisions (binding for this plan)

1. **Timing is tied to chapter WAV finalization** and rewritten on every
   re-render. It is a light read (walk the ordered rendered groups, measure
   each WAV), so re-running freely is fine.
2. **Group-level granularity only** (owner confirms this is what "segment" has
   meant throughout — the render unit, not the underlying sentence-level DB
   row). We know group boundaries, not word timestamps. Groups are small
   (bounded by the engine's `text_chunk_limit`, e.g. XTTS ≤ 500 char), so
   group-into-view is plenty of resolution.
3. **Versioned sidecar contract** (per the repo's versioned-contracts
   directive). Exact format is the implementer's call within this plan;
   §01 specifies it.
4. **Portability:** the timing sidecar **travels with exported chapter audio**
   and **is included in backups, and restores on import**. Critical
   constraint: backups sometimes omit per-segment WAVs, so a chapter-only
   backup **cannot regenerate** timing — therefore the sidecar is a *durable,
   backed-up, restorable artifact*, not a throwaway cache. (No backup-import
   endpoint exists in the codebase today; building the minimal restore path
   needed to prove this is in scope — see §02/§04 Task 6.)
5. **Reader lives on the main Book tab** — the tab that already owns the
   chapter player — as a standalone view: linked from / embeddable compact
   inside the Book view, with escalation embedded → expand-to-full-browser →
   OS fullscreen. It reuses the Book tab's existing chapter player (audio bus),
   not a second audio element.
6. **The chapter editor is out of scope for the reader.** Its existing
   playing-segment highlight is sufficient there and stays as-is — the
   player-piano reader is NOT added to the chapter editor.

## Scope

- Backend: generate + persist the timing sidecar at chapter-stitch
  finalization (§01, §02).
- Contract: versioned sidecar schema + load-time validation (§01).
- Serving: a per-chapter timing API route mirroring the `.peaks.json` route
  (§02).
- Portability: include the sidecar in export + backup bundles; restore it on
  import (§02).
- Frontend: a timing hook + a player-piano `ReaderView` with three display
  states, wired to the **Book tab's** chapter player bus (§03).

## Out of scope (explicit)

- Word-level highlighting / karaoke within a segment (granularity decision #2).
- Forced alignment or any ML timing inference.
- Re-architecting the audio player itself (that's plan 004).
- The chapter editor / Booth view — no reader there; its estimate-based
  playing-segment highlight stays as-is (owner decision).
- Any change to how audio is *rendered* — we only measure the WAVs that
  rendering already produces.

## Definition of done

- Every completed chapter stitch writes a valid, versioned timing sidecar next
  to the chapter WAV.
- The sidecar's segment `[start,end)` ranges tile the timeline gaplessly and
  the final `end_ms` reconciles with the probed chapter-WAV duration within a
  small tolerance (drift is logged).
- The sidecar travels in exports/backups that include chapter audio, and
  restores on import.
- The standalone reader stays in sync with playback in the embedded, expanded,
  and OS-fullscreen states; clicking a group seeks audio and moves the
  reader; when a sidecar is absent the reader shows an explicit "sync
  unavailable" state (no second estimate implementation — re-rendering the
  chapter regenerates the sidecar for free).
- A backup that includes chapter audio but **no segment WAVs** restores into a
  working chapter with a working timing sidecar — the actual portability
  requirement, proven end-to-end, not just asserted by inclusion in the ZIP.

## Design docs in this folder

- `01-timing-contract.md` — sidecar schema, versioning, duration measurement.
- `02-generation-and-portability.md` — stitch hook, serving route, export/backup.
- `03-reader-frontend.md` — reader view, sync engine, display states, seek.
- `04-roadmap.md` — ordered, self-contained tasks with acceptance criteria.

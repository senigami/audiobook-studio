# 10 — Phase 2: Render Monitor (BitTorrent-style)

**Status: Phase 2 — design captured + demo reference implementation built (2026-06-28); production build not scheduled**

Fast-follow after Phase 1 (M-PAR-3). This document captures the design converged in the 2026-06-26 fusion panel so it is not lost, plus the refinements proven by the 2026-06-28 demo mock. Build the production monitor once the Phase 1 parallel backend + frontend multi-active (tasks 001–007) are stable and the M-PAR-3 invariant suite is green. The binding presentation contract is mirrored in `design-docs/specs/progress-presentation.md` §7A (invariants M1–M3).

---

## Reference implementation (demo mock — 2026-06-28)

A working visual mock landed on the demo Activity ("queue") screen, validating the encoding, the animation, and the honesty rules below before any production work:

- `frontend/src/demo/stages/siteMockup/SegmentRenderStrip.tsx` — the strip component + a self-contained simulation (it *plays the backend*: a `queued → preparing → rendering → done`/`failed→retry` state machine under a per-plan concurrency `cap`, deriving the aggregate from the segment set).
- `frontend/src/demo/stages/siteMockup/shared.tsx` — `IN_FLIGHT_JOBS[].plan` (`chars[]`, `groups`, `cap`, `speed`, `doomed`) drives two contrasting examples: XTTS (20 larger segments, cap 3, slowed) and Voxtral (50 segments incl. slivers, cap 4, with a fail→retry).
- `frontend/src/demo/stages/siteMockup/panes/activity.tsx` — host pane.
- `frontend/src/demo/stages/siteMockup/mockup.css` — `ns-seg-*` keyframes (active pulse, preparing sweep) + the teal active-track + reduced-motion guards.

**What it validates:** char-weighted variable-width blocks as a continuous strip; the aggregate derived from the same segment set (M1); ≤ `cap` active at once reading as parallel; the teal-track + blue-fill in-progress encoding; fail→retry; reduced-motion gating at the timer level (M3); the `role="img"` summary label.

**Where the mock diverges from the production target (reconciled):**
- **Failure colour (M2 gap):** the mock shows failure as a red inset border *only*. Production MUST additionally use a non-hue cue (crosshatch/icon) for color-blind accessibility — the red may stay as a secondary cue. See "Block encoding" below.
- **Min block width:** the mock clamps to 3 px so slivers stay visible in its ~235 px panel; production targets ~6 px (see Block encoding) and the degrade-by-count rules.
- **Simulation-only fields:** `speed` (a demo pacing multiplier) and the LCG-generated `chars[]` are mock conveniences; production reads real char counts and live `active_segments_map` progress.

---

## Goal

Give users a dedicated, scannable surface that shows the render state of every segment in a chapter simultaneously — a spatial "manuscript map" rather than a chapter-level progress bar. The monitor makes the parallel structure of a render visible at a glance: which segments are rendering, which are done, which stalled, and the overall chapter ETA. Power users (Jake/Marta personas) get per-engine diagnostics and per-segment retry controls, gated behind a "Production" disclosure. Non-technical users (Rosa persona) see only the calm default surface.

---

## Placement (progressive disclosure)

The monitor is **not** a forced dedicated screen first. It reveals itself progressively:

1. **Default (always visible):** the existing chapter-level progress bar + ETA. No change for users who never want more detail.
2. **Opt-in peek strip:** a narrow strip below the chapter header (a few px tall) showing a condensed block row — visible after the user opts in, or after a configurable threshold of concurrent segments (TBD exact value, see Open Questions). Dismissible back to the default bar.
3. **Expand to block field:** the peek strip expands inline to the full block field (see Block encoding below). The expanded view lives inside the chapter panel — not a modal, not a full-screen takeover.
4. **Select block → inline popover detail:** clicking/tapping a block opens a small inline popover with per-segment detail (engine, attempt count, elapsed, reason code, retry action). The popover is anchored to the block and does not take over the view.

The monitor must not impose cognitive load on users who don't need it. Progressive disclosure is the architectural commitment: each level is opt-in relative to the previous one.

---

## Block encoding

Each segment in the chapter is represented by one block in the field.

**Width:** proportional to the segment's character count (a manuscript map). This encodes relative text length, not expected render duration — the width tells you "how much of the manuscript" this segment represents, not "how long it will take." This distinction must be communicated to the user (see Honesty guards below).

**State via fill brightness / animation:**
- `idle` / not yet queued: dim fill, no animation.
- `queued`: slightly brighter, no animation.
- `rendering`: a **teal track** with the **blue (`--accent`) fill advancing left-to-right** over it as `progress` increases (matches the value from `active_segments_map`), plus a subtle pulse. *(Owner decision, 2026-06-28, proven in the demo mock.)* The teal/blue two-tone makes "working" instantly distinct from queued (grey) and done (solid blue), and is a clearer signal than brightness alone at small block widths. The teal is a **state** cue, not an engine axis (engine stays out of the colour dimension — see below). When productionized it should be tokenized in `design-system.md` rather than a raw rgba.
- `done` (validated artifact): fully filled solid `--accent`, static.
- `stalled` / stuck heartbeat: same as rendering but with a subtle pulse.

**Failure: a non-hue cue is required (spec M2).** A failed/retrying segment MUST be distinguishable without relying on hue — a crosshatch pattern or small warning-icon overlay — because red/green distinctions are inaccessible to red-green color-blind users, and the field already uses brightness/teal as state axes. A danger-hued border MAY be added as a *secondary* cue (the 2026-06-28 demo mock currently uses a red inset border *only*; production MUST add the pattern/icon).

**Aggregate derived from the segment set (spec M1).** The chapter % shown on the aggregate bar above the field MUST be the char-weighted sum over the same segments (`(Σ done.chars + Σ rendering.chars × fill) / Σ total.chars`), never an independent counter — so the strip and the bar cannot drift (the aggregate honestly stalls during `preparing` and dips on a fail→retry). This mirrors the char-weighted progress rule (progress-presentation §4A.9 / B9).

**Engine NOT encoded as a color axis.** Engine identity (XTTS, Voxtral, CPU) goes in the popover/detail table. Do not add a per-engine color dimension to the block fill — it would conflict with the brightness state encoding and force the user to track two simultaneous color axes.

**Minimum block width:** ~6 px (enough to be tappable and visible on a retina display). Very short segments that would render narrower than 6 px are clamped to 6 px.

**Degrade gracefully by segment count:**
- `< 10 segments`: plain bar + counter (the existing chapter bar is sufficient; the block field adds noise). Do not show the block field.
- `10 – ~60 segments`: full block field (proportional-width blocks).
- `> ~60 segments` (TBD threshold): degrade to bar + count ("42 of 60 done"), or virtualize the block row so only visible blocks are rendered. See Open Questions for exact thresholds.

---

## Honesty guards

**Width ≠ render time.** Block width represents manuscript character count, not expected render time. XTTS render time does not scale linearly with character count across engines (Voxtral is network-bound; XTTS is compute-bound). The monitor must make this clear — a label or tooltip on first expansion: "Block width = text length, not render time."

**ETA — bracketed until calibrated.** Display ETA as "~2 min" (bracketed) or "estimating…" until ≥ 3 segment completions have been recorded for the current chapter job. Before that threshold:
- Show "estimating…" in place of an ETA countdown.
- Do not animate a fake countdown.
- This matches the Phase 1 ETA contract (task 007) and extends it to the monitor surface.

---

## Accessibility dual-layer

The block field is a **decoration layer** (aria-hidden). Accessibility is delivered through a parallel, always-present surface:

1. **Block field:** `aria-hidden="true"`. Screen readers skip it entirely.
2. **Accessible status region (aria-live):** announces MILESTONES ONLY — chapter start, chapter complete, a segment count at major thresholds (e.g. "25 of 60 segments done"). **Never per-segment announcements** — announcing every segment completion would deafen a screen reader user for the duration of a render. One announcement per meaningful phase boundary.
3. **Queryable segment table/list:** an always-present (but collapsible/hidden visually for sighted users by default) accessible table listing segment index, state, engine, and ETA. This is the **real keyboard surface** — a screen reader or keyboard-only user can tab into the table and read the full render state. The block field decorates; the table informs.
4. **Reduced motion:** when `prefers-reduced-motion: reduce` is active, the fill-progress animation is disabled. Blocks show state via brightness only (static), not animation. The block field is still shown (reduced motion ≠ no information); the animation is simply stopped.

---

## Rendering

**Default: DOM blocks with rAF-coalesced shared subscription + transform-based fills.**

Each block is a DOM element. Fill progress is applied via a CSS transform (`scaleX`) on a fill div, driven by the rAF-coalesced `active_segments_map` subscription from Phase 1. This avoids per-frame React state updates — the subscription writes directly to the DOM ref, bypassing React's reconciler for the fill animation.

**Memoize per-block:** each block component is memoized. Only blocks whose state changed re-render (React.memo or equivalent). The block field does not re-render wholesale on each progress frame.

**Canvas escape hatch (> 500 segments only):** if a chapter exceeds ~500 segments, the DOM block approach is replaced with a canvas renderer that draws the same visual. Canvas is an escape hatch, not the default. Important constraints that apply if canvas is used:
- Canvas blocks are not selectable (no text selection, no focus).
- The accessible segment table (above) MUST be present and keyboard-accessible when canvas is used — canvas breaks both selectability and a11y, so the table is the only keyboard surface.
- The popover-detail interaction must be re-implemented on top of canvas hit-testing.

---

## Power controls (gated — Production disclosure)

Hidden behind a "Production" collapsible disclosure section. Shown only to users who explicitly expand it. Non-technical users (Rosa persona) never see these controls.

Controls in scope:
- **Per-engine worker count sliders:** adjust the live cap for each engine (XTTS/Voxtral/CPU) within the manifest max. Changes take effect for queued segments, not in-flight ones.
- **Per-engine throughput display:** segments/minute observed for each engine class in the current chapter job.
- **Per-segment retry:** retry a specific stalled or failed segment from the popover detail.
- **Per-segment stall threshold config:** adjust the stuck-segment heartbeat timeout.

Jake and Marta personas are the target for these controls. Rosa persona must never encounter them on the default path.

---

## Open questions

These were flagged as unresolved in the 2026-06-26 fusion panel and must be answered before implementation starts:

1. **Exact view thresholds.** The degrade-to-bar threshold is currently "~60 segments" and the virtualize threshold is "> ~60". Pin exact numbers after user testing or owner decision. Also: at what segment count does the peek strip auto-appear without user opt-in?
2. **Dedicated screen vs inline.** The current design commits to an inline block field (inside the chapter panel, expandable). Is there a scenario where a dedicated full-screen monitor view is warranted (e.g. very long chapters, a "production room" mode)? Owner decision pending.
3. **ETA calibration cap.** ≥ 3 completions is the Phase 1 threshold (task 007). Does the monitor need a tighter or looser threshold for the bracketed display? Same question for the per-engine breakdown ETA.
4. **Peek strip trigger.** Does the peek strip auto-appear when N ≥ 2 segments are concurrently active (parallelism detected), or only on explicit user opt-in? Trade-off: auto-appear is discoverable but may surprise users who did not raise the cap.
5. **Popover vs inline row.** Is per-segment detail better in a popover anchored to the block, or as an expanded row below the block field? The popover approach is currently preferred; validate against the accessible table interaction.

---

## Cross-references

- `00-overview.md` — Scope OUT: "The dedicated 'BitTorrent' render monitor → Phase 2, [10-phase2-render-monitor.md]." Design captured here; build as a fast-follow once Phase 1 is stable.
- `01-map.md` — Risks R-B (VRAM ceiling) and R-D (ETA correctness); INV-9 (no new wire channel from Phase 1 applies here too — the monitor reads the same `active_segments_map` that Phase 1 threads end-to-end).
- `02-roadmap.md` — Phase 2 milestone noted after M-PAR-3.
- `tasks/006-frontend-multi-active.md` — Phase 1 frontend task; the monitor is its Phase 2 successor. The `active_segments_map` store field and rAF-coalesced subscription established by 006 are the data foundation the monitor builds on — do not duplicate or replace them.
- `tasks/007-eta-toggle-and-specs.md` — ETA bracketing (≥3 completions) established in Phase 1 applies to the monitor's ETA display.
- Persona references: Jake (task-focused power user), Marta (production operator), Rosa (non-technical creator) — see `design-docs/personas/`.

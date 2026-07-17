# PR 01 — StatusOrb: distinct "preparing" appearance

**Branch:** `studio2/statusorb-preparing`
**Target:** `studio-2.0`
**Size:** XS (one component + CSS + one test)
**Gate:** none. Runs anytime, parallel-safe.

## Why

W-MIX shipped a segment-level "preparing" state (voice-model load window): the active span reads
*"Preparing… / Loading voice model…"*, the progress bar goes indeterminate, and ETA is suspended.
The one deferred piece of that feature is the **StatusOrb** — it still shows its normal
running/spinner state during the preparing window instead of a distinct one.

The W-MIX visual-check spec (TASKS.md, "VISUAL CHECK — W-MIX complete") calls for:
> StatusOrb shows a distinct preparing state (dimmed/pulsing, not the spinning loader)

This closes that last item (TASKS.md line ~159, currently `[ ]`, marked optional/deferred).

## Read first

- `frontend/src/components/ui/StatusOrb.tsx` — the component.
- `design-docs/specs/progress-presentation.md` (§2.7 preparing tier) — the contract for how
  preparing is presented elsewhere; match its intent (reduced-motion-guarded pulse, no active
  spinner, no fabricated progress).
- How `ScriptView.tsx` renders the preparing tier (`data-render-status="preparing"`) — mirror the
  visual language so the orb and the span agree.
- The code-map shard for `frontend/src/components/` for callers of StatusOrb.

## Scope

**In:** a `preparing` visual variant of StatusOrb (dimmed/pulsing, reduced-motion-guarded, distinct
from the running spinner), wired wherever StatusOrb receives a status that can be "preparing" during
a live render, plus a unit test.

**Out:** any change to the progress/ETA math or the backend preparing signal (all already shipped).
Don't touch `orchestrator_helpers.py` / `service.py`.

## Steps

1. Find how "preparing" is currently distinguishable at StatusOrb's call sites — is a status/tier
   prop already threaded, or does the orb only receive a coarse status? Follow the same source the
   ScriptView preparing tier uses (`chapterRenderPreparingSegmentIds` / `indeterminate` /
   `reason_code`). If the orb doesn't yet receive enough to know it's preparing, thread the existing
   signal in (do not invent a new one).
2. Add the `preparing` appearance to `StatusOrb.tsx` + its CSS: dimmed/pulsing, **no** spinning
   loader, pulse guarded by `prefers-reduced-motion`. Use existing tokens — no new colors.
3. TDD: write the failing test first (orb renders the preparing variant, not the spinner, when given
   the preparing state; reduced-motion path asserted). Confirm it fails for the right reason, then
   implement.

## Verify

- `npm -C frontend run test -- --run` (targeted at the StatusOrb test file first, then a broader run).
- `npm -C frontend run lint` and `npx -C frontend tsc -b` clean.
- **Live visual check** (the point of the feature): trigger a mixed XTTS+Voxtral render on a
  multi-chapter book; during the ~30s XTTS model-load window confirm the orb shows the distinct
  preparing state and flips back to normal running once synthesis starts. Screenshot for the PR.
  (If you can't run a real render, drive the preparing state in the browser via the demo/preview and
  screenshot that — say which you did.)

## Definition of done

- StatusOrb visibly distinct in preparing vs running; reduced-motion respected.
- Test added and revert-checked (fails on pre-change component).
- Green: vitest + lint + tsc.
- Append a code-map changelog-queue entry (`docs/code-map/queue/`).
- Open PR via `write-pr` targeting `studio-2.0`. Include the screenshot.

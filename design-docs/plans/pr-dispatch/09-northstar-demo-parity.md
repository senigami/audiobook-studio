# PR 09 — North Star demo parity with production frontend

**Branch:** `studio2/northstar-demo-parity`
**Target:** `studio-2.0`
**Size:** M
**Gate:** none. Parallel-safe (demo source is isolated from the real app).

## Why + a scope nuance you must respect

The owner wants the North Star demo updated to match the **current production frontend**.

⚠️ **But the North Star demo is not simply a mirror of production.** Per the L-DEMO history in
TASKS.md, the North Star is the *aspirational* direction — production has been catching up to it, not
the other way around, and past demo work was explicitly "additive; nothing existing was removed."
So "match production" means: **reconcile drift where production has diverged from what the demo
shows, without stripping the demo's aspirational-but-not-yet-shipped surfaces.**

Before touching anything, confirm the intended direction with the dispatcher/owner:
- **(a) Demo → production:** update the demo so it accurately reflects what production now looks/works
  like (fix stale demo screens/copy/layout that no longer match shipped UI). *This is the most likely
  intent given the wording.*
- **(b) Production → demo:** the opposite (port demo-only North Star ideas into production) — that's a
  much bigger, feature-shaped effort, **not** this PR. If that's the ask, stop and route to
  plan-architect.

Proceed assuming **(a)** unless told otherwise, and say so in the PR.

## Read first

- `design-docs/plans/active/final_release/19_demo_gap_analysis.md` — the gap short-list.
- `design-docs/plans/active/final_release/14_live_demo_revamp.md` — the demo-as-real-component-showcase
  contract + `build:demo` + `sync:showcase-tokens`.
- `frontend/src/demo/` — the demo source: `DemoApp.tsx` (routing/embed/theme/badge),
  `stages/siteMockupStage.tsx` + `stages/siteMockup/` (the product-area panes), and the other stages
  (`voiceLabStage`, `progressStage`, `queueStage`, `liveOutputStage`).
- The North Star screen-parity plan (`active/north_star_screen_parity/`) — the reverse direction that
  already ran; use it to see which screens were reconciled and how, so you don't undo that work.
- Memory: [Live demo renderer](../../../../.claude/...), [Demo build separate from launch]
  (never wire `build:demo` into `run.sh`).

## Scope

**In:** walk each demo stage/pane against the current shipped screen and fix drift — layout, copy,
component structure, theming (light + dark) — so the demo is an honest representation of production.
Prioritize the screens the owner has flagged before (Home/Welcome, Library, Book view/chapter list,
Studio, Voices) and anything in the doc-19 gap list. Rebuild the static demo output.

**Out:** porting new features into production (that's direction (b)); changing the real app; wiring
`build:demo` into the launch path (forbidden — production launch stays lean, `/demo` serves committed
`docs/demo/`).

## Steps

1. Build the current production app and the demo side-by-side; screen-by-screen, note every place the
   demo no longer matches shipped UI. Produce a short drift list (this is your work plan).
2. Fix each drift in the demo source (`frontend/src/demo/`). Reuse real components where the demo is
   meant to be a real-component showcase (per doc 14) rather than re-mocking.
3. Run the demo build (`npm -C frontend run build:demo` or the documented script) → outputs to
   `docs/demo/`. Commit the regenerated static output.
4. `sync:showcase-tokens` if tokens drifted (per the release checklist).

## Verify

- `npm -C frontend run test -- --run` + `lint` + `npx tsc -b` green (demo stages are linted too —
  watch the known react-refresh warnings, don't add new ones).
- **Live check the demo**: serve it, click through every stage in **both themes** and in embed mode,
  confirm zero console errors and that each screen now matches its production counterpart.
  Screenshot the reconciled screens (before/after) for the PR.
- Update `19_demo_gap_analysis.md` to reflect what's now closed.

## Definition of done

- Demo reconciled to production across the flagged/gap screens; static output rebuilt + committed.
- Green suites; live-verified in both themes; before/after screenshots in the PR.
- Wiki changelog if demo behavior changed; code-map changelog-queue entry if mapped source changed.
- PR via `write-pr` → `studio-2.0`, stating the direction (a) and listing screens reconciled.

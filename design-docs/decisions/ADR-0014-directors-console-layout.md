# ADR-0014: Director's Console — Three-Panel Chapter Editor (Console on the Right) + Book/Screenplay/Stage Views

**Date:** 2026-06-27
**Status:** Accepted
**Deciders:** Studio owner (validated against the chapter-editor persona panel)

## Context

The Studio chapter editor was evolving from the legacy `ChapterEditor` chrome toward the North-Star "Director's Console" direction (chapter-editor art-program: the editor as *modes + palette*). Two layout questions were open, and the mock had drifted from the spec:

1. **Where does the editing console live** relative to the reading text? An earlier iteration stacked the tool column (mode tools + cast palette) on the **left**, immediately after the app navigation rail — so the manuscript was pushed to the far right, walled behind two tool columns.
2. **How many read/format views** does Studio expose? [site-shell-and-book-pipeline.md](../specs/site-shell-and-book-pipeline.md) §3.2 specified "one `ScriptView` with two routed/toggled modes (book primary, script secondary)."

A persona review panel (Novel Adapter, Dialogue Playwright, Casting Director, Motor-Impaired Keyboard User, Deadline Editor) reviewed the rearranged mock and converged.

## Decision

1. **Three-panel layout: navigation rail (left) · chapter text (center) · Director's Console (right).** The manuscript reads in the **center** column. The Director's Console — mode tools atop the contextual palette for the active mode — is a **third column on the right**, never stacked between the rail and the text.

2. **Studio exposes three read/format views of the same chapter, toggled in one place** — **Book** (flowing prose, the primary/default), **Screenplay** (US/Hollywood format), **Stage** (BBC stage-play manuscript format). These are view/format toggles over **one** editor surface, never multiple editors (the "never two editors" invariant is preserved; the count goes from two views to three).

## Why this shape

The panel was unanimous that console-on-the-right serves the core **read → act** loop better than console-on-the-left. The eye tracks the speaker-colored bar at a line's leading edge, reads rightward across the centered text, and arrives at the controls on the right — one continuous left-to-right sweep in reading order. The old left-stacked order forced the reader to read on the right but reach **back left** to act, fighting reading direction on every line. Centering the manuscript also lets it "read like a page instead of a UI element wedged against two toolbars," and the right console sits under the mouse hand for editing.

The third view (Stage / BBC stage-play) is not decoration: it maps to how a dialogue playwright actually works, and `CHARACTER:` + a per-line variation label makes attribution errors jump out. Screenplay (Hollywood) serves the read-through/performance-review pass.

## Rejected alternatives

- **Console on the left (between rail and text).** Reverses the read→act loop, pushes the manuscript off-center, and stacks two tool columns against the text. Rejected by the whole panel.
- **Two views only (Book + Script).** Loses the stage-play format that maps to playwright workflow; keeping a single "script" mode conflates two genuinely different industry formats (screenplay vs. stage play). Rejected.
- **Console-on-right *plus* a second tool strip.** An interim mock split the mode icons (far-right strip) from the cast palette (separate column), making a fourth column. Rejected as too much chrome — unified into one right-hand console.

## Consequences

### Positive
- Reading is centered and uncramped; tool travel follows reading order.
- The three-view toggle covers prose, screenplay, and stage-play readers from one surface.
- Collapsing the left rail (see [site-shell-and-book-pipeline.md](../specs/site-shell-and-book-pipeline.md) §2.4) gives the center text even more room.

### Negative / Trade-offs
- Three columns cost horizontal space; on narrow viewports the rail must collapse to keep the text readable (the rail collapse contract makes this an explicit escape hatch).
- Chapter-jumping moves from rail-adjacent to opposite ends of the layout — mitigated by the in-context breadcrumb chapter dropdown in the center top bar.

### Neutral
- This is currently realized in the mock (`frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx`); the production Studio page tracks it as the R3 target. The spec marks it "binding once built," consistent with the rest of §3.2.

## References
- [site-shell-and-book-pipeline.md §3.2 Studio](../specs/site-shell-and-book-pipeline.md) (three-panel layout, three views)
- [ADR-0015](ADR-0015-attribution-color-is-identity.md) (the attribution-encoding rules the views render)
- [ADR-0009](ADR-0009-app-shell-and-book-pipeline.md) (the shell + routed book pipeline this sits inside)
- `frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx`, `frontend/src/demo/stages/siteMockup/rail.tsx`

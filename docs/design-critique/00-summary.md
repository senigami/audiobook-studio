# Design Critique — Book Tab ("Front Door" Landing Page)
**Date:** 2026-07-09
**Scope:** `frontend/src/pages/Book/stages/BookStage.tsx` + `frontend/src/pages/Book/components/BookInfoCard.tsx` (the new "Book" tab), plus its immediate dependencies: `BookLayout.tsx`, `lib/stages.ts`, `useBookData.ts`, `InlineEdit.tsx`, `PublishStage.tsx` (for the overlapping `BookInfoCard` usage and the audiobook-file data it already fetches).
**Frameworks:** WCAG 2.2 (Lane A), Nielsen heuristics (B), cognitive load (C), affordances/HIG (D), visual hierarchy/Gestalt (E), color/design-systems (F). Persona lens: [27 — Casual Listener (Emma Patterson), INFERRED](../../design-docs/personas/27-casual-listener.md).
**Style guide used:** Yes — `design-docs/specs/design-system.md` (binding contrast/token rules, §8.3/§2.4) + `frontend/src/theme/tokens.css` are this repo's canon (no `docs/style-guide/` exists here; this is the project's documented equivalent).
**Evidence:** Live app, both themes, both breakpoints — a real project ("The Song of Ariadne," fully rendered) was opened in a running dev instance and inspected directly (computed styles, DOM, screenshots) rather than working from user-submitted screenshots.

---

> **TL;DR:** The redesign's mechanics are sound — Book is genuinely the first tab, the identity fields are cleanly unified under one inline-edit system, and the visual language matches the rest of the app. But the tab **does not yet do the one job it exists to do.** It still functions as a metadata panel, not a front door: (1) the tab you land on by default for every book that already exists in the library is still **Contents**, not Book — the redesign's core intent is inactive for all current data; (2) there is **no listen/resume affordance at all** despite the underlying "rendered audiobook" data already being fetched elsewhere in this exact component tree; (3) the description/synopsis the owner wants is a hard-coded placeholder sentence, not a field; and (4) two contrast findings — one of which directly violates this repo's own binding design-system rule — need a one-line fix each.

## What we reviewed

The audit covers the new Book tab end to end: its route/default-tab logic, its data source, its hero component (cover + inline-editable identity + metadata pills), its "Overview notes" placeholder, and where it sits relative to the Publish tab (which independently renders the *same* hero card and already holds the assembled-audiobook data — cover, duration, file size, download link, a free-text description per file — that the Book tab's "resume/listen" gap is asking for). Verified live in the running dev app (light + dark themes, desktop + 375px mobile) against a real, fully-rendered book. Not covered: Contents/Cast/Lexicon/Publish's own internal design (only touched where `BookInfoCard` is duplicated into Publish's sidebar).

## What's working

- ✓ **Book actually is the first tab** in the tab bar order (`lib/stages.ts:1`) — the structural intent is correctly expressed once a user is on the tab strip.
- ✓ **One inline-edit system, not two.** Title, author, series, and series-position all route through the same `InlineEdit` component with consistent borderless/transparent edit-mode styling — the earlier "two editor systems" problem (title vs. author/series) that a prior session fixed stays fixed; no regression found.
- ✓ **The blurred-bleed cover treatment** (`components.css:2456-2465`) is a genuinely nice, restrained piece of depth work — a blurred, saturated echo of the cover behind a contained foreground image reads as considered, not decorative filler.
- ✓ **Lifecycle-aware metadata pills** (runtime vs. predicted vs. "no segments yet" vs. rendered) correctly track production state and follow the no-fabrication principle the rest of the app enforces.
- ✓ **The reusable data is already there.** `useBookData.ts` already fetches `availableAudiobooks` (assembled files with cover, duration, size, download URL, description) — the single biggest missing piece (finding DC-003 below) is a wiring problem, not a build-a-new-system problem.
- ✓ **Reflow at 375px is clean** — no horizontal scroll, no clipped content, cover recenters correctly.

## Findings summary

| Severity | Count | Estimated total effort |
|----------|-------|-------------------------|
| P1 — Blocker | 3 | 0.5–1 day |
| P2 — Major | 3 | 2–4 days (excludes new description-field backend work, scoped separately) |
| P3 — Polish | 3 | 0.5–1 day |
| **Total** | **9** | |

## Coverage by lane

| Lane | Findings | Notable |
|------|----------|---------|
| A — Accessibility | 2 | Verified contrast failure in both themes (DC-002); verified target-size failure (DC-004) |
| B — Usability | 2 | Default-tab regression (DC-001); missing resume/listen affordance (DC-003) |
| C — Cognitive load | 0 | Clean — information density on the card itself is appropriately restrained |
| D — Affordances/HIG | 2 | Missing listen affordance (DC-003, cross-lane); internal-facing copy (DC-008) |
| E — Visual hierarchy | 2 | Dead whitespace in the hero (DC-007); duplicate hero card across tabs (DC-006) |
| F — Color/systems | 1 | `--text-subtle` used against its own documented restriction (folds into DC-002) |

## Top priority findings

| ID | Finding | Severity | Effort |
|----|---------|----------|--------|
| DC-001 | Default tab for every existing book is still Contents, not Book | P1 | XS |
| DC-002 | Empty-field placeholder text uses `--text-subtle` for body text — violates the project's own binding contrast rule, fails in both themes | P1 | XS |
| DC-003 | No listen/resume affordance — the stated #1 goal of this tab is 0% built | P1 | M (S if scoped to "latest file only") |
| DC-004 | Series-position stepper buttons measure 17.9×17.9px — fails WCAG SC 2.5.8 (needs ≥24×24) | P2 | XS |
| DC-005 | No `description`/synopsis field exists anywhere in the data model | P2 | M (backend + frontend) |
| DC-006 | `BookInfoCard` is duplicated verbatim on the Publish tab sidebar | P2 | S |

## Decisions needed from you

No brand-conflicting recommendations — every fix below works within the existing token system and visual language. One product-scope decision *is* embedded in the plan and flagged there rather than here (not a theme trade-off): whether the "listen/resume" affordance should link out to the existing Publish/Assembly table, or become a lightweight first-class element on the Book tab itself. See the North Star section of `02-improvement-plan.md`.

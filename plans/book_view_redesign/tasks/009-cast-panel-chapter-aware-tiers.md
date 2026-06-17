# 009 — Chapter-aware Cast & Voices slide-out with three collapsible tiers

- **Status:** done
- **Workload:** Mock: cast, characters & assignment
- **Severity / type:** major · ux
- **Effort:** L
- **Blocked by:** 007
- **Blocks:** 010, 011

## Goal
Build a slide-out **Cast & Voices** panel for the mock Chapter Workspace that organizes the cast into **three collapsible tiers** (in-chapter favorites / chapter-scoped temps / everyone else), so the 3–5 characters you actually use on the current page sit at the top and the long roster stays out of the way.

## Why this matters
The current mock cast is a flat 4-row "paint palette" (`CAST_SWATCHES` in `studio.tsx`) with no notion of which characters belong to the chapter, no temp characters, and no promote path. The IA proposal (§6.7) makes the cast **chapter-aware**: the panel must surface this chapter's characters first and tuck the full book roster away. This panel is the data home that tasks 010 (variation control) and 011 (range assignment) write into, so it must exist first.

## Context an executor needs
- Read for intent (do not duplicate): `plans/book_view_ia_proposal.md` §6.7 (three tiers), §9 answer **A20b** (temp naming `Ch{N} · Character {i}`, characters track the chapters they appear in), and §9 **A20** (cast organized primary vs secondary). Roadmap: `plans/book_view_redesign/01-roadmap.md` Workload 4.
- **This is a MOCK task.** No backend, no real persistence — in-memory React state in the demo only. Acceptance is a passing build plus observable demo behavior.
- Mock files:
  - `frontend/src/demo/stages/siteMockup/panes/studio.tsx` — `StudioPane` holds the current cast: `CAST_SWATCHES` (id/name list at top of file), `armedSwatch` state, and the right-hand `Panel` labeled "Cast" (~line 1122) that renders the swatch buttons.
  - `frontend/src/demo/stages/siteMockup/panes/book.tsx` — `CastingPane` and its `CHARACTERS_NON_NARRATOR` data (Maren/Dov/The Warden/Sira + voice names); reuse this as the seed "book roster".
  - `frontend/src/demo/stages/siteMockup/shared.tsx` — reusable primitives: `SPEAKER_TOKEN` (speaker → color tokens), `Avatar`, `StatusOrb`, `Panel`, `Col`, `Row`, `SemanticChip`, `CHAPTERS`. Use `ChevronDown`/`ChevronUp` from `lucide-react` for tier collapse carets (already imported elsewhere).
- ⚠️ **Coordination:** the panes are mounted by `frontend/src/demo/stages/siteMockup/siteMockupStage.tsx` (it renders `<StudioPane .../>` etc. by tab, ~lines 923–925). **Another worker is concurrently editing the mock, including `siteMockupStage.tsx`.** If you must touch `siteMockupStage.tsx` (e.g. to mount a new pane or pass a prop), keep the edit minimal and additive, do not reorder/rename existing pane wiring, and re-read the file immediately before editing to avoid clobbering their changes. Prefer building the panel as a new component consumed *inside* `studio.tsx` so no stage edit is needed.

## Target shape / contract
A new component, e.g. `frontend/src/demo/stages/siteMockup/panes/castPanel.tsx` (or `components/CastPanel.tsx` under the mock), default-exported and rendered inside the workspace where the old "Cast" `Panel` lived.

Data model (mock, in-memory):
- **Character** = `{ id, name (alias), voiceName, colorKey, chapters: number[], starred?: boolean, kind: 'book' | 'temp' }`.
  - A **book character** = a favorited voice + an alias; book-global; appears wherever its `chapters` array lists it.
  - A **temp character** = an unnamed library voice used as-is, `kind: 'temp'`, auto-named `Ch{N} · Character {i}` (N = current chapter number, i = 1-based index among this chapter's temps), persisted (in mock state) as chapter-scoped.
- **Tiers** (computed from the current chapter number `N`):
  1. **In this chapter** (always open, starred) — book characters whose `chapters` includes `N`.
  2. **Chapter-scoped** (collapsible) — `kind: 'temp'` characters created for chapter `N`.
  3. **Everyone else** (collapsed by default) — book characters whose `chapters` does **not** include `N`.
- **Operations:**
  - **Surface** — picking a tier-3 character adds `N` to its `chapters` so it jumps to tier 1.
  - **Promote** — a tier-2 temp becomes a named book character: set `kind: 'book'`, take a real name (mock: any non-empty rename, default keep the temp name), it leaves tier 2 and joins the roster (appears in tier 1 while it has `N`).
  - **Add temp** — an affordance ("+ temp voice") creates a new `kind: 'temp'` character auto-named per the rule above.

## Steps
1. Read §6.7 + A20b + A20 in the IA proposal and Workload 4 in the roadmap.
2. Create the new `CastPanel` component file under the mock. Seed its in-memory state from `CHARACTERS_NON_NARRATOR` (book.tsx) plus `Narrator`, assigning each a `chapters` array so a believable subset (e.g. Maren, Dov, Narrator) includes the current chapter (use chapter 4 — "A Vale at Dusk" — to match `StudioPane`'s `matchTrackName: 'Chapter 4'`). Add 1–2 seed temp characters named `Ch4 · Character 1`, `Ch4 · Character 2`.
3. Render the three tiers as collapsible sections: tier 1 open + a star/filled marker, tiers 2 and 3 with a chevron caret and collapsed/expanded state (tier 3 collapsed by default). Reuse `Avatar`, `SPEAKER_TOKEN` colors, and `SemanticChip` for badges.
4. Wire **Surface** (click a tier-3 row → it moves to tier 1), **Promote** (a tier-2 row action → becomes a book character), and **+ temp voice** (adds an auto-named `Ch4 · Character {i}` temp to tier 2).
5. Replace the old static "Cast" `Panel` block in `StudioPane` with `<CastPanel ... />`, preserving the existing "armed swatch" selection behavior the prose paint relies on (keep `armedSwatch`/`handleSwatchClick` working so task 011 can build on it). Each tier row should still arm the selection like the old swatch did.
6. Keep all colors via design tokens (`SPEAKER_TOKEN`, `var(--...)`); no raw hex.
7. Run `npm -C frontend run build` and `npm -C frontend run lint` and fix any errors.

## Acceptance criteria
- `npm -C frontend run build` passes (tsc + vite).
- In the Studio/Workspace pane of the demo, the Cast panel shows **three labeled tiers**: "In this chapter" (open, starred), "Chapter-scoped" (collapsible), "Everyone else" (collapsed by default).
- A temp character is present and auto-named in the `Ch4 · Character {i}` form; clicking "+ temp voice" adds another with the next index.
- Clicking a character in tier 3 moves it into tier 1 ("surface"); promoting a tier-2 temp moves it out of tier 2 into the book roster.
- Arming a character row still selects it for assignment (the existing paint behavior keeps working) so task 011 can extend it.

## Out of scope
- The per-span `Character ▾ · Variation ▾` control (task 010) and range-based assignment (task 011).
- Any real backend, API, or persistence beyond in-memory demo state.
- Changing the real-app `CastingPane` data contract or the production Cast page.
- Restructuring `siteMockupStage.tsx` tab wiring beyond a minimal additive mount if unavoidable.

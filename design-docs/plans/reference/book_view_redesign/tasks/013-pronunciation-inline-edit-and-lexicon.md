# 013 — Inline phonetic edit + per-word pronunciation lexicon (scoped)

- **Status:** done
- **Workload:** Mock: authoring aids
- **Severity / type:** medium · ux
- **Effort:** M
- **Blocked by:** 007
- **Blocks:** nothing

## Goal
Add two mock pronunciation affordances to the Chapter Workspace: (1) a **one-time inline phonetic edit** of a single word in place, conceptually preserving speaker assignments; and (2) a **per-word pronunciation lexicon** where each entry carries a **scope tag — book (default) / series / global** — with most-specific-wins resolution, and inherited (series/global) entries shown read-only with an "inherited" badge.

## Why this matters
The IA proposal (§9 answer **A9b** and §6.1 step 9) defines two distinct pronunciation mechanisms: a one-off inline fix for a single spot, and a reusable per-word lexicon that fixes every occurrence — scoped so a fix can be shared upward (a series name, a universally-mispronounced word) while a book can always override. The real engine for mechanism #2 (`app/domain/text/pronunciation.py`, `build_pronunciation_overrides()`) is scaffolded but raises `NotImplementedError` — this task is the **mock UI** that shows the intended shape, not the real implementation.

## Context an executor needs
- Read for intent (do not duplicate): `design-docs/plans/book_view_ia_proposal.md` §9 **A9b** (lexicon is per-book by default; per-entry scope `book`/`series`/`global`; most-specific-wins; inherited entries read-only with an "inherited" badge) and §6.1 step 9 (inline phonetic edit that preserves speaker assignments). Background: §8.4 Q9/Q10.
- This maps to the real (currently **unbuilt**) `app/domain/text/pronunciation.py` scaffold — mention that lineage in any UI copy if helpful, but **build only mock UI here**; do not touch `app/`.
- **This is a MOCK task.** In-memory demo state only; acceptance is build + observable behavior.
- Mock files:
  - `frontend/src/demo/stages/siteMockup/panes/studio.tsx` — the workspace prose (`chunks: Chunk[]`, each chunk has `text` and an optional `safeText` that already demonstrates a "spoken differently than printed" layer; the "Safe text" toggle at ~line 888 swaps `text`↔`safeText`). The inline-edit affordance belongs on a word within this prose; the existing `safeText` field is the natural place to stash a one-time phonetic override conceptually.
  - `frontend/src/demo/stages/siteMockup/shared.tsx` — `Panel`, `Card`, `Row`, `Col`, `SemanticChip`, `VoiceAttrPill` (good for an "inherited" / scope badge), `Btn`.
- ⚠️ **Coordination:** the panes are mounted by `frontend/src/demo/stages/siteMockup/siteMockupStage.tsx`. **Another worker is concurrently editing the mock.** Keep work inside the pane components and a new lexicon panel component; if you must touch `siteMockupStage.tsx`, keep the edit minimal/additive and re-read it immediately before editing.

## Target shape / contract
- **Inline phonetic edit (one-time):** clicking a word in the prose opens a small inline editor to respell it phonetically for *that spot only*. In the mock, apply it as a one-off override (e.g. set/preview the chunk's `safeText`-style spoken form) while leaving the printed text and the chunk's speaker assignment intact — the visible point is "fix how it's read here without losing who says it."
- **Pronunciation lexicon panel (mock):** a list of per-word entries `{ word, phonetic, scope: 'book' | 'series' | 'global' }`.
  - `book` is the default scope for new entries.
  - **Most-specific-wins resolution:** for the same word, a `book` entry overrides `series` overrides `global`; show this so a book entry visibly supersedes an inherited one.
  - **Inherited entries** (`series` / `global`) render **read-only with an "inherited" badge** (use `VoiceAttrPill`/`SemanticChip`); only `book`-scoped entries are editable at this (book) level.
  - A per-entry scope selector lets a new/book entry be tagged book/series/global.

## Steps
1. Read §9 A9b and §6.1 step 9.
2. Add an inline word-edit affordance in the workspace prose: clicking a word (in `studio.tsx`) opens a small inline input to enter a phonetic respelling; on confirm, store it as a one-time override (reuse the `safeText` concept) and keep the chunk's `speaker` unchanged. Make the "assignments preserved" property observable (the span keeps its speaker tint after the edit).
3. Create a mock **Lexicon panel** component listing per-word entries with `word`, `phonetic`, and a `scope` tag. Seed it with a few entries across all three scopes (at least one `book`, one `series`, one `global`), including one word that exists at two scopes to demonstrate most-specific-wins.
4. Render inherited (`series`/`global`) entries read-only with an "inherited" badge; render `book` entries editable with a scope selector defaulting to `book`.
5. Implement the resolution display: when the same word has multiple scopes, show that the `book` entry wins (e.g. mark the inherited one as overridden/struck or annotate "overridden by book").
6. Use design tokens throughout; reuse shared primitives. No raw hex.
7. Run `npm -C frontend run build` and `npm -C frontend run lint`; fix errors.

## Acceptance criteria
- `npm -C frontend run build` passes.
- Clicking a word in the workspace prose opens an inline phonetic editor; confirming changes how the word is shown-as-spoken (mock) while the span keeps its speaker assignment/tint.
- A lexicon panel lists per-word entries each tagged `book` / `series` / `global`.
- Inherited (`series`/`global`) entries are read-only and carry an "inherited" badge; `book` entries are editable with a scope selector.
- A word present at more than one scope visibly resolves most-specific-wins (the `book` entry supersedes the inherited one).

## Out of scope
- Any change to `app/domain/text/pronunciation.py` or the real backend lexicon (this is mock UI only).
- Real re-render, synthesis, or per-engine `safeText` generation.
- Series/global *management* surfaces beyond showing inherited entries read-only at the book level.

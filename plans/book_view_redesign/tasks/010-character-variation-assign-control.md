# 010 — Per-span `Character ▾ · Variation ▾` assign control

- **Status:** not-started
- **Workload:** Mock: cast, characters & assignment
- **Severity / type:** major · ux
- **Effort:** M
- **Blocked by:** 009
- **Blocks:** 011

## Goal
Turn the per-span assign control in the mock workspace into **`Character ▾ · Variation ▾`**: alongside picking who speaks a span, the author picks that voice's **default or one of its named variations**. A variation is any vocal variant (not only emotions).

## Why this matters
The IA proposal (§6.2, and §9 answer **A-Variations**) makes variation a first-class, per-span choice: a voice has a default plus named variations, and you assign one to a span. The mock currently only lets you pick a speaker (the `Character ▾` hover chip in `studio.tsx` is static text "Maren ▾" with no variation control). Adding the Variation dropdown demonstrates the model the redesign depends on, and gives task 011 (range assignment) the control to attach to a selected range.

## Context an executor needs
- Read for intent (do not duplicate): `plans/book_view_ia_proposal.md` §6.2 (the `Character ▾ · Variation ▾` control), §9 **A-Variations** (default + named variations, chosen per span). Roadmap: `plans/book_view_redesign/01-roadmap.md` Workload 4.
- **This is a MOCK task.** In-memory demo state only; acceptance is build + observable behavior.
- Mock files:
  - `frontend/src/demo/stages/siteMockup/panes/studio.tsx` — the assign popover is `HoverSentenceControls` (~line 105): today it renders a static `<span>Maren ▾</span>` chip plus play/rebuild buttons. This is the surface to extend with a Variation dropdown. There is also a selection context menu (`SelectionContextMenu` / the `#selection-context-menu` div, ~line 807) that assigns a speaker to a sub-sentence selection — note it but task 011 owns that gesture.
  - Cast/character data: from task 009's `CastPanel`, each character carries a `voiceName`. This task adds variations to the voice/cast data so the dropdown has something to list.
  - `frontend/src/demo/stages/siteMockup/shared.tsx` — `SPEAKER_TOKEN`, `Row`, `SemanticChip`; `ChevronDown` from `lucide-react`.
- ⚠️ **Coordination:** `studio.tsx` is rendered by `frontend/src/demo/stages/siteMockup/siteMockupStage.tsx`. **Another worker is concurrently editing the mock.** This task should stay entirely inside `studio.tsx` (and the cast data module from 009) and should **not** need to edit `siteMockupStage.tsx`. If a stage edit somehow becomes necessary, keep it minimal/additive and re-read the file immediately before editing.

## Target shape / contract
- **Voice/variation data (mock):** each mock voice gains `variations: string[]` plus an implicit `'Default'`. Example: `Studio Voice → ['Default', 'Urgent', 'Whisper', 'Warm']`. Any vocal variant is allowed — not only emotions. At least two voices should have a non-trivial variation list; a voice with none shows only `Default` (or hides/disables the picker).
- **Assign control:** the per-span popover renders **two dropdowns side by side**: `Character ▾` (lists the chapter's characters) and `Variation ▾` (lists the chosen character's voice's `Default` + variations). Picking a character resets/repopulates the Variation list to that voice's variations. The current selection is reflected in the chip label, e.g. `Maren · Urgent`.

## Steps
1. Read §6.2 and A-Variations.
2. Add a `variations` list to the mock voice/cast data (extend the data introduced in task 009, or a small local map keyed by `voiceName`). Default is always available even when the list is empty.
3. Extend `HoverSentenceControls` in `studio.tsx` so the single static `Character ▾` chip becomes two adjacent dropdowns: `Character ▾` and `Variation ▾`. Use lightweight popovers/menus consistent with the existing `ExportMenu`/context-menu styling in the file (token colors, `var(--surface)`, `var(--border)`, etc.).
4. Wire local state: selecting a character sets the active character for that span and repopulates the Variation dropdown from that voice's variations; selecting a variation updates the chip label to `Character · Variation`.
5. When a voice has no named variations, show only `Default` (or render the Variation dropdown disabled) — make the empty case graceful.
6. Keep colors token-driven (`SPEAKER_TOKEN`, `var(--...)`); no raw hex.
7. Run `npm -C frontend run build` and `npm -C frontend run lint`; fix errors.

## Acceptance criteria
- `npm -C frontend run build` passes.
- The hover/assign control on a prose span shows **both** a `Character ▾` and a `Variation ▾` dropdown.
- The Variation dropdown lists the selected character's voice's `Default` plus its named variations; changing the character repopulates the variation list.
- Selecting a variation visibly updates the control's label (e.g. `Maren · Urgent`).
- A voice with no named variations shows only `Default` (or a disabled Variation picker) without errors.

## Out of scope
- Range/span selection mechanics (task 011) — this task only upgrades the assign control's *contents*; it can keep attaching to whatever span the current mechanism targets.
- The three-tier cast panel itself (task 009).
- Real synthesis, backend variation fields, or the real-app B4 variation-regression fix.

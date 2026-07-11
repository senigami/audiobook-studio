# Task 008 — Cue Editor popover (Performance Cue SSML + description)

Status: pending

Risk: none (UI-only, built entirely on top of tasks 005's contract and 007's gutter — no backend changes, no render-pipeline changes)

## Goal

Build the **Cue Editor** — a small inline popover, opened by clicking a ⚡ glyph in the gutter (task 007's `GutterGlyph.onClick`), that lets a user set a Performance Cue's SSML parameters (Rate / Pitch / Volume, each with presets + a free-text "Other…" override) and an optional free-text style prompt and human-readable description. On save, it (a) writes the structured payload to the target segment's `engine_directives` field (task 005's contract) and (b) generates and saves the human-readable bracket display string (e.g. `[slowly · low | voice catches]`) as that segment's `text_content`, exactly matching the format rules in the design doc.

## Why this matters

Per `design-docs/workflows/chapter-editor-modes.md` §5 (lines 165–178) and §13 (line 353), the Cue Editor is the only way a Performance Cue gets created or edited — without it, task 005's `engine_directives` field and task 006's render-pipeline consumption are both unreachable from the UI, and task 007's ⚡ glyph has nothing to open. This is the last of the four tasks in the Stage Direction / Performance Cue workload (`01-map.md`'s Part F, "F-ui").

## Exact files

- New: `frontend/src/pages/ChapterEditor/components/DirectorsConsole/AnnotationGutter/CueEditor.tsx` (the popover component — co-located with `AnnotationGutter` since it's the gutter's glyph-click consumer, not a separate top-level module).
- New: `frontend/src/pages/ChapterEditor/components/DirectorsConsole/AnnotationGutter/cueFormat.ts` (pure functions: display-string generation + multi-cue merge — kept separate from the component for unit testing without rendering).
- Edit: `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` — the `castGlyphsForSpan` helper (added by task 007) needs its `onClick` wired to open this popover; `renderSpan`'s span-click handler (lines 152–159) needs a guard so clicking a Performance Cue span's inline text does not also trigger a normal paint-assignment click.
- Reuse (no changes expected, cite for pattern only): `frontend/src/hooks/useFocusTrap.ts` (used by `ConfirmModal.tsx` for focus-trap + Escape-to-close — reuse the same hook for this popover's accessibility instead of writing new focus-trap logic); `frontend/src/components/forms/InlineEdit.tsx` (existing "click to edit, save on blur/Enter, cancel on Escape" convention — the Cue Editor's own free-text inputs should follow the same interaction feel, not a bespoke pattern).
- Reference only, do not copy JSX/logic verbatim (per `01-map.md` R-E, mock is layout truth not code truth): `frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx` lines ~548–650 (`CueEditor` demo component) — useful for the visual shape of the popover (header, labeled preset-button rows, style-prompt input, description input, live preview), but it is **missing a Volume picker and the "Other…" free-text override entirely** — this task must build the full spec (Rate/Pitch/Volume, each with Other…), not the demo's reduced version.

## Current shape (verified)

- No Cue Editor exists in production code anywhere. `CastTool/index.tsx`'s doc comment (lines 29–31) lists "Performance Cue" among deliberately-deferred items.
- Task 007 (dependency) defines `GutterGlyph { segmentId, glyph, tooltip?, onClick? }` and a `castGlyphsForSpan(span, onOpenCueEditor?)` helper in/near `ScriptView.tsx` that currently passes no `onOpenCueEditor` (leaves the ⚡ glyph's `onClick` unset). This task supplies that handler.
- Task 005 (dependency) defines `EngineDirectives { rate?, pitch?, volume?, style_prompt? }` on `frontend/src/types/index.ts`, and the whitelisted single-segment update path `PUT /segments/{segment_id}` (`app/api/routers/chapters.py:207-230`, whitelist extended in task 005 to allow `render`/`engine_directives`) — this is the natural endpoint for the Cue Editor's save action: a single-segment metadata edit, not a batch paint-assignment gesture. The existing frontend API client function for this route (referenced by the security comment at `chapters.py:197-203` as "mirrors `updateSegment`'s payload type in `frontend/src/api/index.ts`") should be reused — check `frontend/src/api/index.ts` for its exact name/signature (e.g. `updateSegment(segmentId, updates)`) before calling it.
- Design doc's exact display-format rules (§5 lines 169–174, verbatim):
  - Both SSML and description: `[slowly · low | voice catches, trailing off]` — `|` separates engine values (left) from human description (right).
  - SSML only: `[slowly · low]` — no `|`.
  - Description only: `[voice catches, trailing off]` — no `|`; displays identically to Stage Direction text but with the ⚡ gutter glyph (task 007 already handles the glyph distinction via `engine_directives != null`, since even a description-only cue still has an `engine_directives` object — see the "empty-but-present" note below).
  - Multiple cues merging onto one target segment (§5 line 165, engine-side merge already implemented by task 006): "last value per parameter wins; descriptions concatenate with ` · `" — this task needs the equivalent **display-string** merge as a pure, independently testable function (see Target shape), even though no new UI surface is required to show a "combined" view (see Out of scope).

## Target shape

**`cueFormat.ts` — pure functions, no React:**
```ts
export interface CueValues {
  rate?: string;      // preset 'slow'|'fast', or a free-text "Other…" value, or absent (normal)
  pitch?: string;      // preset 'low'|'high', or free-text, or absent (normal)
  volume?: string;     // preset 'soft'|'loud', or free-text, or absent (normal)
  style_prompt?: string;
  description?: string; // display-only — never part of EngineDirectives, kept separate here
}

const RATE_LABELS: Record<string, string> = { slow: 'slowly', fast: 'quickly' };
const PITCH_LABELS: Record<string, string> = { low: 'low', high: 'high' };
const VOLUME_LABELS: Record<string, string> = { soft: 'soft', loud: 'loud' };

// Maps a preset key to its natural-language label; an unrecognized value
// (i.e. anything typed into "Other…") is assumed to already be the
// engine-facing raw value and is shown verbatim, per the design doc:
// "Selecting 'Other' reveals a text input; the typed value passes through
// to the engine payload as-is... allowing raw SSML values (0.6x, +15%) or
// model-specific tokens." Raw tokens are not natural language, so they are
// not translated — shown exactly as typed.
function labelFor(value: string | undefined, presetLabels: Record<string, string>): string | null {
  if (!value) return null;
  return presetLabels[value] ?? value;
}

export function formatSsmlAdjectives(cue: CueValues): string {
  return [
    labelFor(cue.rate, RATE_LABELS),
    labelFor(cue.pitch, PITCH_LABELS),
    labelFor(cue.volume, VOLUME_LABELS),
  ].filter((v): v is string => v != null).join(' · ');
}

/** The exact `[slowly · low | voice catches]` / `[slowly · low]` /
 *  `[voice catches]` format from the design doc (§5 lines 169-174). */
export function formatCueDisplay(cue: CueValues): string {
  const ssml = formatSsmlAdjectives(cue);
  const style = [cue.style_prompt, cue.description].filter(Boolean).join(' ').trim()
    ? [cue.style_prompt, cue.description].filter(Boolean).join(', ')
    : '';
  // NOTE: decide during implementation whether style_prompt and description
  // both surface in the human-readable right-hand side, or whether
  // style_prompt (an engine-facing free-text override, not purely a human
  // note) belongs only in the SSML/left side conceptually. The design doc's
  // two-field Cue Editor spec (SSML pickers incl. style prompt; separate
  // "Description (optional)") treats style_prompt as engine input and
  // description as the display-only field — the safest reading is: only
  // `description` feeds the right-hand side of `|`; `style_prompt` has no
  // dedicated adjective mapping (it's free-form natural language already,
  // not a preset) and does not appear in the bracket display at all unless
  // no structured rate/pitch/volume are set, in which case showing
  // *something* is better than an empty bracket — use `description` alone
  // per the three documented cases; do not invent a fourth format for
  // style-prompt-only cues without checking with the design doc owner.
  const right = cue.description || '';
  if (ssml && right) return `[${ssml} | ${right}]`;
  if (ssml) return `[${ssml}]`;
  if (right) return `[${right}]`;
  return '[]'; // no values set — Cue Editor's Save button should be disabled in this state instead of persisting an empty bracket; see Steps.
}

/** Engine-payload merge for N cues preceding one renderable segment:
 *  last value wins per SSML param; descriptions concatenate with ' · '.
 *  Mirrors task 006's render-pipeline merge — kept here as an independently
 *  testable pure function per the design doc's exact wording (§5 line 165),
 *  even though no new UI currently calls it with more than one cue (see
 *  Out of scope) — this exists so the merge rule has ONE tested definition
 *  a future preview surface can reuse, not two divergent guesses.
 */
export function mergeCues(cues: CueValues[]): CueValues {
  const merged: CueValues = {};
  const descriptions: string[] = [];
  for (const cue of cues) {
    if (cue.rate) merged.rate = cue.rate;
    if (cue.pitch) merged.pitch = cue.pitch;
    if (cue.volume) merged.volume = cue.volume;
    if (cue.style_prompt) merged.style_prompt = cue.style_prompt;
    if (cue.description) descriptions.push(cue.description);
  }
  if (descriptions.length) merged.description = descriptions.join(' · ');
  return merged;
}
```

**`CueEditor.tsx` — the popover component:**
- Props: `segmentId: string`, `initialValues: CueValues`, `anchorRef: React.RefObject<HTMLElement>` (the clicked ⚡ glyph button, for positioning), `onSave: (values: CueValues) => void | Promise<void>`, `onCancel: () => void`.
- Three preset-button rows (Rate: slow/normal/fast, Pitch: low/normal/high, Volume: soft/normal/loud), each with an "Other…" button that reveals a text input (per design doc's exact field list — the demo mockup is missing Volume and "Other…" entirely, do not reuse its reduced field set).
- A style-prompt free-text input (optional).
- A description free-text input (optional).
- A live preview showing `formatCueDisplay(currentValues)` as the user edits.
- Save button disabled when `formatCueDisplay(currentValues) === '[]'` (no values set at all — an empty cue is not a valid save state; the user should use Stage Direction or the Narrator eraser instead of an empty Performance Cue).
- Reuse `useFocusTrap` (`frontend/src/hooks/useFocusTrap.ts`) for focus containment + Escape-to-cancel, matching `ConfirmModal.tsx`'s existing pattern rather than writing new modal-accessibility logic.
- Positioned near `anchorRef` (a simple `getBoundingClientRect()`-based placement is sufficient — this is a small popover, not a full modal; do not center it on the viewport the way the demo mockup does).

**Save action:** on save, call the existing single-segment update API (find its exact name in `frontend/src/api/index.ts`, referenced by `chapters.py:197-203`'s comment as `updateSegment`) with:
```ts
{
  render: false,
  engine_directives: { rate: values.rate, pitch: values.pitch, volume: values.volume, style_prompt: values.style_prompt } /* description NOT included — display-only, never part of the engine payload per design doc line 350 */,
  text_content: formatCueDisplay(values), // the generated bracket string becomes the segment's own visible text
}
```
Note `EngineDirectives` (task 005's type) has no `description` field — strip it out of the object passed as `engine_directives`, keep it only for computing the `text_content` display string via `formatCueDisplay`.

**Wiring into `ScriptView.tsx` (task 007's `castGlyphsForSpan`):** supply the `onOpenCueEditor` callback this task was left as a hook for — clicking a ⚡ glyph opens `CueEditor` anchored to that glyph, seeded with `span.engine_directives` (plus a `description` value extracted by reverse-parsing... **do not reverse-parse `text_content` to recover the original description** — instead, since `EngineDirectives` has no `description` field to round-trip from, either (a) accept that re-opening an existing cue for editing starts with a blank description field even though the bracket text is still shown as the span's own inline text until saved again, or (b) store `description` as an extra, non-`EngineDirectives` key in the same JSON blob written to the `engine_directives` DB column (task 005's column is a free-form JSON TEXT column — nothing stops writing `{rate, pitch, volume, style_prompt, description}` into it even though the TypeScript `EngineDirectives` interface only names four of those keys) and simply ignore the extra `description` key at render-pipeline/engine-consumption time (task 006 already only reads `rate`/`pitch`/`volume`/`style_prompt` off the decoded dict, extra keys are harmless). **Prefer option (b)** — it round-trips correctly for re-editing and costs nothing since task 006 never enumerates unknown keys. Update task 005's `EngineDirectives` TS type only if needed for editor convenience (adding an optional `description?: string` field there is fine — it's additive and task 006's Python-side merge/consumption logic reads specific keys off a decoded dict, not a validated schema, so an extra key is inert).

**`renderSpan`'s click handler (`ScriptView.tsx:152-159`):** a Performance Cue span (`engine_directives != null`) should open the Cue Editor for re-editing on click instead of (or in addition to) the normal paint-assignment click-to-commit behavior — guard the existing `onClick` handler with a check for this case, consistent with how the handler already special-cases "has a text selection" (line 153-154).

## Steps

1. Write `cueFormat.ts` with `formatSsmlAdjectives`, `formatCueDisplay`, `mergeCues` and unit tests asserting the exact three documented formats (`[slowly · low | voice catches]`, `[slowly · low]`, `[voice catches]`) plus the empty-cue `'[]'` case and the multi-cue merge rule (last-value-wins + `' · '`-joined descriptions).
2. Build `CueEditor.tsx` per the Target shape (three SSML picker rows with Other…, style prompt, description, live preview, Save/Cancel, focus trap).
3. Wire `CueEditor` into `ScriptView.tsx` via `castGlyphsForSpan`'s `onOpenCueEditor` parameter (added by task 007 as an unused hook) and the `renderSpan` click-handler guard.
4. Confirm the save action's request shape matches task 005's whitelisted fields exactly (`render`, `engine_directives`, `text_content`) — check `frontend/src/api/index.ts`'s existing segment-update function signature before wiring the call.
5. Add a test covering: opening the popover, setting Rate=slow + Pitch=low + description "voice catches", saving, and asserting the resulting API call payload's `text_content === '[slowly · low | voice catches]'` and `engine_directives === {rate: 'slow', pitch: 'low', description: 'voice catches'}` (per the option-(b) decision above, if taken).
6. Run `npm -C frontend run lint` and the targeted vitest run for the changed files.

## Acceptance criteria

- [ ] `cueFormat.ts`'s `formatCueDisplay` produces exactly the three documented formats for the three documented cases, verified by unit tests (not a test that re-derives the same string and compares it to itself — assert against the literal expected strings from the design doc).
- [ ] `mergeCues` implements last-value-wins per SSML param and `' · '`-joined description concatenation, verified by a unit test with 3+ input cues.
- [ ] Clicking a ⚡ gutter glyph (task 007) opens the Cue Editor anchored near that glyph, pre-populated with the segment's existing `engine_directives` (if any).
- [ ] The Cue Editor offers Rate/Pitch/Volume presets each with an "Other…" free-text override, plus a style-prompt field and a description field — matching the design doc's full field list, not the demo mockup's reduced one (no Volume, no Other…).
- [ ] Saving writes `render: false`, `engine_directives` (four SSML/style keys, `description` excluded per the design doc's "display-only, never in the annotation bag" rule, unless option (b) above is taken to store it alongside for re-edit convenience — pick one and document which in the PR), and `text_content` set to the generated bracket string, via the existing single-segment update endpoint.
- [ ] Save is disabled when no field has a value (empty-cue case).
- [ ] Re-opening a previously-saved cue for editing shows its previously-set values (verifies whichever round-trip approach was chosen in Steps).
- [ ] `npm -C frontend run lint` and the targeted vitest run are clean.

## Map links

Part F (Cue Editor UI half) in `01-map.md`. Design doc `design-docs/workflows/chapter-editor-modes.md` §5 lines 165–178, §13 line 353 (the exact field list and display-format rules this task must match verbatim).

## Dependencies

Task 007 (gutter's `GutterGlyph.onClick`/`castGlyphsForSpan` hook must exist to open this popover from). Task 005 (the `engine_directives`/`render` fields and the whitelisted single-segment update endpoint this task writes through).

## Out of scope

- Any change to the render pipeline's engine-side merge (task 006 already implements last-value-wins/skip logic server-side) — this task's `mergeCues` is a frontend-only, independently-testable mirror of that rule, not a second implementation the render pipeline depends on.
- A dedicated UI surface showing the "combined/merged" cue when multiple Performance Cues precede one renderable segment — each cue segment displays its own individually-generated bracket text inline (via `renderSpan`), which satisfies "a cue... displays correctly" per the design doc; `mergeCues` exists as a correct, tested utility for whenever such a surface is needed, not because this task must build one.
- Painting a span as a Performance Cue in the first place (the `P` keyboard shortcut / CastPalette system entry that sets `render: false` and opens this editor for a brand-new cue) — same scoping note as task 005: this task builds the editor itself and its re-edit entry point (clicking an existing ⚡ glyph), but the initial paint-gesture wiring for creating a new cue from scratch is not one of the four tasks in this workload.
- Any change to `app/domain/chunk_groups.py` or the render pipeline (task 006's territory) — this task only ever calls the existing single-segment update endpoint.

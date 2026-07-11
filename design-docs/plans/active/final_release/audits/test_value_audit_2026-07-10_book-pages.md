# Test Value Audit — Book pages — 2026-07-10

Scope: 28 files under `frontend/tests/unit/pages/Book/` (recursive), 177 total test cases reviewed.
Every file was read in full alongside its corresponding source component(s) under `frontend/src/pages/Book/`.

## DEFINITE delete candidates

All six live in one file — `LexiconStage` (`frontend/src/pages/Book/stages/LexiconStage.tsx`) is a
literal one-line wrapper:

```ts
export function LexiconStage() {
  const { bookId } = useBookDataContext();
  return <LexiconPanel projectId={bookId} />;
}
```

Its test file re-runs almost the entire CRUD behavior suite that already exists, in full, against the
real `LexiconPanel` component in `frontend/tests/unit/pages/Book/components/LexiconPanel.test.tsx`
(list/empty/add/edit/delete/cancel, same fixtures, same assertions, same mock shape). Since
`LexiconStage` itself contains zero branching logic beyond "pull `bookId` out of context and forward
it as `projectId`," none of these six tests exercise any behavior that isn't already fully covered
by `LexiconPanel.test.tsx`. They are true duplicates per the audit's "two or more tests asserting the
exact same behavior via different setup, with no unique edge case each one adds" criterion.

- `frontend/tests/unit/pages/Book/stages/LexiconStage.test.tsx:60` — `LexiconStage > lists entries returned by fetchLexicon` — duplicates `LexiconPanel.test.tsx`'s identical test; the only book-keeping this adds (bookId flows to `fetchLexicon`) is implied by every other test in the file too.
- `frontend/tests/unit/pages/Book/stages/LexiconStage.test.tsx:74` — `shows an empty-state message when there are no entries` — duplicate of `LexiconPanel.test.tsx:70`.
- `frontend/tests/unit/pages/Book/stages/LexiconStage.test.tsx:86` — `add calls addLexiconEntry and the new entry appears in the list` — duplicate of `LexiconPanel.test.tsx:96`.
- `frontend/tests/unit/pages/Book/stages/LexiconStage.test.tsx:116` — `edit calls updateLexiconEntry with updated values` — duplicate of `LexiconPanel.test.tsx:170`.
- `frontend/tests/unit/pages/Book/stages/LexiconStage.test.tsx:142` — `delete opens confirm modal and calls deleteLexiconEntry on confirm` — duplicate of `LexiconPanel.test.tsx:215`.
- `frontend/tests/unit/pages/Book/stages/LexiconStage.test.tsx:169` — `cancel in confirm modal does not call deleteLexiconEntry` — duplicate of `LexiconPanel.test.tsx:242`.

Recommendation: delete all six and replace with (at most) one smoke test confirming `LexiconStage`
forwards `bookId` as `LexiconPanel`'s `projectId` prop (e.g. mock `LexiconPanel` and assert the prop),
mirroring how `ChapterWorkspaceHeaderFeatures.test.tsx` verifies the workspace's dockable-panel wiring
without re-testing `LexiconPanel`'s internals a second time.

## DISCUSS (borderline, needs a human call)

- `frontend/tests/unit/pages/Book/components/ChapterImportBar.test.tsx:6` — `ChapterImportBar > uses a compact inline control when requested` — every assertion is an inline-style-string substring match (`min-height: 42px`, `flex: 1 1 280px`, `margin-right: auto`). These are incidental CSS values, not a contractual API — any layout tweak breaks the test without a real regression. The one behavioral assertion worth keeping (`"Choose file"` text absent in compact mode) is buried among four brittle style checks. Uncertain whether the team considers pixel-level layout a real contract here or whether this is unintentional over-specification.
- `frontend/tests/unit/pages/Book/stages/ContentsStage.test.tsx:210` — `highlights the import dropzone while files are dragged over it` — asserts `getAttribute('style')` contains `border: 1px dashed var(--accent)` / `background: var(--accent-glow)` rather than checking a class or data-attribute. The underlying behavior (drag state toggles visual feedback) is real, but the assertion mechanism is fragile to any style refactor. Flagging for a call on whether to loosen to a class-based check.
- `frontend/tests/unit/pages/Book/studio/CastPalette.test.tsx:76` — `does not render a voice-select dropdown` — asserts absence of `screen.queryByTestId('voice-select')`. Grepping the entire `frontend/src` tree finds no `voice-select` testid anywhere, past or present in the currently checked-out tree, so it's unclear what regression this actually guards against (a testid that doesn't exist can't accidentally reappear under that exact name). Likely a leftover from a design-critique fix where the dropdown was removed; worth confirming it still protects something before keeping it.
- `frontend/tests/unit/pages/Book/studio/RenderControlsStrip.test.tsx:6` — `renders queue controls and the predictive progress bar for a running render` — the component (`RenderControlsStrip`) is a straight re-export of `ChapterScriptToolbar` from `ChapterEditor/components/ChapterHeader`, which already has an extensive, dedicated test suite (per the June 2026 frontend-pages audit, `ChapterHeader.test.tsx` / `ChapterHeaderProgressContract.test.tsx`, ~40 tests). This is the file's only test: one large kitchen-sink props object, no interaction, a handful of presence assertions. It does catch an import/re-export break, but adds no behavior coverage beyond what's already tested under the re-exported name. Judgment call on whether a single smoke test is worth keeping for the re-export alias.
- `frontend/tests/unit/pages/Book/BookInfoCard.test.tsx:118` — `uses the same borderless inline editor for title, author, and series text` — asserts `toHaveStyle({ borderStyle: 'none', background: 'transparent' })` on three separate inline-edit instances. The intent (title/author/series share one visual contract) is legitimate, but style-object assertions are brittle to incidental restyling. Borderline because the "same treatment across three fields" invariant is real and would be awkward to assert any other way without a shared test id/class convention.

## Notable KEEP (high-value tests worth calling out)

- `frontend/tests/unit/pages/Book/studio/useStudioChapter.test.tsx` — an exemplary regression suite: every test cites the exact dated defect it guards against (e.g. "2026-07-07 fix", "W-PAR 006", "H5 violation"), uses fake timers correctly to prove real per-segment progress *interpolation* (not just eventual correctness), and covers adversarial edge cases (concurrent segment completion out of index order, stale local state vs. authoritative empty backend map). This is the gold standard for the "REAL" classification in this audit.
- `frontend/tests/unit/pages/Book/lib/useChapterText.test.ts` — three tight, fake-timer-based tests proving the autosave-flush-on-unmount contract (R1-quality: each test states exactly what breaks pre-fix).
- `frontend/tests/unit/pages/Book/ChapterTable.test.tsx` — dense, fully-interactive coverage of confirm-modal guards (rebuild, large-chapter warning, reset, delete), row-click vs. rename vs. menu event isolation, and real download/play URL construction — no shortcuts taken.
- `frontend/tests/unit/pages/Book/components/LexiconPanel.test.tsx` — clean CRUD coverage that mocks only the API boundary (per R2), including the blank-field and duplicate-word error paths the `LexiconStage` duplicate above omits.

## Summary

- 6 definite-delete candidates, 5 discuss, out of 177 total tests reviewed.
- This is a healthy test suite. The Book-pages area is dominated by real, interaction-driven tests
  that exercise conditional branches, async flows (fake timers, no sleeps), and callback wiring rather
  than static text presence — the owner's stated complaint (tests that just check text exists) largely
  does not describe this slice of the codebase. The one clear miss is structural rather than
  qualitative: `LexiconStage` is a trivial pass-through component that got a full copy of its child's
  test suite instead of a thin wiring check, which is pure maintenance cost with no additional
  detection power. The remaining five findings are all judgment calls about asserting on inline style
  strings instead of a more stable contract (class/data-attribute) — none of them are vacuous, mocked-out,
  or wrong-scenario; they're FRAGILE at worst, and in two cases (RenderControlsStrip, the voice-select
  negative check) the concern is redundancy/uncertain protective value rather than fragility per se.

# Test Value Audit — ChapterEditor/DirectorsConsole — 2026-07-10

Scope: 23 test files, 212 total test cases reviewed, under
`frontend/tests/unit/pages/ChapterEditor/` (recursively, including
`components/DirectorsConsole/{CastTool,BoothTool,ReviseTool,WriteTool}/`).

Every file was read in full, paired against its source component(s), before
any test was flagged. This is the first audit pass over this area (all code
is 1-2 days old per the brief).

## DEFINITE delete candidates

- `frontend/tests/unit/pages/ChapterEditor/PlaybackControls.test.tsx:19` — `PlaybackControls Component > renders all controls` — pure static-presence check (4x `toBeInTheDocument()`), no interaction or state variation; fully subsumed by the conditional tests right below it (`shows Play when not playing`, `disables Prev when hasPrev is false`, etc.) which exercise the same buttons through real branches.

- `frontend/tests/unit/pages/ChapterEditor/components/DirectorsConsole/DirectorsConsole.test.tsx:60` — `DirectorsConsole > renders an icon rail entry for every registered tool` — self-referential: it derives its expected tab count/labels from importing the exact same `directorsConsoleTools` registry the component itself reads, so a broken registry can never fail this test. The very next test (`includes the three core tools and the future-slot placeholders`, line 71) hardcodes the real expected labels (`Cast`, `Booth`, `Revise`, `Casting Call`, `Script Supervisor`, `Plugin`) and is a strictly stronger version of the same check.

- `frontend/tests/unit/pages/ChapterEditor/components/ChapterHeaderProgressContract.test.tsx:673` — `ChapterHeader progress contract > renders with data-testid="chapter-header-segment-progress-bar"` — bare presence assertion with no other expectation; every other test in this 900-line file already asserts this same testid as one line inside a much richer behavioral check (ETA, progress value, checkpoint mode, etc.), so this test adds no unique coverage.

- `frontend/tests/unit/pages/ChapterEditor/components/EditTab.test.tsx:45` — `EditTab > shows analyzing state` — asserts `screen.getByText('Analysis')`, but per `EditTab.tsx:96-100` that label renders unconditionally regardless of the `analyzing` prop (only the icon swaps between `RefreshCw`/spin and `Info`, which this test never checks). The test therefore does not actually verify the analyzing behavior it's named for — it would pass identically with `analyzing={false}`.

- `frontend/tests/unit/pages/ChapterEditor/components/EditorTabs.test.tsx:6` — `EditorTabs > renders all tab buttons` — static presence with `editorTab` fixed at one value (no branch exercised), plus several negative assertions (`Live Output`, `Production`, `Performance`, `Preview Safe Output` all "not in document") for tab labels `EditorTabs.tsx` never renders in **any** state — those assertions are trivially true regardless of correctness (vestigial from an earlier, larger tab set). Real coverage of these two tabs is already provided by `calls setEditorTab when a tab is clicked` right below it.

## DISCUSS (borderline, needs a human call)

- Four near-identical "registry contract" tests, one per DirectorsConsole tool, each asserting only hardcoded `id`/`label`/`demoPlaceholder` constants with no interaction or branch:
  - `components/DirectorsConsole/CastTool/CastTool.test.tsx:278` — `keeps the id/label/icon contract expected by the registry`
  - `components/DirectorsConsole/BoothTool/BoothTool.test.tsx:150` — `registers with the id/label/icon expected by the tool registry`
  - `components/DirectorsConsole/ReviseTool/ReviseTool.test.tsx:75` — `registers with the id/label expected by the tool registry`
  - `components/DirectorsConsole/WriteTool/WriteTool.test.tsx:72` — `is registered with the expected id, label, and non-placeholder flag`

  Uncertainty: these do pin a real contract (`DirectorsTool.id`/`.label` are read by the registry and by `DirectorsConsole`'s rail-tab rendering/aria-label lookup), so a rename would be caught here first with a precise failure message. But they test literal string constants with zero logic, are mutually redundant in shape, and a rename would likely also break `DirectorsConsole.test.tsx`'s label-based `getByRole('tab', {name...})` queries anyway. Recommend collapsing to one shared "registry contract" table-test (or dropping in favor of the DirectorsConsole-level coverage) rather than deleting outright, since the failure-message clarity has some value during future refactors.

## Notable KEEP (high-value tests worth calling out)

- `components/DirectorsConsole/BoothTool/AnnotationsPanel.test.tsx` — `does NOT wipe the note being typed when activeSegmentId changes underneath it, and saves against the pinned segment` and `releases the pin on blur when the note is empty` — exemplary R1-style regression tests for the note-pinning fix; they drive the exact race (playback moving `activeSegmentId` mid-type) that produced the bug, not just the pinned/unpinned end states.
- `components/DirectorsConsole/ReviseTool/SegmentSplitter.test.ts` — `splits at the nearest clean sentence boundary...` explicitly revert-checks against the naive "always split at the character limit" implementation (asserts the actual result is NOT what that buggy version would produce), which is exactly the kind of test that proves it would fail pre-fix.
- `components/DirectorsConsole/BoothTool/BoothTool.test.tsx` — `keeps the later chapter's segments when an earlier chapter's fetch resolves after it (stale-response guard)` and the equivalent test in `ReviseTool.test.tsx` — real out-of-order-async race coverage (resolve later request first, then the stale earlier one, assert the stale response is discarded).
- `components/ChapterHeaderProgressContract.test.tsx` — the `(ETA-LEAK)` and `(REASON-CODE-WIRE)` tests carry inline pre-fix/post-fix comments describing exactly what regressed and why — strong R1 documentation discipline.
- `components/ScriptView.test.tsx` — `keeps a just-completed segment lit via liveDoneSpanIds even before the DB refetch catches up` — cites the owner's real bug report and asserts the negative space (does NOT also carry the later-specificity pending/queued classes that would silently override the fix), not just the positive class.

## Summary

- 5 definite-delete candidates, 4 discuss, out of 212 total tests reviewed.
- Overall this is a strong test suite for freshly-written code: the overwhelming majority of tests drive real interactions, conditional branches, async races, and websocket/progress edge cases, and several are explicit, well-documented R1 revert-check regression tests (note-pinning, ETA leak, stale-segment races, sentence-boundary splitting). The low-value tail is small and concentrated in two patterns: (1) a handful of pure "does the static markup exist" checks that got left in place after being superseded by better conditional tests in the same file, and (2) four boilerplate "registry contract" tests (one per DirectorsConsole tool) that check hardcoded id/label constants with no logic — worth consolidating but not urgent. No self-referential math checks, no mocking of the unit under test, and no long-abandoned `.skip`/`.todo` tests were found anywhere in this area.

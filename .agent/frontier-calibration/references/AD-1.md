# AD-1 — Gold-standard reference: word-boundary snapping, hostile read

## Question restated

The word-boundary snapping algorithm exists twice with no shared parity test:
`_snap_offset_to_word_boundary` (Python, authoritative) in
`app/domain/chapters/operations.py` and `snapOffsetToWordBoundary` (TypeScript, UX
preview) in `frontend/src/pages/ChapterEditor/components/ScriptView.tsx`. Do a hostile
read: (1) find concrete inputs where the two diverge (the JS `/\s/` vs Python
`str.isspace()` codepoint gap is one known class); (2) adjudicate whether the "backend
snaps last and authoritatively, so any disagreement can at most over-expand a selection
or mis-draw the preview — never a mid-word split" safety argument holds on every path;
(3) check the `showSafeText` offset-fidelity concern (DOM selection offsets index the
*rendered* text, which may be `sanitized_text`, not the raw `text_content` the backend
splits).

## What was examined

- `app/domain/chapters/operations.py:385-498` — `_apply_range_assignment` (both the
  single-span path, lines 410-426, and the multi-span path, lines 427-451) and
  `_snap_offset_to_word_boundary` (lines 468-498).
- `app/domain/chapters/operations.py:501-513` — `_split_segment_at_offset` guard
  (`offset <= 0 or offset >= len(text)` → no split) and the raw `text[:offset]` /
  `text[offset:]` slicing.
- `frontend/src/pages/ChapterEditor/components/ScriptView.tsx:27-61` —
  `snapOffsetToWordBoundary` and its twin-sync comment block.
- `frontend/src/pages/ChapterEditor/components/ScriptView.tsx:388` — `getDisplayText`
  (renders `sanitized_text || text` when `showSafeText` is on).
- `frontend/src/pages/ChapterEditor/components/ScriptView.tsx:431-475` —
  `handleSelection`: reads `range.startOffset`/`endOffset` from the live DOM Range,
  snaps against `spanMap.get(id)?.text` (always the **raw** text, lines 455-458), posts
  the result.
- `tests/domain/test_chapter_range_assignment.py` and
  `frontend/tests/unit/pages/ChapterEditor/components/ScriptView.test.tsx` — grepped for
  exotic-whitespace coverage (`U+`, `FEFF`, `0085`, `isspace`, `\s`): **zero matches**;
  neither suite exercises the divergent codepoints, confirming the "parallel tests, no
  shared golden fixture" premise.
- `design-docs/plans/proposals/span_resync_preservation.md:75-112` — the "Related
  maintenance risk" and "Related offset-fidelity gap: showSafeText" sections (used to
  cross-check, findings derived from code first).

## Findings

### F1 — Whitespace-class divergence (JS `/\s/` vs Python `str.isspace()`): real, demonstrable, but correctly bounded — LOW

- **Where:** `ScriptView.tsx:54` (`/\s/.test(c)`) vs `operations.py:490-497`
  (`.isspace()`).
- **Triggering inputs:** the divergent codepoints are exactly:
  - **U+FEFF** (ZERO WIDTH NO-BREAK SPACE / BOM): JS whitespace, Python
    `'﻿'.isspace()` is `False`.
  - **U+001C–U+001F** (file/group/record/unit separators) and **U+0085** (NEL): Python
    whitespace, JS non-whitespace.
- **Wrong outcome:** with e.g. `text = "foobar"` and an `end` offset of 2
  (inside `foo`): frontend snaps `end` forward past `` to 7 (it sees one 7-char
  word) and previews/pill-highlights through `bar`; the backend snaps to 3 (it stops at
  the NEL) and splits/assigns only `foo`. Mirror case with U+FEFF: an offset adjacent to
  the BOM is "already on a boundary" for the frontend (returned unchanged,
  `ScriptView.tsx:55`) but mid-word for the backend, which expands it
  (`operations.py:490`). Effect: the popover preview and the applied assignment disagree
  by up to one word.
- **Severity: LOW.** Cosmetic/preview-only, self-documented in both files
  (`operations.py:480-486`, `ScriptView.tsx:41-46`), and the codepoints are vanishingly
  rare in manuscript prose (a BOM leaking into `text_content` mid-import is the most
  plausible source). No data-integrity impact — see F5. The real exposure is the absent
  parity test: nothing prevents a future edit from widening this class silently, and
  neither test suite touches any divergent codepoint today.

### F2 — `showSafeText` offset infidelity: selection offsets index rendered `sanitized_text`, snap and split index raw `text` — MEDIUM, confirmed unhandled

- **Where:** `ScriptView.tsx:388` renders `span.sanitized_text || span.text` when the
  toggle is on, so the DOM text node — and therefore `range.startOffset`/`endOffset`
  (`ScriptView.tsx:439,457-458`) — indexes the sanitized string. But
  `handleSelection` snaps against `spanMap.get(startSpanId)?.text` (raw,
  `ScriptView.tsx:455-456`), and the backend splits raw `text_content`
  (`operations.py:411-416,512-513`). Nothing in `handleSelection` (431-475) gates on or
  compensates for `showSafeText`.
- **Triggering input:** any span where sanitization changes length (that is
  sanitization's whole point). Example: raw `He said "damn it" loudly`, sanitized
  `He said "dang" loudly`. User in safe mode selects `loudly` (sanitized offsets 15-21);
  applied against the raw string those offsets land inside `it" lou`, which snap outward
  to different words than the ones the user selected.
- **Wrong outcome:** the character assignment lands on the wrong word(s) of the raw
  text, silently, with a preview popover that showed the user something else. If
  `sanitized_text` is *longer* than raw, an offset can exceed `len(text_content)`; the
  backend then returns it unchanged (`operations.py:488`) and `_split_segment_at_offset`
  refuses the split (`operations.py:509`), so the **entire segment** is assigned — a
  larger mis-assignment, though not a crash.
- **Severity: MEDIUM.** Silent wrong-data written to `chapter_segments`
  (character/speaker assignment + `audio_status='unprocessed'` reset,
  `operations.py:453-465`) in a supported UI mode. Acknowledged as a known gap in
  `span_resync_preservation.md:94-112` (fix = map sanitized offsets back to raw before
  snapping), but there is no in-code guard (e.g., disabling range selection while
  `showSafeText` is on would be a two-line mitigation).

### F3 — UTF-16 code units vs Unicode code points: an undocumented divergence class larger than the whitespace one — MEDIUM-HIGH, not flagged anywhere

- **Where:** DOM `Range.startOffset`/`endOffset` (`ScriptView.tsx:439`) and all JS
  string indexing (`ScriptView.tsx:53-60`) count **UTF-16 code units**; Python `len()`,
  `text[offset]`, and `text[:offset]` (`operations.py:488-498,512-513`) count **code
  points**.
- **Triggering input:** any span text containing an astral character (emoji, many CJK
  extension ideographs, math alphanumerics) *before* the selection. `"I 😀 love you"` —
  selecting `love`: DOM/JS start offset is 5 (😀 is two code units); Python position of
  `love` is 4. The posted offset 5 lands at `ove…`/one-past in Python indexing.
- **Wrong outcome:** every offset after the astral char is shifted by +1 per astral
  char. The backend still snaps the shifted offset to *a* word boundary, but potentially
  of the **adjacent** word — the assignment silently lands one word off (or, for a
  shifted `start` inside the following word, snaps backward and *includes* a word the
  user excluded). Additionally the astral char itself can be split by
  `_split_segment_at_offset` only in the code-unit sense — in Python it can't (Python
  can't index half a surrogate pair), so no corruption, but selection fidelity is broken.
- **Severity: MEDIUM-HIGH** for manuscripts containing emoji/astral chars (modern
  fiction genuinely does), because unlike F1 this class is **not documented** in either
  twin's comment block (`operations.py:480-486`, `ScriptView.tsx:41-46`) or in the
  proposal doc — the "differ only at exotic whitespace codepoints" claim
  (`operations.py:481`) is itself incomplete. A parity test built on shared golden
  fixtures would surface this immediately if fixtures include astral chars; the
  follow-up should mandate that.

### F4 — No executable parity check — confirmed premise, LOW-as-is / structural

- **Where:** the only sync mechanisms are the cross-referencing comment blocks
  (`operations.py:471-486`, `ScriptView.tsx:36-46`). Grep of both test files finds no
  shared fixture and no divergent-codepoint case.
- **Wrong outcome:** a future single-sided edit (e.g., changing the punctuation-attaches
  rule on one side) diverges silently; the backend's authority bounds the damage to
  preview/applied mismatch (per F5), but that mismatch is a trust-destroying UX bug that
  no test would catch.
- **Severity:** structural risk, LOW today (implementations verified line-for-line
  equivalent modulo F1/F3 semantics). The right fix is a golden-fixture parity test —
  one JSON fixture of `(text, offset, boundary) → expected` consumed by both pytest and
  vitest — with fixtures deliberately including U+FEFF, U+0085, U+001C, NBSP, and astral
  chars, plus an explicit decision on whether offsets are code units or code points.

### F5 — Adjudication of the safety argument: HOLDS for integrity, FAILS as stated for fidelity

- The strong claim — "can never produce a mid-word split" — **holds on every path**.
  Verified: every `_split_segment_at_offset` call in `_apply_range_assignment` is
  immediately preceded by a backend snap of that same offset against that same segment's
  `text_content` (single-span: `operations.py:415-416` before `420,423`; multi-span end:
  `431` before `433`; multi-span start: `438` before `441`). There is no path where an
  unsnapped or foreign-text offset reaches the splitter, and the splitter's own bounds
  guard (`operations.py:509`) degrades out-of-range offsets to "no split" rather than
  clamping into a word.
- The weaker claim — "any disagreement can at most **over-expand** a selection" —
  **does not hold**. F2 and F3 both produce offsets that are wrong before snapping, and
  snapping a wrong offset yields a boundary-aligned assignment of the *wrong words*:
  a shift, not an expansion, and the applied range can also *exclude* words the user
  selected (backend `end` snapping to an earlier boundary than previewed, per F1's NEL
  example). Word-level integrity is guaranteed; selection fidelity is not. The comment
  blocks should be reworded to claim only the former.
- One further documented-but-live caveat: `ScriptView.tsx:449-454` admits that a
  currently-rendering span draws per-character nodes, so `range.startOffset` may not
  index full-span text at all — another fidelity (not integrity) hole on the same
  argument, explicitly deferred in-code.

## Confidence

- F1, F2, F5: **high** — each is demonstrable from the cited lines by direct
  language-semantics reasoning; F2 is independently corroborated by
  `span_resync_preservation.md:94-112`.
- F3: **high** on the mechanism (UTF-16 vs code-point indexing is definitional; DOM
  offsets are code units per the DOM spec), **medium** on real-world frequency.
- F4: **high** that no parity test exists (grep-verified in both suites).

## What could not be determined

- Whether `sanitized_text` in practice ever differs in **length** from `text_content`
  (F2's trigger) — the sanitization producer wasn't traced; `operations.py:31` shows it
  flows from a DB column. If sanitization is guaranteed length-preserving, F2 collapses
  to theoretical; nothing found asserts that guarantee.
- Whether real project manuscripts contain astral characters (F3's trigger) — no corpus
  inspected.
- Runtime DOM behavior (e.g., whether `range.startOffset` can reference an element node
  rather than a text node in edge layouts, changing its meaning from character offset to
  child index) — static read only; this would be a further fidelity hole of the same
  bounded class.
- The design-doc spec the comments say "defines both classes literally"
  (`operations.py:486`) was not located beyond the proposal doc; if a spec normatively
  freezes the JS-vs-Python whitespace divergence, it too omits the F3 code-unit class.

# Plan — word-boundary snap parity fixes (from AD-1 hostile review)

**Status:** DRAFT — awaiting plan review. No code changes made producing this plan.
**Feeds from:** an adversarial review (AD-1, 2026-07-19) that found 5 findings (F1-F5); the
standout is F3, a **previously undocumented** bug class larger than the one this review was
originally scoped to find.

## Findings, by severity, and what to do about each

### F3 — UTF-16 code-unit vs. Unicode code-point offset divergence (MEDIUM-HIGH, undocumented until now)

DOM `Range.startOffset`/JS string indexing counts UTF-16 code units; Python counts code points. Any
span containing an astral character (emoji, CJK extension ideographs) before a selection shifts
every subsequent offset by +1 per astral char — the backend still snaps to *a* word boundary, but
silently the wrong one (word-level integrity holds; selection fidelity doesn't). Not documented in
either twin's own comment block, and the existing "differ only at exotic whitespace" claim
(`operations.py:481`) is itself incomplete.

**Fix**: convert the DOM's UTF-16 code-unit offset to a Unicode code-point offset in the frontend
before posting it to the backend (standard technique: iterate the string counting code points up to
the UTF-16 offset, or use `Array.from(text.slice(0, utf16Offset)).length`). Test: a span containing
an astral character before the target word; assert the posted offset lands on the correct word after
conversion, and add this case to the parity fixture (see F4).

### F2 — `showSafeText` offset infidelity (MEDIUM, confirmed unhandled)

When sanitized-text display is on, DOM selection offsets index the *sanitized* string, but the
backend snap/split operates on raw `text_content` — any length-changing sanitization silently
mis-assigns the wrong word(s), and can assign the entire segment if the sanitized offset exceeds the
raw string's length.

**Fix**: map the sanitized-text offset back to the raw-text offset before posting (requires knowing
the sanitization transform, or a two-cheapest-first-check: if `sanitized_text` is guaranteed
length-preserving, this collapses to a non-issue — verify that first). If length-preserving isn't
guaranteed, the two-line mitigation the reference identifies (disable range selection while
`showSafeText` is on) is the cheap interim fix; do the real offset-mapping fix if sanitization length
changes are common enough to matter.

### F4 — No executable parity test between the two snap implementations (structural, LOW today)

**Fix**: one JSON golden fixture — `(text, offset, boundary) → expected` — consumed by both pytest
and vitest. Fixtures MUST include: U+FEFF, U+0085, U+001C (the F1 whitespace-class divergence), and
an astral character (the F3 case). This is the mechanism that would have caught F3 immediately had it
existed.

### F1 — Whitespace-class divergence (LOW, correctly bounded, preview-only)

Already self-documented in both files' comment blocks; no data-integrity impact (per F5's
adjudication). **Fix**: add the exact divergent codepoints (U+FEFF, U+001C-001F, U+0085) to the F4
parity fixture so the documented-but-untested class actually has a test. No code change beyond the
fixture.

### F5 — Correct the safety-argument wording (documentation-only)

The strong claim ("never a mid-word split") holds on every path — verified, keep it. The weaker claim
("disagreement can at most over-expand a selection") is **false** — F2/F3 both show a shift, which
can also *exclude* words the user selected. **Fix**: reword both files' comment blocks to claim only
word-level integrity, not selection-fidelity boundedness.

## Task order

1. F4's parity-fixture harness first (cheap, and it's the regression-proof mechanism for everything
   else) — write it with the F1/F3 cases already known to diverge, confirm both suites currently pass
   or fail as expected against the *current* (unfixed) implementations.
2. F3's UTF-16→code-point conversion fix — highest severity, concrete, testable.
3. F2 — resolve the length-preservation question first (cheap check), then either close as
   theoretical or apply the interim/real fix based on what's found.
4. F5's comment-block wording correction — trivial, do last alongside a final doc pass.

## Out of scope

Runtime DOM edge cases (a `range.startOffset` referencing an element node instead of a text node) —
flagged by the reference as a further fidelity hole of the same bounded class, but not investigated
here; file separately if it proves real.

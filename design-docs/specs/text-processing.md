# SP6 — Text Processing Spec

**spec_version:** 1.1.1  
**status:** active  
**owner:** Studio 2.0

---

## Changelog

| Version | Date       | Author      | Notes                         |
|---------|------------|-------------|-------------------------------|
| 1.1.1   | 2026-06-13 | Studio team | Staleness fix: refreshed the example "segment" count surface list (analysis strip, cast palette counts, script-view Numbers toggle) — the in-page character sidebar is removed by the site redesign (casting moves to a right-hand Cast palette); binding contract (counts derive from `build_chunk_groups`, not row cardinality) unchanged |
| 1.1.0   | 2026-06-11 | Studio team | Stage 6 groups exposed read-only at `GET /projects/{pid}/chapters/{cid}/render_groups` (`build_chunk_groups` over ordered segments); UI "segment" counts and the script-view Numbers toggle MUST derive from this canonical computation, not sentence-row counts |
| 1.0.1   | 2026-06-10 | Studio team | B19: Stage 6 grouping budget now uses `get_text_chunk_limit(engine_id)` (manifest-sourced) — constant-based limit removed from grouper, bake, and standard handler |
| 1.0.0   | 2026-06-10 | Studio team | Initial spec from implemented behavior |

---

## Purpose

This document specifies the text processing pipeline that transforms raw manuscript
text into synthesis-ready chunks. It covers every transformation stage from initial
cleaning through to the render-time group join, with the invariants each stage must
uphold. All future work that touches text handling must conform to this spec; code
that disagrees is a bug in one or the other and must be resolved explicitly.

---

## Pipeline Overview

```
Raw chapter text
     │
     ▼
[Stage 1] Preprocessing  (preprocess_text)
     │
     ▼
[Stage 2] TTS Cleaning   (clean_text_for_tts / sanitize_text)
     │
     ▼
[Stage 3] Sentence Splitting  (split_sentences / safe_split_long_sentences)
     │
     ▼
[Stage 4] Packing to Limit   (pack_text_to_limit)
     │
     ▼
[Stage 5] Segment Sync (DB)  (sync_chapter_segments)
     │
     ▼
[Stage 6] Render-time Grouping + Join  (handle_xtts_segments / join_group_text)
     │
     ▼
TTS engine
```

Stages 1–4 run during chapter analysis / asset generation.
Stage 5 persists segments to SQLite.
Stage 6 runs at render time.

---

## Stage 1 — Preprocessing

**Module:** `app/utils/text/textops_helpers.py` — `preprocess_text`

**Input:** raw unicode text string  
**Output:** text with structural bracket characters removed

**Contract:**
- Removes `[ ] { } ( ) < >` characters entirely (replaced with `""`).
- Does not modify newlines, punctuation, digits, or alphanumeric content.
- Called at the start of most splitting and analysis utilities.

**Also in this module:**
- `normalize_newlines`: CRLF/CR → LF; 3+ consecutive newlines → `";\n"` (pause marker);
  2+ newlines → `"\n\n"` (paragraph break). This is a UI-facing normalization step applied
  before editing; it is distinct from the pipeline stages above.

---

## Stage 2 — TTS Cleaning

**Module:** `app/utils/text/textops_cleaning.py`

### 2a. `clean_text_for_tts`

**Input:** preprocessed text (may contain newlines)  
**Output:** TTS-safe text with normalized punctuation; internal newlines preserved

**Contract:**
- Splits on `'\n'` and processes each line independently to preserve newline positions.
- Smart/curly quotes normalized then stripped; straight double-quotes stripped.
- Acronyms with 2+ dot-separated initials (e.g. `A.B.C.`) have dots replaced with spaces.
- Fractions `N/M` → `"N out of M"` where N, M each have at most 20 digits
  (bounds regex to O(1) backtracking — CodeQL py/polynomial-redos).
- Leading dots/ellipses/punctuation stripped from each line.
- Em-dash `—` → `", "`; ellipsis `…` / `...` → `". "`.
- Spaces before `,;:` removed (bounded quantifier `{1,500}` — linear-time guarantee).
- Stray spaces before/after quote-terminal sequences (`word '.` → `word.'`,
  `word .'` → `word.'`) using `[ \t]{1,500}` quantifier — linear-time guarantee.
- Multiple spaces collapsed to one; redundant/duplicate punctuation normalised.
- After per-line cleaning, `consolidate_single_word_sentences` runs over the full text.
- Final pass: `re.sub(r'\n{2,}', '\n', result)` collapses any double-newlines created by
  the consolidator back to single newlines; result is `.strip()`-ped.
- **Output newlines:** clean_text_for_tts output contains at most single newlines
  (double-newlines are collapsed in the final pass).

### 2b. `consolidate_single_word_sentences`

**Input:** cleaned text (may contain newlines)  
**Output:** text where sentences ≤ 3 words are merged forward with `"; "` separator

**Contract:**
- Uses `split_sentences` (Stage 3) to enumerate sentences.
- Sentences with fewer than 4 words are merged greedily forward until the accumulated
  text reaches 4+ words.
- Merges use `"; "` as separator regardless of paragraph boundary.
- Newline structure is reconstructed from per-sentence `line_idx` metadata; paragraph
  gaps (jumps in `line_idx`) insert blank line runs to preserve visual structure.

### 2c. `sanitize_text`

**Input:** text (any state)  
**Output:** fully sanitized, ASCII-only, terminal-punctuation-guaranteed string

**Contract (superset of `clean_text_for_tts`):**
1. Calls `clean_text_for_tts` first.
2. Removes all non-ASCII characters (`[^\x00-\x7F\n]+`).
3. Collapses horizontal whitespace; normalizes multiple newlines to single `'\n'`.
4. Promotes trailing soft punctuation (`,;:`) to `.` to avoid trailing-comma artifacts.
5. Appends `"."` if the text does not already end with `[.!?]`.
- XTTS `safe_mode` rendering calls `sanitize_text` on the joined group text before
  synthesis (see Stage 6).

**Regex linear-time guarantees (CodeQL py/polynomial-redos):**
- `(\d{1,20})/(\d{1,20})` — digit groups capped at 20.
- `' {1,500}([,;:])'` — whitespace run capped at 500.
- `'[ \t]{1,500}([\'"])([.!?])'` — horizontal space run capped at 500.
- `'[ \t]{1,500}([.!?])([\'"])'` — horizontal space run capped at 500.
- All four patterns are pinned by `tests/utils/test_textops_cleaning_redos.py`.

---

## Stage 3 — Sentence Splitting

**Module:** `app/utils/text/textops_splitting.py`

### 3a. `split_sentences`

**Input:** single text string  
**Output:** generator of `(sentence_str, start_idx, end_idx)` triples

**Contract:**
- Splits at `.`, `!`, `?` followed by optional closing quote(s), then whitespace or
  end-of-string.
- Also splits at bare `'\n'` (including runs of newlines).
- In `preserve_gap=False` mode (default): each sentence is `.strip()`-ped of `\t\r` and
  leading space; empty sentences are suppressed.
- In `preserve_gap=True` mode (used by `app/db/nlp.py` for segment sync): trailing
  whitespace including newlines is included in the sentence string; used so that segment
  text faithfully stores surrounding whitespace context.
- No regex; character-by-character scan — linear time.

### 3b. `safe_split_long_sentences`

**Input:** text string; `target` int (default `DEFAULT_SAFE_SPLIT_TARGET = 250`)  
**Output:** text with long sentences broken at natural separator boundaries

**Contract:**
- **Paragraph boundaries (`\n{2,}`) are preserved.** The function uses
  `re.split(r'(\n{2,})', text)` to capture blank-line runs as opaque separators, then
  reassembles them unchanged around the processed paragraph content. This invariant is
  pinned by `test_b8_blank_line_boundary_preserved` and related B8 tests.
- Single newlines within a paragraph block are preserved; lines are processed
  independently and re-joined with `"\n"`.
- Within a paragraph line, sentences exceeding `target` are first split at separator
  punctuation (`"; "`, `" - "`, `", "`, `": "`, `" and "`, etc.) in priority order.
  Fallback: whitespace-boundary hard-wrap; last resort: force-cut at `target`.
- Resulting pieces are joined back with `" ".join(pieces)` within each line.

---

## Stage 4 — Packing to Limit

**Module:** `app/utils/text/textops_cleaning.py` — `pack_text_to_limit`

**Input:** cleaned/split text; `limit` int (per-engine chunk limit, default 500)  
**Output:** newline-joined string where each `'\n'`-delimited chunk is ≤ `limit` chars

**Contract:**
- Splits input on `'\n'` to get lines; respects paragraph structure.
- **Pre-expansion pass:** any line whose `.strip()` length exceeds `limit` is expanded
  before packing:
  1. Try `split_sentences` to break it into sub-sentences that fit.
  2. For any sub-sentence still > `limit`: hard-wrap at the last whitespace at or before
     `limit`; if no whitespace, force-cut at `limit`.
  - This guarantees every `expanded_lines` entry is ≤ `limit` characters before greedy
    packing begins.
- **Greedy packing:** lines are accumulated into `current_chunk` using `"\n"` as
  separator. A line is appended to the current chunk only when
  `len(current_chunk) + 1 + len(line) <= limit`. Otherwise the current chunk is emitted
  and the line starts a new chunk.
- **Hard guarantee:** every chunk in the output is ≤ `limit` characters. No exception.
  Pinned by `test_b9_single_long_line`, `test_b9_no_whitespace_token`,
  `test_b9_mixed_normal_text`, and related B9 tests in
  `tests/utils/test_textops_bugs_b8_b9.py`.
- `pad=True` (optional): each emitted chunk is `ljust(limit)` padded. Not used in the
  normal pipeline.

**Per-engine `limit` value:**  
The limit passed to `pack_text_to_limit` comes from `manifest.behavior.text_chunk_limit`.
`app/engines/behavior.py` → `get_text_chunk_limit(engine_id)` reads this from the
manifest, falling back to `DEFAULT_ENGINE_TEXT_CHUNK_LIMIT = 500`.

| Engine    | `text_chunk_limit` | `text_split_target` |
|-----------|--------------------|---------------------|
| `xtts`    | 500                | 450                 |
| `voxtral` | 500                | 450                 |
| (default) | 500                | 450                 |

`text_split_target` is the target used by `safe_split_long_sentences` at analysis time
(surfaced via `get_text_split_target(engine_id)`).

---

## Stage 5 — Segment Sync (DB)

**Module:** `app/db/segments.py` — `sync_chapter_segments`  
**Module:** `app/db/nlp.py` — `split_into_sentences`

**Input:** `chapter_id`, `text_content` (chapter body as stored)  
**Output:** `chapter_segments` table updated; returns `True`

**Contract:**
- `split_into_sentences` delegates to `split_sentences(text, preserve_gap=True)`,
  yielding one segment per sentence/gap-included unit.
- **Preservation rule:** for index `i`, if the existing segment at position `i` has
  `text_content.strip() == new_sentence.strip()`, the existing row's `id`, `character_id`,
  `speaker_profile_name`, `audio_status`, and `audio_file_path` are preserved.
  - The comparison uses `.strip()` on both sides — leading/trailing whitespace differences
    do not cause a segment to be considered changed.
- Segments that were not preserved (text changed or disappeared) are deleted; their
  audio files are cleaned up via `cleanup_chapter_audio_files`.
- If a preserved segment's `audio_file_path` appears in the set of invalidated paths
  (paths belonging to removed segments), that segment's audio is reset to `unprocessed`.
- The full row set is replaced with a `DELETE` + `INSERT` pattern; ordering is
  `segment_order ASC` (0-indexed per sentence).
- Transaction ownership: if `conn` is provided by the caller, this function does not
  commit; the caller owns the transaction.

---

## Stage 6 — Render-time Grouping and Join

**Module:** `tts_engines/tts_xtts/plugin/studio/segments.py` — `handle_xtts_segments`  
**Module:** `tts_engines/tts_xtts/plugin/studio/_text_utils.py` — `join_group_text`

**Input:** list of `chapter_segments` rows for the requested render job  
**Output:** script entries with joined group text, submitted to the TTS engine

### Grouping

**Contract:**
- Consecutive segments are merged into a group when ALL conditions hold:
  1. `same_char`: `curr['character_id'] == prev['character_id']`
  2. `is_consecutive`: the segments are adjacent in the full chapter segment list (no
     gaps from the complete ordered set).
  3. `fits_limit`: `len(" ".join([s['text_content'] for s in current_group])) + 1 + len(curr['text_content']) <= get_text_chunk_limit("xtts")`
- The grouping budget is resolved at handler invocation time via
  `get_text_chunk_limit(engine_id)` (reads `manifest.behavior.text_chunk_limit`),
  consistent with the packer at Stage 4. The old `DEFAULT_SENT_CHAR_LIMIT` constant
  is no longer used for render-time grouping decisions.
- The size budget formula is:
  `combined_len = len(" ".join(existing_texts)) + 1 + len(next_text)`
  which exactly mirrors the separator used by `join_group_text`.

### Canonical exposure (read-only)

`GET /projects/{project_id}/chapters/{chapter_id}/render_groups`
(`app/api/routers/chapters.py`) returns the Stage 6 grouping for a chapter as
`{count, groups: [{index, segment_ids, engine, char_count}]}`, computed by
`build_chunk_groups(load_chunk_segments(chapter_id), default_profile)` where
`default_profile` is the chapter's `speaker_profile_name` falling back to the
settings `default_speaker_profile` — the same resolution queue submissions use.

**Contract:**
- Any UI surface presenting a "segment" count for rendering (e.g. the analysis strip,
  Cast palette counts, the script-view Numbers toggle) MUST derive from this
  computation, never from sentence-row counts (`chapter_segments` cardinality). The
  surface list is illustrative, not exhaustive — the binding contract is that the count
  comes from `build_chunk_groups`, regardless of where it is shown. (The site redesign
  removes Studio's in-page character sidebar; casting moves to a right-hand Cast palette,
  so the count formerly attributed to the sidebar now lives on that palette.)
- The endpoint is read-only and MUST NOT mutate segments or trigger grouping
  side effects.

### Group text join

**Module:** `tts_engines/tts_xtts/plugin/studio/_text_utils.py`

```python
def join_group_text(group: list) -> str:
    return " ".join(s['text_content'] for s in group)
```

**Contract:**
- Segments are joined with **exactly one space** between each.
- No leading or trailing space is added.
- No newlines are inserted between segments.
- The string length produced by `join_group_text` is exactly equal to the
  `combined_len` budget the grouper calculated before admitting the final segment.
  This invariant is pinned by `test_size_budget_matches_join_length` in
  `tests/engines/test_xtts_segment_grouping.py`.
- Pinned invariants: no double spaces between segments; single-segment groups are
  returned unchanged.

### Safe-mode text path (XTTS only)

When `j.safe_mode` is `True`, after `join_group_text`:
1. `sanitize_text(combined_text)` is called (full ASCII normalization + terminal punct).
2. `safe_split_long_sentences(combined_text, target=get_text_chunk_limit("xtts"))` is called.

The safe-mode path may alter the text; the unsanitized path passes the joined text
directly to the engine.

---

## MUST / MUST NOT Invariants

| ID   | Invariant |
|------|-----------|
| I-1  | `pack_text_to_limit` MUST produce chunks where every `'\n'`-separated piece is ≤ `limit` characters, including for inputs with no whitespace. |
| I-2  | `safe_split_long_sentences` MUST NOT collapse or remove `\n{2,}` paragraph boundaries. |
| I-3  | `clean_text_for_tts` MUST NOT introduce polynomial-time regex backtracking. All four bounded-quantifier regexes MUST complete on 50,000-character adversarial inputs within 2 seconds. |
| I-4  | `join_group_text` MUST join with exactly one space and MUST NOT produce double spaces. |
| I-5  | The grouper's `combined_len` budget MUST use the same separator (`" ".join` of existing texts) as `join_group_text` so length predictions are accurate. |
| I-6  | `sync_chapter_segments` MUST use `.strip()` comparison on both sides when deciding whether to preserve an existing segment ID. |
| I-7  | The `limit` passed to `pack_text_to_limit` MUST be sourced from `manifest.behavior.text_chunk_limit` via `get_text_chunk_limit(engine_id)`, not hardcoded. |
| I-11 | The grouping budget in Stage 6 (`fits_limit` check) MUST be sourced from `get_text_chunk_limit(engine_id)` so that pack limit and group limit are always consistent. |
| I-8  | `sanitize_text` MUST append `"."` if the output would otherwise lack terminal punctuation. |
| I-9  | `split_sentences` MUST NOT use regex for its core split logic (it is a character scan); it is linear time. |
| I-10 | Audio file cleanup MUST be triggered for any segment removed or whose path is invalidated during `sync_chapter_segments`. |

---

## Conformance Checklist

Each item maps to one or more pinned tests.

| Check | Test file :: test name |
|-------|------------------------|
| Paragraph boundaries survive `safe_split_long_sentences` | `tests/utils/test_textops_bugs_b8_b9.py::test_b8_blank_line_boundary_preserved` |
| Long sentence within paragraph is split while boundary preserved | `tests/utils/test_textops_bugs_b8_b9.py::test_b8_long_sentence_within_paragraph_still_split` |
| Single newlines within paragraph unchanged | `tests/utils/test_textops_bugs_b8_b9.py::test_b8_single_newline_within_paragraph_unchanged` |
| `pack_text_to_limit` never emits a chunk > limit (1200-char line) | `tests/utils/test_textops_bugs_b8_b9.py::test_b9_single_long_line` |
| `pack_text_to_limit` force-cuts at limit when no whitespace | `tests/utils/test_textops_bugs_b8_b9.py::test_b9_no_whitespace_token` |
| `pack_text_to_limit` empty input returns `""` | `tests/utils/test_textops_bugs_b8_b9.py::test_b9_empty_input` |
| Fraction regex completes in < 2s on 50 000-char digit string | `tests/utils/test_textops_cleaning_redos.py::TestAdversarialTiming::test_fraction_pattern_no_slash` |
| Space-before-punct regex completes in < 2s on 50 000-char space run | `tests/utils/test_textops_cleaning_redos.py::TestAdversarialTiming::test_spaces_before_punctuation_no_colon` |
| Stray-space-before-quote regex completes in < 2s | `tests/utils/test_textops_cleaning_redos.py::TestAdversarialTiming::test_stray_space_before_quote_no_quote` |
| Behavioral equivalence of all four bounded regexes | `tests/utils/test_textops_cleaning_redos.py::TestBehavioralEquivalence` (all methods) |
| `join_group_text` single segment no extra spaces | `tests/engines/test_xtts_segment_grouping.py::TestJoinGroupText::test_single_segment_no_extra_spaces` |
| `join_group_text` two segments separated by one space | `tests/engines/test_xtts_segment_grouping.py::TestJoinGroupText::test_two_segments_joined_with_single_space` |
| `join_group_text` size budget matches grouper calculation | `tests/engines/test_xtts_segment_grouping.py::TestJoinGroupText::test_size_budget_matches_join_length` |
| No double spaces in `join_group_text` output | `tests/engines/test_xtts_segment_grouping.py::TestJoinGroupText::test_no_double_space_between_stripped_segments` |

---

## Known Gaps and Ambiguities

1. **`SENT_CHAR_LIMIT` vs manifest `text_chunk_limit` in grouping (Stage 6) — RESOLVED (v1.0.1):**
   The XTTS grouper, bake handler, and standard handler now all resolve the grouping budget
   via `get_text_chunk_limit("xtts")` at handler invocation time, consistent with the
   manifest-sourced limit used by the packer at Stage 4. The old `DEFAULT_SENT_CHAR_LIMIT`
   constant is retained only as the fallback inside `get_text_chunk_limit` and for
   generic text utility modules that have no engine context.

2. **`clean_text_for_tts` collapses double-newlines:** the final `re.sub(r'\n{2,}', '\n')`
   in `clean_text_for_tts` means paragraph boundaries that survive `safe_split_long_sentences`
   (B8) will be collapsed if the text passes through `clean_text_for_tts` afterward. In the
   actual pipeline, cleaning happens before splitting, so this is not a problem in practice;
   but callers who run cleaning on already-split text should be aware of this behavior.

3. **Segment sync uses `preserve_gap=True`:** `split_into_sentences` (Stage 5) uses the
   gap-preserving mode of `split_sentences`. This means segment `text_content` values
   stored in the DB may include trailing whitespace or newlines. The `.strip()` comparison
   in preservation logic accounts for this, but consumers of raw `text_content` should
   call `.strip()` before further processing.

4. **Mixed-engine grouping:** the `synthesis_mixed` plugin and Voxtral handler also perform
   grouping, but this spec documents only the XTTS path. Mixed-engine group joins use
   `" ".join` (consistent with this spec) but their consecutive/character-match logic is
   in separate modules not fully covered here.

5. **`consolidate_single_word_sentences` crosses paragraph lines:** the consolidator may
   merge sentences from adjacent lines (separated by a single newline) using `"; "`, which
   can collapse logical paragraph breaks into a single line. This is intentional for TTS
   quality but means the output line structure does not necessarily match the input
   paragraph structure when short sentences are involved.

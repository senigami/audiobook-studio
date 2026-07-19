# RC-1 reference — sub-sentence spans collapse after edit-and-save

## The question restated

A user assigns a second speaker to part of a sentence (creating a manually-split,
sub-sentence segment), then edits the chapter's manuscript text and saves. After the save,
every manual sub-sentence assignment in the chapter has reverted to narrator-owned whole
sentences and the segment audio is invalidated. Find the exact discarding code path, the
specific condition a sub-sentence span fails (function + line), and whether this fires only
on an explicit "resync" or also on the ordinary edit-and-save flow.

## What I examined

- `app/db/segments.py:492-599` — `sync_chapter_segments` (the rebuild)
- `app/db/chapters.py:197-234` — `update_chapter`; `app/db/chapters.py:41-66` — `create_chapter`
- `app/domain/chapters/operations.py:385-465` — `_apply_range_assignment`;
  `:501-539` — `_split_segment_at_offset`; `:270-316` — `get_resync_preview`
- `app/db/nlp.py:8-11` — `split_into_sentences` (delegates to `app/utils/text/textops.split_sentences`)
- `frontend/src/hooks/chapter/useChapterPersistence.ts:16-38` — `handleSave`
- `app/api/routers/chapters.py:79-101` (chapter-update endpoint), `:259` (explicit resync endpoint)
- Caller sweep: `grep -rn sync_chapter_segments app/` — callers are `create_chapter`
  (chapters.py:54), `update_chapter` (chapters.py:224), and the explicit resync route
  (routers/chapters.py:259).

## Analysis

### How a sub-sentence span comes to exist

Assigning a speaker to part of a sentence goes through
`_apply_range_assignment` (operations.py:385), which calls
`_split_segment_at_offset` (operations.py:501). That function splits one segment row into
two: the original row keeps `text[:offset]` (operations.py:512, 519) and a new row with id
`split_<uuid12>` gets `text[offset:]` (operations.py:515, 526-537). The result is
**two DB rows whose `text_content` values are fragments of one manuscript sentence**, and
the row count for the chapter now exceeds the sentence count of the manuscript. Nothing is
written back to `chapters.text_content` — the manuscript text is untouched; only the
segment rows diverge from a pure sentence split of it.

### The discarding path on save

Frontend save: `handleSave` (useChapterPersistence.ts:24) calls
`api.updateChapter(chapterId, { title, text_content })` whenever the text differs from the
loaded chapter. The backend route (routers/chapters.py:90-101) passes `text_content`
through to `update_chapter` (chapters.py:197). Because `is_text_update` is true
(chapters.py:205), `update_chapter` unconditionally calls
`sync_chapter_segments(chapter_id, updates["text_content"], conn=conn)` at
**chapters.py:224** — inside the same transaction, on *every* text save.

`sync_chapter_segments` (segments.py:492) then:

1. Re-splits the saved manuscript into sentences: `sentences = split_into_sentences(text_content)`
   (segments.py:507). The sentence splitter operates on raw text and knows nothing about
   manual splits — it can only ever emit whole sentences.
2. Loads existing segment rows ordered by `segment_order` (segments.py:512-513).
3. Attempts preservation with the check at **segments.py:523**:

   ```python
   if i < len(existing) and (existing[i].get("text_content") or "").strip() == sent.strip():
   ```

   Preservation requires (a) **positional identity** — sentence *i* of the new split must
   line up with existing row *i* — and (b) **exact text equality** between the whole
   sentence and the existing row's text.
4. Any row that fails gets a brand-new id (segments.py:526) with
   `character_id = None` and `speaker_profile_name = None` (**segments.py:534-535**) and
   `audio_status = 'unprocessed'` — i.e. narrator-owned, audio invalidated.
5. All old rows are deleted and the new set inserted (`DELETE ... WHERE chapter_id = ?`,
   **segments.py:555**, insert at :557-569).
6. The removed rows' audio files are physically deleted via
   `cleanup_chapter_audio_files` (segments.py:581-592) — the observed audio invalidation.

### Why a manually-split span is *structurally* unable to survive

The failing condition is the equality half of **segments.py:523**. Suppose the manual split
turned sentence S (at order *i*) into fragments L = `S[:k]` (row *i*) and R = `S[k:]`
(row *i+1*). On save, `split_into_sentences` emits the whole sentence S at index *i*
(sub-sentence fragments are not sentence boundaries, so the splitter reproduces S intact
even if that sentence was never edited). The comparison is then
`L.strip() == S.strip()` — false by construction, since L is a strict prefix of S. Row *i+1*
(fragment R) is never even compared against S; index *i+1* now holds the *next* sentence.
So both fragment rows fail, both get `character_id = None`, and the manual assignment is
gone. There is no code path in `sync_chapter_segments` that concatenates adjacent rows or
does partial/prefix matching — whole-sentence equality at the same index is the only
preservation rule, and a sub-sentence fragment can never satisfy it.

**Cascade:** each manual split also inflates the row count by one, so after the first split
every subsequent existing row sits at index `i + (number of prior splits)` while the fresh
sentence list is un-inflated. The positional half of segments.py:523 (`existing[i]`, no
re-alignment, no diffing) therefore misaligns *every row after the first split point*, wiping
even whole-sentence manual assignments downstream of it and invalidating their audio
(segments.py:541-552 clears audio on any row whose file was shared with a removed row;
:581-592 deletes removed rows' files). This matches the report that *all* assignments in the
chapter revert, not just the split one.

### Explicit resync vs ordinary save

Both. Callers of `sync_chapter_segments`:

- **Ordinary edit-and-save**: `update_chapter` at chapters.py:221-224, reached from
  `handleSave` → `POST` chapter-details route (routers/chapters.py:101). This is the bug's
  everyday trigger — no "resync" action needed.
- **Explicit resync**: routers/chapters.py:259 calls the same function.
  `get_resync_preview` (operations.py:270) exists precisely to warn about this destruction
  before an explicit resync — it duplicates the same index+equality check at
  **operations.py:298-299** and counts failures as `lost_assignments_count`. But the
  ordinary save path (chapters.py:224) runs the destructive sync **without** any preview or
  confirmation.
- **Chapter creation**: chapters.py:54 (irrelevant here — no prior assignments).

Note the frontend guard at useChapterPersistence.ts:20/26 means the sync only fires when the
text actually changed — but *any* text change anywhere in the chapter (even appending a
word to the last paragraph) triggers a full rebuild, and the equality check dooms every
sub-sentence span regardless of whether its sentence was edited.

## Root cause, stated concretely

`sync_chapter_segments` rebuilds the chapter's segment table from a fresh
whole-sentence split of the saved text and preserves an existing row only if
`existing[i].text_content.strip() == sentences[i].strip()` — same index, exact
whole-sentence text (**app/db/segments.py:523**). Rows created by
`_split_segment_at_offset` (**app/domain/chapters/operations.py:501**) hold sub-sentence
fragments, which by construction can never equal the whole sentence the splitter emits,
and their extra row count shifts every later row off its index. All such rows are dropped
(new ids, `character_id=None` at **segments.py:526/534-535**), the old rows deleted
(**segments.py:555**), and their audio files removed (**segments.py:581-592**). The sync is
invoked on every ordinary text save via `update_chapter` (**app/db/chapters.py:224**), not
only on explicit resync.

## Confidence

**High (~95%)** on the mechanism and the cited lines — the path is short, fully readable,
and every step was verified in current source; the structural impossibility (fragment ≠
whole sentence under exact equality) is deterministic, not probabilistic.

What would change it:
- Evidence that `split_sentences` in `app/utils/text/textops.py` can emit sub-sentence
  fragments matching the manual split points (I read only the `nlp.py` delegate, not the
  splitter's internals — but no splitter can know the user's arbitrary word-boundary
  offsets, so this could at most rescue coincidental cases).
- A runtime repro showing assignments surviving an edit-and-save (would mean some
  frontend path avoids sending `text_content` when only the title changed — the guard at
  useChapterPersistence.ts:20 returns early if neither changed, but line 24 always sends
  both fields once either differs, so a *title-only* edit where text is byte-identical…
  actually still sends `text_content` equal to the stored text; in that case every row
  matches at :523 only if no manual splits exist — with splits present, even a re-save of
  identical text destroys them, which sharpens the bug).

## Not determinable from the evidence here

- Whether any UI affordance routes ordinary saves through `get_resync_preview` first
  (I found no call from `handleSave`; a full frontend sweep of the preview endpoint's
  usage was out of scope).
- The exact behavior of `split_sentences(preserve_gap=True)` on edge inputs (quotes,
  ellipses) — irrelevant to the root cause but it determines *which* index the first
  mismatch occurs at.

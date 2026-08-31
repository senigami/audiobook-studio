"""
Content-anchored alignment between a chapter's existing segment rows and a freshly
split sentence list.

This IS the single shared alignment function for both ``sync_chapter_segments``
(app/db/segments.py) and ``get_resync_preview`` (app/domain/chapters/operations.py) --
the RC-1 bug this replaces existed because those two callers duplicated the same rule
and drifted. Any future change to matching logic must touch only this module.

STATUS (2026-07-19): both callers wired (Task 4, Task 5). Parity between preview and
real sync verified by execution across multiple scenarios -- the preview can no longer
report a false "destructive"/loss warning for a save the real sync actually preserves.

Pure function: no DB access, no side effects. See
design-docs/plans/active/span_resync_preservation_fix/ for the full design and the
invariants (I1-I7) this implementation must uphold.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field


def _norm(text: str | None) -> str:
    return (text or "").strip()


@dataclass
class PreservedRun:
    """One fresh sentence, matched to a contiguous run of 1+ existing rows to preserve
    untouched (id, character_id, speaker_profile_name, audio fields). ``segment_order``
    is NOT part of the untouched guarantee -- see Invariant I1a."""

    fresh_index: int
    existing_ids: list[str]


@dataclass
class AlignmentResult:
    preserved: list[PreservedRun] = field(default_factory=list)
    # Fresh-sentence indices with no preserved match -- caller creates a new row for each.
    new_sentence_indices: list[int] = field(default_factory=list)
    # Existing row ids not claimed by any preserved run -- caller deletes these and
    # invalidates their audio.
    unmatched_existing_ids: set[str] = field(default_factory=set)


def align_segments(existing_rows: list[dict], fresh_sentences: list[str]) -> AlignmentResult:
    """
    existing_rows: ordered list of dicts with at least 'id' and 'text_content'.
    fresh_sentences: ordered list of whole-sentence strings from split_into_sentences()
                      (already produced with preserve_gap=True -- see Invariant I3).

    Algorithm, in order of preference:

    1. Position-anchored exact match (existing[i] == fresh[i]) -- the cheapest, most
       common case, and always safe: position AND content equality together can never
       cross-match wrongly.
    2. For any fresh sentence not resolved by (1):
       (a) Single-row content search, for content that is UNIQUE among both the fresh
           sentence list and the existing rows -- this is what lets a uniquely-identified
           sentence (like "Middle." in the reordered-duplicates test) be recognized at its
           new position. Duplicate content is deliberately EXCLUDED from this search --
           see Invariant I2: reordered duplicates must never cross-match, so ambiguous
           content only ever matches by strict position (step 1), never by search.
       (b) Fragment-run search: a contiguous run of unused existing rows whose stripped
           concatenation equals the sentence (Invariant I3: strip AFTER concatenation,
           never compare raw un-stripped slices). Unbounded run length -- assignments
           accumulate across separate edits with no re-merge in between, so a run can be
           longer than the 3 fragments a single split action produces.

           CORRECTED (2026-07-19, after a code review found the original blanket gate
           destroyed data): a genuine multi-row fragment run (length >= 2) is ALWAYS
           eligible, even for duplicate-sensitive content -- a multi-row split is an
           explicit, deliberate user action, categorically different from a
           naturally-occurring duplicate whole sentence, and recognizing it is safe. A
           length-1 "run" (i.e., a single whole row) found by the same search function
           is NOT exempted -- it is exactly the single-row case in (a) and stays gated by
           content-uniqueness for the same cross-match-safety reason. Concretely: a
           chapter with a manually-split sentence whose text ALSO appears verbatim
           elsewhere (e.g. repeated dialogue) must not lose the split on a resave just
           because the sentence's whole-text is duplicated -- only single-row ambiguity
           is dangerous; a >=2-row run's existence is itself strong evidence of a real,
           intentional split.
    3. Anything still unresolved is a new/changed sentence -- caller creates a fresh row.
    """
    n_existing = len(existing_rows)
    existing_texts = [_norm(r.get("text_content")) for r in existing_rows]
    existing_counts = Counter(existing_texts)

    fresh_norm = [_norm(s) for s in fresh_sentences]
    fresh_counts = Counter(fresh_norm)

    used = [False] * n_existing
    preserved: list[PreservedRun] = []
    unresolved: list[int] = []

    # Pass 1 -- position-anchored exact match.
    for i, sent in enumerate(fresh_norm):
        if i < n_existing and not used[i] and existing_texts[i] == sent:
            preserved.append(PreservedRun(fresh_index=i, existing_ids=[existing_rows[i]["id"]]))
            used[i] = True
        else:
            unresolved.append(i)

    # Pass 2 -- content search (unique content only) + fragment-run search.
    still_unresolved: list[int] = []
    for i in unresolved:
        sent = fresh_norm[i]
        is_duplicate_sensitive = fresh_counts[sent] > 1 or existing_counts.get(sent, 0) > 1
        matched = False

        if not is_duplicate_sensitive:
            for j in range(n_existing):
                if not used[j] and existing_texts[j] == sent:
                    preserved.append(PreservedRun(fresh_index=i, existing_ids=[existing_rows[j]["id"]]))
                    used[j] = True
                    matched = True
                    break

        if not matched:
            run = _find_fragment_run(existing_rows, used, sent)
            # A genuine multi-row fragment run (>= 2 rows) is always eligible, even for
            # duplicate-sensitive content -- a multi-row split is an explicit user
            # action, categorically different from a naturally-occurring duplicate
            # whole sentence. A length-1 "run" IS the single-row case above and stays
            # gated by content-uniqueness (see the corrected docstring for why).
            if run and (len(run) > 1 or not is_duplicate_sensitive):
                preserved.append(
                    PreservedRun(fresh_index=i, existing_ids=[existing_rows[k]["id"] for k in run])
                )
                for k in run:
                    used[k] = True
                matched = True

        if not matched:
            still_unresolved.append(i)

    unmatched_existing_ids = {
        existing_rows[j]["id"] for j in range(n_existing) if not used[j]
    }

    return AlignmentResult(
        preserved=preserved,
        new_sentence_indices=still_unresolved,
        unmatched_existing_ids=unmatched_existing_ids,
    )


def _find_fragment_run(
    existing_rows: list[dict], used: list[bool], sentence: str
) -> list[int] | None:
    """Find the first contiguous run of unused rows whose stripped concatenation exactly
    equals ``sentence``. Unbounded length. Returns the run's indices, or None."""
    n = len(existing_rows)
    for start in range(n):
        if used[start]:
            continue
        acc = ""
        for end in range(start, n):
            if used[end]:
                break
            acc += existing_rows[end].get("text_content") or ""
            stripped_acc = acc.strip()
            if stripped_acc == sentence:
                return list(range(start, end + 1))
            if not sentence.startswith(stripped_acc):
                break
    return None


# --------------------------------------------------------------------------------
# Task 002 (#232) -- render-block grain extension.
#
# ``align_segments`` above matches SENTENCE rows. Render-block rows can each hold
# several sentences, so this layer re-splits every existing row's ``text_content``
# back into sentence-level anchors (never persisted -- computed on demand), runs the
# proven three-pass matcher unchanged at that anchor granularity, then translates the
# anchor-level result back into row-level outcomes. See 01-map.md / task 002 for the
# full design; this docstring only orients the code below.
#
# Still a pure function: no DB access, no side effects. ``render_epoch_bumped`` is a
# signal for the caller (Task 005's DB-integration layer) to perform the actual
# ``chapters.render_epoch`` UPDATE once per call -- this module cannot touch the DB
# itself without breaking the purity guarantee the rest of this file relies on for
# testability.
# --------------------------------------------------------------------------------


@dataclass
class SplitPiece:
    """One surviving piece of a row that got split. Deliberately carries no
    audio_status/audio_file_path fields: EVERY split piece is invalidated (no
    partial-audio reuse), so there is nothing for a caller to accidentally forward."""

    start_offset: int
    end_offset: int
    text_content: str
    text_hash: str
    id: str | None  # the original row's id, only on the piece that keeps it
    keeps_original_id: bool


@dataclass
class RowOutcome:
    """One outcome per existing row (or, for a genuinely new fresh sentence not
    covered by anything above, no RowOutcome at all -- see
    ``RenderBlockAlignmentResult.new_sentence_indices``)."""

    kind: str  # "unchanged" | "split" | "deleted" | "re-homed"
    row_id: str
    start_offset: int | None = None
    end_offset: int | None = None
    text_content: str | None = None
    text_hash: str | None = None
    pieces: list[SplitPiece] | None = None  # only for kind == "split"
    ambiguous_tie_note: str | None = None


@dataclass
class RenderBlockAlignmentResult:
    outcomes: list[RowOutcome] = field(default_factory=list)
    # Fresh-sentence indices not claimed by any outcome above -- caller groups these
    # into new render-block rows before insertion (Task 005b's job, not this one's).
    new_sentence_indices: list[int] = field(default_factory=list)
    render_epoch_bumped: bool = True


def _fresh_cumulative_offsets(fresh_sentences: list[str]) -> list[tuple[int, int]]:
    offsets = []
    pos = 0
    for s in fresh_sentences:
        offsets.append((pos, pos + len(s)))
        pos += len(s)
    return offsets


def _build_anchors(existing_rows: list[dict]) -> list[dict]:
    from .nlp import split_into_sentences

    anchors = []
    for row_idx, row in enumerate(existing_rows):
        text = row.get("text_content") or ""
        row_sentences = split_into_sentences(text) or [text]
        for local_idx, sent in enumerate(row_sentences):
            anchors.append(
                {
                    "anchor_id": f"{row['id']}::{local_idx}",
                    "row_idx": row_idx,
                    "row_id": row["id"],
                    "text": sent,
                }
            )
    return anchors


def _find_single_run_matching(
    available_sorted: list[int], fresh_sentences: list[str], target: str
) -> tuple[int, int] | None:
    """Search maximal runs of literally-consecutive available fresh indices for a
    contiguous sub-run whose raw concatenation, stripped, equals ``target``. Mirrors
    ``_find_fragment_run`` but over the fresh/new side for moved-block detection."""
    if not available_sorted or not target:
        return None
    avail_set = set(available_sorted)
    i = 0
    n = len(available_sorted)
    while i < n:
        j = i
        while j + 1 < n and available_sorted[j + 1] == available_sorted[j] + 1:
            j += 1
        run_indices = available_sorted[i : j + 1]
        for start_pos in range(len(run_indices)):
            acc = ""
            for end_pos in range(start_pos, len(run_indices)):
                idx = run_indices[end_pos]
                acc += fresh_sentences[idx]
                stripped_acc = acc.strip()
                if stripped_acc == target:
                    return (run_indices[start_pos], run_indices[end_pos])
                if not target.startswith(stripped_acc):
                    break
        i = j + 1
    return None


def align_render_blocks(
    existing_rows: list[dict], fresh_sentences: list[str]
) -> RenderBlockAlignmentResult:
    """
    existing_rows: ordered list of dicts with 'id', 'text_content', optionally
                   'audio_status' (rendered == "done") and 'text_hash' (carried
                   forward verbatim when a row is unchanged).
    fresh_sentences: ordered list of RAW (preserve_gap=True) sentence strings whose
                      concatenation reproduces the chapter's full current text
                      exactly -- offsets below are derived purely from position in
                      this list, fresh every call (never incremental +=).

    Returns row-level outcomes: unchanged / split / deleted / re-homed, plus any
    fresh-sentence indices left over for the caller to group into new rows.
    """
    fresh_offsets = _fresh_cumulative_offsets(fresh_sentences)
    anchors = _build_anchors(existing_rows)
    anchor_by_id = {a["anchor_id"]: a for a in anchors}
    anchor_global_pos = {a["anchor_id"]: i for i, a in enumerate(anchors)}
    anchors_by_row: dict[int, list[dict]] = defaultdict(list)
    for a in anchors:
        anchors_by_row[a["row_idx"]].append(a)

    # Reuse the proven three-pass matcher at anchor (sentence) granularity.
    anchor_rows_for_core = [{"id": a["anchor_id"], "text_content": a["text"]} for a in anchors]
    core = align_segments(anchor_rows_for_core, fresh_sentences)

    anchor_fresh_index: dict[str, int] = {}
    run_members_by_fresh_index: dict[int, list[str]] = {}
    for run in core.preserved:
        run_members_by_fresh_index[run.fresh_index] = run.existing_ids
        for aid in run.existing_ids:
            anchor_fresh_index[aid] = run.fresh_index

    # Cross-row merge groups (RISK-1 Shape B), source 1: a PreservedRun the core
    # matcher already produced whose anchors happen to span more than one original
    # row (e.g. an exact multi-row fragment-run match).
    cross_row_groups: dict[int, set[int]] = defaultdict(set)
    for fresh_idx, members in run_members_by_fresh_index.items():
        member_rows = {anchor_by_id[m]["row_idx"] for m in members}
        if len(member_rows) > 1:
            cross_row_groups[fresh_idx] = member_rows

    # Cross-row merge groups, source 2 -- the actual RISK-1 boundary case: the
    # LAST anchor of a row and the FIRST anchor of the next row are both left
    # globally unresolved by the core matcher. Per the task spec, the dividing
    # line between Shape A (boundary/paragraph-break disappears, no real merge)
    # and Shape B (a genuine sentence-level merge) is a SENTENCE-COUNT check at
    # that specific two-anchor boundary, never a content-equality check: Shape B
    # deletes a real character (the sentence-ending punctuation), so the merged
    # text can never satisfy exact fragment-concatenation matching against the
    # old anchors' unmodified text -- that mechanism only ever proves Shape A
    # (which the core matcher already resolves on its own, needing no special
    # case here at all). If editing left exactly ONE fresh sentence sitting in
    # the gap between this boundary's neighboring resolved anchors, that one
    # sentence is the merge; two or more/zero is a different edit shape and is
    # left to fall through to ordinary split/delete/new handling.
    for row_idx in range(len(existing_rows) - 1):
        next_idx = row_idx + 1
        last_anchor = anchors_by_row[row_idx][-1]
        first_anchor_next = anchors_by_row[next_idx][0]
        if last_anchor["anchor_id"] in anchor_fresh_index:
            continue
        if first_anchor_next["anchor_id"] in anchor_fresh_index:
            continue

        # Find the fresh-index bounds of the gap between this boundary's nearest
        # already-resolved neighbors on either side (across ALL anchors, not just
        # this row's), computed fresh each time -- never patched incrementally.
        gap_lo = 0
        for a in anchors[: anchor_global_pos[last_anchor["anchor_id"]]][::-1]:
            fidx = anchor_fresh_index.get(a["anchor_id"])
            if fidx is not None:
                gap_lo = fidx + 1
                break
        gap_hi = len(fresh_sentences) - 1
        for a in anchors[anchor_global_pos[first_anchor_next["anchor_id"]] + 1 :]:
            fidx = anchor_fresh_index.get(a["anchor_id"])
            if fidx is not None:
                gap_hi = fidx - 1
                break

        if gap_lo > gap_hi:
            continue  # no room left -- not a mergeable gap
        if gap_hi - gap_lo + 1 != 1:
            continue  # not exactly one fresh sentence -- not the Shape B pattern
        if gap_lo in cross_row_groups or gap_lo in run_members_by_fresh_index:
            continue  # already claimed by a core-detected merge at this index

        # Plausibility guard: a bare sentence-count coincidence (two UNRELATED rows
        # each independently deleted/changed, leaving a size-1 gap between them by
        # chance) must not be mistaken for a real merge. Require the gap sentence to
        # actually read as this boundary's content run together -- it must start
        # with the earlier row's boundary text and end with the later row's, with
        # no shared overlap counted twice. This correctly recognizes a merge that
        # only deletes whitespace/paragraph-break characters between the two
        # sentences (RISK-1 Shape B's core case); a merge that ALSO deletes real
        # punctuation from inside one of the anchors' own stored text will not
        # satisfy this prefix/suffix check and instead falls through to ordinary
        # per-row split/delete/new handling -- a known, deliberately conservative
        # limitation (never wrongly merges/preserves) rather than false-positiving
        # on coincidental gaps, see this task's report for why this line was drawn
        # here.
        gap_text = _norm(fresh_sentences[gap_lo])
        last_text = _norm(last_anchor["text"])
        first_text = _norm(first_anchor_next["text"])
        if not (
            last_text
            and first_text
            and gap_text.startswith(last_text)
            and gap_text.endswith(first_text)
            and len(last_text) + len(first_text) <= len(gap_text)
        ):
            continue

        anchor_fresh_index[last_anchor["anchor_id"]] = gap_lo
        anchor_fresh_index[first_anchor_next["anchor_id"]] = gap_lo
        run_members_by_fresh_index[gap_lo] = [
            last_anchor["anchor_id"],
            first_anchor_next["anchor_id"],
        ]
        cross_row_groups[gap_lo] = {row_idx, next_idx}

    # Resolve each cross-row group's winner: exactly-one-rendered wins outright;
    # otherwise the row contributing the most characters wins; ties -> leftmost
    # (lowest row_idx), matching the prefix-wins convention used elsewhere.
    group_winner: dict[int, int] = {}
    for fresh_idx, row_idxs in cross_row_groups.items():
        rendered = [r for r in row_idxs if existing_rows[r].get("audio_status") == "done"]
        if len(rendered) == 1:
            group_winner[fresh_idx] = rendered[0]
            continue
        share: dict[int, int] = defaultdict(int)
        for m in run_members_by_fresh_index[fresh_idx]:
            a = anchor_by_id[m]
            if a["row_idx"] in row_idxs:
                share[a["row_idx"]] += len(a["text"])
        group_winner[fresh_idx] = max(sorted(row_idxs), key=lambda r: share[r])

    outcomes: list[RowOutcome] = []
    consumed_fresh_indices: set[int] = set()
    fully_unmatched_rows: list[int] = []

    for row_idx, row in enumerate(existing_rows):
        row_anchors = anchors_by_row[row_idx]
        dispositions = []
        for a in row_anchors:
            fidx = anchor_fresh_index.get(a["anchor_id"])
            if fidx is None:
                dispositions.append(("none", None, False))
            elif fidx in cross_row_groups:
                dispositions.append(("cross", fidx, group_winner[fidx] == row_idx))
            else:
                dispositions.append(("solo", fidx, False))

        kinds = {d[0] for d in dispositions}

        if kinds == {"solo"}:
            fresh_idxs = [d[1] for d in dispositions]
            if fresh_idxs == list(range(fresh_idxs[0], fresh_idxs[0] + len(fresh_idxs))):
                lo, hi = fresh_idxs[0], fresh_idxs[-1]
                start, end = fresh_offsets[lo][0], fresh_offsets[hi][1]
                consumed_fresh_indices.update(range(lo, hi + 1))
                text_hash = row.get("text_hash")
                text_content = row.get("text_content") or ""
                if not text_hash:
                    from .segments import segment_text_hash

                    text_hash = segment_text_hash(text_content)
                outcomes.append(
                    RowOutcome(
                        kind="unchanged",
                        row_id=row["id"],
                        start_offset=start,
                        end_offset=end,
                        text_content=text_content,
                        text_hash=text_hash,
                    )
                )
                continue

        if kinds == {"none"}:
            fully_unmatched_rows.append(row_idx)
            continue

        # Mixed dispositions: build contiguous pieces from consecutive same-kind
        # (same fresh index run, for solo/cross) anchors.
        from .segments import segment_text_hash

        pieces_raw: list[tuple[str, list[dict], list[tuple]]] = []
        i = 0
        n = len(dispositions)
        while i < n:
            kind = dispositions[i][0]
            j = i
            while (
                j + 1 < n
                and dispositions[j + 1][0] == kind
                and (kind == "none" or dispositions[j + 1][1] == dispositions[j][1] + 1)
            ):
                j += 1
            pieces_raw.append((kind, row_anchors[i : j + 1], dispositions[i : j + 1]))
            i = j + 1

        candidate_pieces = []
        for idx, (kind, _panchors, pdisps) in enumerate(pieces_raw):
            if kind == "solo":
                candidate_pieces.append((idx, len(pdisps)))
            elif kind == "cross" and pdisps[0][2]:
                candidate_pieces.append((idx, len(pdisps)))
        id_keeper_idx = None
        if candidate_pieces:
            id_keeper_idx = max(candidate_pieces, key=lambda t: (t[1], -t[0]))[0]

        split_pieces: list[SplitPiece] = []
        for idx, (kind, _panchors, pdisps) in enumerate(pieces_raw):
            if kind == "none":
                continue
            if kind == "cross" and not pdisps[0][2]:
                continue  # lost the tie-break -- absorbed into the winning row
            fresh_idxs = [d[1] for d in pdisps]
            lo, hi = fresh_idxs[0], fresh_idxs[-1]
            start, end = fresh_offsets[lo][0], fresh_offsets[hi][1]
            text_content = "".join(fresh_sentences[lo : hi + 1])
            keeps_id = idx == id_keeper_idx
            split_pieces.append(
                SplitPiece(
                    start_offset=start,
                    end_offset=end,
                    text_content=text_content,
                    text_hash=segment_text_hash(text_content),
                    id=row["id"] if keeps_id else None,
                    keeps_original_id=keeps_id,
                )
            )
            consumed_fresh_indices.update(range(lo, hi + 1))

        if not split_pieces:
            outcomes.append(RowOutcome(kind="deleted", row_id=row["id"]))
        else:
            outcomes.append(RowOutcome(kind="split", row_id=row["id"], pieces=split_pieces))

    # Moved-block re-homing for wholly-unmatched rows (step 5).
    available = sorted(set(core.new_sentence_indices) - consumed_fresh_indices)
    run_of_row: dict[int, tuple[int, int] | None] = {}
    for row_idx in fully_unmatched_rows:
        target = _norm(existing_rows[row_idx].get("text_content"))
        run_of_row[row_idx] = _find_single_run_matching(available, fresh_sentences, target)

    contenders_by_run: dict[tuple[int, int], list[int]] = defaultdict(list)
    for row_idx, run in run_of_row.items():
        if run is not None:
            contenders_by_run[run].append(row_idx)

    claimed_runs: set[tuple[int, int]] = set()
    for row_idx in fully_unmatched_rows:
        row = existing_rows[row_idx]
        run = run_of_row[row_idx]
        if run is None:
            outcomes.append(RowOutcome(kind="deleted", row_id=row["id"]))
            continue
        contenders = contenders_by_run[run]
        if len(contenders) == 1:
            winner = row_idx
        else:
            rendered = [r for r in contenders if existing_rows[r].get("audio_status") == "done"]
            winner = rendered[0] if len(rendered) == 1 else None

        if winner == row_idx and run not in claimed_runs:
            lo, hi = run
            start, end = fresh_offsets[lo][0], fresh_offsets[hi][1]
            text_content = "".join(fresh_sentences[lo : hi + 1])
            consumed_fresh_indices.update(range(lo, hi + 1))
            claimed_runs.add(run)
            outcomes.append(
                RowOutcome(
                    kind="re-homed",
                    row_id=row["id"],
                    start_offset=start,
                    end_offset=end,
                    text_content=text_content,
                    text_hash=row.get("text_hash") or _hash(text_content),
                )
            )
        else:
            note = None
            if len(contenders) > 1 and winner is None:
                note = (
                    "ambiguous moved-block tie: multiple candidates, none uniquely "
                    "rendered -- fell back to delete+new rather than guessing"
                )
            outcomes.append(RowOutcome(kind="deleted", row_id=row["id"], ambiguous_tie_note=note))

    remaining_new = [
        i for i in core.new_sentence_indices if i not in consumed_fresh_indices
    ]

    return RenderBlockAlignmentResult(outcomes=outcomes, new_sentence_indices=remaining_new)


def _hash(text_content: str) -> str:
    from .segments import segment_text_hash

    return segment_text_hash(text_content)

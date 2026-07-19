"""
Content-anchored alignment between a chapter's existing segment rows and a freshly
split sentence list.

This IS the single shared alignment function for both ``sync_chapter_segments``
(app/db/segments.py) and ``get_resync_preview`` (app/domain/chapters/operations.py) --
the RC-1 bug this replaces existed because those two callers duplicated the same rule
and drifted. Any future change to matching logic must touch only this module.

STATUS (2026-07-19): both callers wired (Task 4, Task 5). Parity between preview and
real sync verified by execution across multiple scenarios (see
.agent/frontier-calibration/code-reviews/rc1-task5-*.md) -- the preview can no longer
report a false "destructive"/loss warning for a save the real sync actually preserves.

Pure function: no DB access, no side effects. See
design-docs/plans/active/span_resync_preservation_fix/ for the full design and the
invariants (I1-I7) this implementation must uphold.
"""
from __future__ import annotations

from collections import Counter
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

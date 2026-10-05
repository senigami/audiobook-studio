"""Migration version 2: segment_render_block_collapse (#232 Task 005).

Destructive, one-way collapse of every chapter's sentence-grain
``chapter_segments`` rows into render-block-grain rows: one surviving row per
group of sentences that was actually synthesized together (or, for
never-rendered content, per group the live ``build_chunk_groups`` decision
would produce today). See the task file's "Target shape" section
(``~/.claude/plans/audiobook-factory/segment-render-block-redesign/tasks/
005-destructive-collapse-migration.md``) for the full numbered contract this
module implements -- read that before changing this file.

Two entry points:

- ``migrate_002_render_block_collapse`` -- the real, destructive ``up()``,
  registered in ``registry.py``. Runs inside the migration runner's single
  ``BEGIN IMMEDIATE`` transaction (see runner.py); raises
  ``CollapseMigrationError`` on any invariant failure, which the runner
  rolls back whole.
- ``build_collapse_dry_run_report`` -- a read-only report over the same
  grouping/offset logic, callable standalone against an isolated copy of a
  database (never the live path -- see the task file's hard requirement).
  Never executes a write statement.

Both share ``_process_chapter``, parameterized by ``dry_run``, so the report
and the real migration can never silently diverge in what they compute.
"""
from __future__ import annotations

import sqlite3
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from app.db.segments import segment_text_hash
from app.db.segment_contiguity import assert_chapter_contiguity, ContiguityViolation


class CollapseMigrationError(RuntimeError):
    """Raised when a collapse invariant fails to hold for some chapter.

    Left to the migration runner's transaction wrapper to roll back the
    entire migration (all chapters, not just the offending one) -- see the
    task file's Target shape step 5: a partial migration (some chapters
    collapsed, others not) is worse than none, since nothing else in this
    plan is designed to handle that mixed state.
    """


@dataclass
class ChapterCollapseReport:
    chapter_id: str
    rows_before: int
    rows_after: int
    rows_preserved_with_audio: int
    rows_deleted: int
    any_ambiguous_groupings: bool
    offset_mismatch: bool
    audio_refs_dropped_by_duplicate_remediation: int


@dataclass
class CollapseReport:
    """Aggregate report -- shape shared by the dry-run mode and (internally)
    the real migration's own bookkeeping."""

    per_chapter: list[ChapterCollapseReport] = field(default_factory=list)
    chapters_with_offset_mismatch: list[str] = field(default_factory=list)
    audio_refs_dropped_by_duplicate_remediation: int = 0


def _fetch_chapter_ids(conn: sqlite3.Connection) -> list[str]:
    return [row[0] for row in conn.execute("SELECT id FROM chapters ORDER BY id")]


def _fetch_default_profile(conn: sqlite3.Connection, chapter_id: str) -> Optional[str]:
    row = conn.execute(
        """
        SELECT c.speaker_profile_name AS chapter_profile,
               p.speaker_profile_name AS project_profile
        FROM chapters c
        JOIN projects p ON p.id = c.project_id
        WHERE c.id = ?
        """,
        (chapter_id,),
    ).fetchone()
    if not row:
        return None
    return row["chapter_profile"] or row["project_profile"]


def _remediate_non_contiguous_duplicate_audio(
    rows: list[dict],
) -> tuple[list[dict], int]:
    """Target shape step 6, case (b): pre-existing data debt where the same
    ``audio_file_path`` is referenced by rows that do NOT form one
    contiguous run (so step 2's contiguous-run grouping would otherwise
    produce two separate collapsed rows both claiming the same file).

    This is deliberately run BEFORE grouping (not as a post-collapse
    reactive fix) so that by the time grouping runs, no such duplicate
    exists — the post-collapse ``ux_seg_audio_file`` pre-check in
    ``_run_post_collapse_duplicate_check`` is then a pure safety net for
    case (a) (a fresh bug in this migration's own grouping), never expected
    to fire from case (b) data.

    Policy (this migration's own choice, not a replication of
    ``clear_duplicate_segment_audio_paths`` -- that function's only live
    caller passes a caller-designated group; a migration has no such
    caller-designated preference): keep the FIRST contiguous run (by
    current row order) referencing the file; NULL
    audio_status/audio_file_path/audio_generated_at on every other row
    referencing it.

    Returns ``(new_rows, dropped_count)`` -- ``rows`` itself is not
    mutated.
    """
    positions_by_path: dict[str, list[int]] = defaultdict(list)
    for idx, row in enumerate(rows):
        path = row.get("audio_file_path")
        if path:
            positions_by_path[path].append(idx)

    new_rows = [dict(row) for row in rows]
    dropped = 0
    for path, positions in positions_by_path.items():
        if positions == list(range(positions[0], positions[0] + len(positions))):
            continue  # already one contiguous run -- step 2 handles this natively

        keep: list[int] = [positions[0]]
        for p in positions[1:]:
            if p == keep[-1] + 1:
                keep.append(p)
            else:
                break
        keep_set = set(keep)

        for p in positions:
            if p in keep_set:
                continue
            new_rows[p]["audio_file_path"] = None
            new_rows[p]["audio_status"] = None
            new_rows[p]["audio_generated_at"] = None
            dropped += 1

    return new_rows, dropped


def _partition_into_groups(rows: list[dict], default_profile: Optional[str]) -> list[list[dict]]:
    """Target shape steps 2+3.

    Rows must already be in ``segment_order`` order and have had
    ``_remediate_non_contiguous_duplicate_audio`` applied. Returns an
    ordered list of member-row-lists, one per surviving collapsed row.
    """
    from app.domain.chunk_groups import build_chunk_groups  # noqa: PLC0415 -- avoid import cycle at module load

    groups: list[list[dict]] = []
    engine_cache: dict = {}
    n = len(rows)
    i = 0
    while i < n:
        path = rows[i].get("audio_file_path")
        if path:
            j = i
            while j + 1 < n and rows[j + 1].get("audio_file_path") == path:
                j += 1
            groups.append(rows[i : j + 1])
            i = j + 1
        else:
            j = i
            while j + 1 < n and not rows[j + 1].get("audio_file_path"):
                j += 1
            run = rows[i : j + 1]
            for live_group in build_chunk_groups(run, default_profile, engine_cache=engine_cache):
                if live_group["segments"]:
                    groups.append(live_group["segments"])
            i = j + 1
    return groups


def _compute_offsets_for_groups(
    canonical_text: str, group_texts: list[str]
) -> tuple[list[tuple[int, int]], bool]:
    """Target shape step 4's offset derivation method: sequential search
    from the previous group's ``end_offset`` (never global/first-match --
    a global search can mis-locate a group whose text duplicates an
    earlier one elsewhere in the chapter).

    A mismatch is either ``str.find`` failing outright, or the located
    span not abutting the previous group's ``end_offset`` (a gap). On the
    first mismatch, offset computation for this chapter stops (the
    remaining groups get a placeholder so the caller can still report
    ``rows_after`` etc.) -- callers must treat ``mismatch=True`` as "do not
    trust any offset in this chapter's report."
    """
    offsets: list[tuple[int, int]] = []
    cursor = 0
    mismatch = False
    for text in group_texts:
        if mismatch:
            offsets.append((cursor, cursor))
            continue
        idx = canonical_text.find(text, cursor)
        if idx == -1:
            mismatch = True
            offsets.append((cursor, cursor))
            continue
        if idx != cursor:
            mismatch = True
        start, end = idx, idx + len(text)
        offsets.append((start, end))
        cursor = end
    return offsets, mismatch


def _process_chapter(
    conn: sqlite3.Connection, chapter_id: str, *, dry_run: bool
) -> ChapterCollapseReport:
    rows = [
        dict(row)
        for row in conn.execute(
            "SELECT * FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order ASC",
            (chapter_id,),
        )
    ]
    rows_before = len(rows)
    if not rows:
        return ChapterCollapseReport(chapter_id, 0, 0, 0, 0, False, False, 0)

    # chapters.text_content is *usually* normalized to LF-only on write
    # (app/db/chapters.py's create/update paths), but real data shows both
    # a chapter's canonical text AND its chapter_segments rows can still
    # carry the original CRLF line endings -- pre-existing rows written
    # before that normalization applied, independently, per table. Task
    # 005's synthetic fixtures always used LF-only text for both, so this
    # drift was never modeled. Normalize BOTH sides identically before
    # matching (never just one side, which trades one mismatch for
    # another): whichever of the two disagrees with the LF-only
    # convention the rest of the app assumes gets brought into line here.
    def _to_lf(text: str) -> str:
        return text.replace("\r\n", "\n").replace("\r", "\n")

    for row in rows:
        text = row.get("text_content")
        if text and "\r" in text:
            row["text_content"] = _to_lf(text)

    remediated_rows, dropped = _remediate_non_contiguous_duplicate_audio(rows)
    default_profile = _fetch_default_profile(conn, chapter_id)
    groups = _partition_into_groups(remediated_rows, default_profile)

    chapter_row = conn.execute(
        "SELECT text_content FROM chapters WHERE id = ?", (chapter_id,)
    ).fetchone()
    canonical_text = (chapter_row["text_content"] if chapter_row else None) or ""
    if "\r" in canonical_text:
        canonical_text = _to_lf(canonical_text)
        if not dry_run:
            conn.execute(
                "UPDATE chapters SET text_content = ? WHERE id = ?",
                (canonical_text, chapter_id),
            )

    group_texts = ["".join((m.get("text_content") or "") for m in g) for g in groups]
    offsets, mismatch = _compute_offsets_for_groups(canonical_text, group_texts)

    if mismatch and not dry_run:
        raise CollapseMigrationError(
            f"chapter {chapter_id}: offset derivation mismatch during collapse "
            "-- a group's concatenated text could not be sequentially located "
            "in the chapter's canonical text (see Target shape step 4)"
        )

    rows_preserved_with_audio = sum(1 for g in groups if g[0].get("audio_file_path"))
    rows_deleted = rows_before - len(groups)

    if not dry_run:
        for group, text, (start, end) in zip(groups, group_texts, offsets):
            leader = group[0]
            other_ids = [m["id"] for m in group[1:]]
            if other_ids:
                placeholders = ",".join("?" * len(other_ids))
                conn.execute(
                    f"DELETE FROM chapter_segments WHERE id IN ({placeholders})",
                    other_ids,
                )
            conn.execute(
                """
                UPDATE chapter_segments
                SET text_content = ?,
                    start_offset = ?,
                    end_offset = ?,
                    text_hash = ?,
                    audio_file_path = ?,
                    audio_status = ?,
                    audio_generated_at = ?
                WHERE id = ?
                """,
                (
                    text,
                    start,
                    end,
                    segment_text_hash(text),
                    leader.get("audio_file_path"),
                    leader.get("audio_status"),
                    leader.get("audio_generated_at"),
                    leader["id"],
                ),
            )
        for order, group in enumerate(groups):
            conn.execute(
                "UPDATE chapter_segments SET segment_order = ? WHERE id = ?",
                (order, group[0]["id"]),
            )

    return ChapterCollapseReport(
        chapter_id=chapter_id,
        rows_before=rows_before,
        rows_after=len(groups),
        rows_preserved_with_audio=rows_preserved_with_audio,
        rows_deleted=rows_deleted,
        any_ambiguous_groupings=dropped > 0,
        offset_mismatch=mismatch,
        audio_refs_dropped_by_duplicate_remediation=dropped,
    )


def _assert_contiguity(conn: sqlite3.Connection) -> None:
    """Target shape step 5 (INV-1): per chapter, surviving rows' offset
    ranges must chain with no gaps and no overlaps across the chapter's
    full canonical-text length.

    #232 Task 006 extracted the actual check into
    ``app.db.segment_contiguity.assert_chapter_contiguity`` (a shared helper
    the manual split/merge editor actions also use) -- this wrapper just
    loops every chapter and preserves this migration's own
    ``CollapseMigrationError`` type for its existing tests.
    """
    for chapter_id in _fetch_chapter_ids(conn):
        try:
            assert_chapter_contiguity(conn, chapter_id)
        except ContiguityViolation as exc:
            raise CollapseMigrationError(str(exc)) from exc


def _run_post_collapse_duplicate_check(conn: sqlite3.Connection) -> None:
    """Target shape step 6's outer pre-check, run as a pure safety net --
    the inline remediation in ``_process_chapter`` should already have
    resolved every case-(b) duplicate before grouping ran. A non-empty
    result here is case (a): a genuine bug in this migration's own
    grouping logic."""
    rows = conn.execute(
        """
        SELECT chapter_id, audio_file_path, COUNT(*) AS c
        FROM chapter_segments
        WHERE audio_file_path IS NOT NULL
        GROUP BY chapter_id, audio_file_path
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    if rows:
        offenders = ", ".join(f"{r['chapter_id']}:{r['audio_file_path']}" for r in rows)
        raise CollapseMigrationError(
            "chapter_segments collapse produced duplicate audio_file_path "
            f"references (this migration's own grouping bug, not pre-existing "
            f"data debt -- that case is remediated before grouping runs): {offenders}"
        )


def migrate_002_render_block_collapse(conn: sqlite3.Connection) -> None:
    """Real, destructive ``up()`` for migration version 2. See module
    docstring and the task file's Target shape for the full contract.

    NOTE (flagged, not resolved, by this task's own implementer -- see the
    accompanying task report): this function deliberately does NOT attempt
    to add a ``CHECK (end_offset > start_offset)`` constraint via
    ``ALTER TABLE`` -- SQLite has never supported adding a table-level CHECK
    constraint to an existing table without a full table rebuild (a
    separate, higher-risk operation this task file does not itself
    describe). The two real, addable constraints (``ux_seg_start``,
    ``ux_seg_end``, plus the partial ``ux_seg_audio_file`` index) are added;
    the CHECK is left as an explicit open item for the owner to decide
    (rebuild now vs. a separately-scoped future migration vs. app-level
    enforcement only).
    """
    for chapter_id in _fetch_chapter_ids(conn):
        _process_chapter(conn, chapter_id, dry_run=False)

    null_hash_count = conn.execute(
        "SELECT COUNT(*) AS c FROM chapter_segments WHERE text_hash IS NULL"
    ).fetchone()["c"]
    if null_hash_count:
        raise CollapseMigrationError(
            f"{null_hash_count} surviving chapter_segments row(s) have a NULL "
            "text_hash after collapse -- this migration's own backfill missed a row"
        )

    _assert_contiguity(conn)
    _run_post_collapse_duplicate_check(conn)

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_seg_start ON chapter_segments(chapter_id, start_offset)"
    )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_seg_end ON chapter_segments(chapter_id, end_offset)"
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_seg_audio_file
        ON chapter_segments(chapter_id, audio_file_path)
        WHERE audio_file_path IS NOT NULL
        """
    )


def build_collapse_dry_run_report(conn: sqlite3.Connection) -> CollapseReport:
    """Read-only report mode (Target shape / Steps).

    MUST be called against an isolated filesystem copy of the real
    database, never the live path -- this function itself never executes a
    write statement, but the operational safety property ("dry-run" as
    something other than a name) is the caller's responsibility to
    preserve by choosing what connection to open. See the task file's
    "hard requirement" note and this task's test suite for how that is
    verified mechanically.
    """
    report = CollapseReport()
    for chapter_id in _fetch_chapter_ids(conn):
        chapter_report = _process_chapter(conn, chapter_id, dry_run=True)
        report.per_chapter.append(chapter_report)
        if chapter_report.offset_mismatch:
            report.chapters_with_offset_mismatch.append(chapter_id)
        report.audio_refs_dropped_by_duplicate_remediation += (
            chapter_report.audio_refs_dropped_by_duplicate_remediation
        )
    return report

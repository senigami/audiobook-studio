from __future__ import annotations
import hashlib
import os
import logging
import re
import time
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection
from .segment_tombstones import has_tombstone
from ..utils.render_trace import trace

logger = logging.getLogger(__name__)
SEGMENT_AUDIO_RE = re.compile(r"^(?P<segment_id>.+)\.(?:wav|mp3|m4a)$", re.IGNORECASE)


def segment_text_hash(text_content: str) -> str:
    """Canonical content fingerprint for a `chapter_segments` row's text.

    Owned here (migration 001, #232) so every writer of `text_content` —
    the migration's own backfill, resync, and row-creation-time grouping —
    computes the same value via this one function (INV-9). Never
    reimplement this formula at a call site.
    """
    return hashlib.sha256(text_content.strip().encode("utf-8")).hexdigest()


def _chapter_has_active_generation(chapter_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT 1
            FROM processing_queue
            WHERE chapter_id = ?
              AND status IN ('queued', 'preparing', 'running', 'finalizing')
            LIMIT 1
            """,
            (chapter_id,),
        )
        if cursor.fetchone():
            return True

    try:
        from ..db.state import get_jobs

        active_statuses = {"queued", "preparing", "running", "finalizing"}
        for job in get_jobs().values():
            if getattr(job, "status", None) not in active_statuses:
                continue
            if getattr(job, "chapter_id", None) == chapter_id or getattr(job, "chapter_file", None) == chapter_id:
                return True
    except Exception:
        logger.warning("Failed to inspect in-memory jobs while checking chapter generation state", exc_info=True)

    return False

def update_segments_status_bulk(segment_ids: List[str], chapter_id: str, status: str, broadcast: bool = True):
    if not segment_ids: return
    project_id = None
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT project_id FROM chapters WHERE id = ?", (chapter_id,))
            row = cursor.fetchone()
            project_id = row["project_id"] if row else None
            placeholders = ",".join(["?"] * len(segment_ids))
            if status == "unprocessed":
                cursor.execute(
                    f"UPDATE chapter_segments SET audio_status = ?, audio_file_path = NULL, audio_generated_at = NULL WHERE id IN ({placeholders})",
                    [status] + segment_ids
                )
                cursor.execute(
                    "UPDATE chapters SET audio_status = 'unprocessed', audio_file_path = NULL, audio_generated_at = NULL, audio_length_seconds = NULL WHERE id = ?",
                    (chapter_id,)
                )
            else:
                cursor.execute(f"UPDATE chapter_segments SET audio_status = ? WHERE id IN ({placeholders})", [status] + segment_ids)
            conn.commit()

    if broadcast:
        try:
            from ..api.ws import broadcast_segments_updated
            broadcast_segments_updated(chapter_id)
        except Exception:
            logger.warning("Failed to broadcast bulk segment update", exc_info=True)

    # Cache Invalidation: If segments are being reset, delete chapter-level files
    if status == 'unprocessed':
        try:
            from .chapters import cleanup_chapter_audio_files
            cleanup_chapter_audio_files(project_id, chapter_id, segment_ids)
        except Exception:
            logger.warning("Failed to clean up chapter audio after bulk segment reset", exc_info=True)

def chapter_completion_by_size(chapter_id: str) -> tuple[int, int]:
    """Return ``(done_chars, total_chars)`` for a chapter's segments, size-
    weighted by ``LENGTH(text_content)`` rather than segment count.

    Used as the order-independent source of truth for chapter completion
    (W-PAR enable-gate, size-weighted/order-independent completion): unlike a
    count-based ``completed/total`` ratio, this reflects the fraction of
    manuscript TEXT actually rendered, so an out-of-order completion of a
    large segment before smaller ones is not under-reported. ``audio_status
    = 'done'`` is the sole completion value for ``chapter_segments`` (see
    ``app/db/segments.py`` / ``update_segment``).

    Returns ``(0, 0)`` for a chapter with no segments.
    """
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT
                    COALESCE(SUM(LENGTH(text_content)), 0) AS total_chars,
                    COALESCE(SUM(CASE WHEN audio_status = 'done' THEN LENGTH(text_content) ELSE 0 END), 0) AS done_chars
                FROM chapter_segments
                WHERE chapter_id = ?
                """,
                (chapter_id,),
            )
            row = cursor.fetchone()
    if not row:
        return (0, 0)
    total_chars = int(row["total_chars"] or 0)
    done_chars = int(row["done_chars"] or 0)
    return (done_chars, total_chars)


def get_chapter_segments(chapter_id: str) -> List[Dict[str, Any]]:
    request_started_at = time.perf_counter()
    with _db_lock:
        db_started_at = time.perf_counter()
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT s.*, c.color as character_color, c.name as character_name, c.speaker_profile_name as character_speaker_profile_name
                FROM chapter_segments s
                LEFT JOIN characters c ON s.character_id = c.id
                WHERE s.chapter_id = ?
                ORDER BY s.segment_order ASC
            """, (chapter_id,))
            rows = [dict(row) for row in cursor.fetchall()]
            db_fetch_ms = round((time.perf_counter() - db_started_at) * 1000)
            if db_fetch_ms >= 100:
                logger.info("segments.get_chapter_segments db_fetch chapter=%s ms=%s rows=%s", chapter_id, db_fetch_ms, len(rows))
            # We need project_id to find the right directory.
            cursor.execute("SELECT project_id FROM chapters WHERE id = ?", (chapter_id,))
            crow = cursor.fetchone()
            project_id = crow['project_id'] if crow else None

            processing_ids = [row["id"] for row in rows if row["audio_status"] == "processing"]
            if processing_ids and not _chapter_has_active_generation(chapter_id):
                placeholders = ",".join(["?"] * len(processing_ids))
                cursor.execute(
                    f"""
                    UPDATE chapter_segments
                    SET audio_status = 'unprocessed',
                        audio_file_path = NULL,
                        audio_generated_at = NULL
                    WHERE id IN ({placeholders})
                    """,
                    processing_ids,
                )
                conn.commit()
                for s in rows:
                    if s["id"] in processing_ids:
                        s["audio_status"] = "unprocessed"
                        s["audio_file_path"] = None

    # Rule 3: Disk as Source of Truth - Outside Lock
    from ..core import config

    chapter_dir = config.get_chapter_dir(project_id, chapter_id) if project_id else None
    seg_dir = config.secure_join_flat(chapter_dir, "segments") if chapter_dir else None

    existing_segment_files: set[str] = set()
    if seg_dir and seg_dir.exists():
        try:
            existing_segment_files = {entry.name for entry in os.scandir(seg_dir) if entry.is_file()}
        except OSError:
            existing_segment_files = set()

    # #232 Task 005b (item 6): a row's own audio_file_path is canonical by
    # construction now (a chapter_segments row IS the render unit -- there
    # is no separate "what would build_chunk_groups decide today" to compare
    # against any longer). The self-heal below only ever invalidates a row
    # for a genuinely MISSING file, never for a live-regroup mismatch.
    invalid_done_ids: list[str] = []
    for s in rows:
        if not s.get('speaker_profile_name') and s.get('character_speaker_profile_name'):
            s['speaker_profile_name'] = s['character_speaker_profile_name']

        if s['audio_status'] == 'done':
            path = s['audio_file_path']
            file_exists = path in existing_segment_files if (path and seg_dir) else False

            if not file_exists:
                # #232 Task 004: a file missing on disk could be mid-grace-
                # period in a tombstone-then-sweep cycle (GC has tombstoned
                # it but not yet deleted it, or has already deleted it and
                # is about to clear the row itself). Don't race that: if a
                # tombstone exists for this filename, its terminal state is
                # GC's business, not this read path's — skip rather than
                # NULL it out from here.
                if path and has_tombstone(chapter_id, os.path.basename(path)):
                    continue
                s['audio_status'] = 'unprocessed'
                s['audio_file_path'] = None
                invalid_done_ids.append(s['id'])

    if invalid_done_ids:
        with _db_lock:
            with get_connection() as conn:
                cursor = conn.cursor()
                placeholders = ",".join(["?"] * len(invalid_done_ids))
                cursor.execute(
                    f"""
                    UPDATE chapter_segments
                    SET audio_status = 'unprocessed',
                        audio_file_path = NULL,
                        audio_generated_at = NULL
                    WHERE id IN ({placeholders})
                    """,
                    invalid_done_ids,
                )
                conn.commit()

    trace(
        "segments.get_chapter_segments",
        chapter_id=chapter_id,
        row_count=len(rows),
    )
    total_ms = round((time.perf_counter() - request_started_at) * 1000)
    if total_ms >= 100:
        trace(
            "segments.get_chapter_segments.timings",
            chapter_id=chapter_id,
            row_count=len(rows),
            existing_segment_files=len(existing_segment_files),
            total_ms=total_ms,
        )
    return rows


def clear_duplicate_segment_audio_paths(chapter_id: str, keep_segment_ids: List[str], audio_file_path: Optional[str]) -> List[str]:
    if not chapter_id or not keep_segment_ids or not audio_file_path:
        return []

    if not SEGMENT_AUDIO_RE.match(audio_file_path):
        return []

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            placeholders_keep = ",".join(["?"] * len(keep_segment_ids))
            cursor.execute(
                f"""
                SELECT id
                FROM chapter_segments
                WHERE chapter_id = ?
                  AND id NOT IN ({placeholders_keep})
                  AND audio_file_path = ?
                """,
                [chapter_id] + keep_segment_ids + [audio_file_path],
            )
            duplicate_ids = [row["id"] for row in cursor.fetchall()]
            if not duplicate_ids:
                return []

            placeholders = ",".join(["?"] * len(duplicate_ids))
            cursor.execute(
                f"""
                UPDATE chapter_segments
                SET audio_status = 'unprocessed',
                    audio_file_path = NULL,
                    audio_generated_at = NULL
                WHERE id IN ({placeholders})
                """,
                duplicate_ids,
            )
            conn.commit()
            return duplicate_ids

def update_segment(segment_id: str, broadcast: bool = True, **updates) -> bool:
    if not updates: return False
    changed = False
    cleanup_chapter_id = None
    cleanup_project_id = None
    stale_audio_path = None

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            if "text_content" in updates or ("audio_status" in updates and updates["audio_status"] == "unprocessed") or "character_id" in updates or "speaker_profile_name" in updates:
                cursor.execute("""
                    SELECT c.chapter_id, ch.project_id, c.audio_file_path
                    FROM chapter_segments c
                    JOIN chapters ch ON ch.id = c.chapter_id
                    WHERE c.id = ?
                """, (segment_id,))
                current = cursor.fetchone()
                if current:
                    cleanup_chapter_id = current["chapter_id"]
                    cleanup_project_id = current["project_id"]
                    stale_audio_path = current["audio_file_path"]
            fields = []
            values = []
            for k, v in updates.items():
                fields.append(f"{k} = ?")
                values.append(v)
            values.append(segment_id)
            cursor.execute(f"UPDATE chapter_segments SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
            changed = cursor.rowcount > 0
            trace(
                "segments.update_segment.db",
                segment_id=segment_id,
                updates=updates,
                changed=changed,
                cleanup_chapter_id=cleanup_chapter_id,
                cleanup_project_id=cleanup_project_id,
                stale_audio_path=stale_audio_path,
            )

            # If audio was successfully rendered, touch the chapter's audio_generated_at
            if changed and updates.get("audio_status") == "done":
                cursor.execute("""
                    UPDATE chapters 
                    SET audio_generated_at = ? 
                    WHERE id = (SELECT chapter_id FROM chapter_segments WHERE id = ?)
                """, (time.time(), segment_id))
                conn.commit()

            # If character or voice changed, update chapter timestamp for stale detection
            if changed:
                keys = updates.keys()
                if "character_id" in keys or "speaker_profile_name" in keys or "text_content" in keys or ("audio_status" in keys and updates["audio_status"] == 'unprocessed'):
                    cursor.execute("""
                        SELECT c.chapter_id, ch.project_id
                        FROM chapter_segments c
                        JOIN chapters ch ON ch.id = c.chapter_id
                        WHERE c.id = ?
                    """, (segment_id,))
                    row = cursor.fetchone()
                    if row:
                        chapter_id = row["chapter_id"]
                        cleanup_project_id = row["project_id"]
                        if updates.get("audio_status") != "done":
                            cursor.execute(
                                "UPDATE chapter_segments SET audio_status = 'unprocessed', audio_file_path = NULL, audio_generated_at = NULL WHERE id = ?",
                                (segment_id,)
                            )
                        cursor.execute(
                            "UPDATE chapters SET text_last_modified = ?, audio_status = 'unprocessed', audio_file_path = NULL, audio_generated_at = NULL, audio_length_seconds = NULL WHERE id = ?",
                            (time.time(), chapter_id)
                        )
                        conn.commit()
                        cleanup_chapter_id = chapter_id

    # Broadcast via WebSocket if audio_status changed (outside the lock to avoid deadlock)
    if cleanup_chapter_id:
        try:
            from .chapters import cleanup_chapter_audio_files

            new_audio_path = updates.get("audio_file_path")
            explicit_files = []
            if stale_audio_path:
                if updates.get("audio_status") == "done":
                    # If marking as done, only cleanup if the path is actually changing
                    if new_audio_path and new_audio_path != stale_audio_path:
                        explicit_files = [stale_audio_path]
                else:
                    # Metadata or status change without explicit 'done' update
                    # The old path is now considered stale.
                    explicit_files = [stale_audio_path]

            # Only remove the chapter-level outputs and the edited segment's audio files.
            cleanup_chapter_audio_files(
                cleanup_project_id,
                cleanup_chapter_id,
                [segment_id] if updates.get("audio_status") != "done" else [],
                explicit_files=explicit_files or None,
            )
            trace(
                "segments.update_segment.cleanup",
                segment_id=segment_id,
                chapter_id=cleanup_chapter_id,
                project_id=cleanup_project_id,
                status=updates.get("audio_status"),
                explicit_files=explicit_files,
                new_audio_path=updates.get("audio_file_path"),
                stale_audio_path=stale_audio_path,
            )
        except Exception:
            logger.warning(
                "Failed to clean up chapter audio after segment update",
                exc_info=True,
            )

    if broadcast and changed and "audio_status" in updates:
        try:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT chapter_id FROM chapter_segments WHERE id = ?", (segment_id,))
                row = cursor.fetchone()
                if row:
                    from ..api.ws import broadcast_segments_updated
                    broadcast_segments_updated(row["chapter_id"])
        except Exception:
            logger.warning("Failed to broadcast segment update", exc_info=True)

    return changed

def update_segments_bulk(segment_ids: List[str], **updates) -> bool:
    if not updates or not segment_ids: return False
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            fields = []
            values = []
            for k, v in updates.items():
                fields.append(f"{k} = ?")
                values.append(v)

            placeholders = ",".join(["?"] * len(segment_ids))
            query = f"UPDATE chapter_segments SET {', '.join(fields)} WHERE id IN ({placeholders})"
            cursor.execute(query, values + segment_ids)
            conn.commit()

            # If audio was successfully rendered in bulk, touch the chapter's audio_generated_at
            if cursor.rowcount > 0 and updates.get("audio_status") == "done":
                # We assume all segments belong to the same chapter for bulk updates in this context
                cursor.execute("""
                    UPDATE chapters 
                    SET audio_generated_at = ? 
                    WHERE id = (SELECT chapter_id FROM chapter_segments WHERE id = ?)
                """, (time.time(), segment_ids[0]))
                conn.commit()

            return cursor.rowcount > 0

def write_back_segment_audio_guarded(
    fingerprints: Dict[str, Dict[str, Any]],
    audio_file_path: str,
    chapter_id: str,
) -> Dict[str, List[str]]:
    """Guarded write-back for a completed render's segments (#232 Task 003, INV-2).

    Applies ``audio_status='done'``/``audio_file_path``/``audio_generated_at``
    per segment id ONLY if the row's live ``(text_hash, character_id,
    speaker_profile_name)`` still matches the fingerprint captured at job
    submission time. A mismatch means the segment's shape changed underneath
    an in-flight render (a resync or reassignment) -- that id's result is
    discarded rather than applied to a row that now means something
    different. Handled per-row, not all-or-nothing: a multi-segment group
    sharing one audio file can have some members apply and others discard.

    If EVERY id in the batch is discarded, the shared audio file is
    tombstoned (INV-3 -- never deleted directly here; GC removes it after
    the grace period). If any id applies, any pre-existing tombstone for
    that filename is cleared in the same transaction (a filename that was
    tombstoned by a prior invalidation and is now legitimately live again).

    Returns ``{"applied": [...ids], "stale": [...ids]}``.
    """
    if not fingerprints:
        return {"applied": [], "stale": []}

    now = time.time()
    filename = os.path.basename(audio_file_path)
    applied: List[str] = []
    stale: List[str] = []

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            for seg_id, fp in fingerprints.items():
                cursor.execute(
                    """
                    UPDATE chapter_segments
                       SET audio_status = 'done',
                           audio_file_path = ?,
                           audio_generated_at = ?
                     WHERE id = ?
                       AND text_hash = ?
                       AND character_id IS ?
                       AND speaker_profile_name IS ?
                    """,
                    (
                        filename,
                        now,
                        seg_id,
                        fp.get("text_hash"),
                        fp.get("character_id"),
                        fp.get("speaker_profile_name"),
                    ),
                )
                if cursor.rowcount == 1:
                    applied.append(seg_id)
                else:
                    stale.append(seg_id)

            if applied:
                cursor.execute(
                    "DELETE FROM segment_audio_tombstones WHERE filename = ? AND chapter_id = ?",
                    (filename, chapter_id),
                )
                cursor.execute(
                    "UPDATE chapters SET audio_generated_at = ? WHERE id = ?",
                    (now, chapter_id),
                )
            elif stale:
                # The whole batch was stale: nothing applied, so this file is
                # not referenced by any live row. Tombstone it rather than
                # deleting directly (GC, Task 004, does the actual delete
                # after the grace period).
                cursor.execute(
                    "INSERT OR IGNORE INTO segment_audio_tombstones (filename, chapter_id, created_at) VALUES (?, ?, ?)",
                    (filename, chapter_id, now),
                )

            conn.commit()

    trace(
        "segments.write_back_guarded",
        chapter_id=chapter_id,
        filename=filename,
        applied=applied,
        stale=stale,
    )
    return {"applied": applied, "stale": stale}


def cleanup_orphaned_segments(chapter_id: str):
    """
    Finds and deletes any files in the chapter's segments directory
    that do not correspond to an existing segment in the database.
    """
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # Fetch ALL valid segment IDs across all chapters to avoid deleting
            # segments that might be shared or temporarily in the wrong place.
            cursor.execute("SELECT id FROM chapter_segments")
            valid_ids = set(row['id'] for row in cursor.fetchall())

            cursor.execute("SELECT project_id FROM chapters WHERE id = ?", (chapter_id,))
            crow = cursor.fetchone()
            project_id = crow['project_id'] if crow else None

    if not project_id:
        return

    from ..core import config
    chapter_dir = config.get_chapter_dir(project_id, chapter_id)
    sdir = config.secure_join_flat(chapter_dir, "segments")

    if not sdir or not sdir.exists():
        return

    # Scan V2 segments directory
    for p in sdir.glob("*.*"):
        if p.suffix.lower() in ('.wav', '.mp3', '.m4a'):
            # V2 canonical name is sid.wav
            seg_id = p.stem
            if seg_id not in valid_ids:
                logger.info("Deleting orphaned segment audio file: %s", p.name)
                try:
                    p.unlink()
                except Exception as e:
                    logger.warning("Failed to delete orphaned segment %s: %s", p.name, e)

def sync_chapter_segments(chapter_id: str, text_content: str, conn=None):
    """
    Parses the text into sentences (segments) and syncs the chapter_segments table.
    Attempts to preserve IDs and assignments for sentences that haven't changed.

    Transaction ownership:
    - If ``conn`` is provided, this function does **not** call ``commit()`` or
      ``rollback()``. The caller owns the transaction and must commit or roll
      back after this function returns.
    - If ``conn`` is ``None``, this function acquires ``_db_lock``, opens its
      own connection, and commits the transaction before returning.
    """
    import logging
    logger = logging.getLogger(__name__)
    from .nlp import split_into_sentences
    from .segment_alignment import align_render_blocks
    sentences = split_into_sentences(text_content)

    def _fresh_offsets(sents: list[str]) -> list[tuple[int, int]]:
        offsets = []
        pos = 0
        for s in sents:
            offsets.append((pos, pos + len(s)))
            pos += len(s)
        return offsets

    def _sync_with_conn(conn):
        cursor = conn.cursor()
        # #232 migration 001 is additive and may not have run against every
        # schema this function is exercised on (a handful of test fixtures
        # still build a bare pre-migration chapter_segments table). Detect
        # the column rather than assuming it, so this stays correct on both
        # shapes -- see INV-9 below for why it's still written whenever it
        # IS present. text_hash/start_offset/end_offset were all added by the
        # same migration, so one column's presence stands in for all three.
        has_render_block_columns = "text_hash" in {
            row[1] for row in cursor.execute("PRAGMA table_info(chapter_segments)")
        }
        has_render_epoch_column = "render_epoch" in {
            row[1] for row in cursor.execute("PRAGMA table_info(chapters)")
        }
        # 1. Get existing segments
        cursor.execute("SELECT * FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order ASC", (chapter_id,))
        existing = [dict(row) for row in cursor.fetchall()]
        cursor.execute("SELECT project_id FROM chapters WHERE id = ?", (chapter_id,))
        crow = cursor.fetchone()
        project_id = crow["project_id"] if crow else None
        existing_by_id = {row["id"]: row for row in existing}

        # 2. Content-anchored alignment at RENDER-BLOCK grain (#232 Task 005c):
        # align_render_blocks() re-splits each existing row's text_content back
        # into sentence anchors, reuses the proven three-pass matcher at that
        # granularity, then translates the result into per-row outcomes
        # (unchanged / split / deleted / re-homed) carrying fresh, whole-chapter
        # -recomputed start_offset/end_offset -- see app/db/segment_alignment.py
        # and tasks/002-resync-alignment-extension.md for the full contract.
        alignment = align_render_blocks(existing, sentences)

        fresh_offsets = _fresh_offsets(sentences)
        placed: list[dict] = []
        deleted_ids: set[str] = set()

        def _carry(outcome, row):
            placed.append({
                "id": outcome.row_id,
                "orig_segment_order": row.get("segment_order"),
                "text_content": outcome.text_content,
                "text_hash": outcome.text_hash,
                "start_offset": outcome.start_offset,
                "end_offset": outcome.end_offset,
                "character_id": row.get("character_id"),
                "speaker_profile_name": row.get("speaker_profile_name"),
                "audio_status": row.get("audio_status", "unprocessed"),
                "audio_file_path": row.get("audio_file_path"),
                "audio_generated_at": row.get("audio_generated_at"),
                "preserved": True,
            })

        for outcome in alignment.outcomes:
            row = existing_by_id.get(outcome.row_id)
            if outcome.kind in ("unchanged", "re-homed"):
                _carry(outcome, row)
            elif outcome.kind == "deleted":
                deleted_ids.add(outcome.row_id)
            elif outcome.kind == "split":
                # Task 002 step 4: every piece of a split row is invalidated --
                # no partial-audio reuse -- but cast (character/profile) carries
                # forward to every piece, since a boundary edit is not a
                # re-casting decision. Exactly one piece may keep the original
                # row's id (per align_render_blocks' tie-break); if none does,
                # the original row disappears entirely.
                any_kept = False
                for piece in outcome.pieces or []:
                    if piece.keeps_original_id:
                        any_kept = True
                        placed.append({
                            "id": piece.id,
                            "orig_segment_order": row.get("segment_order"),
                            "text_content": piece.text_content,
                            "text_hash": piece.text_hash,
                            "start_offset": piece.start_offset,
                            "end_offset": piece.end_offset,
                            "character_id": row.get("character_id"),
                            "speaker_profile_name": row.get("speaker_profile_name"),
                            "audio_status": "unprocessed",
                            "audio_file_path": None,
                            "audio_generated_at": None,
                            "preserved": True,
                        })
                    else:
                        placed.append({
                            "id": None,
                            "orig_segment_order": None,
                            "text_content": piece.text_content,
                            "text_hash": piece.text_hash,
                            "start_offset": piece.start_offset,
                            "end_offset": piece.end_offset,
                            "character_id": row.get("character_id"),
                            "speaker_profile_name": row.get("speaker_profile_name"),
                            "audio_status": "unprocessed",
                            "audio_file_path": None,
                            "audio_generated_at": None,
                            "preserved": False,
                        })
                if not any_kept:
                    deleted_ids.add(outcome.row_id)

        removed_audio_paths = {
            existing_by_id[rid].get("audio_file_path")
            for rid in deleted_ids
            if existing_by_id.get(rid, {}).get("audio_file_path")
        }

        # 3. Leftover fresh sentences claimed by nothing above (Task 005b): grouped
        # into as few new rows as build_chunk_groups' chunk-limit rule allows,
        # never inserted one row per sentence -- this is what closes the
        # frontier-tier IntegrityError crash on ux_seg_audio_file. Grouping only
        # ever happens HERE, at row-creation time.
        #
        # Scoped to `bool(existing)` -- i.e. only when this chapter already has
        # at least one prior row, meaning genuinely new content is being ADDED
        # to already-cast manuscript, not a chapter's first-ever import. A
        # virgin import (existing == []) keeps one-row-per-sentence granularity
        # so the editor's per-sentence casting workflow has something to cast.
        should_group_new_rows = bool(existing)
        remaining = sorted(alignment.new_sentence_indices)

        def _new_row_dict(lo: int, hi: int, order_key: int) -> dict:
            start, end = fresh_offsets[lo][0], fresh_offsets[hi][1]
            text = "".join(sentences[lo: hi + 1])
            return {
                "id": None,
                "orig_segment_order": None,
                "text_content": text,
                "text_hash": segment_text_hash(text),
                "start_offset": start,
                "end_offset": end,
                "character_id": None,
                "speaker_profile_name": None,
                "audio_status": "unprocessed",
                "audio_file_path": None,
                "audio_generated_at": None,
                "preserved": False,
            }

        i = 0
        while i < len(remaining):
            j = i
            while j + 1 < len(remaining) and remaining[j + 1] == remaining[j] + 1:
                j += 1
            run = remaining[i: j + 1]
            if not should_group_new_rows:
                for k in run:
                    placed.append(_new_row_dict(k, k, k))
            else:
                from ..domain.chunk_groups import build_chunk_groups  # noqa: PLC0415 -- avoid import cycle at module load
                fake_segments = [
                    {"text_content": sentences[k], "character_id": None, "speaker_profile_name": None}
                    for k in run
                ]
                new_groups = build_chunk_groups(fake_segments, default_profile=None)
                idx = 0
                for group in new_groups:
                    n = len(group["segments"])
                    group_run = run[idx: idx + n]
                    idx += n
                    placed.append(_new_row_dict(group_run[0], group_run[-1], group_run[0]))
            i = j + 1

        # 4. Shared-audio invalidation: a preserved row whose audio file is shared with a
        # removed row must still be force-invalidated (protects the existing
        # test_chapters_sync.py shared-audio-invalidation test).
        for r in placed:
            if r["preserved"] and r["audio_file_path"] in removed_audio_paths:
                r["audio_status"] = "unprocessed"
                r["audio_file_path"] = None
                r["audio_generated_at"] = None

        # 5. Lay out the final row set in whole-chapter offset order and assign
        # segment_order by position -- offsets are always derived fresh from
        # position in `sentences` (Task 002 step 7: never `+= delta`), so
        # sorting by start_offset reproduces fresh-sentence order exactly.
        placed.sort(key=lambda r: r["start_offset"])
        final_rows = []
        preserved_ids: set[str] = set()
        for order, r in enumerate(placed):
            r["segment_order"] = order
            if r["preserved"]:
                preserved_ids.add(r["id"])
            else:
                r["id"] = f"{time.time_ns()}_{order}"
            final_rows.append(r)

        # 6. Execute the minimal write set. Any existing row not carried forward
        # into `final_rows` (deleted outright, or a split row whose id was not
        # kept by any surviving piece) is removed here.
        ids_to_delete = set(existing_by_id) - preserved_ids
        if ids_to_delete:
            cursor.executemany(
                "DELETE FROM chapter_segments WHERE id = ?",
                [(rid,) for rid in ids_to_delete],
            )

        # Precompute which preserved rows actually need a write (content, order,
        # audio, or offset changed) -- needed up-front (not just inline below) so
        # the offset-collision guard just below can act on the same set.
        for r in final_rows:
            if not r["preserved"]:
                r["_changed"] = True
                continue
            orig = existing_by_id[r["id"]]
            r["_changed"] = (
                r["segment_order"] != r["orig_segment_order"]
                or r["text_content"] != orig.get("text_content")
                or r["audio_status"] != orig.get("audio_status")
                or r["audio_file_path"] != orig.get("audio_file_path")
                or r["audio_generated_at"] != orig.get("audio_generated_at")
                or (
                    has_render_block_columns
                    and (
                        r["start_offset"] != orig.get("start_offset")
                        or r["end_offset"] != orig.get("end_offset")
                    )
                )
            )

        # `start_offset`/`end_offset` carry per-chapter UNIQUE indexes
        # (ux_seg_start/ux_seg_end, Task 005) checked immediately -- SQLite has
        # no deferred UNIQUE constraints. A preserved row moving into a span
        # another not-yet-written row currently still occupies (e.g. two rows
        # trading positions on a reorder) would spuriously violate that
        # constraint mid-transaction even though the FINAL layout is always a
        # disjoint partition of the chapter's fresh text. Clear every updating
        # preserved row's offsets to row-unique negative sentinels first --
        # collision-free by construction (deleted rows are already gone above;
        # any preserved row NOT being updated keeps its real, still-disjoint
        # offset) -- so every INSERT/UPDATE below can then write its real
        # final offset in any order without a transient collision.
        if has_render_block_columns:
            sentinel_updates = [
                (-(i + 1), -(i + 1), r["id"])
                for i, r in enumerate(final_rows)
                if r["preserved"] and r["_changed"]
            ]
            if sentinel_updates:
                cursor.executemany(
                    "UPDATE chapter_segments SET start_offset = ?, end_offset = ? WHERE id = ?",
                    sentinel_updates,
                )

        for r in final_rows:
            if not r["preserved"]:
                if has_render_block_columns:
                    # INV-9 (#232): a fresh row's text_hash must be written in
                    # the same statement as its text_content, via the one
                    # canonical helper -- otherwise Task 003's write-back
                    # guard would see a NULL live hash for every newly-synced
                    # segment and discard every legitimate render as "stale".
                    cursor.execute(
                        """
                        INSERT INTO chapter_segments
                            (id, chapter_id, segment_order, text_content, text_hash, start_offset, end_offset,
                             character_id, speaker_profile_name, audio_status, audio_file_path, audio_generated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            r["id"], chapter_id, r["segment_order"], r["text_content"],
                            r["text_hash"], r["start_offset"], r["end_offset"],
                            r["character_id"], r["speaker_profile_name"], r["audio_status"],
                            r["audio_file_path"], r["audio_generated_at"],
                        ),
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO chapter_segments
                            (id, chapter_id, segment_order, text_content, character_id,
                             speaker_profile_name, audio_status, audio_file_path, audio_generated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            r["id"], chapter_id, r["segment_order"], r["text_content"],
                            r["character_id"], r["speaker_profile_name"], r["audio_status"],
                            r["audio_file_path"], r["audio_generated_at"],
                        ),
                    )
                continue

            if not r["_changed"]:
                continue  # genuinely untouched -- skip the DB write entirely
            if has_render_block_columns:
                cursor.execute(
                    """
                    UPDATE chapter_segments
                    SET segment_order = ?, text_content = ?, text_hash = ?, start_offset = ?, end_offset = ?,
                        audio_status = ?, audio_file_path = ?, audio_generated_at = ?
                    WHERE id = ?
                    """,
                    (
                        r["segment_order"], r["text_content"], r["text_hash"],
                        r["start_offset"], r["end_offset"],
                        r["audio_status"], r["audio_file_path"], r["audio_generated_at"], r["id"],
                    ),
                )
            else:
                cursor.execute(
                    """
                    UPDATE chapter_segments
                    SET segment_order = ?, text_content = ?, audio_status = ?, audio_file_path = ?, audio_generated_at = ?
                    WHERE id = ?
                    """,
                    (
                        r["segment_order"], r["text_content"],
                        r["audio_status"], r["audio_file_path"], r["audio_generated_at"], r["id"],
                    ),
                )

        # #232 Task 005c: bump chapters.render_epoch once per resync call --
        # align_render_blocks() signals this (render_epoch_bumped) but cannot
        # perform the write itself (it's a pure function); this integration
        # layer is where the actual UPDATE happens, per Task 002's contract.
        if has_render_epoch_column and alignment.render_epoch_bumped:
            cursor.execute(
                "UPDATE chapters SET render_epoch = render_epoch + 1 WHERE id = ?",
                (chapter_id,),
            )

        return existing, preserved_ids, project_id

    if conn:
        existing, preserved_ids, project_id = _sync_with_conn(conn)
    else:
        with _db_lock:
            with get_connection() as conn:
                existing, preserved_ids, project_id = _sync_with_conn(conn)
                conn.commit()

    removed_rows = [row for row in existing if row["id"] not in preserved_ids]
    removed_ids = [row["id"] for row in removed_rows]
    removed_files = [row.get("audio_file_path") for row in removed_rows if row.get("audio_file_path")]
    # Task 6: surface how many manual assignments were actually lost, so an ordinary save
    # (not just the explicit resync route) can warn the user -- see
    # design-docs/plans/active/span_resync_preservation_fix/. Additive: the three existing
    # callers (create_chapter, update_chapter, the explicit resync route) all discard the
    # old bare `True` return today, so this shape change is backward compatible.
    lost_assignments_count = sum(1 for row in removed_rows if row.get("character_id"))
    try:
        from .chapters import cleanup_chapter_audio_files
        cleanup_chapter_audio_files(
            project_id,
            chapter_id,
            removed_ids,
            explicit_files=removed_files,
            delete_chapter_outputs=False,
        )
    except Exception:
        logger.warning(
            "Failed to clean up stale chapter audio after segment sync",
            exc_info=True,
        )

    return {"success": True, "lost_assignments_count": lost_assignments_count}

from __future__ import annotations
import hashlib
import os
import logging
import re
import time
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection
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
    from ..domain.chunk_groups import build_chunk_groups

    chapter_dir = config.get_chapter_dir(project_id, chapter_id) if project_id else None
    seg_dir = config.secure_join_flat(chapter_dir, "segments") if chapter_dir else None

    existing_segment_files: set[str] = set()
    if seg_dir and seg_dir.exists():
        try:
            existing_segment_files = {entry.name for entry in os.scandir(seg_dir) if entry.is_file()}
        except OSError:
            existing_segment_files = set()

    # Fetch default profile for group validation
    default_profile = None
    if project_id and chapter_id:
        with _db_lock:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT c.speaker_profile_name AS chapter_profile,
                           p.speaker_profile_name AS project_profile
                    FROM chapters c
                    JOIN projects p ON p.id = c.project_id
                    WHERE c.id = ?
                """, (chapter_id,))
                row = cursor.fetchone()
                if row:
                    default_profile = row["chapter_profile"] or row["project_profile"]

    # Calculate current groups to determine canonical names
    # This ensures that if groups change, old shared files are invalidated for the split segments.
    current_groups = build_chunk_groups(rows, default_profile, engine_cache={})
    segment_to_canonical = {}
    for group in current_groups:
        if not group['segments']:
            continue
        canonical_name = f"{group['segments'][0]['id']}.wav"
        for seg in group['segments']:
            segment_to_canonical[seg['id']] = canonical_name

    invalid_done_ids: list[str] = []
    for s in rows:
        if not s.get('speaker_profile_name') and s.get('character_speaker_profile_name'):
            s['speaker_profile_name'] = s['character_speaker_profile_name']

        if s['audio_status'] == 'done':
            path = s['audio_file_path']
            exists = False

            # Rule: Segment audio must live in V2 segments/ directory
            if path and seg_dir:
                # Canonical check: must match the current group's canonical name
                canonical_for_seg = segment_to_canonical.get(s['id'])
                file_exists = path in existing_segment_files
                if path == canonical_for_seg and file_exists:
                    exists = True

            if not exists:
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
    from .segment_alignment import align_segments
    sentences = split_into_sentences(text_content)

    def _sync_with_conn(conn):
        cursor = conn.cursor()
        # 1. Get existing segments
        cursor.execute("SELECT * FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order ASC", (chapter_id,))
        existing = [dict(row) for row in cursor.fetchall()]
        cursor.execute("SELECT project_id FROM chapters WHERE id = ?", (chapter_id,))
        crow = cursor.fetchone()
        project_id = crow["project_id"] if crow else None
        existing_by_id = {row["id"]: row for row in existing}

        # 2. Content-anchored alignment (RC-1 fix): preserve matched runs (including
        # multi-row fragment runs from manual sub-sentence splits) IN PLACE -- never
        # delete-and-reinsert them, which is what kept destroying manual assignments
        # (see design-docs/plans/active/span_resync_preservation_fix/).
        alignment = align_segments(existing, sentences)

        preserved_by_fresh_index = {}
        preserved_ids = set()
        for run in alignment.preserved:
            preserved_by_fresh_index[run.fresh_index] = run.existing_ids
            preserved_ids.update(run.existing_ids)

        unmatched_ids = alignment.unmatched_existing_ids
        removed_rows = [existing_by_id[rid] for rid in unmatched_ids]
        removed_audio_paths = {r.get("audio_file_path") for r in removed_rows if r.get("audio_file_path")}

        # 3. Lay out the final row set in fresh-sentence order. A fragment run's rows
        # keep their own text_content and relative order; only segment_order may change
        # (Invariant I1a) -- id, character_id, speaker_profile_name, and audio fields on
        # a preserved row are untouched here, and are only overwritten below if that
        # exact row shares an audio file with a removed row (the shared-audio-invalidation
        # pass, unchanged from before).
        final_rows = []
        order = 0
        for i, sent in enumerate(sentences):
            run_ids = preserved_by_fresh_index.get(i)
            if run_ids:
                for rid in run_ids:
                    row = existing_by_id[rid]
                    final_rows.append({
                        "id": rid,
                        "segment_order": order,
                        "orig_segment_order": row.get("segment_order"),
                        "text_content": row.get("text_content"),
                        "character_id": row.get("character_id"),
                        "speaker_profile_name": row.get("speaker_profile_name"),
                        "audio_status": row.get("audio_status", "unprocessed"),
                        "audio_file_path": row.get("audio_file_path"),
                        "audio_generated_at": row.get("audio_generated_at"),
                        "preserved": True,
                    })
                    order += 1
            else:
                final_rows.append({
                    "id": str(time.time_ns()) + f"_{i}",
                    "segment_order": order,
                    "orig_segment_order": None,
                    "text_content": sent,
                    "character_id": None,
                    "speaker_profile_name": None,
                    "audio_status": "unprocessed",
                    "audio_file_path": None,
                    "audio_generated_at": None,
                    "preserved": False,
                })
                order += 1

        # 4. Shared-audio invalidation: a preserved row whose audio file is shared with a
        # removed row must still be force-invalidated (protects the existing
        # test_chapters_sync.py shared-audio-invalidation test).
        for r in final_rows:
            if r["preserved"] and r["audio_file_path"] in removed_audio_paths:
                r["audio_status"] = "unprocessed"
                r["audio_file_path"] = None
                r["audio_generated_at"] = None

        # 5. Execute the minimal write set. Preserved rows whose order didn't move and
        # whose audio wasn't just invalidated get NO DB write at all -- this is the
        # actual "preserve in place" guarantee, not delete-and-reinsert-with-old-id.
        if unmatched_ids:
            cursor.executemany(
                "DELETE FROM chapter_segments WHERE id = ?",
                [(rid,) for rid in unmatched_ids],
            )

        for r in final_rows:
            if not r["preserved"]:
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

            orig = existing_by_id[r["id"]]
            order_changed = r["segment_order"] != r["orig_segment_order"]
            audio_changed = (
                r["audio_status"] != orig.get("audio_status")
                or r["audio_file_path"] != orig.get("audio_file_path")
                or r["audio_generated_at"] != orig.get("audio_generated_at")
            )
            if not order_changed and not audio_changed:
                continue  # genuinely untouched -- skip the DB write entirely
            cursor.execute(
                """
                UPDATE chapter_segments
                SET segment_order = ?, audio_status = ?, audio_file_path = ?, audio_generated_at = ?
                WHERE id = ?
                """,
                (r["segment_order"], r["audio_status"], r["audio_file_path"], r["audio_generated_at"], r["id"]),
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

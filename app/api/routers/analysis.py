from itertools import groupby
from pydantic import BaseModel
from fastapi import APIRouter, Form, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from ...config import CHAPTER_DIR, REPORT_DIR, SENT_CHAR_LIMIT, BASELINE_XTTS_CPS
from ...db import get_chapter, get_chapter_segments, get_characters
from ...textops import (
    find_long_sentences, clean_text_for_tts, safe_split_long_sentences,
    pack_text_to_limit, sanitize_for_xtts, get_text_stats, format_duration
)


router = APIRouter(prefix="/api", tags=["analysis"])

@router.get("/chapters/{chapter_id}/analyze")
async def api_analyze_chapter(chapter_id: str):
    chap = get_chapter(chapter_id)
    if not chap:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)

    segs = get_chapter_segments(chapter_id)
    chars = get_characters(chap['project_id'])
    char_map = {c['id']: c for c in chars}

    # 1. Group segments by consecutive character using itertools.groupby
    groups = []
    for char_id, seg_iterator in groupby(segs, key=lambda s: s['character_id']):
        groups.append({
            "character_id": char_id,
            "segments": list(seg_iterator)
        })

    # 2. Within each group, reproduce the exact character-limit grouping from jobs.py
    voice_chunks = []
    for g in groups:
        char = char_map.get(g['character_id'])
        char_name = char['name'] if char else "NARRATOR"
        char_color = char['color'] if char else "#94a3b8"

        segs_in_group = g['segments']
        if not segs_in_group:
            continue

        current_batch = [segs_in_group[0]]
        for i in range(1, len(segs_in_group)):
            curr_seg = segs_in_group[i]
            current_batch_text = "".join([s['text_content'] for s in current_batch])
            combined_len = len(current_batch_text) + len(curr_seg['text_content'])

            if combined_len <= SENT_CHAR_LIMIT:
                current_batch.append(curr_seg)
            else:
                combined = " ".join([s['text_content'] for s in current_batch])
                final_text = sanitize_for_xtts(combined)
                final_text = safe_split_long_sentences(final_text, target=SENT_CHAR_LIMIT)
                voice_chunks.append({
                    "character_name": char_name,
                    "character_color": char_color,
                    "text": final_text,
                    "raw_length": len(final_text),
                    "sent_count": len(current_batch)
                })
                current_batch = [curr_seg]

        if current_batch:
            combined = " ".join([s['text_content'] for s in current_batch])
            final_text = sanitize_for_xtts(combined)
            final_text = safe_split_long_sentences(final_text, target=SENT_CHAR_LIMIT)
            voice_chunks.append({
                "character_name": char_name,
                "character_color": char_color,
                "text": final_text,
                "raw_length": len(final_text),
                "sent_count": len(current_batch)
            })

    # Stats
    full_text = chap.get('text_content') or ''
    stats = get_text_stats(full_text)

    raw_hits = find_long_sentences(full_text)
    cleaned_text = clean_text_for_tts(full_text)
    split_text_full = safe_split_long_sentences(cleaned_text)
    cleaned_hits = find_long_sentences(split_text_full)
    uncleanable = len(cleaned_hits)
    auto_fixed = len(raw_hits) - uncleanable

    return JSONResponse({
        "status": "ok",
        "voice_chunks": voice_chunks,
        "threshold": SENT_CHAR_LIMIT,
        "char_count": stats["char_count"],
        "word_count": stats["word_count"],
        "sent_count": stats["sent_count"],
        "predicted_seconds": stats["predicted_seconds"],
        "raw_long_sentences": len(raw_hits),
        "auto_fixed": auto_fixed,
        "uncleanable": uncleanable,
        "uncleanable_sentences": [
            {"length": clen, "text": s}
            for idx, clen, start, end, s in cleaned_hits
        ]
    })


class AnalyzeTextRequest(BaseModel):
    text_content: str

@router.post("/analyze_text")
async def api_analyze_text(req: AnalyzeTextRequest):
    text_content = req.text_content
    stats = get_text_stats(text_content)

    raw_hits = find_long_sentences(text_content)
    cleaned_text = clean_text_for_tts(text_content)
    split_text = safe_split_long_sentences(cleaned_text)
    packed_text = pack_text_to_limit(split_text, pad=True)
    cleaned_hits = find_long_sentences(split_text)

    uncleanable = len(cleaned_hits)
    auto_fixed = len(raw_hits) - uncleanable

    return JSONResponse({
        "status": "ok",
        "char_count": stats["char_count"],
        "word_count": stats["word_count"],
        "sent_count": stats["sent_count"],
        "predicted_seconds": stats["predicted_seconds"],
        "raw_long_sentences": len(raw_hits),
        "auto_fixed": auto_fixed,
        "uncleanable": uncleanable,
        "uncleanable_sentences": [
            {"length": clen, "text": s}
            for idx, clen, start, end, s in cleaned_hits
        ],
        "threshold": SENT_CHAR_LIMIT,
        "safe_text": packed_text,
        "split_sentences": split_text.split('\n')
    })


def _run_analysis(chapter_file: str):
    p = CHAPTER_DIR / chapter_file
    if not p.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Chapter file '{chapter_file}' not found."
        )
    text = p.read_text(encoding="utf-8", errors="replace")
    stats = get_text_stats(text)
    raw_hits = find_long_sentences(text)
    cleaned_text = clean_text_for_tts(text)
    split_text = safe_split_long_sentences(cleaned_text)
    cleaned_hits = find_long_sentences(split_text)
    uncleanable = len(cleaned_hits)
    auto_fixed = len(raw_hits) - uncleanable

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    # Sanitize stem for safety
    safe_stem = Path(chapter_file).stem.replace("..", "")
    report_path = REPORT_DIR / f"long_sentences_{safe_stem}.txt"
    lines = [
        f"Character Count   : {stats['char_count']:,}",
        f"Word Count        : {stats['word_count']:,}",
        f"Sentence Count    : {stats['sent_count']:,} (approx)",
        f"Predicted Time    : {stats['formatted_duration']} "
        f"(@ {BASELINE_XTTS_CPS} cps)",
    ]
    if len(raw_hits) > 0:
        lines.extend([
            "--------------------------------------------------",
            f"Limit Threshold   : {SENT_CHAR_LIMIT} characters",
            f"Raw Long Sentences: {len(raw_hits)}",
            f"Auto-Fixable      : {auto_fixed} (handled by Safe Mode)",
            f"Action Required   : {uncleanable} (STILL too long after split!)",
            "--------------------------------------------------",
            ""
        ])
    else: lines.append("")

    if uncleanable > 0:
        lines.append("!!! ACTION REQUIRED: The following sentences could not be auto-split !!!\n")
        for idx, clen, start, end, s in cleaned_hits:
            lines.append(f"--- Uncleanable Sentence ({clen} chars) ---\n{s}\n")
    elif len(raw_hits) > 0:
        lines.append("✓ All long sentences will be successfully handled by Safe Mode.")

    report_text = "\n".join(lines)
    report_path.write_text(report_text, encoding="utf-8")
    return report_path, report_text


@router.get("/report/{name}")
def report(name: str):
    report_path = REPORT_DIR / f"long_sentences_{name}.txt"
    if not report_path.exists():
        return JSONResponse({"status": "error", "message": "Report not found"}, status_code=404)
    return FileResponse(report_path)

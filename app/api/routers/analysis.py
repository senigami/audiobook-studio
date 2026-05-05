import logging
import os
from pathlib import Path
from itertools import groupby
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Form, HTTPException, Depends
from fastapi.responses import JSONResponse, FileResponse
from ... import config
from ...db import get_chapter, get_chapter_segments, get_characters
from ...textops import (
    find_long_sentences, clean_text_for_tts, safe_split_long_sentences,
    pack_text_to_limit, sanitize_text, get_text_stats, format_duration
)
from ...config import BASELINE_ENGINE_CPS
from ...engines.behavior import get_text_chunk_limit, get_text_split_target
from ... import state
from ...pathing import safe_basename, safe_join_flat

logger = logging.getLogger(__name__)

# Compatibility for tests that monkeypatch these
REPORT_DIR = config.REPORT_DIR
CHAPTER_DIR = config.CHAPTER_DIR


class AnalysisError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class VoiceChunk(BaseModel):
    character_name: str
    character_color: str
    text: str
    raw_length: int
    sent_count: int


class UncleanableSentence(BaseModel):
    length: int
    text: str


class AnalysisStats(BaseModel):
    char_count: int
    word_count: int
    sent_count: int
    predicted_seconds: float


class ChapterAnalysisResponse(BaseModel):
    status: str = "ok"
    voice_chunks: List[VoiceChunk]
    threshold: int
    char_count: int
    word_count: int
    sent_count: int
    predicted_seconds: float
    raw_long_sentences: int
    auto_fixed: int
    uncleanable: int
    uncleanable_sentences: List[UncleanableSentence]


class TextAnalysisResponse(BaseModel):
    status: str = "ok"
    char_count: int
    word_count: int
    sent_count: int
    predicted_seconds: float
    raw_long_sentences: int
    auto_fixed: int
    uncleanable: int
    uncleanable_sentences: List[UncleanableSentence]
    threshold: int
    safe_text: str
    split_sentences: List[str]




def get_report_dir() -> Path:
    return config.REPORT_DIR


def get_chapter_dir() -> Path:
    return config.CHAPTER_DIR


router = APIRouter(prefix="/api", tags=["analysis"])

@router.get("/chapters/{chapter_id}/analyze", response_model=ChapterAnalysisResponse)
def api_analyze_chapter(chapter_id: str):
    try:
        chap = get_chapter(chapter_id)
        if not chap:
            raise AnalysisError("Chapter not found", 404)

        def process_chapter():
            segs = get_chapter_segments(chapter_id)
            chars = get_characters(chap["project_id"])
            char_map = {c["id"]: c for c in chars}

            # Determine limit based on engine
            from ...voice_engines import get_default_profile_engine
            engine_id = chap.get("engine_id") or state.get_settings().get("default_engine", get_default_profile_engine())
            chunk_limit = get_text_chunk_limit(engine_id)
            split_target = get_text_split_target(engine_id)

            # 1. Group segments by consecutive character using itertools.groupby
            groups = []
            for char_id, seg_iterator in groupby(
                segs, key=lambda s: s["character_id"]
            ):
                groups.append({
                    "character_id": char_id,
                    "segments": list(seg_iterator)
                })

            # 2. Within each group, reproduce the exact character-limit grouping
            voice_chunks = []
            for g in groups:
                char = char_map.get(g["character_id"])
                char_name = char["name"] if char else "NARRATOR"
                char_color = char["color"] if char else "#94a3b8"

                segs_in_group = g["segments"]
                if not segs_in_group:
                    continue

                current_batch = [segs_in_group[0]]
                for i in range(1, len(segs_in_group)):
                    curr_seg = segs_in_group[i]
                    current_batch_text = "".join(
                        [s["text_content"] for s in current_batch]
                    )
                    combined_len = (
                        len(current_batch_text) + len(curr_seg["text_content"])
                    )

                    if combined_len <= chunk_limit:
                        current_batch.append(curr_seg)
                    else:
                        combined = " ".join([s["text_content"] for s in current_batch])
                        final_text = sanitize_text(combined)
                        final_text = safe_split_long_sentences(
                            final_text, target=split_target
                        )
                        voice_chunks.append({
                            "character_name": char_name,
                            "character_color": char_color,
                            "text": final_text,
                            "raw_length": len(final_text),
                            "sent_count": len(current_batch)
                        })
                        current_batch = [curr_seg]

                if current_batch:
                    combined = " ".join([s["text_content"] for s in current_batch])
                    final_text = sanitize_text(combined)
                    final_text = safe_split_long_sentences(
                        final_text, target=split_target
                    )
                    voice_chunks.append({
                        "character_name": char_name,
                        "character_color": char_color,
                        "text": final_text,
                        "raw_length": len(final_text),
                        "sent_count": len(current_batch)
                    })

            # Stats
            full_text = chap.get("text_content") or ""
            stats = get_text_stats(full_text)

            raw_hits = find_long_sentences(full_text)
            cleaned_text = clean_text_for_tts(full_text)
            split_text_full = safe_split_long_sentences(cleaned_text)
            cleaned_hits = find_long_sentences(split_text_full)
            uncleanable = len(cleaned_hits)
            auto_fixed = len(raw_hits) - uncleanable

            return {
                "voice_chunks": voice_chunks,
                "stats": stats,
                "raw_hits": raw_hits,
                "auto_fixed": auto_fixed,
                "uncleanable": uncleanable,
                "cleaned_hits": cleaned_hits,
                "chunk_limit": chunk_limit,
            }

        res = process_chapter()

        return ChapterAnalysisResponse(
            status="ok",
            voice_chunks=res["voice_chunks"],
            threshold=res["chunk_limit"],
            char_count=res["stats"]["char_count"],
            word_count=res["stats"]["word_count"],
            sent_count=res["stats"]["sent_count"],
            predicted_seconds=res["stats"]["predicted_seconds"],
            raw_long_sentences=len(res["raw_hits"]),
            auto_fixed=res["auto_fixed"],
            uncleanable=res["uncleanable"],
            uncleanable_sentences=[
                UncleanableSentence(length=clen, text=s)
                for idx, clen, start, end, s in res["cleaned_hits"]
            ]
        )
    except AnalysisError:
        raise


class AnalyzeTextRequest(BaseModel):
    text_content: str = Field(..., max_length=5000000)

@router.post("/analyze_text", response_model=TextAnalysisResponse)
def api_analyze_text(req: AnalyzeTextRequest):
    def process_text():
        text_content = req.text_content
        stats = get_text_stats(text_content)

        from ...voice_engines import get_default_profile_engine
        engine_id = state.get_settings().get("default_engine", get_default_profile_engine())
        chunk_limit = get_text_chunk_limit(engine_id)
        split_target = get_text_split_target(engine_id)

        raw_hits = find_long_sentences(text_content, threshold=chunk_limit)
        cleaned_text = clean_text_for_tts(text_content)
        split_text = safe_split_long_sentences(cleaned_text, target=split_target)
        packed_text = pack_text_to_limit(split_text, limit=chunk_limit, pad=True)
        cleaned_hits = find_long_sentences(split_text, threshold=chunk_limit)

        uncleanable = len(cleaned_hits)
        auto_fixed = len(raw_hits) - uncleanable

        return {
            "stats": stats,
            "raw_hits": raw_hits,
            "auto_fixed": auto_fixed,
            "uncleanable": uncleanable,
            "cleaned_hits": cleaned_hits,
            "packed_text": packed_text,
            "split_text": split_text,
            "chunk_limit": chunk_limit,
        }

    res = process_text()

    return TextAnalysisResponse(
        status="ok",
        char_count=res["stats"]["char_count"],
        word_count=res["stats"]["word_count"],
        sent_count=res["stats"]["sent_count"],
        predicted_seconds=res["stats"]["predicted_seconds"],
        raw_long_sentences=len(res["raw_hits"]),
        auto_fixed=res["auto_fixed"],
        uncleanable=res["uncleanable"],
        uncleanable_sentences=[
            UncleanableSentence(length=clen, text=s)
            for idx, clen, start, end, s in res["cleaned_hits"]
        ],
        threshold=res["chunk_limit"],
        safe_text=res["packed_text"],
        split_sentences=res["split_text"].split("\n")
    )




@router.get("/report/{name}")
def report(
    name: str,
    report_dir: Path = Depends(get_report_dir)
):
    # Path Traversal Safety
    report_filename = safe_basename(f"long_sentences_{name}.txt")
    if report_filename != f"long_sentences_{name}.txt":
        logger.error("Error resolving report path %s", name, exc_info=True)
        return JSONResponse(
            {"status": "error", "message": "Invalid report name"},
            status_code=403
        )
    report_path = next(
        (entry.resolve() for entry in report_dir.iterdir() if entry.is_file() and entry.name == report_filename),
        None,
    ) if report_dir.exists() else None
    if not report_path:
        return JSONResponse(
            {"status": "error", "message": "Report not found"},
            status_code=404
        )

    return FileResponse(report_path)

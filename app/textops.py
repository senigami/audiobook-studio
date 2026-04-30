from .config import BASELINE_XTTS_CPS, SENT_CHAR_LIMIT, SAFE_SPLIT_TARGET
from .textops_helpers import (
    CHAPTER_RE,
    normalize_newlines,
    preprocess_text,
    safe_filename,
    format_duration
)
from .textops_splitting import (
    split_by_chapter_markers,
    split_into_parts,
    write_chapters_to_folder,
    split_sentences,
    safe_split_long_sentences,
    find_long_sentences
)
from .textops_cleaning import (
    clean_text_for_tts,
    consolidate_single_word_sentences,
    sanitize_for_xtts,
    pack_text_to_limit
)


def get_text_stats(text: str) -> dict:
    """Centralized stats for analysis and DB."""
    if not text:
        return {
            "char_count": 0, "word_count": 0, "sent_count": 0,
            "predicted_seconds": 0, "formatted_duration": "0s"
        }
    char_count = len(text)
    word_count = len(text.split())
    # Count periods, exclamation marks, and question marks as sentence markers
    sent_count = text.count('.') + text.count('?') + text.count('!')
    pred_seconds = int(char_count / BASELINE_XTTS_CPS)

    return {
        "char_count": char_count,
        "word_count": word_count,
        "sent_count": sent_count,
        "predicted_seconds": pred_seconds,
        "formatted_duration": format_duration(pred_seconds)
    }


def compute_chapter_metrics(text: str) -> dict:
    """Legacy wrapper for DB updates, now uses centralized helper."""
    stats = get_text_stats(text)
    return {
        "char_count": stats["char_count"],
        "word_count": stats["word_count"],
        "predicted_audio_length": float(stats["predicted_seconds"])
    }

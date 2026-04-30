"""Legacy re-export layer for engine utilities.

Phase 9 Large-File Refactor: This module now delegates to specialized sub-modules
within the ``app/engines/`` package while preserving the legacy API surface.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

# Import specialized modules
from app.engines.audio_ops import (
    _ffmpeg_concat_entry,
    convert_to_wav,
    get_audio_duration,
    stitch_segments,
    wav_to_mp3,
)
from app.engines.audiobook_utils import _create_temp_manifest, assemble_audiobook
from app.engines.proc_utils import _active_processes, run_cmd_stream, terminate_all_subprocesses
from app.engines.video_utils import generate_video_sample
from app.engines.xtts_utils import (
    get_speaker_latent_path,
    migrate_speaker_latent_to_profile,
    xtts_generate,
    xtts_generate_script,
)

# Re-export config and utils that were previously available in this module
from .config import XTTS_ENV_ACTIVATE, XTTS_ENV_PYTHON, MP3_QUALITY, BASE_DIR, AUDIOBOOK_BITRATE
from .subprocess_utils import coerce_subprocess_output, probe_audio_duration
from .textops import safe_split_long_sentences, sanitize_for_xtts, pack_text_to_limit

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger(__name__)

# Re-exports for backward compatibility
__all__ = [
    "_active_processes",
    "terminate_all_subprocesses",
    "run_cmd_stream",
    "wav_to_mp3",
    "convert_to_wav",
    "xtts_generate",
    "xtts_generate_script",
    "get_audio_duration",
    "get_speaker_latent_path",
    "migrate_speaker_latent_to_profile",
    "assemble_audiobook",
    "generate_video_sample",
    "stitch_segments",
    "_create_temp_manifest",
    "_ffmpeg_concat_entry",
]

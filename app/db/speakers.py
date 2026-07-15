# Facade for voice profile / speaker persistence.
# Original monolithic speakers.py has been decomposed into specialized sub-modules
# (speakers_paths, speakers_settings, speakers_crud, speakers_sync), mirroring the
# app/db/state.py facade pattern.

from ..core import config
from ..utils.pathing import find_secure_file
from .core import get_connection
from .speaker_naming import infer_speaker_name, infer_variant_name
from .speaker_paths import _profile_name_or_error
from .speakers_paths import (
    SAFE_PROFILE_NAME_RE,
    _looks_like_uuid,
    _existing_profile_dir,
    _new_profile_dir,
    _resolve_existing_profile_name,
    get_profile_dir,
    get_profile_wavs,
)
from .speakers_settings import (
    DEFAULT_SPEAKER_TEST_TEXT,
    _infer_profile_engine,
    _get_minimal_save_metadata,
    get_profile_engine,
    profile_has_custom_test_text,
    get_speaker_settings,
    update_speaker_settings,
    normalize_profile_metadata,
    normalize_base_profiles,
)
from .speakers_crud import (
    create_speaker,
    get_speaker,
    list_speakers,
    update_speaker,
    delete_speaker,
)
from .speakers_sync import (
    sync_speakers_from_profiles,
    update_voice_profile_references,
)

# Re-exporting for backward compatibility and centralized access
__all__ = [
    "config",
    "find_secure_file",
    "get_connection",
    "infer_speaker_name",
    "infer_variant_name",
    "_profile_name_or_error",
    "SAFE_PROFILE_NAME_RE",
    "_looks_like_uuid",
    "_existing_profile_dir",
    "_new_profile_dir",
    "_resolve_existing_profile_name",
    "get_profile_dir",
    "get_profile_wavs",
    "DEFAULT_SPEAKER_TEST_TEXT",
    "_infer_profile_engine",
    "_get_minimal_save_metadata",
    "get_profile_engine",
    "profile_has_custom_test_text",
    "get_speaker_settings",
    "update_speaker_settings",
    "normalize_profile_metadata",
    "normalize_base_profiles",
    "create_speaker",
    "get_speaker",
    "list_speakers",
    "update_speaker",
    "delete_speaker",
    "sync_speakers_from_profiles",
    "update_voice_profile_references",
]

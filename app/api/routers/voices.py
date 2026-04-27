import logging
from fastapi import APIRouter

# Assemble the API surface from sub-routers
from . import (
    voices_bundles,
    voices_management,
    voices_actions,
    voices_characters,
    voices_narrators,
)

# Re-export internal helpers and settings used by tests and other modules
from .voices_helpers import (
    VOICES_DIR,
    _is_engine_active,
    delete_speaker_sample,
)
from ...jobs import (
    get_speaker_settings,
    update_speaker_settings,
    DEFAULT_SPEAKER_TEST_TEXT,
    enqueue,
)
from ...engines.bridge import create_voice_bridge
from ...state import put_job

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voices"])

# Management routes (profiles)
router.include_router(voices_management.router, prefix="/api")

# Character routes
router.include_router(voices_characters.router, prefix="/api")

# Speaker (narrator) routes
router.include_router(voices_narrators.router, prefix="/api")

# Bundle routes (download/import)
router.include_router(voices_bundles.router, prefix="/api/voices")

# Action routes (build, test, settings, samples)
router.include_router(voices_actions.router, prefix="/api/speaker-profiles")

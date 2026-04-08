"""Voice domain for Studio 2.0.

Owns voice profiles, voice assets, preview/test behavior, and compatibility.
"""

from .models import VoiceAssetModel, VoicePreviewRequestModel, VoiceProfileModel
from .compatibility import validate_voice_compatibility
from .repository import VoiceRepository
from .samples import build_voice_sample_request
from .service import create_voice_service

__all__ = [
    "VoiceAssetModel",
    "VoicePreviewRequestModel",
    "VoiceProfileModel",
    "VoiceRepository",
    "build_voice_sample_request",
    "create_voice_service",
    "validate_voice_compatibility",
]

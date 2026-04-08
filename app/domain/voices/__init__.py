"""Voice domain for Studio 2.0.

Owns voice profiles, voice assets, preview/test behavior, and compatibility.
"""

from .models import VoiceAssetModel, VoiceProfileModel
from .service import create_voice_service

__all__ = ["VoiceAssetModel", "VoiceProfileModel", "create_voice_service"]

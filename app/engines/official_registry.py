"""Official Plugin Registry MVP for Studio 2.0.

This module provides a hardcoded JSON representation of the official plugin registry
for the v2.0 release. It is intended to be replaced with a remote JSON document
in a future update.
"""

from typing import Any


def get_official_registry() -> list[dict[str, Any]]:
    """Return the list of official plugins for the v2.0 release."""
    return [
        {
            "id": "tts_xtts",
            "name": "XTTS (Local)",
            "summary": "Official local voice cloning and text-to-speech plugin.",
            "trust_level": "official",
            "repo_url": "https://github.com/audiobook-studio/tts-xtts.git",
            "homepage": "https://github.com/audiobook-studio/tts-xtts",
            "docs_url": "https://github.com/audiobook-studio/tts-xtts#readme",
            "icon": "icon.png",
            "tags": ["local", "voice-cloning", "gpu"],
            "min_studio": "2.0.0",
            "compatibility": ["macOS", "Windows", "Linux"],
            "requirements": ["Python 3.11", "4 GB VRAM recommended"],
        },
        {
            "id": "tts_voxtral",
            "name": "Voxtral (Cloud)",
            "summary": "Official cloud text-to-speech plugin using Mistral AI APIs.",
            "trust_level": "official",
            "repo_url": "https://github.com/audiobook-studio/tts-voxtral.git",
            "homepage": "https://github.com/audiobook-studio/tts-voxtral",
            "docs_url": "https://github.com/audiobook-studio/tts-voxtral#readme",
            "icon": "icon.png",
            "tags": ["cloud", "network", "api-key"],
            "min_studio": "2.0.0",
            "compatibility": ["macOS", "Windows", "Linux"],
            "requirements": ["Mistral API Key"],
        },
    ]

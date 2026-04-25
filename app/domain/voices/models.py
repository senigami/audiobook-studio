from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

@dataclass
class VoiceModel:
    id: str
    name: str
    version: int = 2
    default_variant: str = "Default"
    description: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class VariantModel:
    id: str
    voice_id: str
    name: str
    engine: str = "xtts"
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class VoiceProfileModel:
    id: str
    name: str
    default_engine_id: Optional[str] = None
    settings: Dict[str, Any] = field(default_factory=dict)

@dataclass
class VoiceAssetModel:
    id: str
    voice_profile_id: str
    engine_id: str
    path: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class VoicePreviewRequestModel:
    voice_profile_id: str
    script_text: str
    engine_id: Optional[str] = None
    reference_text: Optional[str] = None
    reference_audio_path: Optional[str] = None
    voice_asset_id: Optional[str] = None
    output_format: str = "wav"

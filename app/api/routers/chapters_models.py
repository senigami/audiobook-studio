from __future__ import annotations
from typing import Optional, List, Literal
from pydantic import BaseModel


class BulkStatusUpdate(BaseModel):
    segment_ids: List[str]
    status: Literal["unprocessed", "processing", "done", "failed", "cancelled", "error"]


class BulkSegmentsUpdate(BaseModel):
    segment_ids: List[str]
    updates: dict


class ProductionBlocksUpdate(BaseModel):
    blocks: list[dict]
    base_revision_id: Optional[str] = None


class AudioExportRequest(BaseModel):
    format: Literal["wav", "mp3"]


class ScriptSpan(BaseModel):
    id: str
    order_index: int
    text: str
    sanitized_text: str
    character_id: Optional[str] = None
    speaker_profile_name: Optional[str] = None
    status: str
    audio_file_path: Optional[str] = None
    audio_generated_at: Optional[float] = None
    char_count: int
    sanitized_char_count: int


class ScriptParagraph(BaseModel):
    id: str
    span_ids: List[str]


class ScriptRenderBatch(BaseModel):
    id: str
    span_ids: List[str]
    status: str
    estimated_work_weight: int


class ScriptViewResponse(BaseModel):
    chapter_id: str
    base_revision_id: str
    paragraphs: List[ScriptParagraph]
    spans: List[ScriptSpan]
    render_batches: List[ScriptRenderBatch]


class ScriptAssignment(BaseModel):
    span_ids: List[str]
    character_id: Optional[str] = None
    speaker_profile_name: Optional[str] = None


class ScriptRangeAssignment(BaseModel):
    start_span_id: str
    start_offset: int
    end_span_id: str
    end_offset: int
    character_id: Optional[str] = None
    speaker_profile_name: Optional[str] = None


class CompactionRequest(BaseModel):
    base_revision_id: Optional[str] = None


class ScriptAssignmentsUpdate(BaseModel):
    assignments: List[ScriptAssignment] = []
    range_assignments: List[ScriptRangeAssignment] = []
    base_revision_id: Optional[str] = None


class ResyncPreviewRequest(BaseModel):
    text_content: str


class ResyncPreviewResponse(BaseModel):
    total_segments_before: int
    total_segments_after: int
    preserved_assignments_count: int
    lost_assignments_count: int
    affected_character_names: List[str]
    is_destructive: bool

/**
 * Mirrors app/domain/chapters/performance_schema.py field-for-field (W-PERF
 * safe foundation, task 002). See design-docs/specs/performance-script-format.md.
 *
 * The `review` sub-object holds only speaker_reviewed/performance_reviewed/
 * review_notes -- needs_human_review/locked live on dedicated chapter_segments
 * columns (task 001) and are NOT duplicated here.
 */

export type SegmentKind =
  | 'narration'
  | 'dialogue'
  | 'attribution'
  | 'stage_direction'
  | 'action_context'
  | 'vocalization'
  | 'sfx'
  | 'music'
  | 'ambience'
  | 'silence'
  | 'chapter_marker'
  | 'scene_marker'
  | 'production_note';

export type RenderingMode =
  | 'standard_audiobook'
  | 'enhanced_audiobook'
  | 'audio_drama'
  | 'script_view'
  | 'review_view';

export type RenderingValue =
  | 'spoken'
  | 'spoken_by_narrator'
  | 'omit'
  | 'convert_to_vocalization'
  | 'convert_to_sfx'
  | 'use_as_context_only'
  | 'visible'
  | 'hidden';

export interface Emphasis {
  text: string;
  level: string;
}

export interface EmotionAnnotation {
  primary: string;
  secondary: string[];
  intensity: number;
  valence?: number | null;
  arousal?: number | null;
  confidence?: number | null;
}

export interface DeliveryAnnotation {
  pace?: string | null;
  volume?: string | null;
  pitch?: string | null;
  range?: string | null;
  pause_before_ms?: number | null;
  pause_after_ms?: number | null;
  emphasis: Emphasis[];
}

export interface PerformanceAnnotation {
  emotion?: EmotionAnnotation | null;
  delivery?: DeliveryAnnotation | null;
  acting_note?: string | null;
}

export interface InferredState {
  target_character_id: string;
  emotion: string;
}

export interface ReviewAnnotation {
  speaker_reviewed?: boolean | null;
  performance_reviewed?: boolean | null;
  review_notes?: string | null;
}

export interface PerformanceData {
  kind: SegmentKind;
  performance?: PerformanceAnnotation | null;
  rendering: Partial<Record<RenderingMode, RenderingValue>>;
  review?: ReviewAnnotation | null;

  // Kind-specific extension fields (vocalization).
  vocalization_type?: string | null;
  spoken_text?: string | null;
  export_strategy?: string | null;

  // Kind-specific extension fields (sfx).
  sfx_type?: string | null;
  description?: string | null;
  placement?: string | null;
  enabled?: boolean | null;

  // Kind-specific extension fields (silence / sfx shared).
  duration_ms?: number | null;
  purpose?: string | null;

  // Kind-specific extension fields (action_context).
  affects_next_segments?: string[] | null;
  inferred_state?: InferredState | null;
}

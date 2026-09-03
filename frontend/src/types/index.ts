export type Engine = string;
export type VoiceEngine = string;
export type JobClassification = 'job' | 'chapter' | 'segment';

/**
 * Per-segment lifecycle entry within an `active_segments_map` (W-PAR 006).
 * Frozen contract (C2, design-docs/plans/active/parallel-segment-rendering):
 * consumed verbatim from the chapter progress frame.
 */
export interface ActiveSegmentMapEntry {
  phase: 'preparing' | 'rendering' | 'done' | 'failed';
  progress: number;
  eta_seconds: number | null;
  reason_code?: string;
  indeterminate?: boolean;
  /** Real per-segment character count (task 008) — never the render group's
   * combined total; see `app/orchestration/tasks/segment_synthesis.py`'s
   * `_segment_char_count`. */
  char_count?: number;
  engine_id?: string;
}

export interface TtsEngine {
  engine_id: string;
  display_name: string;
  status: 'ready' | 'needs_setup' | 'unverified' | 'not_loaded' | 'invalid_config';
  verified: boolean;
  enabled: boolean;
  version: string;
  local: boolean;
  cloud: boolean;
  network: boolean;
  languages: string[];
  capabilities: string[];
  resource: Record<string, any>;
  author: string;
  homepage: string;
  can_enable?: boolean;
  enablement_message?: string;
  setup_message?: string;
  health_message?: string;
  health_details?: Record<string, any>;
  dependencies_satisfied?: boolean;
  missing_dependencies?: string[];
  help_text?: string;
  privacy_text?: string;
  settings_schema: any;
  current_settings?: Record<string, any>;
  last_test?: {
    ok: boolean;
    audio_url: string;
    generated_at: number | string;
    message?: string;
  };
  calibrated_cps?: number | null;
  calibration_sample_count?: number | null;
  calibration_since?: number | null;
  calibration_confidence_percent?: number | null;
  dev?: {
    enabled?: boolean;
    scenarios?: string;
  };
  behavior?: Record<string, any>;
  logo_url?: string;
  built_in?: boolean;
}

export type Status = 'queued' | 'preparing' | 'running' | 'finalizing' | 'done' | 'failed' | 'cancelled' | 'error';

// Task 005 (north_star_screen_parity) — partial 3-state workflow status,
// derived server-side (app/db/projects.py::list_projects) from chapter
// lifecycle aggregates. "Studio" (actively rendering) and "Published"
// (assembled) are intentionally not represented — see design-docs/plans/
// active/north_star_screen_parity/tasks/005-library-project-status.md.
export type ProjectStatus = 'drafting' | 'casting' | 'rendered';

export interface Project {
  id: string;
  name: string;
  series: string | null;
  series_position: number | null;
  author: string | null;
  speaker_profile_name: string | null;
  cover_image_path: string | null;
  description: string | null;
  created_at: number;
  updated_at: number;
  chapter_map?: Record<string, any>;
  status?: ProjectStatus;
  /** Total chapter count, for deriving a static rendered-fraction progress (task 006). */
  chapter_count?: number;
  /** Chapters whose audio_status is 'done', for the same rendered-fraction calc. */
  chapters_rendered_count?: number;
}

export interface Character {
  id: string;
  project_id: string;
  name: string;
  speaker_profile_name: string | null;
  default_emotion: string | null;
  color: string;
  chapter_id?: string | null;
}

export interface ChapterSegment {
  id: string;
  chapter_id: string;
  // #232 Task 009: segment_order dropped -- ordering authority is
  // start_offset, this field had zero runtime readers, and the API no
  // longer serves it (app/api/routers/chapters.py's api_get_segments).
  text_content: string;
  sanitized_text?: string;
  character_id: string | null;
  speaker_profile_name: string | null;
  audio_file_path: string | null;
  audio_status: 'unprocessed' | 'processing' | 'done' | 'error' | 'failed' | 'cancelled';
  audio_generated_at: number | null;
}

export interface ScriptSpan {
  id: string;
  order_index: number;
  text: string;
  sanitized_text: string;
  character_id: string | null;
  speaker_profile_name: string | null;
  status: string;
  audio_file_path: string | null;
  audio_generated_at: number | null;
  char_count: number;
  sanitized_char_count: number;
}

export interface ScriptParagraph {
  id: string;
  span_ids: string[];
}

export interface ScriptRenderBatch {
  id: string;
  span_ids: string[];
  status: string;
  estimated_work_weight: number;
}

export interface AudioGroup {
  id: string;
  span_ids: string[];
  status: string;
  audio_file_path: string | null;
  asset_url: string | null;
  order_index: number;
  estimated_work_weight: number;
}

export interface ScriptViewResponse {
  chapter_id: string;
  base_revision_id: string | null;
  paragraphs: ScriptParagraph[];
  spans: ScriptSpan[];
  render_batches: ScriptRenderBatch[];
  audio_groups: AudioGroup[];
}

export interface ScriptAssignment {
  span_ids: string[];
  character_id?: string | null;
  speaker_profile_name?: string | null;
}

export interface ScriptRangeAssignment {
  start_span_id: string;
  start_offset: number;
  end_span_id: string;
  end_offset: number;
  character_id?: string | null;
  speaker_profile_name?: string | null;
}

export interface ScriptAssignmentsUpdate {
  assignments: ScriptAssignment[];
  range_assignments?: ScriptRangeAssignment[];
  base_revision_id: string | null;
}

export interface Chapter {
  id: string;
  project_id: string;
  title: string;
  text_content: string;
  speaker_profile_name: string | null;
  sort_order: number;
  audio_status: 'unprocessed' | 'processing' | 'done' | 'error' | 'failed' | 'cancelled';
  audio_file_path: string | null;
  has_wav?: boolean;
  has_mp3?: boolean;
  has_m4a?: boolean;
  text_last_modified: number | null;
  audio_generated_at: number | null;
  char_count: number;
  word_count: number;
  sent_count: number;
  predicted_audio_length: number;
  audio_length_seconds: number;
  total_segments_count?: number;
  done_segments_count?: number;
}

export interface ProcessingQueueItem {
  id: string;
  project_id?: string | null;
  chapter_id?: string | null;
  split_part: number;
  parent_job_id?: string | null;
  classification?: JobClassification;
  status: Status;
  created_at: number;
  completed_at: number | null;
  chapter_title?: string;
  project_name?: string;
  progress?: number;
  eta_seconds?: number;
  estimated_end_at?: number;
  eta_basis?: 'remaining_from_update' | 'total_from_start';
  started_at?: number;
  log?: string;
  error?: string | null;
  custom_title?: string;
  predicted_audio_length?: number;
  char_count?: number;
  engine?: Engine;
  segment_ids?: string[];
  grouped_progress?: number;
  chapter_audio_status?: Chapter['audio_status'];
  chapter_audio_file_path?: string | null;
  updated_at?: number;
  eta_updated_at?: number;
  confidence?: number;
  render_group_count?: number;
  completed_render_groups?: number;
  active_render_group_index?: number;
  total_render_weight?: number;
  completed_render_weight?: number;
  active_render_group_weight?: number;
  active_segment_id?: string | null;
  active_segment_progress?: number;
  active_segments_map?: Record<string, ActiveSegmentMapEntry> | null;
  audio_length_seconds?: number;
  produced_audio_length?: number;
  produced_chars?: number;
  produced_word_count?: number;
  produced_segment_count?: number;
  indeterminate?: boolean | null;
  loadingElapsedSeconds?: number | null;
}

export interface SpeakerProfile {
  name: string;
  wav_count: number;
  samples?: string[];
  speed: number;
  is_default: boolean;
  test_text?: string;
  speaker_id: string | null;
  variant_name: string | null;
  engine?: VoiceEngine;
  voice_asset_id?: string | null;
  model?: string | null;
  reference_sample?: string | null;
  preview_url: string | null;
  asset_base_url?: string | null;
  has_latent?: boolean;
  is_rebuild_required?: boolean;
  rebuild_reasons?: string[];
  samples_detailed?: Array<{ name: string; is_new: boolean }>;
  is_ready?: boolean;
  readiness_message?: string;
  settings?: Record<string, any>;
  version_count?: number;
  performance_tags?: string[];
  /** Per-variant default flag (task 005) — the character's default variant for bundle
   * export. Distinct from `is_default` (the app-wide default speaker profile). */
  is_variant_default?: boolean;
  /** Per-variant performance qualities (owner-requested, 2026-07-16) — moved off
   * voice-level VoiceAttributes since these describe how THIS recording performs,
   * which can genuinely differ between two variants of the same voice (unlike
   * class/gender/age, which stay voice-level). */
  tone?: string[];
  timbre?: string[];
  pace?: string;
}

export interface Speaker {
  id: string;
  name: string;
  default_profile_name: string | null;
  created_at: number;
  updated_at: number;
}

/** Voice attributes — controlled vocabularies per design-docs/specs/voice-taxonomy.json v2.0 */
export interface VoiceAttributes {
  class?: string;
  gender?: string;
  age?: string;
  accent?: string;
  language?: string[];
  style?: string[];
  tone?: string[];
  timbre?: string[];
  pace?: string;
  use_case?: string[];
  quality?: string[];
}

/** One ranked voice suggestion — an entry of CastingResponse.recommendations (voice-bundles.md §9). */
export interface CastingRecommendation {
  voice_id: string;
  score: number;
  reason: string;
}

/** Response shape of POST /api/voices/cast (casting contract, voice-bundles.md §9). */
export interface CastingResponse {
  contract_version: string;
  character: string;
  recommendations: CastingRecommendation[];
  /** True when fewer than 2 catalog cards were eligible — brief/catalog too thin to rank meaningfully. */
  needs_input: boolean;
}

/** Full metadata for a voice — returned by GET /api/voices/ and PATCH /api/voices/{id}/metadata */
export interface VoiceMetadata {
  id: string;
  name: string;
  description?: string;
  image?: string;
  languages?: string[];
  attributes?: VoiceAttributes;
  tags?: string[];
  /** True when the attributes block is absent (voice has not been tagged yet) */
  is_untagged: boolean;
  /** voice-bundles.md §8.1 — only present when the voice has recorded provenance. */
  provenance?: {
    source: 'recorded' | 'cloned' | 'imported' | 'designed';
    author?: string;
    consent_ack?: boolean;
    created_at?: string;
  };
}

// --- Hugging Face voice browse/import (GET/POST /api/voices/huggingface/*) ---

/** One row of a Hub search result — GET /api/voices/huggingface/search */
export interface HfSearchResult {
  hub_id: string;
  author?: string | null;
  tags: string[];
  likes: number;
}

/** Full parsed card — GET /api/voices/huggingface/inspect */
export interface HfVoiceCard {
  hub_id: string;
  revision?: string | null;
  license?: string | null;
  is_restrictive_license: boolean;
  languages: string[];
  tags: string[];
  author?: string | null;
  description?: string | null;
  sample_url?: string | null;
}

/** Response shape of POST /api/voices/huggingface/import */
export interface HfImportResult {
  status: string;
  voice_id: string;
  voice_name: string;
  profile_name: string;
  saved_samples: string[];
  license?: string | null;
  is_restrictive_license: boolean;
  metadata: VoiceMetadata;
}

export interface Job {
  id: string;
  engine: Engine;
  chapter_file: string;
  status: Status;
  created_at: number;
  parent_job_id?: string | null;
  project_id?: string;
  chapter_id?: string;
  classification?: JobClassification;
  started_at?: number;
  updated_at?: number;
  eta_updated_at?: number;
  finished_at?: number;
  completed_at?: number | null;
  safe_mode: boolean;
  make_mp3: boolean;
  progress: number;
  eta_seconds?: number;
  estimated_end_at?: number;
  eta_basis?: 'remaining_from_update' | 'total_from_start';
  eta_confidence?: 'estimating' | 'stable' | 'recomputing';
  confidence?: number;
  log?: string;
  error?: string;
  reason_code?: string;
  warning_count: number;
  custom_title?: string;
  author_meta?: string;
  narrator_meta?: string;
  output_wav?: string | null;
  output_mp3?: string | null;
  audio_length_seconds?: number;
  produced_audio_length?: number;
  produced_chars?: number;
  produced_segment_count?: number;
  speaker_profile?: string | null;
  segment_ids?: string[];
  active_segment_id?: string | null;
  active_segment_progress?: number;
  active_segment_eta_seconds?: number | null;
  active_segment_eta_basis?: string | null;
  active_segment_updated_at?: number | null;
  active_segments_map?: Record<string, ActiveSegmentMapEntry> | null;
  render_group_count?: number;
  completed_render_groups?: number;
  active_render_group_index?: number;
  total_render_weight?: number;
  completed_render_weight?: number;
  active_render_group_weight?: number;
  grouped_progress?: number;
  active_render_batch_id?: string | null;
  active_render_batch_progress?: number;
  segmentProgressUpdates?: any[];
  has_segment_support?: boolean;
  hasSegmentSupport?: boolean;
  // Model-load / indeterminate telemetry (W-MIX-LA 004) — populated from the live
  // event payload; mirrors ProcessingQueueItem. The progress bar honors these for
  // the mid-chapter model-load window.
  indeterminate?: boolean | null;
  loadingElapsedSeconds?: number | null;
}

export interface SegmentProgress {
  job_id: string;
  chapter_id?: string;
  segment_id: string;
  progress: number;
  // Escaped defect fix (2026-07-05): captured from the same segments.progress
  // wire frame that already carries `progress`, so useStudioChapter.ts can
  // derive a usable active-segments fallback (phase/eta), not just a bare
  // percentage, when the backend's own active_segments_map is absent.
  eta_seconds?: number | null;
  status?: string;
  updated_at?: number;
}

export interface Settings {
  safe_mode: boolean;
  default_engine: Engine;
  default_speaker_profile?: string;
  cloud_enabled?: boolean;
  enabled_plugins?: Record<string, boolean>;
  cloud_model?: string;
  mistral_api_key?: string;
  tts_parallel_cap?: number;
  tts_engine_caps?: Record<string, number>;
  /** Redacted by the backend: '***' when set, '' when unset. The real value is never sent to the frontend. */
  huggingface_token?: string;
}

export interface Audiobook {
  filename: string;
  title: string;
  download_filename?: string;
  cover_url: string | null;
  url?: string;
  created_at?: number;
  size_bytes?: number;
  duration_seconds?: number;
  description?: string | null;
}

export interface StoredBackup {
  filename: string;
  created_at: string; // ISO timestamp from backend
  size_bytes: number;
  comment: string | null;
  download_url: string;
}

export interface AssemblyChapter {
  filename: string;
  title: string;
  duration: number;
}

export interface AssemblyPrep {
  chapters: AssemblyChapter[];
  total_duration: number;
}

export interface GlobalState {
  jobs: Record<string, Job>;
  settings: Settings;
  engines: TtsEngine[];
  paused: boolean;
  chapters: Chapter[];
  narrator_ok: boolean;
  speaker_profiles: SpeakerProfile[];
  speakers: Speaker[];
  projects: Project[];
  render_stats?: RenderStats;
  runtime_services?: RuntimeService[];
  system_info?: {
    backend_mode?: string;
    orchestrator?: string;
    api_base_url?: string;
    startup_ready?: boolean;
    startup_message?: string;
    startup_detail?: string;
    local_url?: string;
    network_url?: string | null;
  };
}

export interface RenderStats {
  sample_count: number;
  word_count: number;
  chars: number;
  audio_duration_seconds: number;
  render_duration_seconds: number;
  audio_hours_rendered: number;
  render_hours_spent: number;
  since_timestamp?: number | null;
  since_date?: string | null;
  by_engine: Array<{
    engine: string;
    sample_count: number;
    audio_duration_seconds: number;
    render_duration_seconds: number;
  }>;
}

export interface RuntimeService {
  id: string;
  label: string;
  kind: 'api' | 'tts_server' | 'frontend' | string;
  url?: string | null;
  port?: number | null;
  healthy?: boolean;
  pingable?: boolean;
  status?: string;
  message?: string | null;
  can_restart?: boolean;
  circuit_open?: boolean;
}

/** Per-book pronunciation lexicon entry — plain-text respelling, book-scoped only. */
export interface LexiconEntry {
  id: string;
  project_id: string;
  word: string;
  replacement: string;
  created_at?: number;
}

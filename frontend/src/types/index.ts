export type Engine = 'xtts' | 'voxtral' | 'mixed' | 'audiobook' | 'voice_build' | 'voice_test';
export type VoiceEngine = 'xtts' | 'voxtral';

export type Status = 'queued' | 'preparing' | 'running' | 'finalizing' | 'done' | 'failed' | 'cancelled' | 'error';

export interface Project {
  id: string;
  name: string;
  series: string | null;
  author: string | null;
  cover_image_path: string | null;
  created_at: number;
  updated_at: number;
}

export interface Character {
  id: string;
  project_id: string;
  name: string;
  speaker_profile_name: string | null;
  default_emotion: string | null;
  color: string;
}

export interface ChapterSegment {
  id: string;
  chapter_id: string;
  segment_order: number;
  text_content: string;
  sanitized_text?: string;
  character_id: string | null;
  speaker_profile_name: string | null;
  audio_file_path: string | null;
  audio_status: 'unprocessed' | 'processing' | 'done' | 'error' | 'failed' | 'cancelled';
  audio_generated_at: number | null;
}

export interface Chapter {
  id: string;
  project_id: string;
  title: string;
  text_content: string;
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
  project_id: string;
  chapter_id: string;
  split_part: number;
  status: Status;
  created_at: number;
  completed_at: number | null;
  chapter_title?: string;
  project_name?: string;
  progress?: number;
  eta_seconds?: number;
  started_at?: number;
  log?: string;
  custom_title?: string;
  predicted_audio_length?: number;
  char_count?: number;
  engine?: Engine;
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
  voxtral_voice_id?: string | null;
  voxtral_model?: string | null;
  reference_sample?: string | null;
  preview_url: string | null;
  has_latent?: boolean;
  is_rebuild_required?: boolean;
  samples_detailed?: Array<{ name: string; is_new: boolean }>;
}

export interface Speaker {
  id: string;
  name: string;
  default_profile_name: string | null;
  created_at: number;
  updated_at: number;
}

export interface Job {
  id: string;
  engine: Engine;
  chapter_file: string;
  status: Status;
  created_at: number;
  project_id?: string;
  chapter_id?: string;
  started_at?: number;
  finished_at?: number;
  safe_mode: boolean;
  make_mp3: boolean;
  progress: number;
  eta_seconds?: number;
  log?: string;
  error?: string;
  warning_count: number;
  custom_title?: string;
  author_meta?: string;
  narrator_meta?: string;
  output_wav?: string | null;
  output_mp3?: string | null;
  speaker_profile?: string | null;
  active_segment_id?: string | null;
  active_segment_progress?: number;
}

export interface Settings {
  safe_mode: boolean;
  make_mp3: boolean;
  default_engine: Engine;
  default_speaker_profile?: string;
  voxtral_enabled?: boolean;
  voxtral_model?: string;
  mistral_api_key?: string;
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
  paused: boolean;
  chapters: string[];
  audiobooks: Audiobook[];
  xtts_mp3: string[];
  xtts_wav_only: string[];
  narrator_ok: boolean;
  speaker_profiles: SpeakerProfile[];
  speakers: Speaker[];
}

/**
 * Voice Lab fixtures for the demo stage.
 *
 * 4 voices covering the key status states: READY, READY (default), BUILD TO TEST, NO SAMPLES.
 * preview_url uses a 0.5-second silent WAV data-URI so play buttons work without a backend.
 */

import type { Speaker, SpeakerProfile, TtsEngine } from '@/types';

// 0.5 s silent WAV (44 100 Hz, 16-bit mono) as a data-URI.
// Generated from a minimal RIFF/WAVE header + 44 100 * 0.5 = 22 050 silent samples.
// This is the shortest valid WAV that browsers will accept for <audio>.
export const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------

export const demoVoiceEngines: TtsEngine[] = [
  {
    engine_id: 'xtts',
    display_name: 'XTTS',
    status: 'ready',
    verified: true,
    enabled: true,
    version: '2.0.3',
    local: true,
    cloud: false,
    network: false,
    languages: ['en'],
    capabilities: ['voice_build', 'preview'],
    resource: { gpu: true },
    author: 'Coqui',
    homepage: 'https://github.com/coqui-ai/TTS',
    settings_schema: {},
  },
  {
    engine_id: 'voxtral',
    display_name: 'Voxtral',
    status: 'ready',
    verified: true,
    enabled: true,
    version: '1.0.0',
    local: false,
    cloud: true,
    network: true,
    languages: ['en', 'fr', 'de', 'es'],
    capabilities: ['preview'],
    resource: {},
    author: 'Mistral AI',
    homepage: 'https://mistral.ai',
    settings_schema: {},
  },
];

// ---------------------------------------------------------------------------
// Speakers + profiles
// ---------------------------------------------------------------------------

export interface DemoVoice {
  speaker: Speaker;
  profiles: SpeakerProfile[];
}

const now = Date.now() / 1000;

export const demoVoices: DemoVoice[] = [
  // 1 — Dark Fantasy (xtts, READY, default)
  {
    speaker: {
      id: 'demo-speaker-dark-fantasy',
      name: 'Dark Fantasy',
      default_profile_name: 'Dark Fantasy/xtts',
      created_at: now - 86400,
      updated_at: now - 3600,
    },
    profiles: [
      {
        name: 'Dark Fantasy/xtts',
        wav_count: 6,
        speed: 1.0,
        is_default: true,
        speaker_id: 'demo-speaker-dark-fantasy',
        variant_name: 'Default',
        engine: 'xtts',
        preview_url: SILENT_WAV_DATA_URI,
        is_rebuild_required: false,
        is_ready: true,
        samples: [],
      },
    ],
  },
  // 2 — Studio Voice (xtts, READY)
  {
    speaker: {
      id: 'demo-speaker-studio-voice',
      name: 'Studio Voice',
      default_profile_name: 'Studio Voice/xtts',
      created_at: now - 172800,
      updated_at: now - 7200,
    },
    profiles: [
      {
        name: 'Studio Voice/xtts',
        wav_count: 8,
        speed: 1.0,
        is_default: true,
        speaker_id: 'demo-speaker-studio-voice',
        variant_name: 'Default',
        engine: 'xtts',
        preview_url: SILENT_WAV_DATA_URI,
        is_rebuild_required: false,
        is_ready: true,
        samples: [],
      },
    ],
  },
  // 3 — Sea Captain (voxtral, BUILD TO TEST — no_preview)
  {
    speaker: {
      id: 'demo-speaker-sea-captain',
      name: 'Sea Captain',
      default_profile_name: 'Sea Captain/voxtral',
      created_at: now - 43200,
      updated_at: now - 900,
    },
    profiles: [
      {
        name: 'Sea Captain/voxtral',
        wav_count: 3,
        speed: 1.0,
        is_default: true,
        speaker_id: 'demo-speaker-sea-captain',
        variant_name: 'Default',
        engine: 'voxtral',
        preview_url: null,
        is_rebuild_required: true,
        rebuild_reasons: ['no_preview'],
        is_ready: false,
        samples: [],
      },
    ],
  },
  // 4 — Ancient Chronicler (xtts, NO SAMPLES)
  {
    speaker: {
      id: 'demo-speaker-chronicler',
      name: 'Ancient Chronicler',
      default_profile_name: 'Ancient Chronicler/xtts',
      created_at: now - 1800,
      updated_at: now - 60,
    },
    profiles: [
      {
        name: 'Ancient Chronicler/xtts',
        wav_count: 0,
        speed: 1.0,
        is_default: true,
        speaker_id: 'demo-speaker-chronicler',
        variant_name: 'Default',
        engine: 'xtts',
        preview_url: null,
        is_rebuild_required: false,
        is_ready: false,
        samples: [],
      },
    ],
  },
];

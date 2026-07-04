import { describe, it, expect } from 'vitest';
import {
  voiceMetadataToCastingCard,
  buildCastingCatalog,
  characterToCastingBrief,
  resolveCastingVoiceIdToProfileName,
} from '@/utils/voiceCasting';
import type { Speaker, SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';

describe('voiceMetadataToCastingCard', () => {
  it('maps VoiceMetadata attributes into the casting-card shape (voice-bundles.md §9)', () => {
    const voice: VoiceMetadata = {
      id: 'gravel-road',
      name: 'Gravel Road',
      description: 'A weathered, low Southern drawl.',
      languages: ['en-US'],
      attributes: {
        class: 'human',
        gender: 'masculine',
        age: 'senior',
        accent: 'us-southern',
        tone: ['authoritative', 'somber'],
        timbre: ['deep', 'gravelly'],
      },
      tags: ['cowboy'],
      is_untagged: false,
    };

    const card = voiceMetadataToCastingCard(voice);

    expect(card).toMatchObject({
      voice_id: 'gravel-road',
      card_version: '1.0',
      description: 'A weathered, low Southern drawl.',
      languages: ['en-US'],
      class: 'human',
      gender: 'masculine',
      age: 'senior',
      accent: 'us-southern',
      tone: ['authoritative', 'somber'],
      timbre: ['deep', 'gravelly'],
    });
  });

  it('degrades gracefully for an untagged voice (no attributes block)', () => {
    const voice: VoiceMetadata = {
      id: 'bare-voice',
      name: 'Bare Voice',
      is_untagged: true,
    };

    const card = voiceMetadataToCastingCard(voice);

    expect(card.voice_id).toBe('bare-voice');
    expect(card.class).toBeUndefined();
    expect(card.tone).toEqual([]);
    expect(card.languages).toEqual([]);
  });
});

describe('buildCastingCatalog', () => {
  it('maps a list of voices into catalog cards, preserving order', () => {
    const voices: VoiceMetadata[] = [
      { id: 'a', name: 'A', is_untagged: true },
      { id: 'b', name: 'B', is_untagged: true },
    ];
    const catalog = buildCastingCatalog(voices);
    expect(catalog.map(c => c.voice_id)).toEqual(['a', 'b']);
  });
});

describe('characterToCastingBrief', () => {
  it('carries the character name (Character has no description/notes field today)', () => {
    expect(characterToCastingBrief({ name: 'Sheriff Boone' })).toEqual({ name: 'Sheriff Boone' });
  });
});

describe('resolveCastingVoiceIdToProfileName', () => {
  const voiceMetadataList: VoiceMetadata[] = [
    { id: 'gravel-road', name: 'Gravel Road', is_untagged: false },
  ];
  const speakers: Speaker[] = [
    { id: 'speaker-1', name: 'Gravel Road', default_profile_name: 'Gravel Road - Default', created_at: 0, updated_at: 0 },
  ];
  const speakerProfiles: SpeakerProfile[] = [
    {
      name: 'Gravel Road - Default',
      wav_count: 3,
      speed: 1,
      is_default: true,
      speaker_id: 'speaker-1',
      variant_name: 'Default',
      engine: 'xtts',
      preview_url: null,
      samples: [],
    } as SpeakerProfile,
  ];
  const engines: TtsEngine[] = [
    { engine_id: 'xtts', enabled: true, status: 'ready', display_name: 'XTTS' } as TtsEngine,
  ];

  it('resolves a recommended voice_id to its default speaker_profile_name', () => {
    const result = resolveCastingVoiceIdToProfileName('gravel-road', voiceMetadataList, speakers, speakerProfiles, engines);
    expect(result).toBe('Gravel Road - Default');
  });

  it('returns null when the voice_id is not in the metadata list', () => {
    const result = resolveCastingVoiceIdToProfileName('unknown-voice', voiceMetadataList, speakers, speakerProfiles, engines);
    expect(result).toBeNull();
  });

  it('returns null when no live speaker matches the voice name', () => {
    const result = resolveCastingVoiceIdToProfileName('gravel-road', voiceMetadataList, [], speakerProfiles, engines);
    expect(result).toBeNull();
  });

  it('returns null (fails closed) when engines is an empty array, even though multiple profiles exist', () => {
    // Regression: engines=[] is a real reachable state (initial page load before hydration,
    // and the server returning engines: [] during TTS watchdog startup/circuit-open). The
    // manual voice-assignment dropdown (isVoiceProfileSelectable) fails closed in this case;
    // casting-suggestion resolution must match that, not silently hand back a profile backed
    // by an engine of unknown readiness.
    const multiProfiles: SpeakerProfile[] = [
      ...speakerProfiles,
      {
        name: 'Gravel Road - Alt',
        wav_count: 2,
        speed: 1,
        is_default: false,
        speaker_id: 'speaker-1',
        variant_name: 'Alt',
        engine: 'xtts',
        preview_url: null,
        samples: [],
      } as SpeakerProfile,
    ];

    const result = resolveCastingVoiceIdToProfileName('gravel-road', voiceMetadataList, speakers, multiProfiles, []);
    expect(result).toBeNull();
  });
});

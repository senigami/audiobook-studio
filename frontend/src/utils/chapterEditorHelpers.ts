import type { ChapterSegment, ProductionBlock, TtsEngine, SpeakerProfile } from '../types';
import { getDefaultVoiceProfileName, getVoiceProfileEngine, formatVoiceEngineLabel } from './voiceProfiles';

/**
 * Builds fallback production blocks from source segments if no production blocks exist.
 */
export const buildFallbackProductionBlocks = (sourceSegments: ChapterSegment[]): ProductionBlock[] => {
  return [...sourceSegments]
    .sort((a, b) => (a.segment_order ?? 0) - (b.segment_order ?? 0))
    .map((segment, index) => ({
      id: segment.id,
      order_index: index,
      text: segment.sanitized_text || segment.text_content || '',
      character_id: segment.character_id,
      speaker_profile_name: segment.speaker_profile_name,
      status: segment.audio_status === 'done'
        ? 'rendered'
        : segment.audio_status === 'processing'
          ? 'running'
          : segment.audio_status === 'failed' || segment.audio_status === 'error'
            ? 'failed'
            : segment.audio_status === 'cancelled'
              ? 'failed'
              : 'draft',
      source_segment_ids: [segment.id],
    }));
};

/**
 * Resolves the engine status and availability message for a given voice.
 */
export const resolveVoiceEngineStatus = (
  voiceName: string | null | undefined,
  engines: TtsEngine[],
  speakerProfiles: SpeakerProfile[]
) => {
  const targetVoice = (voiceName || '').trim();
  if (!targetVoice) {
    return {
      profileName: null as string | null,
      engineId: null as string | null,
      engineLabel: null as string | null,
      enabled: true,
      message: null as string | null,
    };
  }

  if (!engines || engines.length === 0) {
    return {
      profileName: targetVoice,
      engineId: null,
      engineLabel: null,
      enabled: true,
      message: null as string | null,
    };
  }

  const profile = speakerProfiles.find(p => p.name === targetVoice);
  const engineId = getVoiceProfileEngine(profile);
  const engineLabel = formatVoiceEngineLabel(engineId);
  
  if (!profile || !engineId) {
    return {
      profileName: targetVoice,
      engineId: null,
      engineLabel,
      enabled: false,
      message: `${targetVoice} is unavailable. Choose an available voice or enable its engine in Settings.`,
    };
  }

  const engine = engines.find(e => e.engine_id === engineId);
  const enabled = Boolean(engine?.enabled && engine.status === 'ready');
  
  return {
    profileName: targetVoice,
    engineId,
    engineLabel,
    enabled,
    message: enabled
      ? null
      : `${targetVoice} is a ${engineLabel} voice, but ${engineLabel} is disabled in Settings. Enable the engine or choose an available voice.`,
  };
};

/**
 * Downloads a blob as a file.
 */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

/**
 * Resolves the default variant name for a character.
 */
export const resolveDefaultVariantName = (
  characterId: string | null,
  characters: import('../types').Character[],
  speakers: import('../types').Speaker[],
  speakerProfiles: SpeakerProfile[]
) => {
  if (!characterId || characterId === 'CLEAR_ASSIGNMENT') return null;
  const character = characters.find(c => c.id === characterId);
  if (!character?.speaker_profile_name) return null;
  const speaker = speakers.find(s => s.name === character.speaker_profile_name);
  if (!speaker) return null;
  const variants = (speakerProfiles || []).filter(p => p.speaker_id === speaker.id);
  return getDefaultVoiceProfileName(variants);
};

/**
 * Formats a chapter title for file export.
 */
export const formatExportFilename = (title: string, chapterId: string): string => {
    return title
        .trim()
        .replace(/[^\w.-]+/g, '_')
        .replace(/^_+|_+$/g, '') || `chapter-${chapterId}`;
};

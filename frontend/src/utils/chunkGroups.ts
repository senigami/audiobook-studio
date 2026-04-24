import type { ChapterSegment, Character, SpeakerProfile, VoiceEngine } from '../types';
import { CHUNK_CHAR_LIMIT } from '../constants/audio';
import { getVoiceProfileEngine } from './voiceProfiles';

export interface ChunkGroup {
  characterId: string | null;
  profileName: string | null;
  engine: VoiceEngine;
  segments: ChapterSegment[];
}

export function resolveSegmentProfileName(
  segment: ChapterSegment,
  characters: Character[],
  defaultProfile: string | null | undefined
): string | null {
  if (segment.speaker_profile_name) return segment.speaker_profile_name;
  const characterProfile = characters.find(c => c.id === segment.character_id)?.speaker_profile_name;
  return characterProfile || defaultProfile || null;
}

export function buildChunkGroups(
  segments: ChapterSegment[],
  characters: Character[],
  defaultProfile: string | null | undefined,
  speakerProfiles: SpeakerProfile[] = []
): ChunkGroup[] {
  const groups: ChunkGroup[] = [];
  const profileEngineMap = new Map<string, VoiceEngine>(
    speakerProfiles
      .filter((profile): profile is SpeakerProfile & { name: string } => !!profile?.name)
      .map(profile => [profile.name, getVoiceProfileEngine(profile) || 'unknown'])
  );

  segments.forEach(seg => {
    const text = (seg.text_content || '').trim();
    if (!text) return;
    const profileName = resolveSegmentProfileName(seg, characters, defaultProfile);
    const engine = profileName ? (profileEngineMap.get(profileName) || 'unknown') : 'unknown';
    const lastGroup = groups[groups.length - 1];

    if (
      lastGroup &&
      lastGroup.characterId === seg.character_id &&
      lastGroup.profileName === profileName &&
      lastGroup.engine === engine
    ) {
      const currentBatchText = lastGroup.segments.map(s => (s.text_content || '').trim()).filter(Boolean).join(' ');
      if (currentBatchText.length + text.length + 1 <= CHUNK_CHAR_LIMIT) {
        lastGroup.segments.push(seg);
        return;
      }
    }

    groups.push({ characterId: seg.character_id, profileName, engine, segments: [seg] });
  });

  return groups;
}

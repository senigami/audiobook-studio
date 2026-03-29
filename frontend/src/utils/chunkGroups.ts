import type { ChapterSegment, Character } from '../types';
import { CHUNK_CHAR_LIMIT } from '../constants/audio';

export interface ChunkGroup {
  characterId: string | null;
  profileName: string | null;
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
  defaultProfile: string | null | undefined
): ChunkGroup[] {
  const groups: ChunkGroup[] = [];

  segments.forEach(seg => {
    const text = seg.text_content || '';
    const profileName = resolveSegmentProfileName(seg, characters, defaultProfile);
    const lastGroup = groups[groups.length - 1];

    if (
      lastGroup &&
      lastGroup.characterId === seg.character_id &&
      lastGroup.profileName === profileName
    ) {
      const currentBatchText = lastGroup.segments.map(s => s.text_content).join(' ');
      if (currentBatchText.length + text.length + 1 <= CHUNK_CHAR_LIMIT) {
        lastGroup.segments.push(seg);
        return;
      }
    }

    groups.push({ characterId: seg.character_id, profileName, segments: [seg] });
  });

  return groups;
}

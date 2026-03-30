import { describe, expect, it } from 'vitest';
import { buildChunkGroups } from './chunkGroups';
import type { ChapterSegment, Character, SpeakerProfile } from '../types';

describe('buildChunkGroups', () => {
  it('splits groups when the resolved voice engine changes', () => {
    const segments: ChapterSegment[] = [
      {
        id: 'seg-1',
        chapter_id: 'chap-1',
        segment_order: 0,
        text_content: 'First sentence.',
        character_id: null,
        speaker_profile_name: 'Narrator XTTS',
        audio_file_path: null,
        audio_status: 'unprocessed',
        audio_generated_at: null,
      },
      {
        id: 'seg-2',
        chapter_id: 'chap-1',
        segment_order: 1,
        text_content: 'Second sentence.',
        character_id: null,
        speaker_profile_name: 'Narrator Voxtral',
        audio_file_path: null,
        audio_status: 'unprocessed',
        audio_generated_at: null,
      },
    ];
    const speakerProfiles: SpeakerProfile[] = [
      { name: 'Narrator XTTS', wav_count: 1, speed: 1, is_default: false, speaker_id: null, variant_name: null, preview_url: null, engine: 'xtts' },
      { name: 'Narrator Voxtral', wav_count: 1, speed: 1, is_default: false, speaker_id: null, variant_name: null, preview_url: null, engine: 'voxtral' },
    ];

    const groups = buildChunkGroups(segments, [] as Character[], null, speakerProfiles);

    expect(groups).toHaveLength(2);
    expect(groups[0].segments.map(segment => segment.id)).toEqual(['seg-1']);
    expect(groups[1].segments.map(segment => segment.id)).toEqual(['seg-2']);
  });

  it('ignores whitespace-only segments the same way the backend chunker does', () => {
    const segments: ChapterSegment[] = [
      {
        id: 'seg-1',
        chapter_id: 'chap-1',
        segment_order: 0,
        text_content: 'First sentence.',
        character_id: null,
        speaker_profile_name: 'Narrator',
        audio_file_path: null,
        audio_status: 'unprocessed',
        audio_generated_at: null,
      },
      {
        id: 'seg-2',
        chapter_id: 'chap-1',
        segment_order: 1,
        text_content: '   ',
        character_id: null,
        speaker_profile_name: 'Narrator',
        audio_file_path: null,
        audio_status: 'unprocessed',
        audio_generated_at: null,
      },
      {
        id: 'seg-3',
        chapter_id: 'chap-1',
        segment_order: 2,
        text_content: 'Second sentence.',
        character_id: null,
        speaker_profile_name: 'Narrator',
        audio_file_path: null,
        audio_status: 'unprocessed',
        audio_generated_at: null,
      },
    ];

    const groups = buildChunkGroups(segments, [] as Character[], null, []);

    expect(groups).toHaveLength(1);
    expect(groups[0].segments.map(segment => segment.id)).toEqual(['seg-1', 'seg-3']);
  });
});

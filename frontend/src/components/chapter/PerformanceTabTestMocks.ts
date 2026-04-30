import type { ChapterSegment, Character } from '../../types';

export const mockSegments: ChapterSegment[] = [
  { 
    id: 'seg-1', 
    chapter_id: 'chap-1', 
    text_content: 'Sentence one.', 
    segment_order: 0, 
    audio_status: 'unprocessed',
    character_id: 'char-1',
    speaker_profile_name: 'Profile 1',
    audio_file_path: '',
    audio_generated_at: 0
  },
  { 
    id: 'seg-2', 
    chapter_id: 'chap-1', 
    text_content: 'Sentence two.', 
    segment_order: 1, 
    audio_status: 'done',
    character_id: null,
    speaker_profile_name: 'Narrator',
    audio_file_path: '/audio/2.wav',
    audio_generated_at: 1000
  }
];

export const mockCharacters: Character[] = [
  { id: 'char-1', project_id: 'proj-1', name: 'Char 1', color: '#ff0000', speaker_profile_name: 'Voice 1' } as any
];

export const mockChunkGroups = [
  { characterId: 'char-1', segments: [mockSegments[0]] }
];

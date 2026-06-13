import { describe, expect, it } from 'vitest';
import { deriveChapterLifecycle } from '@/pages/Book/lib/chapterLifecycle';
import type { Chapter } from '@/types';

const baseChapter: Chapter = {
  id: 'chapter-1',
  project_id: 'book-1',
  title: 'Chapter 1',
  text_content: '',
  speaker_profile_name: null,
  sort_order: 0,
  audio_status: 'unprocessed',
  audio_file_path: null,
  text_last_modified: null,
  audio_generated_at: null,
  char_count: 0,
  word_count: 0,
  sent_count: 0,
  predicted_audio_length: 0,
  audio_length_seconds: 0,
};

describe('deriveChapterLifecycle', () => {
  it('marks rendered chapters from done status or audio assets', () => {
    expect(deriveChapterLifecycle({ ...baseChapter, audio_status: 'done' })).toBe('Rendered');
    expect(deriveChapterLifecycle({ ...baseChapter, has_wav: true })).toBe('Rendered');
    expect(deriveChapterLifecycle({ ...baseChapter, has_mp3: true })).toBe('Rendered');
    expect(deriveChapterLifecycle({ ...baseChapter, has_m4a: true })).toBe('Rendered');
  });

  it('marks cast chapters from partial segment progress or processing fallback', () => {
    expect(deriveChapterLifecycle({ ...baseChapter, audio_status: 'processing' })).toBe('Cast');
    expect(deriveChapterLifecycle({ ...baseChapter, total_segments_count: 4, done_segments_count: 1 })).toBe('Cast');
  });

  it('marks ready chapters when text and analyzed segments exist', () => {
    expect(deriveChapterLifecycle({ ...baseChapter, char_count: 120, total_segments_count: 3 })).toBe('Ready');
  });

  it('marks empty or unanalyzed chapters as draft', () => {
    expect(deriveChapterLifecycle(baseChapter)).toBe('Draft');
    expect(deriveChapterLifecycle({ ...baseChapter, char_count: 120, total_segments_count: 0 })).toBe('Draft');
  });
});

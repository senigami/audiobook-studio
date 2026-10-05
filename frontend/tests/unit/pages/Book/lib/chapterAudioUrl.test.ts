/**
 * chapterAudioUrl.test.ts
 *
 * Tests for frontend/src/pages/Book/lib/chapterAudioUrl.ts — the single
 * shared expression for "this chapter's own rendered audio URL", used by
 * both ChapterTable.tsx's play button and the synced-reader wiring
 * (useReaderSync's chapterAudioUrl gate). A drift here would silently break
 * the reader's sync gate, so this pins the exact shape.
 */
import { describe, expect, it } from 'vitest';
import { buildChapterAudioUrl } from '@/pages/Book/lib/chapterAudioUrl';

describe('buildChapterAudioUrl', () => {
  it('builds the chapter audio asset URL, encoding the filename', () => {
    const url = buildChapterAudioUrl({
      id: 'chapter-a',
      project_id: 'book-1',
      audio_file_path: 'chapter one.wav',
    });
    expect(url).toBe('/api/projects/book-1/chapters/chapter-a/assets/audio?filename=chapter%20one.wav');
  });

  it('returns null when the chapter has no rendered audio yet', () => {
    const url = buildChapterAudioUrl({
      id: 'chapter-a',
      project_id: 'book-1',
      audio_file_path: null,
    });
    expect(url).toBeNull();
  });
});

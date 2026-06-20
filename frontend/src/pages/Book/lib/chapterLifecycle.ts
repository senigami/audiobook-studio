import type { Chapter } from '@/types';

export type ChapterLifecycle = 'Draft' | 'Ready' | 'Cast' | 'Rendered';

export function deriveChapterLifecycle(chapter: Chapter): ChapterLifecycle {
  if (chapter.audio_status === 'done' || chapter.has_wav || chapter.has_mp3 || chapter.has_m4a) {
    return 'Rendered';
  }

  if (
    chapter.audio_status === 'processing' ||
    ((chapter.done_segments_count || 0) > 0 && (chapter.total_segments_count || 0) > 0)
  ) {
    return 'Cast';
  }

  if (chapter.char_count > 0 && (chapter.total_segments_count || 0) > 0) {
    return 'Ready';
  }

  return 'Draft';
}

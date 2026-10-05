import type { Chapter } from '@/types';

export type ChapterLifecycle = 'Draft' | 'Ready' | 'Cast' | 'Rendered' | 'Stale' | 'Error';

// Mirrors StatusOrb's chapter-level priority: a failed render or a chapter whose
// text has drifted ahead of its last render must be surfaced before any of the
// Draft/Ready/Cast/Rendered progress states, otherwise the lifecycle pill can
// contradict the StatusOrb shown on the same row.
export function deriveChapterLifecycle(chapter: Chapter): ChapterLifecycle {
  if (chapter.audio_status === 'error' || chapter.audio_status === 'failed') {
    return 'Error';
  }

  const isStale = !!(
    chapter.text_last_modified &&
    chapter.audio_generated_at &&
    chapter.text_last_modified > chapter.audio_generated_at
  );
  if (isStale) {
    return 'Stale';
  }

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

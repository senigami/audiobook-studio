/**
 * bookContinuousPlayback.ts — Chapter-by-chapter auto-advancing "Continue
 * Listening" playback engine for a book.
 *
 * Replaces the previous "play the whole assembled m4b/wav as one file"
 * approach, which risked crashing on multi-hour books. Instead, this module
 * drives playerBus (src/store/playerBus.ts) one rendered chapter at a time,
 * wiring onPrev/onNext/onEnded to advance through the book's chapter queue,
 * and persists an auto-resume bookmark (src/store/bookmarks.ts) so playback
 * can pick up where it left off.
 *
 * No import-time side effects (modular_architecture.md INV-6): every export
 * below is a function called at runtime; nothing runs at module load.
 */
import { useEffect, useRef } from 'react';
import { getAutoResumeBookmark, upsertAutoResumeBookmark, clearAutoResumeBookmark } from '@/store/bookmarks';
import { loadAndPlay, seek, stop, subscribe, getSnapshot } from '@/store/playerBus';

export interface BookChapterQueueEntry {
  chapterId: string;
  title: string;
  audioUrl: string;
}

/** Minimum real-time gap between persisted auto-resume writes. */
const AUTO_SAVE_THROTTLE_MS = 5000;

/**
 * Pure function: given a book's ordered chapters, keep only rendered ones
 * (those with a usable audio URL) in book order. No side effects.
 */
export function buildChapterQueue(
  chapters: Array<{
    id: string;
    title: string;
    project_id: string;
    audio_file_path?: string | null;
  }>,
): BookChapterQueueEntry[] {
  const queue: BookChapterQueueEntry[] = [];
  for (const chapter of chapters) {
    const audioPath = chapter.audio_file_path;
    if (!audioPath) continue;
    queue.push({
      chapterId: chapter.id,
      title: chapter.title,
      audioUrl: `/api/projects/${chapter.project_id}/chapters/${chapter.id}/assets/audio?filename=${encodeURIComponent(audioPath)}`,
    });
  }
  return queue;
}

/**
 * Starts (or resumes) continuous chapter playback for a book. Reads the
 * auto-resume bookmark; if it names a chapter still present in `queue`,
 * starts there and seeks to its saved position. Otherwise starts at the
 * first queue entry. No-op if the queue is empty.
 */
export function playBookContinuous(bookId: string, bookTitle: string, queue: BookChapterQueueEntry[]): void {
  if (queue.length === 0) return;

  const bookmark = getAutoResumeBookmark(bookId);
  let startIndex = 0;
  let resumePosition: number | null = null;
  if (bookmark) {
    const idx = queue.findIndex((entry) => entry.chapterId === bookmark.chapterId);
    if (idx !== -1) {
      startIndex = idx;
      resumePosition = bookmark.positionSeconds ?? null;
    }
  }

  let currentIndex = startIndex;

  const loadIndex = (index: number, seekTo: number | null) => {
    const entry = queue[index];
    loadAndPlay({
      scope: 'chapter',
      bookId,
      title: bookTitle,
      subtitle: `Chapter ${index + 1}: ${entry.title}`,
      audioUrl: entry.audioUrl,
      hasPrev: index > 0,
      hasNext: index < queue.length - 1,
      onPrev: () => {
        if (currentIndex > 0) {
          currentIndex -= 1;
          loadIndex(currentIndex, null);
        }
      },
      onNext: () => {
        if (currentIndex < queue.length - 1) {
          currentIndex += 1;
          loadIndex(currentIndex, null);
        }
      },
      onEnded: () => {
        if (currentIndex < queue.length - 1) {
          currentIndex += 1;
          loadIndex(currentIndex, null);
        } else {
          clearAutoResumeBookmark(bookId);
          stop();
        }
      },
    });
    if (seekTo != null) {
      seek(seekTo);
    }
  };

  loadIndex(currentIndex, resumePosition);
}

/**
 * React hook: while ANY chapter of THIS book is the active bookId in
 * playerBus AND is playing, persists the current chapter + position via
 * upsertAutoResumeBookmark, throttled to at most once per ~5 real seconds.
 * Does nothing when playerBus.bookId !== bookId or when not playing, or
 * when bookId/queue is empty.
 */
export function useAutoSaveResumePosition(bookId: string, queue: BookChapterQueueEntry[]): void {
  const lastSaveRef = useRef<number>(-Infinity);

  useEffect(() => {
    if (!bookId || queue.length === 0) return undefined;

    const handleChange = () => {
      const snapshot = getSnapshot();
      if (snapshot.bookId !== bookId || !snapshot.playing) return;

      const entry = queue.find((q) => q.audioUrl === snapshot.audioUrl);
      if (!entry) return;

      const now = Date.now();
      if (now - lastSaveRef.current < AUTO_SAVE_THROTTLE_MS) return;
      lastSaveRef.current = now;

      upsertAutoResumeBookmark(bookId, entry.chapterId, snapshot.position);
    };

    return subscribe(handleChange);
  }, [bookId, queue]);
}

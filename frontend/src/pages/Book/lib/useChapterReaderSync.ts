import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/api';
import { seek, usePlayerBus } from '@/store/playerBus';
import { useChapterTiming } from '@/hooks/useChapterTiming';
import { useReaderSync } from '@/hooks/useReaderSync';
import { buildChapterAudioUrl } from '@/pages/Book/lib/chapterAudioUrl';
import type { Chapter, ChapterSegment } from '@/types';
import type { ReaderViewProps } from '@/components/reader/ReaderView';

type ReaderChapter = Pick<Chapter, 'id' | 'project_id' | 'audio_file_path'>;

export interface UseChapterReaderSyncResult {
  /** Spread directly into `<ReaderContainer {...readerProps} />`. */
  readerProps: ReaderViewProps;
  /** This chapter's own audio URL — identical construction to `ChapterTable.tsx`'s play button. */
  chapterAudioUrl: string | null;
}

/**
 * Shared read-along wiring (synced-reader plan, Task 9 "entry points"): fetches
 * this chapter's segments (for `segmentTextById`) and combines
 * `useChapterTiming` + the global `playerBus` + `useReaderSync` into the
 * props `ReaderContainer`/`ReaderView` need — plus a click-to-seek handler
 * for the reader's own focal block (03-reader-frontend.md's "Bidirectional
 * seek": no existing per-segment list lives in the Book tab outside the
 * chapter editor, so the reader block itself is the click-to-seek surface).
 *
 * Used by both entry points (`ChapterReaderCard`'s embedded card and the
 * standalone `ReaderPage` route) so they can never drift apart.
 */
export function useChapterReaderSync(
  bookId: string,
  chapter: ReaderChapter | null,
): UseChapterReaderSyncResult {
  const playerBus = usePlayerBus();
  const timing = useChapterTiming(chapter?.id ?? '', bookId);
  const [segments, setSegments] = useState<ChapterSegment[]>([]);

  useEffect(() => {
    if (!chapter?.id) {
      setSegments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const fetched = await api.fetchSegments(chapter.id);
        if (!cancelled) setSegments(fetched);
      } catch {
        // Segment text is best-effort here — a fetch failure just leaves the
        // reader's blocks blank rather than crashing the card/page.
        if (!cancelled) setSegments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapter?.id]);

  const segmentTextById = useMemo(() => {
    const byId = new Map(segments.map((segment) => [segment.id, segment.text_content]));
    return (segmentId: string) => byId.get(segmentId) ?? '';
  }, [segments]);

  const chapterAudioUrl = chapter ? buildChapterAudioUrl(chapter) : null;
  const sync = useReaderSync(timing, playerBus, chapterAudioUrl ?? '');

  // Bidirectional seek (convenience seek-to-start of the active group): the
  // bus position stays the single source of truth (03-reader-frontend.md) —
  // this handler's only job is to call `seek`, never to touch reader state
  // directly. The reader then reacts automatically via `useReaderSync`.
  const onActiveBlockClick = useCallback(() => {
    if (sync.activeGroup) {
      seek(sync.activeGroup.start_ms / 1000);
    }
  }, [sync.activeGroup]);

  return {
    readerProps: {
      activeGroup: sync.activeGroup,
      prev: sync.prev,
      next: sync.next,
      groupProgress: sync.groupProgress,
      isTrackingThisChapter: sync.isTrackingThisChapter,
      segmentTextById,
      onActiveBlockClick,
    },
    chapterAudioUrl,
  };
}

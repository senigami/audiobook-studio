import { useEffect, useRef, useState } from 'react';
import { api } from '@/api';
import type { Job } from '@/types';
import type { SegmentRenderMonitorSegment } from '@/components/progress/SegmentRenderMonitor/SegmentRenderMonitor';

/**
 * W-PAR task 008: the full, real segment inventory for a chapter render job
 * — every segment in the chapter's script (not just in-flight ones), merged
 * with the live `active_segments_map`.
 *
 * Pattern to imitate (per the task file): `useStudioChapter.ts`'s merge of
 * `job.active_segments_map` with a client-side fallback — this hook applies
 * the same shape of merge at a different grain (the whole chapter's static
 * segment list from the script-view endpoint, not a per-segment fallback).
 *
 * No new WebSocket channel (M4/INV-9): this only fetches the existing
 * `GET /chapters/{chapter_id}/script-view` REST endpoint once per active job
 * and enriches with the `active_segments_map` field the job already carries.
 *
 * A span absent from `active_segments_map`:
 * - `status === 'done'` -> phase 'done', progress 1 (already rendered).
 * - otherwise -> phase 'preparing', progress 0 (SegmentRenderMonitor's own
 *   dimmest/idle visual state — not a new invented phase).
 */
export function useSegmentInventory(job: Job | null | undefined): {
  segments: SegmentRenderMonitorSegment[];
  loading: boolean;
} {
  const [segments, setSegments] = useState<SegmentRenderMonitorSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const chapterId = job?.chapter_id;
  const engineId = job?.engine;
  const activeSegmentsMap = job?.active_segments_map;

  useEffect(() => {
    if (!chapterId) {
      setSegments([]);
      return;
    }

    const myRequestId = ++requestIdRef.current;
    setLoading(true);

    api.fetchScriptView(chapterId)
      .then((data) => {
        if (requestIdRef.current !== myRequestId) return; // stale

        const merged: SegmentRenderMonitorSegment[] = (data.spans || []).map((span) => {
          const liveEntry = activeSegmentsMap?.[span.id];
          if (liveEntry) {
            return {
              id: span.id,
              charCount: liveEntry.char_count ?? span.char_count,
              phase: liveEntry.phase,
              progress: liveEntry.progress,
              engineId: liveEntry.engine_id ?? engineId,
              reasonCode: liveEntry.reason_code,
            };
          }
          const isDone = span.status === 'done';
          return {
            id: span.id,
            charCount: span.char_count,
            phase: isDone ? 'done' : 'preparing',
            progress: isDone ? 1 : 0,
            engineId,
          };
        });

        setSegments(merged);
      })
      .catch(() => {
        if (requestIdRef.current !== myRequestId) return;
        setSegments([]);
      })
      .finally(() => {
        if (requestIdRef.current === myRequestId) setLoading(false);
      });
  }, [chapterId, engineId, activeSegmentsMap]);

  return { segments, loading };
}

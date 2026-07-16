import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/api';
import type { Job, ScriptSpan } from '@/types';
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
 * - `status === 'rendered'` -> phase 'done', progress 1 (already rendered —
 *   the script-view API's `_normalize_segment_status` maps a DB `audio_status`
 *   of 'done' to the span field value 'rendered'; 'done' itself never appears
 *   on `span.status`, only on the raw DB column one layer below this API).
 * - otherwise -> phase 'preparing', progress 0 (SegmentRenderMonitor's own
 *   dimmest/idle visual state — not a new invented phase).
 */
export function useSegmentInventory(job: Job | null | undefined): {
  segments: SegmentRenderMonitorSegment[];
  loading: boolean;
} {
  const [baseSpans, setBaseSpans] = useState<ScriptSpan[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const chapterId = job?.chapter_id;
  const engineId = job?.engine;
  const activeSegmentsMap = job?.active_segments_map;

  // Fetch the static script-view spans once per chapterId — this list only
  // changes when the chapter's script changes, not on every progress tick.
  useEffect(() => {
    if (!chapterId) {
      setBaseSpans([]);
      return;
    }

    const myRequestId = ++requestIdRef.current;
    setLoading(true);

    api.fetchScriptView(chapterId)
      .then((data) => {
        if (requestIdRef.current !== myRequestId) return; // stale
        setBaseSpans(data.spans || []);
      })
      .catch(() => {
        if (requestIdRef.current !== myRequestId) return;
        setBaseSpans([]);
      })
      .finally(() => {
        if (requestIdRef.current === myRequestId) setLoading(false);
      });
  }, [chapterId]);

  // Merge live active_segments_map into the (stable) base spans on every
  // tick — pure client-side computation, no network call.
  const segments = useMemo<SegmentRenderMonitorSegment[]>(() => {
    return baseSpans.map((span) => {
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
      const isDone = span.status === 'rendered';
      return {
        id: span.id,
        charCount: span.char_count,
        phase: isDone ? 'done' : 'preparing',
        progress: isDone ? 1 : 0,
        engineId,
      };
    });
  }, [baseSpans, activeSegmentsMap, engineId]);

  return { segments, loading };
}

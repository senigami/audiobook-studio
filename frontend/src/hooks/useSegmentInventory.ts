import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/api';
import type { Job, ScriptSpan, ScriptRenderBatch } from '@/types';
import type { SegmentRenderMonitorSegment, SegmentRenderPhase } from '@/components/progress/SegmentRenderMonitor/SegmentRenderMonitor';

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
 *
 * Owner ruling (design-docs/specs/glossary.md 1.1.0, 2026-08-26): the render
 * batch is the finest granularity that may ever be user-visible — no
 * per-sentence/per-span row anywhere in the render monitor UI. The per-span
 * merge above is an internal step only; the array this hook RETURNS is
 * aggregated one entry per render batch, using `ScriptViewResponse.render_batches`
 * (already computed server-side by `get_script_view_payload`, same grouping
 * rule as the real synthesis-time `build_chunk_groups`). A batch's phase is
 * 'failed' if any member failed, else 'rendering' if any member is live, else
 * 'done' only if every member is done, else 'preparing' — and its progress is
 * the char-weighted fraction across its members (same math as
 * `charWeightedProgress`), never a single member's own progress standing in
 * for the whole batch. `batchSpanIds` is returned alongside so a caller can
 * resolve a batch id back to its real member span ids for a batch-level
 * retry (`api.generateSegments(batchSpanIds[batchId])` — the existing
 * multi-id generate endpoint IS the batch-retry capability; no new backend
 * verb was needed).
 */
export function useSegmentInventory(job: Job | null | undefined): {
  segments: SegmentRenderMonitorSegment[];
  loading: boolean;
  batchSpanIds: Record<string, string[]>;
} {
  const [baseSpans, setBaseSpans] = useState<ScriptSpan[]>([]);
  const [renderBatches, setRenderBatches] = useState<ScriptRenderBatch[]>([]);
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
        setRenderBatches(data.render_batches || []);
      })
      .catch(() => {
        if (requestIdRef.current !== myRequestId) return;
        setBaseSpans([]);
        setRenderBatches([]);
      })
      .finally(() => {
        if (requestIdRef.current === myRequestId) setLoading(false);
      });
  }, [chapterId]);

  // Merge live active_segments_map into the (stable) base spans on every
  // tick — pure client-side computation, no network call.
  const spanSegments = useMemo<SegmentRenderMonitorSegment[]>(() => {
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
        phase: (isDone ? 'done' : 'preparing') as SegmentRenderPhase,
        progress: isDone ? 1 : 0,
        engineId,
      };
    });
  }, [baseSpans, activeSegmentsMap, engineId]);

  // Aggregate the per-span merge above into one row per render batch — the
  // finest granularity the render monitor UI may ever show (owner ruling,
  // glossary.md 1.1.0). Falls back to the raw per-span array when
  // render_batches is unavailable (e.g. an older/degraded payload) rather
  // than rendering nothing.
  const { segments, batchSpanIds } = useMemo(() => {
    if (renderBatches.length === 0) {
      return { segments: spanSegments, batchSpanIds: {} as Record<string, string[]> };
    }

    const byId = new Map(spanSegments.map((s) => [s.id, s] as const));
    const ids: Record<string, string[]> = {};

    const batches: SegmentRenderMonitorSegment[] = renderBatches.map((batch) => {
      ids[batch.id] = batch.span_ids;
      const members = batch.span_ids.map((id) => byId.get(id)).filter((s): s is SegmentRenderMonitorSegment => !!s);

      const charCount = members.reduce((sum, m) => sum + m.charCount, 0);
      const anyFailed = members.some((m) => m.phase === 'failed');
      const anyRendering = members.some((m) => m.phase === 'rendering');
      const allDone = members.length > 0 && members.every((m) => m.phase === 'done');
      // A batch with completed members but nothing in flight is the
      // resume-after-restart shape. It is not 'preparing': that word means
      // not-yet-started, and claiming it while half the characters are already
      // on disk puts a part-filled bar under a "Preparing" label (#237).
      // `inFlight` stays false so the parallel-render count and the pulse
      // animation keep meaning "actually occupying a render slot right now".
      const anyDone = members.some((m) => m.phase === 'done');
      const phase: SegmentRenderPhase = anyFailed
        ? 'failed'
        : anyRendering
          ? 'rendering'
          : allDone
            ? 'done'
            : anyDone
              ? 'rendering'
              : 'preparing';

      const filled = members.reduce((sum, m) => {
        if (m.phase === 'done') return sum + m.charCount;
        if (m.phase === 'rendering') return sum + m.charCount * m.progress;
        return sum;
      }, 0);
      const progress = charCount > 0 ? filled / charCount : 0;

      const engineId = members.find((m) => m.engineId)?.engineId;
      const reasonCode = phase === 'failed' ? members.find((m) => m.phase === 'failed')?.reasonCode : undefined;

      return { id: batch.id, charCount, phase, progress, engineId, reasonCode, inFlight: anyRendering };
    });

    return { segments: batches, batchSpanIds: ids };
  }, [spanSegments, renderBatches]);

  return { segments, loading, batchSpanIds };
}
